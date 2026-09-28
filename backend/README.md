# Hanzi Deck backend

Requires Bun 1.3+. Copy `.env.example` to `.env` and run `bun run src/server.ts`.
The service uses Bun's built-in SQLite driver and creates `backend/data/app.sqlite`.

For local smoke tests, set `AUTH_DEV_MODE=1` and use `POST /v1/auth/dev/session`
with `{ "email": "local@example.test", "name": "Local tester" }`.

Provider setup uses `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_REDIRECT_URI`, `TELEGRAM_CLIENT_ID`, `TELEGRAM_CLIENT_SECRET`, and
`TELEGRAM_REDIRECT_URI`. The redirect URI must be registered with each provider.

Observability endpoints are `GET /metrics` for Prometheus and
`POST /v1/telemetry/batch` for client events. Client events are deduplicated
and stored in SQLite; Telegram login events store the verified chat ID, full
name, and username, but these identity fields are never used as metric labels.
Learner text, answers, words, and API keys are not collected.
