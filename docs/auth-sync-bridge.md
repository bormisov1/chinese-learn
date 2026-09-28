# Auth and sync bridge

This document is the small first-release contract between the Expo client and
the Bun service. It deliberately keeps the local-first store and adds a
server-backed account without moving provider secrets or the DeepSeek key to
the backend.

## Authentication

The client opens `GET /v1/auth/google/start` or
`GET /v1/auth/telegram/start` with `redirect_uri`, `state`, and `device_id`.
The service stores the state server-side, completes the provider's
authorization-code flow, creates or finds a user by the immutable provider
subject, stores the provider profile needed for account display, and redirects
to `hanzideck://auth/callback?code=...&state=...` (or the web callback URL).
The client exchanges the one-time code at `POST /v1/auth/exchange`, stores the
short-lived access token and rotating refresh token in the platform's local
store for this first slice, then calls `POST /v1/sync/bootstrap`.

## Bootstrap and merge

`POST /v1/sync/bootstrap` accepts the local snapshot and a client/device id;
the server merges it into the authenticated user and returns the canonical
snapshot plus a cursor. The operation is idempotent by `bootstrap_id`.

Merge rules:

- words use `hanzi` as the natural key; translations merge per language;
  scalar fields use deterministic last-write-wins by `updatedAt`, then id;
- sentences use `id` when present and a stable hash of normalized Chinese text
  otherwise; word-to-sentence references are rebuilt from the merged data;
- attempts and round completions are set unions by their stable event key;
- SRS counters are merged with max for this bootstrap-only implementation,
  while later event sync can replace this with event-derived projections;
- settings merge field-by-field; `apiKey` and provider configuration remain
  local-only; mix queue and position remain device-local.

The backend stores the user, linked SSO identities, sessions, and the merged
snapshot in SQLite. A future incremental `/v1/sync/push`/`changes` protocol
can be added without changing the bootstrap payload shape.
