# Conversation Viewer

Internal Next.js app to view broker client conversations from Postgres (`chat_audit_logs` + `chat_sessions`).

## Features

- Internal credential login via NextAuth
- Client inbox with search/filters
- Session list per client
- Full transcript view (user + assistant events)
- SSE live updates with reconnect and `afterAuditId` resume
- Handles null/empty `session_id` with synthetic `__unscoped__` bucket

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env template and fill values:

```bash
cp .env.example .env.local
```

Note: if you store bcrypt hashes in `.env.local`, escape `$` as `\$` inside `ADMIN_USERS_JSON` or use `ADMIN_USERS_JSON_B64`.

3. Generate bcrypt hash for admin password:

```bash
node scripts/hash-password.mjs mypassword
```

4. Start dev server:

```bash
npm run dev
```

Open http://localhost:3000/login.

## API Endpoints

- `GET /api/clients`
- `GET /api/clients/[userPhone]/sessions`
- `GET /api/clients/[userPhone]/messages?sessionId=...&afterAuditId=...`
- `GET /api/stream/messages?userPhone=...&sessionId=...&afterAuditId=...`

All endpoints require authenticated session.
