# Hanzi Deck backend and sync architecture

Status: proposed; architecture deliverable only
Updated: 2026-09-20

## 1. Decisions and invariants

1. **Local is the write path.** Every user action atomically commits to the device database and durable outbox before network work. Study UX never waits for cloud.
2. **Union, never replace.** Server snapshots are merged, never assigned over local state. A local live record missing from the backend is uploaded on login/bootstrap and periodic reconciliation.
3. **Immutable learning facts.** Reviews, attempts, imports, and setting changes get globally unique event IDs. SRS/counters are projections, preventing lost concurrent increments.
4. **Deterministic convergence.** Entity fields use hybrid logical clocks (HLC) plus stable device/mutation tie-breakers. Relationships use observed-remove sets.
5. **Soft deletion.** Tombstones replicate for 400 days. Hard deletion occurs only in verified privacy erasure, after a 30-day recovery window.
6. **One account, linked identities.** Telegram, Google (including consumer Gmail accounts), and verified email/password identities link to an opaque user UUID. Email is not an account key.
7. **Secrets stay local.** API keys, provider tokens, password material, and raw identity payloads never enter sync or analytics.
8. **Content-free analytics.** Never send words, sentences, translations, answers, clipboard contents, filenames, or API keys. Import metrics are method and counts only.

## 2. Context and deployment shape

```text
Learner (web/iOS/Android)
  └─ Expo app
       ├─ local DB + recovery snapshot
       ├─ domain/SRS projections
       ├─ outbox + pull cursor + reconciler
       └─ content-free telemetry buffer
                 │ TLS / JSON
                 ▼
          Edge/API gateway
        ┌────────┼─────────────┐
        ▼        ▼             ▼
     Identity   Sync        Telemetry
        │        │             │
        └────────┴──────┬──────┘
                        ▼
        PostgreSQL + disposable Redis + encrypted backups
                        │
          Telegram OIDC / Google OIDC / email provider
```

First release: a stateless modular monolith plus worker, managed PostgreSQL, Redis, object storage, and email provider. Logical boundaries remain explicit; split only after measured scale/security need.

### Inner service catalog

| Boundary | Responsibilities | Durable writes |
|---|---|---|
| Edge gateway | TLS, CORS allowlist, request IDs, body/rate limits | none |
| Identity service | users, identity linking/merge, session families, verification, recovery, erasure | identity/session tables |
| Telegram OIDC verifier | authorization code + PKCE; validate issuer, audience, signature, nonce/state/expiry | identity only |
| Google OIDC verifier | authorization code + PKCE; validate issuer, audience, signature, nonce/state/expiry | identity only |
| Credential service | Argon2id hash/check/rehash, password abuse controls | password hash |
| Notification worker | verification/reset email, retry/dead letter | delivery metadata |
| Sync ingress | ownership/schema validation, batch idempotency, sequenced change append | mutation/change log |
| Merge engine | field merge, tombstones, OR-set relationships, conflict journal | projections |
| Progress projector | fold immutable events into counters, SRS, active deck; drift repair | projections |
| Snapshot/reconciler | stable inventory, bucket hashes, bootstrap export | snapshots/reports |
| Telemetry ingress | strict allowlist, content-shape rejection, dedupe | analytics events |
| Aggregator/maintenance | product aggregates, compaction, deletion, restore checks | aggregates/jobs |

## 3. Authentication

### Identity model and linking

`users.id` is UUIDv7. `auth_identities` has unique `(provider, provider_subject)`; provider subjects are Telegram OIDC `sub`, Google `sub`, or canonical verified email for password identities.

Linking requires a signed-in session plus fresh proof from the new provider. Never auto-link because emails match. For a collision, authenticate both identities and perform a transactional, idempotent merge with an audit record. Unlink is blocked if it would leave no login method.

### Provider flows

- **Telegram (preferred):** use Telegram's current OIDC authorization-code flow, not the archived legacy Login Widget for new work. Use PKCE S256, exact redirect URI, one-time `state`, and `nonce`. Validate discovery/JWKS over pinned HTTPS origin; ID-token signature, exact issuer, configured client/bot audience, nonce, expiry/not-before, and authorization-code single use. Use immutable `sub`; never trust username. If a legacy widget must coexist during migration, verify its HMAC and `auth_date ≤ 5 min` server-side and bind to a one-time state.
- **Google:** Authorization Code + PKCE S256; exact redirect URI, one-time state and nonce. Validate JWKS signature, issuer, audience, authorized party when present, expiry/not-before, nonce, and code single use. Request only `openid email profile`; Gmail mailbox scopes are unnecessary.
- **Email + password:** normalize email for lookup/delivery while retaining display form. Password length 12–256 characters, allow paste/managers, no composition rules/periodic rotation. Hash with Argon2id and unique salt; initial target 64 MiB, 3 iterations, parallelism 1, benchmarked to operational latency. Optional KMS pepper stored separately. Check common/breached passwords without logging them. Generic auth responses prevent enumeration; throttle per IP/account/device.

### Confirmation, recovery, sessions

Registration creates a pending account. Send 32 random bytes encoded URL-safe; store only a keyed digest; expire after 30 minutes; one-time use; resend invalidates older tokens. Pending sessions cannot sync or link identities. Reset tokens expire in 15 minutes; successful reset revokes all refresh-token families and sends notice.

Access token lifetime: 10 minutes, kept in memory. Refresh token: opaque, rotated every use, family/reuse detection; Secure/HttpOnly/SameSite cookie on web, platform secure storage on native. OAuth Security BCP requires authorization-code flows and refresh replay protection through rotation or sender constraint. Cookie mutations also require CSRF token; exact CORS allowlist. Users can list and revoke sessions.

References:

- [Telegram Login / OIDC](https://core.telegram.org/bots/telegram-login)
- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/reference)
- [OAuth 2.0 Security Best Current Practice, RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

## 4. Canonical data schema

Every sync-owned entity includes `user_id, created_at, updated_at, deleted_at, revision bigint, hlc varchar(64), writer_device_id, last_mutation_id`. Wire timestamps are RFC 3339 UTC; numeric ranges are bounded safe integers.

```sql
users(id uuid pk, state, locale, created_at, verified_at, deletion_due_at)
auth_identities(id uuid pk, user_id fk, provider, provider_subject,
  email_normalized, email_verified, password_hash, created_at, last_used_at,
  unique(provider, provider_subject))
sessions(id uuid pk, user_id fk, device_id, family_id, refresh_hash,
  expires_at, rotated_at, revoked_at, last_seen_at)
auth_one_time_tokens(id uuid pk, user_id fk, purpose, token_digest,
  expires_at, consumed_at, superseded_at, attempt_count, created_at,
  unique(purpose, token_digest))
devices(id uuid pk, user_id fk, name, platform, app_version,
  schema_version, last_cursor, last_seen_at, revoked_at)

words(id uuid pk, user_id fk, hanzi text, pinyin text,
  translations jsonb, example_count int, created_at_client timestamptz,
  card_introduced_at timestamptz, card_active bool,
  card_last_studied_round int, card_last_incorrect_at timestamptz,
  word_shown_count int, srs_level int, srs_correct int, srs_incorrect int,
  srs_due_at timestamptz, card_srs_level int, card_srs_correct int,
  card_srs_incorrect int, card_srs_due_at timestamptz, card_lapses int)

sentences(id uuid pk, user_id fk, chinese text, pinyin text,
  translations jsonb, grammar_pattern text, sentence_shown_count int,
  last_shown_at timestamptz)
sentence_words(user_id, sentence_id, word_id, position, add_tag, removed_at)

study_events(id uuid pk, user_id, device_id, entity_type, entity_id,
  kind, mode, occurred_at, hlc, payload jsonb, mutation_id)
-- card_review, sentence_review, word_shown, sentence_attempt
-- answers and model feedback remain local; payload has correctness,
-- direction, round, and scheduling inputs only.

settings(user_id pk, language, tts_provider, tts_voice_uri, tts_rate,
  automatic_word_addition, onboarding_complete, language_selected,
  field_clocks jsonb)
device_state(user_id, device_id, mix_queue jsonb, mix_position int,
  card_round int, primary key(user_id, device_id))

mutations(user_id, mutation_id uuid, device_id, client_hlc, entity_type,
  entity_id, operation, body_hash, accepted_seq bigint, received_at,
  primary key(user_id, mutation_id))
change_log(user_id, seq bigint, mutation_id, entity_type, entity_id,
  operation, canonical_record jsonb, server_time, primary key(user_id, seq))
sync_heads(user_id pk, next_seq bigint, min_available_seq bigint)

analytics_events(event_id uuid pk, user_id_hash, install_id_hash,
  session_id uuid, name, occurred_at, received_at, app_version,
  platform, properties jsonb)
```

### Current StoreData mapping

| Current field | Canonical form | Rule |
|---|---|---|
| `words[]` | words + study events | bootstrap becomes one baseline; new progress uses events |
| `sentences[]`, `wordSentenceIndex` | sentences + sentence_words | index is derived |
| `attempts[]` | local answer + synced metadata event | never upload answer/evaluation feedback |
| `sentenceDataByLanguage` | language-keyed sentence projections | collections merge independently |
| `cardRound` | monotonic projection + per-device UI state | max; event order reproduces active deck |
| `mixQueue/mixPosition` | device_state | never overwrite another device's queue |
| onboarding/language/non-secret settings | settings | field-level LWW |
| `apiKey`, validation | secure local storage only | rejected by sync schema |
| `apiUrl`, `model` | local only initially | arbitrary provider config can be sensitive |

## 5. Local persistence and sync

Replace the mutable blob internally with transactional SQLite (native) and an IndexedDB-backed adapter (web). Keep the legacy blob as recovery source. Minimum tables: canonical entities, events, outbox, applied changes, sync state, migration journal, recovery snapshots.

### Atomic write

```text
BEGIN
  mutate local entity/projection
  append immutable domain event if progress changed
  append UUIDv7 outbox mutation with HLC
  update compatibility projection
COMMIT
render success → background sync
```

Outbox rows are removed only after acknowledgement of the exact mutation ID; keep compact acknowledged-ID dedupe metadata 30 days.

### Push/pull loop

1. `POST /v1/sync/push`: oldest 100 mutations / ≤512 KiB. Server transaction authenticates ownership, validates, deduplicates, merges, and appends sequenced canonical changes.
2. Mark only acknowledged IDs; never discard local entity data.
3. `GET /v1/sync/changes?cursor=N&limit=500`: apply page and advance cursor in one local transaction to its stable `headCursor`.
4. Push any merge repair; pull until caught up.
5. First account attachment, restore, cursor expiry, invariant failure, and every 30 days trigger reconciliation.

### Reconciliation: guarantee upload of backend-missing local records

1. Record local high-water HLC `H0`; UI writes continue.
2. Fetch stable, paginated server inventory `(type,id,revision,content_hash,deleted_at)`, snapshot token, and head cursor.
3. Compare 256 buckets by `SHA-256(type || id) mod 256`; server bucket hashes skip equal buckets.
4. **Local live, absent server:** enqueue complete upsert. This covers data created before outbox support.
5. **Server live, absent local:** download and merge; absence never means deletion.
6. **Both differ:** deterministic merge; enqueue repair if result differs from server.
7. **Tombstone conflict:** later total-order clock wins; a newer live edit resurrects explicitly.
8. Sync mutations after `H0`, pull through snapshot head, then resume normal loop. Report counts/hashes only.

### Conflict rules

| Data | Merge |
|---|---|
| Immutable study/import events | set union by UUID; same ID/different hash is quarantined and alerted |
| Counters/SRS | recompute from event union plus signed bootstrap baseline; never add/max projections |
| Word/sentence scalar collision | field LWW by `(field_hlc, writer_device_id, mutation_id)`; loser in 30-day journal |
| Translation | same independently per language |
| sentence_words | observed-remove set: removal clears only observed add-tags |
| Settings | field LWW; secret/local-only keys rejected |
| cardRound | max; review event ordering then deterministically projects active deck |
| Active deck | rerun existing SRS/`fillActivePool` rules; do not merge booleans |
| Queue/position | device scoped |
| Tombstone/update | later total-order clock; resurrection audited |

Clamp physical HLC component if device time differs from server by >24 hours; return corrected HLC. Stable lexicographic IDs break every tie.

### Cache, TTL, offline

| Artifact | Policy |
|---|---|
| Local learning data | no TTL; authoritative offline UX; encrypted where platform permits |
| Outbox | no TTL pre-ack; full-jitter retry 1 s→5 min; retry on foreground/connectivity |
| Cursor/change log | durable cursor; server changes/tombstones 400 days; expiry → full reconcile |
| Auth access token | 10 min; refresh session bounded and revocable |
| User HTTP reads | private ETag, `Cache-Control: private, no-cache`; no shared cache |
| Dictionaries/static app | content hashes, immutable one year; manifest 5 min |
| Redis | 10 min–24 h acceleration only; PostgreSQL is truth |
| Telemetry buffer | 7 days or 10,000 events; oldest drops; never blocks learning sync |
| Conflict journal | 30 days |

All study/import/settings features remain offline. Login and backend-dependent AI are clearly unavailable offline.

## 6. API contract

All routes are `/v1` JSON; access token auth; `Idempotency-Key` on actions; `X-Request-ID`; strict size and property schemas.

```http
POST /v1/auth/register
POST /v1/auth/email/verify
POST /v1/auth/email/resend
POST /v1/auth/login/password
POST /v1/auth/login/telegram/start
POST /v1/auth/login/telegram/callback
POST /v1/auth/login/google/start
POST /v1/auth/login/google/callback
POST /v1/auth/refresh
POST /v1/auth/logout
POST /v1/auth/password/forgot
POST /v1/auth/password/reset
GET  /v1/auth/sessions
DELETE /v1/auth/sessions/{id}
POST /v1/auth/identities/link/{provider}

POST /v1/sync/push
GET  /v1/sync/changes?cursor=123&limit=500
POST /v1/sync/snapshot
POST /v1/sync/reconcile/report
POST /v1/telemetry/batch
GET  /v1/account/export
DELETE /v1/account
```

Push:

```json
{
  "deviceId": "uuid",
  "schemaVersion": 3,
  "baseCursor": 123,
  "mutations": [{
    "mutationId": "uuidv7",
    "hlc": "2026-09-20T12:00:00.000Z-0001-device",
    "entity": {"type": "word", "id": "uuid"},
    "operation": "upsert",
    "body": {"pinyin": "...", "fieldClocks": {"pinyin": "..."}}
  }]
}
```

Response returns accepted mutation→sequence mappings, itemized rejections, next cursor, and server HLC. A partial push is safe to retry. Error envelope: `{error:{code,message,requestId,retryable,details}}`. Use 400 validation, 401 auth, 403 policy, 409 user-action conflict, 413 size, 422 schema, 429 + Retry-After, and retryable 5xx.

Server supports current plus previous two client schemas. `GET /v1/meta` reports capabilities. Unsupported clients fail closed without modifying outbox/local data.

## 7. Product metrics

Common fields: event ID, name, time, session ID, HMAC-pseudonymous install/user IDs, app version, platform, allowlisted properties. No auth identifiers in analytics. `first_visit` fires once/install.

| Event | Allowed properties |
|---|---|
| first_visit | suggested_language, platform, app_version |
| login_started/succeeded/failed | method telegram/google/password, is_link, bounded failure_class |
| language_chosen | language, onboarding/settings, suggested_match |
| word_addition_mode_chosen | manual/automatic, onboarding/settings |
| import_completed | typed/paste/hsk/qr, word_count, sentence_count, duplicate_count, duration bucket; **never content** |
| mode_entered | cards/sentences/listening/mix, bounded entry_point |
| card_answered | correct, SRS level before/after, latency bucket, cards/mix |
| sentence_answered | correct, direction, latency bucket, sentences/listening/mix; no answer/ID |
| listening_item_completed | word/sentence, revealed/correct/incorrect, listening/mix |
| mix_item_completed | bounded item kind and result |
| settings_changed | allowlisted setting and bucketed old/new; never API settings/voice URI |

Derived: mode entry and completion; cards/sentences/listening/mix correctness; login conversion; language/manual/automatic selection; imports/counts by method; D1/D7/D30 retention. Suppress cohorts under 20. Operational sync metrics remain separate.

## 8. Security and privacy

Threats: stolen token/device, malicious client, account enumeration, OAuth/login CSRF/replay, XSS/CSRF/injection, provider impersonation, scraping, insider access, backup leak, sync bugs.

Controls:

- TLS 1.2+, HSTS, CSRF, CSP, exact CORS, request depth/size/rate limits, parameterized SQL, output encoding, dependency/container scanning.
- Ownership only from session; strict UUID/length/range/enum checks. Database private. Least-privilege RBAC, JIT audited production access, secrets manager, signed artifacts/SBOM.
- KMS envelope encryption for DB/backups; keys separated by environment and rotated.
- Logs: request ID, route template, status, duration, byte counts, pseudonyms only. Never bodies, headers/tokens, email, learning content, clipboard contents, keys. Automated redaction canaries.
- Export/correction/unlink/deletion workflows. Delete disables login then queues purge after a reversible 30-day period; minimize separately retained security audit data.

## 9. Observability and operations

SLOs, rolling 30 days: auth/sync availability 99.9%; accepted mutation durability 99.999%; p95 push/pull <500 ms for 100 mutations; 99% of online clients converge <60 s. Local study has no cloud dependency.

Measure requests/errors/duration; auth success/throttle by method; outbox age/size; push accept/reject/dedupe; cursor lag/expiry; reconcile missing-local/missing-server/repair counts; conflicts; projector drift; log growth; worker lag; DB saturation/replication; email; telemetry rejects. No raw IDs as metric labels.

Payload-free OpenTelemetry traces. Alert on SLO burn, any accepted-mutation loss invariant, p95 outbox age >10 min, hash mismatch/conflict spike, projector drift, failed backup/PITR, email failure, DB capacity. Synthetic flow: register→verify, login, offline mutation→sync→second-device convergence.

## 10. Deployment, migration, rollback

- Isolated dev/staging/prod accounts, DBs, keys, OAuth clients, Telegram bots, mail domains. IaC and immutable signed images.
- Multi-AZ PostgreSQL + PITR; daily encrypted cross-account/region backup; quarterly restore drill. Targets RPO ≤5 min, RTO ≤60 min.
- Canary 1%→10%→50%→100%, gated on auth/sync error, latency, rejects, and invariants. Graceful drain. Workers follow compatible schema.
- Database: **expand → backfill → dual read/write → contract**. No destructive migration in the introducing release. Online indexes and checkpointed bounded jobs.
- Local: checksum `hanzi-deck:v1`; make timestamped recovery snapshot; copy-on-write migrate; validate counts, IDs, references, and projections; atomically flip active pointer. Never auto-delete source blob. Failure reopens old storage and retains journal.
- Bootstrap has baseline ID/checksum and idempotency key. Server count/hash validation is required before completion.
- Rollback deploys the prior image without reversing compatible DB changes. Flags disable new writers. Merge regression: stop writer, preserve outboxes, rebuild projections from immutable events/change log, emit repair changes. PITR is last resort; replay accepted mutation log after restore.

## 11. Delivery and acceptance

1. Local DB/outbox/migration journal behind a flag; prove crash atomicity/recovery.
2. Identity/session foundation; Telegram OIDC, Google OIDC, password confirmation; abuse tests.
3. Words/settings sync, then sentences/relations, immutable study events/projector, device queues.
4. Reconciliation/second device; fault-inject drops, duplicates, reordering, skew, stale clients, concurrency.
5. Privacy-filtered telemetry and dashboards.
6. Gradual opt-in; local-only remains supported.

Acceptance:

- Pre-sync local records absent server are detected and uploaded.
- Concurrent offline reviews preserve both facts and reproduce identical SRS.
- Replayed pushes are idempotent; cursor paging is crash-safe.
- Logout/account switch never deletes local data; local data is namespaced by account.
- Learning content/secrets fail telemetry schemas and never enter logs.
- Failed local/server migrations roll back without losing mutations.
- Restore/replay meets RPO/RTO; current and previous two client versions coexist.

## 12. ADR summary

- **ADR-001 Local outbox + change log:** protects offline behavior and makes retries safe.
- **ADR-002 Immutable progress events:** counter LWW/max would lose concurrent reviews.
- **ADR-003 Field clocks + OR-set relationships:** deterministic convergence with recoverable conflict journal.
- **ADR-004 Modular monolith first:** simplest transactional operations with explicit boundaries.
- **ADR-005 PostgreSQL truth:** integrity, sequencing, JSON flexibility, PITR; Redis disposable.
- **ADR-006 Content-free telemetry:** product decisions need counts/outcomes, not learner text.
