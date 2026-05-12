import sqlite3
import json
import os
from datetime import datetime

DB_PATH = os.environ.get(
    "WEBHOOK_DB_PATH",
    os.path.join(os.path.dirname(__file__), "webhooks.db"),
)


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS payloads (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            hook_uuid   TEXT    NOT NULL,
            method      TEXT    NOT NULL,
            headers     TEXT    NOT NULL DEFAULT '{}',
            body        TEXT,
            raw_body    TEXT,
            query_params TEXT   NOT NULL DEFAULT '{}',
            source_ip   TEXT,
            timestamp   TEXT    NOT NULL,
            status_code INTEGER NOT NULL DEFAULT 200
        );

        CREATE INDEX IF NOT EXISTS idx_hook_uuid ON payloads(hook_uuid);
        CREATE INDEX IF NOT EXISTS idx_timestamp ON payloads(timestamp);
    """)
    conn.commit()
    conn.close()


def insert_payload(hook_uuid: str, method: str, headers: dict,
                   body: str | None, raw_body: str | None,
                   query_params: dict, source_ip: str | None,
                   status_code: int = 200) -> int:
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO payloads (hook_uuid, method, headers, body, raw_body, "
        "query_params, source_ip, timestamp, status_code) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (hook_uuid, method, json.dumps(dict(headers)),
         body, raw_body, json.dumps(dict(query_params)),
         source_ip or "", datetime.utcnow().isoformat() + "Z", status_code),
    )
    conn.commit()
    row_id = cur.lastrowid
    conn.close()
    return row_id


def get_payloads(hook_uuid: str | None = None, method: str | None = None,
                 status: int | None = None, search: str | None = None,
                 page: int = 1, per_page: int = 20) -> tuple[list[dict], int]:
    conn = get_conn()
    clauses = ["1=1"]
    params = []

    if hook_uuid:
        clauses.append("hook_uuid = ?")
        params.append(hook_uuid)
    if method:
        clauses.append("method = ?")
        params.append(method.upper())
    if status:
        clauses.append("status_code = ?")
        params.append(status)
    if search:
        clauses.append("(body LIKE ? OR raw_body LIKE ? OR headers LIKE ?)")
        s = f"%{search}%"
        params.extend([s, s, s])

    where = " AND ".join(clauses)
    total = conn.execute(
        f"SELECT COUNT(*) FROM payloads WHERE {where}", params
    ).fetchone()[0]

    offset = (page - 1) * per_page
    rows = conn.execute(
        f"SELECT * FROM payloads WHERE {where} "
        "ORDER BY id DESC LIMIT ? OFFSET ?",
        [*params, per_page, offset],
    ).fetchall()

    payloads = [dict(r) for r in rows]
    # Parse stored JSON fields
    for p in payloads:
        try:
            p["headers"] = json.loads(p["headers"])
        except (json.JSONDecodeError, TypeError):
            p["headers"] = {}
        try:
            p["query_params"] = json.loads(p["query_params"])
        except (json.JSONDecodeError, TypeError):
            p["query_params"] = {}

    conn.close()
    return payloads, total


def get_payload(payload_id: int) -> dict | None:
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM payloads WHERE id = ?", (payload_id,)
    ).fetchone()
    conn.close()
    if row is None:
        return None
    p = dict(row)
    try:
        p["headers"] = json.loads(p["headers"])
    except (json.JSONDecodeError, TypeError):
        p["headers"] = {}
    try:
        p["query_params"] = json.loads(p["query_params"])
    except (json.JSONDecodeError, TypeError):
        p["query_params"] = {}
    return p


def prune_old_payloads(hook_uuid: str, max_per_hook: int):
    """Delete oldest payloads for a hook beyond max_per_hook."""
    conn = get_conn()
    conn.execute(
        "DELETE FROM payloads WHERE id NOT IN ("
        "SELECT id FROM payloads WHERE hook_uuid = ? "
        "ORDER BY id DESC LIMIT ?"
        ") AND hook_uuid = ?",
        (hook_uuid, max_per_hook, hook_uuid),
    )
    conn.commit()
    conn.close()


def update_status(payload_id: int, status_code: int):
    conn = get_conn()
    conn.execute(
        "UPDATE payloads SET status_code = ? WHERE id = ?",
        (status_code, payload_id),
    )
    conn.commit()
    conn.close()
