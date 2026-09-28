import { Database } from "bun:sqlite";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

const port = Number(process.env.PORT ?? 8787);
const dbPath = process.env.DATABASE_PATH ?? "./data/app.sqlite";
const publicOrigin = process.env.PUBLIC_ORIGIN ?? `http://localhost:${port}`;
const devAuth = process.env.AUTH_DEV_MODE === "1";
if (dirname(dbPath) !== ".") mkdirSync(dirname(dbPath), { recursive: true });
const db = new Database(dbPath, { create: true });
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, name TEXT, email TEXT, picture TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS identities (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), provider TEXT NOT NULL,
    subject TEXT NOT NULL, profile_json TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE(provider, subject)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), refresh_hash TEXT NOT NULL,
    created_at TEXT NOT NULL, expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS auth_codes (
    code_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
    redirect_uri TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT
  );
  CREATE TABLE IF NOT EXISTS oauth_states (
    state_hash TEXT PRIMARY KEY, provider TEXT NOT NULL, redirect_uri TEXT NOT NULL,
    expires_at TEXT NOT NULL, code_verifier TEXT NOT NULL, nonce TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS user_snapshots (
    user_id TEXT PRIMARY KEY REFERENCES users(id), snapshot_json TEXT NOT NULL,
    updated_at TEXT NOT NULL, bootstrap_id TEXT
  );
  CREATE TABLE IF NOT EXISTS analytics_events (
    event_id TEXT PRIMARY KEY, name TEXT NOT NULL, occurred_at TEXT NOT NULL,
    received_at TEXT NOT NULL, platform TEXT NOT NULL, app_version TEXT NOT NULL,
    install_id_hash TEXT NOT NULL, properties_json TEXT NOT NULL
  );
`);
try { db.exec("ALTER TABLE oauth_states ADD COLUMN code_verifier TEXT NOT NULL DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE oauth_states ADD COLUMN nonce TEXT NOT NULL DEFAULT ''"); } catch {}

type Provider = "google" | "telegram";
type Snapshot = Record<string, unknown>;

const metricCounters = new Map<string, number>();
const metricHistograms = new Map<string, { buckets: number[]; counts: number[]; sum: number; count: number }>();
const requestBuckets = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];
const telemetryNames = new Set([
  "app_opened", "first_app_opened", "login_started", "login_succeeded", "login_failed",
  "language_switched", "language_switch_failed", "words_added", "round_started",
  "round_completed", "card_reviewed", "sentence_practice_completed", "listening_item_completed",
  "mix_item_completed", "sync_bootstrap", "study_mode_selected",
]);
const metricLabel = (value: string) => value.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 80) || "unknown";
const inc = (name: string, labels: Record<string, string> = {}, amount = 1) => {
  const suffix = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${metricLabel(value)}`).join(",");
  const key = suffix ? `${name}|${suffix}` : name;
  metricCounters.set(key, (metricCounters.get(key) ?? 0) + amount);
};
const observe = (name: string, seconds: number, labels: Record<string, string> = {}) => {
  const suffix = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${metricLabel(value)}`).join(",");
  const key = suffix ? `${name}|${suffix}` : name;
  const entry = metricHistograms.get(key) ?? { buckets: requestBuckets, counts: requestBuckets.map(() => 0), sum: 0, count: 0 };
  entry.count += 1; entry.sum += seconds;
  entry.buckets.forEach((bucket, index) => { if (seconds <= bucket) entry.counts[index] += 1; });
  metricHistograms.set(key, entry);
};
const labelsText = (value: string) => {
  const labels = value.split(",").filter(Boolean).map(item => {
    const index = item.indexOf("=");
    return `${item.slice(0, index)}="${item.slice(index + 1)}"`;
  });
  return labels.length ? `{${labels.join(",")}}` : "";
};
const prometheus = () => {
  let output = "# HELP http_requests_total HTTP requests handled by the backend.\n# TYPE http_requests_total counter\n";
  const counterNames = new Set([...metricCounters.keys()].map(key => key.split("|")[0]));
  for (const name of counterNames) if (name !== "http_requests_total") output += `# TYPE ${name} counter\n`;
  for (const [key, value] of metricCounters) {
    const [name, suffix = ""] = key.split("|");
    output += `${name}${labelsText(suffix)} ${value}\n`;
  }
  for (const [key, value] of metricHistograms) {
    const [name, suffix = ""] = key.split("|");
    value.buckets.forEach((bucket, index) => output += `${name}_bucket${labelsText(suffix ? `${suffix},le=${bucket}` : `le=${bucket}`)} ${value.counts[index]}\n`);
    output += `${name}_bucket${labelsText(suffix ? `${suffix},le=+Inf` : "le=+Inf")} ${value.count}\n`;
    output += `${name}_sum${labelsText(suffix)} ${value.sum}\n${name}_count${labelsText(suffix)} ${value.count}\n`;
  }
  return output;
};

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization", "access-control-allow-methods": "GET,POST,OPTIONS" } });
const now = () => new Date();
const iso = () => now().toISOString();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const token = () => randomBytes(32).toString("base64url");
const base64Url = (value: string) => Buffer.from(value).toString("base64url");
const pkceChallenge = async (verifier: string) => base64Url(Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
const safeJson = (value: unknown): Snapshot => value && typeof value === "object" && !Array.isArray(value) ? value as Snapshot : {};

function recordTelemetry(event: Snapshot) {
  const name = String(event.name ?? "");
  if (!telemetryNames.has(name)) return false;
  const properties = safeJson(event.properties);
  const boundedProperties: Snapshot = {};
  for (const key of ["platform", "provider", "source", "language", "from", "to", "mode", "kind", "result", "round", "count", "size", "firstTime", "chatId", "fullName", "username"]) {
    if (properties[key] !== undefined) boundedProperties[key] = typeof properties[key] === "number" ? Math.max(0, Math.min(100000, Math.trunc(Number(properties[key])))) : String(properties[key]).slice(0, 40);
  }
  const eventId = String(event.eventId ?? "");
  if (!eventId) return false;
  const insert = db.query("INSERT OR IGNORE INTO analytics_events(event_id, name, occurred_at, received_at, platform, app_version, install_id_hash, properties_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(eventId, name, String(event.occurredAt ?? iso()), iso(), String(event.platform ?? "unknown").slice(0, 20), String(event.appVersion ?? "unknown").slice(0, 40), hash(String(event.installId ?? "unknown")), JSON.stringify(boundedProperties));
  if (insert.changes === 0) return true;
  const labels: Record<string, string> = { event: name };
  for (const key of ["platform", "provider", "language", "from", "to", "source", "mode", "kind", "result", "firstTime"]) if (boundedProperties[key] !== undefined) labels[key] = String(boundedProperties[key]);
  if (boundedProperties.round !== undefined) labels.round = String(boundedProperties.round);
  inc("client_events_total", labels);
  return true;
}

async function verifyIdToken(value: string, issuer: string, audience: string, jwksUrl: string, nonce: string) {
  const [encodedHeader, encodedPayload, encodedSignature] = value.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) throw new Error("Malformed identity token");
  const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString()) as { kid?: string; alg?: string };
  const claims = JSON.parse(Buffer.from(encodedPayload, "base64url").toString()) as Record<string, unknown>;
  if (header.alg !== "RS256" || !header.kid || claims.iss !== issuer || claims.aud !== audience || (nonce && claims.nonce !== nonce) || Number(claims.exp ?? 0) < Math.floor(Date.now() / 1000)) throw new Error("Invalid identity token claims");
  const keys = await (await fetch(jwksUrl)).json() as { keys?: JsonWebKey[] };
  const key = keys.keys?.find(candidate => (candidate as JsonWebKey & { kid?: string }).kid === header.kid);
  if (!key) throw new Error("Unknown identity token key");
  const cryptoKey = await crypto.subtle.importKey("jwk", key, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const signature = Buffer.from(encodedSignature, "base64url");
  const signed = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  if (!await crypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, signature, signed)) throw new Error("Invalid identity token signature");
  return claims;
}

function createUser(provider: Provider, subject: string, profile: Snapshot) {
  const existing = db.query("SELECT user_id FROM identities WHERE provider = ? AND subject = ?").get(provider, subject) as { user_id: string } | null;
  if (existing) {
    db.query("UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), picture = COALESCE(?, picture) WHERE id = ?")
      .run(profile.name as string | null, profile.email as string | null, profile.picture as string | null, existing.user_id);
    return existing.user_id;
  }
  const userId = randomUUID();
  const time = iso();
  db.transaction(() => {
    db.query("INSERT INTO users(id, name, email, picture, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(userId, profile.name ?? null, profile.email ?? null, profile.picture ?? null, time);
    db.query("INSERT INTO identities(id, user_id, provider, subject, profile_json, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(randomUUID(), userId, provider, subject, JSON.stringify(profile), time);
  })();
  return userId;
}

function issueCode(userId: string, redirectUri: string) {
  const code = token();
  db.query("INSERT INTO auth_codes(code_hash, user_id, redirect_uri, expires_at) VALUES (?, ?, ?, ?)")
    .run(hash(code), userId, redirectUri, new Date(Date.now() + 5 * 60_000).toISOString());
  return code;
}

function issueSession(userId: string) {
  const accessToken = token();
  const refreshToken = token();
  db.query("INSERT INTO sessions(id, user_id, refresh_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)")
    .run(accessToken, userId, hash(refreshToken), iso(), new Date(Date.now() + 30 * 86400_000).toISOString());
  const identity = db.query("SELECT provider, profile_json FROM identities WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(userId) as { provider: string; profile_json: string } | null;
  const profile = identity ? safeJson(JSON.parse(identity.profile_json)) : {};
  return {
    accessToken,
    refreshToken,
    userId,
    authProfile: {
      provider: identity?.provider,
      chatId: profile.chatId as string | undefined,
      fullName: profile.name as string | undefined,
      username: profile.username as string | undefined,
    },
  };
}

function userForAccess(request: Request) {
  const value = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!value) return null;
  return db.query("SELECT user_id FROM sessions WHERE id = ? AND expires_at > ?").get(value, iso()) as { user_id: string } | null;
}

function localSnapshot(userId: string): Snapshot {
  const row = db.query("SELECT snapshot_json FROM user_snapshots WHERE user_id = ?").get(userId) as { snapshot_json: string } | null;
  return row ? safeJson(JSON.parse(row.snapshot_json)) : {};
}

function keyForSentence(sentence: Snapshot) {
  return String(sentence.id ?? sentence.chinese ?? "").trim().normalize("NFC");
}

function mergeWords(local: Snapshot[], incoming: Snapshot[]) {
  const byKey = new Map<string, Snapshot>();
  for (const word of [...local, ...incoming]) {
    const key = String(word.hanzi ?? "").trim();
    if (!key) continue;
    const previous = byKey.get(key);
    if (!previous) { byKey.set(key, word); continue; }
    const newer = Number(word.updatedAt ?? word.createdAt ?? 0) >= Number(previous.updatedAt ?? previous.createdAt ?? 0) ? { ...previous, ...word } : { ...word, ...previous };
    for (const field of ["exampleCount", "wordShownCount", "srsLevel", "srsCorrect", "srsIncorrect", "cardSrsLevel", "cardSrsCorrect", "cardSrsIncorrect", "cardLapses"]) newer[field] = Math.max(Number(previous[field] ?? 0), Number(word[field] ?? 0));
    newer.srsDueAt = Math.max(Number(previous.srsDueAt ?? 0), Number(word.srsDueAt ?? 0));
    newer.cardSrsDueAt = Math.max(Number(previous.cardSrsDueAt ?? 0), Number(word.cardSrsDueAt ?? 0));
    byKey.set(key, newer);
  }
  return [...byKey.values()];
}

function mergeList(local: Snapshot[], incoming: Snapshot[], key: (value: Snapshot) => string) {
  const result = new Map<string, Snapshot>();
  for (const item of [...local, ...incoming]) {
    const itemKey = key(item);
    if (!itemKey) continue;
    const previous = result.get(itemKey);
    result.set(itemKey, !previous ? item : (Number(item.updatedAt ?? item.at ?? item.completedAt ?? 0) >= Number(previous.updatedAt ?? previous.at ?? previous.completedAt ?? 0) ? { ...previous, ...item } : { ...item, ...previous }));
  }
  return [...result.values()];
}

function mergeSnapshot(server: Snapshot, client: Snapshot): Snapshot {
  const merged: Snapshot = { ...server, ...client };
  merged.words = mergeWords(Array.isArray(server.words) ? server.words as Snapshot[] : [], Array.isArray(client.words) ? client.words as Snapshot[] : []);
  merged.sentences = mergeList(Array.isArray(server.sentences) ? server.sentences as Snapshot[] : [], Array.isArray(client.sentences) ? client.sentences as Snapshot[] : [], keyForSentence);
  merged.attempts = mergeList(Array.isArray(server.attempts) ? server.attempts as Snapshot[] : [], Array.isArray(client.attempts) ? client.attempts as Snapshot[] : [], item => `${item.sentenceId}:${item.at}:${item.direction ?? ""}`);
  merged.roundCompletions = mergeList(Array.isArray(server.roundCompletions) ? server.roundCompletions as Snapshot[] : [], Array.isArray(client.roundCompletions) ? client.roundCompletions as Snapshot[] : [], item => String(item.round));
  merged.cardRound = Math.max(Number(server.cardRound ?? 0), Number(client.cardRound ?? 0));
  const serverByLanguage = safeJson(server.sentenceDataByLanguage), clientByLanguage = safeJson(client.sentenceDataByLanguage);
  const languageData: Snapshot = {};
  for (const language of new Set([...Object.keys(serverByLanguage), ...Object.keys(clientByLanguage)])) {
    const serverLanguage = safeJson(serverByLanguage[language]), clientLanguage = safeJson(clientByLanguage[language]);
    languageData[language] = {
      ...serverLanguage,
      ...clientLanguage,
      sentences: mergeList(Array.isArray(serverLanguage.sentences) ? serverLanguage.sentences as Snapshot[] : [], Array.isArray(clientLanguage.sentences) ? clientLanguage.sentences as Snapshot[] : [], keyForSentence),
      attempts: mergeList(Array.isArray(serverLanguage.attempts) ? serverLanguage.attempts as Snapshot[] : [], Array.isArray(clientLanguage.attempts) ? clientLanguage.attempts as Snapshot[] : [], item => `${item.sentenceId}:${item.at}:${item.direction ?? ""}`),
      mixQueue: clientLanguage.mixQueue ?? serverLanguage.mixQueue ?? [],
      mixPosition: clientLanguage.mixPosition ?? serverLanguage.mixPosition ?? 0,
    };
  }
  merged.sentenceDataByLanguage = languageData;
  const wordSentenceIndex: Snapshot = {};
  for (const sentence of (merged.sentences as Snapshot[] ?? [])) for (const wordId of (Array.isArray(sentence.wordIds) ? sentence.wordIds : [])) wordSentenceIndex[wordId] = [...(wordSentenceIndex[wordId] as string[] ?? []), sentence.id];
  merged.wordSentenceIndex = wordSentenceIndex;
  const serverSettings = safeJson(server.settings), clientSettings = safeJson(client.settings);
  const { apiKey: _apiKey, apiKeyValidated: _validated, apiUrl: _apiUrl, model: _model, ...safeServerSettings } = serverSettings as Record<string, unknown>;
  const { apiKey: _clientKey, apiKeyValidated: _clientValidated, apiUrl: _clientUrl, model: _clientModel, ...safeClientSettings } = clientSettings as Record<string, unknown>;
  merged.settings = { ...safeServerSettings, ...safeClientSettings };
  merged.mixQueue = client.mixQueue ?? server.mixQueue ?? [];
  merged.mixPosition = client.mixPosition ?? server.mixPosition ?? 0;
  return merged;
}

async function providerProfile(provider: Provider, code: string, verifier: string, nonce: string) {
  if (provider === "google") {
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? "", grant_type: "authorization_code", code_verifier: verifier }) });
    if (!response.ok) throw new Error("Google token exchange failed");
    const tokens = await response.json() as { id_token?: string };
    const profile = await verifyIdToken(String(tokens.id_token ?? ""), "https://accounts.google.com", process.env.GOOGLE_CLIENT_ID ?? "", "https://www.googleapis.com/oauth2/v3/certs", nonce);
    return { subject: String(profile.sub), profile: { name: profile.name, email: profile.email, picture: profile.picture } };
  }
  const basic = Buffer.from(`${process.env.TELEGRAM_CLIENT_ID ?? ""}:${process.env.TELEGRAM_CLIENT_SECRET ?? ""}`).toString("base64");
  const response = await fetch("https://oauth.telegram.org/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${basic}` }, body: new URLSearchParams({ code, client_id: process.env.TELEGRAM_CLIENT_ID ?? "", redirect_uri: process.env.TELEGRAM_REDIRECT_URI ?? "", grant_type: "authorization_code", code_verifier: verifier }) });
  if (!response.ok) throw new Error("Telegram token exchange failed");
  const tokens = await response.json() as { id_token?: string };
  const profile = await verifyIdToken(String(tokens.id_token ?? ""), "https://oauth.telegram.org", process.env.TELEGRAM_CLIENT_ID ?? "", "https://oauth.telegram.org/.well-known/jwks.json", nonce);
  return { subject: String(profile.sub), profile: { name: profile.name ?? profile.preferred_username, username: profile.preferred_username, chatId: String(profile.sub), picture: profile.picture } };
}

async function fetchRequest(request: Request) {
    if (request.method === "OPTIONS") return json({}, 204);
    const url = new URL(request.url);
    try {
      if (url.pathname === "/metrics") return new Response(prometheus(), { headers: { "content-type": "text/plain; version=0.0.4" } });
      if (url.pathname === "/health") return json({ ok: true, service: "hanzi-deck-backend" });
      if (request.method === "POST" && url.pathname === "/v1/telemetry/batch") {
        const body = safeJson(await request.json());
        const events = Array.isArray(body.events) ? body.events.slice(0, 100) : [];
        let accepted = 0;
        for (const event of events) if (recordTelemetry(safeJson(event))) accepted += 1;
        inc("telemetry_batches_total", { result: "accepted" });
        return json({ accepted, rejected: events.length - accepted });
      }
      const authMatch = url.pathname.match(/^\/v1\/auth\/(google|telegram)\/start$/);
      if (request.method === "GET" && authMatch) {
        const provider = authMatch[1] as Provider;
        const redirectUri = url.searchParams.get("redirect_uri") ?? `${publicOrigin}/auth/callback`;
        const state = token();
        const verifier = token(), nonce = token(), challenge = await pkceChallenge(verifier);
        db.query("INSERT INTO oauth_states(state_hash, provider, redirect_uri, expires_at, code_verifier, nonce) VALUES (?, ?, ?, ?, ?, ?)").run(hash(state), provider, redirectUri, new Date(Date.now() + 10 * 60_000).toISOString(), verifier, nonce);
        const providerUrl = provider === "google" ? new URL("https://accounts.google.com/o/oauth2/v2/auth") : new URL("https://oauth.telegram.org/auth");
        providerUrl.search = new URLSearchParams({ client_id: provider === "google" ? process.env.GOOGLE_CLIENT_ID ?? "" : process.env.TELEGRAM_CLIENT_ID ?? "", redirect_uri: provider === "google" ? process.env.GOOGLE_REDIRECT_URI ?? "" : process.env.TELEGRAM_REDIRECT_URI ?? "", response_type: "code", scope: provider === "google" ? "openid email profile" : "openid profile", state, nonce, code_challenge: challenge, code_challenge_method: "S256" }).toString();
        return Response.redirect(providerUrl.toString(), 302);
      }
      const callbackMatch = url.pathname.match(/^\/v1\/auth\/(google|telegram)\/callback$/);
      if (request.method === "GET" && callbackMatch) {
        const state = url.searchParams.get("state") ?? "", code = url.searchParams.get("code");
        const row = db.query("SELECT provider, redirect_uri, code_verifier, nonce FROM oauth_states WHERE state_hash = ? AND expires_at > ?").get(hash(state), iso()) as { provider: Provider; redirect_uri: string; code_verifier: string; nonce: string } | null;
        if (!row || !code) return json({ error: "invalid_oauth_state" }, 400);
        db.query("DELETE FROM oauth_states WHERE state_hash = ?").run(hash(state));
        const identity = await providerProfile(row.provider, code, row.code_verifier, row.nonce);
        const userId = createUser(row.provider, identity.subject, identity.profile);
        const exchangeCode = issueCode(userId, row.redirect_uri);
        return Response.redirect(`${row.redirect_uri}?${new URLSearchParams({ code: exchangeCode, state })}`, 302);
      }
      if (request.method === "POST" && url.pathname === "/v1/auth/dev/session") {
        if (!devAuth) return json({ error: "disabled" }, 404);
        const body = safeJson(await request.json());
        const userId = createUser("google", `dev:${String(body.email ?? randomUUID())}`, { name: body.name ?? "Local tester", email: body.email ?? null });
        return json(issueSession(userId));
      }
      if (request.method === "POST" && url.pathname === "/v1/auth/exchange") {
        const body = safeJson(await request.json());
        const row = db.query("SELECT user_id, redirect_uri FROM auth_codes WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?").get(hash(String(body.code ?? "")), iso()) as { user_id: string; redirect_uri: string } | null;
        if (!row || (body.redirectUri && body.redirectUri !== row.redirect_uri)) return json({ error: "invalid_code" }, 400);
        db.query("UPDATE auth_codes SET used_at = ? WHERE code_hash = ?").run(iso(), hash(String(body.code)));
        return json(issueSession(row.user_id));
      }
      if (request.method === "POST" && url.pathname === "/v1/auth/refresh") {
        const body = safeJson(await request.json());
        const row = db.query("SELECT id, user_id FROM sessions WHERE refresh_hash = ? AND expires_at > ?").get(hash(String(body.refreshToken ?? "")), iso()) as { id: string; user_id: string } | null;
        if (!row) return json({ error: "invalid_refresh" }, 401);
        db.query("DELETE FROM sessions WHERE id = ?").run(row.id);
        return json(issueSession(row.user_id));
      }
      const user = userForAccess(request);
      if (!user) return json({ error: "unauthorized" }, 401);
      if (request.method === "POST" && url.pathname === "/v1/sync/bootstrap") {
        const body = safeJson(await request.json());
        const merged = mergeSnapshot(localSnapshot(user.user_id), safeJson(body.snapshot));
        db.query("INSERT INTO user_snapshots(user_id, snapshot_json, updated_at, bootstrap_id) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET snapshot_json=excluded.snapshot_json, updated_at=excluded.updated_at, bootstrap_id=excluded.bootstrap_id")
          .run(user.user_id, JSON.stringify(merged), iso(), String(body.bootstrapId ?? ""));
        return json({ snapshot: merged, cursor: Date.now().toString() });
      }
      if (request.method === "GET" && url.pathname === "/v1/account") {
        return json(db.query("SELECT id, name, email, picture, created_at AS createdAt FROM users WHERE id = ?").get(user.user_id));
      }
      return json({ error: "not_found" }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: error instanceof Error ? error.message : "server_error" }, 500);
    }
}

const server = Bun.serve({
  port,
  async fetch(request) {
    const started = performance.now();
    let response: Response;
    try {
      response = await fetchRequest(request);
    } catch (error) {
      inc("http_requests_total", { method: request.method, route: "uncaught", status: "500" });
      observe("http_request_duration_seconds", (performance.now() - started) / 1000, { method: request.method, route: "uncaught" });
      throw error;
    }
    const route = new URL(request.url).pathname.replace(/^\/v1\/auth\/(google|telegram)\/.*$/, "/v1/auth/:provider").replace(/^\/v1\/auth\/.*$/, "/v1/auth/:action");
    inc("http_requests_total", { method: request.method, route, status: String(response.status) });
    observe("http_request_duration_seconds", (performance.now() - started) / 1000, { method: request.method, route });
    return response;
  },
});

console.log(`Hanzi Deck backend listening on http://localhost:${server.port}`);
