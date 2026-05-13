# tap — Webhook Inspector & Replay Tool

A developer tool for receiving, inspecting, and replaying webhook payloads. Works with Stripe, Shopify, GitHub, or any third-party webhook sender.

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+

### 1. Start the backend

```bash
cd backend
pip install -r requirements.txt
python main.py
# → http://localhost:8000
```

### 2. Start the frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### 3. Send test webhooks

```bash
bash demo.sh
```

Or manually:

```bash
# Create a webhook endpoint
curl -s -X POST http://localhost:8000/hooks/new

# Send a payload
curl -X POST http://localhost:8000/hooks/{your-uuid} \
  -H "Content-Type: application/json" \
  -d '{"event": "test", "data": {"hello": "world"}}'
```

## Features

- **Unique endpoints** — each session gets a `/hooks/{uuid}` URL accepting any HTTP method
- **Live inspector** — incoming webhooks appear in real time via Server-Sent Events
- **Request history** — paginated list with search and filter by method/status/content
- **Replay** — resend any past request to a custom target URL with configurable headers
- **HMAC signature simulation** — toggle to add a Stripe-style `Stripe-Signature` header on replay (SHA256 HMAC)
- **Export** — download any payload as a JSON file
- **Dark/light mode** — persistent theme toggle
- **Syntax-highlighted JSON** — color-coded keys, strings, numbers, booleans
- **Keyboard shortcuts** — `j/k` navigate payloads, `r` replay, `e` export
- **Cancelable requests** — AbortController-powered cancel for replay requests
- **Rate limiting** — per-IP sliding window to prevent abuse
- **SSRF protection** — private/reserved IPs blocked on replay

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `j` / `↓` | Next payload in list |
| `k` / `↑` | Previous payload in list |
| `r` | Open replay modal for selected payload |
| `e` | Export selected payload as JSON |

## Demo Scenario

Run the demo script to simulate a realistic workflow:

```bash
bash demo.sh
```

This sends three webhook payloads:
1. **Stripe** — `checkout.session.completed` event
2. **Shopify** — `orders/create` webhook
3. **GitHub** — `push` event

Open http://localhost:5173 to see them arrive in real time.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/hooks/new` | Create new webhook endpoint |
| ANY | `/hooks/{uuid}` | Receive webhook (GET, POST, PUT, PATCH, DELETE, etc.) |
| GET | `/payloads` | List payloads (paginated, filterable) |
| GET | `/payloads/{id}` | Get payload detail |
| GET | `/export/{id}` | Download payload as JSON |
| POST | `/replay/{id}` | Replay a payload to a target URL |
| GET | `/stream` | SSE stream for real-time updates |

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBHOOK_HOST` | `127.0.0.1` | Backend bind address |
| `WEBHOOK_PORT` | `8000` | Backend port |
| `WEBHOOK_FRONTEND_URL` | `http://localhost:5173` | Frontend origin for CORS |
| `WEBHOOK_DB_PATH` | `backend/webhooks.db` | SQLite database path |
| `WEBHOOK_RELOAD` | `false` | Enable hot reload (`1` or `true`) |

### Rate Limits

Per-IP sliding window (60s):

| Endpoint | Limit |
|----------|-------|
| `/hooks/new`, `/replay/*`, `/stream` | 10 req/min |
| `/hooks/*` (webhook receiver) | 60 req/min |
| Other read endpoints | 120 req/min |

## Security

- **XSS protection** — all JSON output is HTML-escaped before syntax highlighting
- **SSRF protection** — replay target is validated against private/reserved IP ranges
- **No default HMAC secrets** — random secret auto-generated per session
- **CORS restricted** — only the configured frontend origin is allowed
- **CSP headers** — Content-Security-Policy set on all responses
- **Request size limit** — 1MB max body size
- **UUID validation** — webhook endpoints must be valid UUID v4
- **Rate limiting** — per-IP sliding window per endpoint group

> **Authentication** — not yet implemented. The tool is designed for local development. API key / session authentication is planned for a future release. Contributions welcome.

## License

MIT
