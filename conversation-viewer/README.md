# Conversation Viewer

Internal Next.js app to view broker client conversations from Postgres (`chat_audit_logs` + `chat_sessions`).

## Features

- Internal credential login via NextAuth
- Client inbox with search/filters
- Session list per client
- Full transcript view (user + assistant events)
- Realtime SSE updates backed by Postgres `LISTEN/NOTIFY`
- Handles null/empty `session_id` with synthetic `__unscoped__` bucket

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables (`.env.local` or `.env`) and fill values:

```bash
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=...
ADMIN_USERNAME=admin
ADMIN_PASSWORD=...
DATABASE_URL=postgresql://...
STREAM_HEARTBEAT_MS=15000
STREAM_FALLBACK_POLL_MS=30000
```

Note: if you store bcrypt hashes in `.env.local`, escape `$` as `\$` inside `ADMIN_USERS_JSON` or use `ADMIN_USERS_JSON_B64`.

3. Apply DB migration (required once) to enable realtime notifications:

```bash
psql "$DATABASE_URL" -f sql/2026-02-27-chat-audit-realtime.sql
```

If `psql` is unavailable, execute that SQL file via your preferred DB client.

4. Generate bcrypt hash for admin password:

```bash
node scripts/hash-password.mjs mypassword
```

5. Start dev server:

```bash
npm run dev
```

Open http://localhost:3000/login.

## API Endpoints

- `GET /api/clients`
- `GET /api/clients/[userPhone]/sessions`
- `GET /api/clients/[userPhone]/messages?sessionId=...&afterAuditId=...`
- `GET /api/stream/messages?userPhone=...&sessionId=...&afterAuditId=...`
- `GET /api/stream/updates?userPhone=...` (optional filter)

All endpoints require authenticated session.
