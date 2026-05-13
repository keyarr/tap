"""
tap — Webhook Inspector & Replay Tool (FastAPI backend).
"""
import asyncio
import hashlib
import hmac
import ipaddress
import json
import os
import re
import secrets
import socket
import ssl
import time
import uuid as uuid_lib
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse
from sse_starlette.sse import EventSourceResponse

from database import (
    get_payload,
    get_payloads,
    init_db,
    insert_payload,
    prune_old_payloads,
)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

FRONTEND_ORIGIN = os.environ.get(
    "WEBHOOK_FRONTEND_URL", "http://localhost:5173"
)
MAX_BODY_SIZE = 1_048_576  # 1 MB
MAX_SSE_CONNECTIONS = 100
MAX_PAYLOADS_PER_HOOK = int(os.environ.get("WEBHOOK_MAX_PAYLOADS_PER_HOOK", "1000"))

# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="tap", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# SSRF protection
# ---------------------------------------------------------------------------

_BLOCKED_NETS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]

_SSRF_SAFE_SCHEMES = {"http", "https"}

_SENSITIVE_HEADERS = {
    "authorization", "cookie", "set-cookie",
    "proxy-authorization", "x-api-key",
}


def _sanitize_headers(headers: dict) -> dict:
    """Strip sensitive headers before broadcast."""
    return {k: v for k, v in headers.items() if k.lower() not in _SENSITIVE_HEADERS}


def _resolve_safe_ip(url: str) -> str | None:
    """Resolve host, validate ALL addresses, return pinned IP or None."""
    try:
        parsed = httpx.URL(url)
        if parsed.scheme not in _SSRF_SAFE_SCHEMES:
            return None
        host = parsed.host
        if host is None:
            return None
        # Resolve IPv4 + IPv6, check every address
        addrs = socket.getaddrinfo(host, None, family=socket.AF_UNSPEC)
        pinned_ip = addrs[0][4][0]
        for addr in addrs:
            ip = ipaddress.ip_address(addr[4][0])
            if any(ip in net for net in _BLOCKED_NETS):
                return None
        return pinned_ip
    except Exception:
        return None


# ---------------------------------------------------------------------------
# CSP header middleware
# ---------------------------------------------------------------------------


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "script-src 'self'"
    )
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    return resp


# ---------------------------------------------------------------------------
# Rate limiter (in-memory sliding window)
# ---------------------------------------------------------------------------

_RATE_LIMITS: dict[str, list[float]] = {}
_RATE_WINDOW = 60  # seconds
_RATE_CLEANUP_INTERVAL = 100  # purge dead keys every N requests
_rate_ops = 0

TRUSTED_PROXY = os.environ.get("WEBHOOK_TRUSTED_PROXY", "")


def _rate_limit_for_path(path: str) -> int:
    """Max requests per window for a given path."""
    if path.startswith("/hooks/new") or path.startswith("/replay/"):
        return 10
    if path.startswith("/stream"):
        return 10
    if path.startswith("/hooks/"):
        return 60
    return 120  # read endpoints


def _rate_cleanup():
    """Remove keys with empty timestamp lists to prevent memory leak."""
    global _rate_ops
    _rate_ops += 1
    if _rate_ops % _RATE_CLEANUP_INTERVAL == 0:
        dead = [k for k, v in _RATE_LIMITS.items() if not v]
        for k in dead:
            del _RATE_LIMITS[k]


def _resolve_client_ip(request: Request) -> str:
    """Get client IP, optionally respecting X-Forwarded-For."""
    ip = request.client.host if request.client else "unknown"
    if TRUSTED_PROXY and ip == TRUSTED_PROXY:
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
    return ip


@app.middleware("http")
async def rate_limiter(request: Request, call_next):
    # Only rate-limit API routes
    if not request.url.path.startswith("/"):
        return await call_next(request)

    client_ip = _resolve_client_ip(request)
    now = time.time()
    key = f"{client_ip}:{request.url.path}"
    limit = _rate_limit_for_path(request.url.path)

    timestamps = _RATE_LIMITS.get(key, [])
    # Prune old entries outside the window
    cutoff = now - _RATE_WINDOW
    timestamps = [t for t in timestamps if t > cutoff]

    if len(timestamps) >= limit:
        retry_after = int(timestamps[0] + _RATE_WINDOW - now) + 1
        return JSONResponse(
            status_code=429,
            content={
                "error": "Too many requests",
                "retry_after_seconds": retry_after,
            },
            headers={"Retry-After": str(retry_after)},
        )

    timestamps.append(now)
    _RATE_LIMITS[key] = timestamps
    _rate_cleanup()
    return await call_next(request)


# ---------------------------------------------------------------------------
# SSE event bus (in-memory, capped)
# ---------------------------------------------------------------------------

_sse_queues: list[asyncio.Queue] = []


def _broadcast(event: str, data: dict):
    payload = json.dumps(data)
    dead: list[asyncio.Queue] = []
    for q in _sse_queues:
        try:
            q.put_nowait({"event": event, "data": payload})
        except asyncio.QueueFull:
            dead.append(q)
    for q in dead:
        _sse_queues.remove(q)


async def _sse_generator():
    if len(_sse_queues) >= MAX_SSE_CONNECTIONS:
        raise HTTPException(status_code=503, detail="Too many SSE connections")
    queue: asyncio.Queue = asyncio.Queue(maxsize=256)
    _sse_queues.append(queue)
    try:
        while True:
            msg = await queue.get()
            yield msg
    except asyncio.CancelledError:
        pass
    finally:
        if queue in _sse_queues:
            _sse_queues.remove(queue)


# ---------------------------------------------------------------------------
# UUID validation
# ---------------------------------------------------------------------------

_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def _valid_uuid(s: str) -> bool:
    return bool(_UUID_RE.match(s))


# ---------------------------------------------------------------------------
# Body size limit
# ---------------------------------------------------------------------------


async def _read_body(request: Request) -> bytes:
    cl = request.headers.get("content-length")
    if cl and int(cl) > MAX_BODY_SIZE:
        raise HTTPException(status_code=413, detail="Request body too large")
    raw = await request.body()
    if len(raw) > MAX_BODY_SIZE:
        raise HTTPException(status_code=413, detail="Request body too large")
    return raw


# ---------------------------------------------------------------------------
# Create new hook endpoint (must be before catch-all /hooks/{uuid})
# ---------------------------------------------------------------------------


@app.post("/hooks/new")
async def create_hook():
    new_uuid = str(uuid_lib.uuid4())
    return {
        "hook_uuid": new_uuid,
        "url": f"/hooks/{new_uuid}",
    }


# ---------------------------------------------------------------------------
# Webhook endpoint — accept any HTTP method
# ---------------------------------------------------------------------------


@app.api_route(
    "/hooks/{hook_uuid}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
)
async def receive_webhook(hook_uuid: str, request: Request):
    if not _valid_uuid(hook_uuid):
        raise HTTPException(status_code=400, detail="Invalid hook UUID")

    raw_body: str | None = None
    body_json: str | None = None
    try:
        raw_bytes = await _read_body(request)
        raw_body = raw_bytes.decode("utf-8") if raw_bytes else None
        if raw_body:
            json.loads(raw_body)
            body_json = raw_body
    except (json.JSONDecodeError, UnicodeDecodeError):
        if raw_body is None:
            raw_bytes = await _read_body(request)
            raw_body = raw_bytes.decode("utf-8", errors="replace") if raw_bytes else None
    except HTTPException:
        raise
    except Exception:
        raw_body = (await _read_body(request)).decode("utf-8", errors="replace")

    status_code = 200

    payload_id = insert_payload(
        hook_uuid=hook_uuid,
        method=request.method,
        headers=dict(_sanitize_headers(dict(request.headers))),
        body=body_json,
        raw_body=raw_body,
        query_params=dict(request.query_params),
        source_ip=request.client.host if request.client else None,
        status_code=status_code,
    )

    # Prune oldest payloads (probabilistic — 1 in 10 to reduce write contention)
    if secrets.randbelow(10) == 0:
        prune_old_payloads(hook_uuid, MAX_PAYLOADS_PER_HOOK)

    payload_out = {
        "id": payload_id,
        "hook_uuid": hook_uuid,
        "method": request.method,
        "headers": _sanitize_headers(dict(request.headers)),
        "body": body_json,
        "raw_body": raw_body,
        "query_params": dict(request.query_params),
        "source_ip": request.client.host if request.client else None,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "status_code": status_code,
    }
    _broadcast("new_payload", payload_out)

    return JSONResponse(
        content={"received": True, "payload_id": payload_id},
        status_code=status_code,
    )


# ---------------------------------------------------------------------------
# SSE stream
# ---------------------------------------------------------------------------


@app.get("/stream")
async def sse_stream():
    return EventSourceResponse(_sse_generator())


# ---------------------------------------------------------------------------
# List payloads (paginated, filterable)
# ---------------------------------------------------------------------------


@app.get("/payloads")
async def list_payloads(
    hook_uuid: str | None = Query(None),
    method: str | None = Query(None),
    status: int | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    payloads, total = get_payloads(
        hook_uuid=hook_uuid, method=method, status=status,
        search=search, page=page, per_page=per_page,
    )
    return {
        "payloads": payloads,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": max(1, (total + per_page - 1) // per_page),
    }


# ---------------------------------------------------------------------------
# Single payload detail
# ---------------------------------------------------------------------------


@app.get("/payloads/{payload_id}")
async def get_payload_detail(payload_id: int):
    p = get_payload(payload_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Payload not found")
    return p


# ---------------------------------------------------------------------------
# Export payload as JSON download
# ---------------------------------------------------------------------------


@app.get("/export/{payload_id}")
async def export_payload(payload_id: int):
    p = get_payload(payload_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Payload not found")
    export = {
        "id": p["id"],
        "hook_uuid": p["hook_uuid"],
        "method": p["method"],
        "headers": p["headers"],
        "query_params": p["query_params"],
        "body": _try_parse_json(p.get("body") or p.get("raw_body")),
        "raw_body": p.get("raw_body"),
        "timestamp": p["timestamp"],
        "source_ip": p.get("source_ip"),
    }
    return JSONResponse(
        content=export,
        headers={
            "Content-Disposition": f'attachment; filename="webhook-{payload_id}.json"',
        },
    )


def _try_parse_json(s: str | None):
    if s is None:
        return None
    try:
        return json.loads(s)
    except (json.JSONDecodeError, TypeError):
        return s


# ---------------------------------------------------------------------------
# Replay a payload (SSRF-safe)
# ---------------------------------------------------------------------------


def _compute_hmac_signature(
    payload_body: str, secret: str, timestamp: int | None = None
) -> tuple[str, int]:
    """Stripe-style HMAC signature."""
    t = timestamp or int(time.time())
    signed_payload = f"{t}.{payload_body}"
    sig = hmac.new(
        secret.encode(),
        signed_payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    return sig, t


_SAFE_RESPONSE_HEADERS = {
    "content-type", "content-length", "date", "server",
}


@app.post("/replay/{payload_id}")
async def replay_payload(payload_id: int, request: Request):
    p = get_payload(payload_id)
    if p is None:
        raise HTTPException(status_code=404, detail="Payload not found")

    body = await request.json()
    target_url = body.get("target_url", "")
    if not target_url:
        raise HTTPException(status_code=400, detail="target_url is required")

    pinned_ip = _resolve_safe_ip(target_url)
    if pinned_ip is None:
        raise HTTPException(
            status_code=400,
            detail="target_url blocked: private/reserved IPs not allowed",
        )

    # Reconstruct URL with pinned IP to prevent DNS rebinding
    parsed_target = httpx.URL(target_url)
    pinned_url = f"{parsed_target.scheme}://{pinned_ip}"
    if parsed_target.port:
        pinned_url += f":{parsed_target.port}"
    pinned_url += parsed_target.path or "/"
    if parsed_target.raw_query:
        pinned_url += f"?{parsed_target.raw_query}"

    custom_headers = body.get("headers", {})
    add_hmac = body.get("add_hmac", False)
    hmac_secret = body.get("hmac_secret", "")
    hmac_header = body.get("hmac_header", "Stripe-Signature")

    # HMAC requires a non-default secret
    if add_hmac:
        if not hmac_secret or hmac_secret == "whsec_test_secret":
            raise HTTPException(
                status_code=400,
                detail="HMAC requires a custom secret (default 'whsec_test_secret' is not allowed)",
            )

    payload_body = p.get("body") or p.get("raw_body") or ""

    headers = dict(custom_headers)
    for k, v in p["headers"].items():
        k_lower = k.lower()
        if k_lower in (
            "host", "connection", "content-length", "content-encoding",
            "transfer-encoding", "accept-encoding",
        ) or k_lower in _SENSITIVE_HEADERS:
            continue
        if k not in headers:
            headers[k] = v

    if add_hmac:
        sig, ts = _compute_hmac_signature(payload_body, hmac_secret)
        headers[hmac_header] = f"t={ts},v1={sig}"

    # Ensure Host header matches original target, not pinned IP
    headers.setdefault("Host", parsed_target.host or "")

    # Custom transport with SSL hostname check disabled — connects to pinned
    # IP while still validating the certificate chain (no hostname match).
    _ssl_ctx = ssl.create_default_context()
    _ssl_ctx.check_hostname = False
    _transport = httpx.AsyncHTTPTransport(verify=_ssl_ctx)

    try:
        async with httpx.AsyncClient(timeout=30, transport=_transport) as client:
            resp = await client.request(
                method=p["method"],
                url=pinned_url,
                headers=headers,
                content=payload_body,
            )
            resp_body = resp.text[:100_000]
            # Only return safe headers
            safe_headers = {
                k: v for k, v in resp.headers.items()
                if k.lower() in _SAFE_RESPONSE_HEADERS
            }
            return {
                "success": True,
                "status_code": resp.status_code,
                "response_headers": safe_headers,
                "response_body": resp_body,
            }
    except httpx.RequestError as exc:
        return JSONResponse(
            status_code=502,
            content={
                "success": False,
                "error": f"Request failed: {exc}",
            },
        )


# ---------------------------------------------------------------------------
# Root health-check
# ---------------------------------------------------------------------------


@app.get("/")
async def root():
    return {"service": "tap", "version": "1.0.0", "status": "ok"}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.environ.get("WEBHOOK_HOST", "127.0.0.1"),
        port=int(os.environ.get("WEBHOOK_PORT", "8000")),
        reload=os.environ.get("WEBHOOK_RELOAD", "").lower() in ("1", "true"),
    )
