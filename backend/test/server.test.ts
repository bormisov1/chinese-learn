import { expect, test } from "bun:test";

test("backend source exposes health and auth/sync endpoints", async () => {
  const source = await Bun.file(new URL("../src/server.ts", import.meta.url)).text();
  expect(source).toContain("/health");
  expect(source).toContain("google|telegram");
  expect(source).toContain("providerProfile");
  expect(source).toContain("/v1/sync/bootstrap");
});

test("sync merges explanations and preserves a failed card review across stale clients", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "hanzi-explanation-sync-"));
  const port = 21000 + Math.floor(Math.random() * 20000);
  const base = `http://127.0.0.1:${port}`;
  const process = Bun.spawn(["bun", "run", new URL("../src/server.ts", import.meta.url).pathname], {
    env: { ...Bun.env, PORT: String(port), DATABASE_PATH: join(directory, "test.sqlite"), AUTH_DEV_MODE: "1" },
    stdout: "ignore", stderr: "pipe",
  });
  try {
    let healthy = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      try { healthy = (await fetch(`${base}/health`)).ok; } catch {}
      if (healthy) break;
      await Bun.sleep(50);
    }
    expect(healthy).toBe(true);
    const sessionResponse = await fetch(`${base}/v1/auth/dev/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `explanations-${port}@test.local` }) });
    const session = await sessionResponse.json() as { accessToken: string };
    const bootstrap = async (snapshot: Record<string, unknown>) => {
      const response = await fetch(`${base}/v1/sync/bootstrap`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.accessToken}` }, body: JSON.stringify({ snapshot, bootstrapId: crypto.randomUUID() }) });
      expect(response.ok).toBe(true);
      return (await response.json() as { snapshot: { explanations: Record<string, { updatedAt: number; explanation: { translation: string } }> } }).snapshot;
    };
    const key = JSON.stringify(["en", "word", "你好"]);
    const other = JSON.stringify(["ru", "word", "学习"]);
    const cached = (updatedAt: number, translation: string) => ({ updatedAt, explanation: { translation } });
    await bootstrap({ explanations: { [key]: cached(20, "hello") } });
    const merged = await bootstrap({ explanations: { [key]: cached(10, "hi"), [other]: cached(11, "учиться") } });
    expect(merged.explanations[key].explanation.translation).toBe("hello");
    expect(merged.explanations[other].explanation.translation).toBe("учиться");
    const refreshed = await bootstrap({ explanations: { [key]: cached(30, "greetings") } });
    expect(refreshed.explanations[key].explanation.translation).toBe("greetings");
    expect(refreshed.explanations[other].explanation.translation).toBe("учиться");

    const queued = JSON.stringify(["en", "sentence", "你好"]);
    const upsertResponse = await fetch(`${base}/v1/explanations/upsert`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.accessToken}` }, body: JSON.stringify({ entries: [{ key: queued, value: cached(40, "hello sentence") }] }) });
    expect(upsertResponse.ok).toBe(true);
    expect((await upsertResponse.json() as { acknowledgements: { key: string }[] }).acknowledgements[0].key).toBe(queued);
    const afterQueuedUpsert = await bootstrap({});
    expect(afterQueuedUpsert.explanations[queued].explanation.translation).toBe("hello sentence");

    const forbidden = await fetch(`${base}/v1/admin/settings/premium-access`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${session.accessToken}` }, body: JSON.stringify({ enabled: false }) });
    expect(forbidden.status).toBe(403);
    const adminSessionResponse = await fetch(`${base}/v1/auth/dev/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "bormisov1@gmail.com" }) });
    const adminSession = await adminSessionResponse.json() as { accessToken: string };
    const adminAccount = await fetch(`${base}/v1/account`, { headers: { authorization: `Bearer ${adminSession.accessToken}` } }).then(response => response.json()) as { isAdmin: boolean; adminPremiumEnabled: boolean };
    expect(adminAccount.isAdmin).toBe(true);
    expect(adminAccount.adminPremiumEnabled).toBe(true);
    const disabled = await fetch(`${base}/v1/admin/settings/premium-access`, { method: "PUT", headers: { "content-type": "application/json", authorization: `Bearer ${adminSession.accessToken}` }, body: JSON.stringify({ enabled: false }) });
    expect(disabled.ok).toBe(true);
    expect((await disabled.json() as { adminPremiumEnabled: boolean }).adminPremiumEnabled).toBe(false);
    const disabledAdminAccount = await fetch(`${base}/v1/account`, { headers: { authorization: `Bearer ${adminSession.accessToken}` } }).then(response => response.json()) as { adminPremiumEnabled: boolean };
    expect(disabledAdminAccount.adminPremiumEnabled).toBe(false);

    const firstGraduation = { round: 1, wordId: "word-1", at: 100 };
    await bootstrap({ cardGraduations: [firstGraduation] });
    const graduationMerge = await bootstrap({ cardGraduations: [{ round: 2, wordId: "word-2", at: 200 }] }) as unknown as { cardGraduations: typeof firstGraduation[] };
    expect(graduationMerge.cardGraduations).toHaveLength(2);
    const staleGraduationMerge = await bootstrap({ cardGraduations: [firstGraduation] }) as unknown as { cardGraduations: typeof firstGraduation[] };
    expect(staleGraduationMerge.cardGraduations).toHaveLength(2);

    const graduated = { id: "word-1", hanzi: "你好", createdAt: 1,
      cardSrsLevel: 3, cardSrsCorrect: 3, cardSrsIncorrect: 0,
      cardSrsDueAt: 50, cardActive: false, cardRelearning: false };
    await bootstrap({ words: [graduated] });
    const failed = { ...graduated, cardSrsLevel: 0, cardSrsIncorrect: 1,
      cardSrsDueAt: 0, cardLastIncorrectAt: 100, cardRelearning: true };
    const failedSnapshot = await bootstrap({ words: [failed] }) as unknown as { words: typeof failed[] };
    expect(failedSnapshot.words[0].cardSrsLevel).toBe(0);
    expect(failedSnapshot.words[0].cardSrsDueAt).toBe(0);
    expect(failedSnapshot.words[0].cardRelearning).toBe(true);
    const staleSnapshot = await bootstrap({ words: [graduated] }) as unknown as { words: typeof failed[] };
    expect(staleSnapshot.words[0].cardSrsLevel).toBe(0);
    expect(staleSnapshot.words[0].cardRelearning).toBe(true);
    const progressed = { ...failed, cardSrsLevel: 1, cardSrsCorrect: 4,
      cardLastStudiedRound: 2 };
    const progressedSnapshot = await bootstrap({ words: [progressed] }) as unknown as { words: typeof failed[] };
    expect(progressedSnapshot.words[0].cardSrsLevel).toBe(1);

    await bootstrap({ handwritingOpenCount: 8 });
    const staleTrial = await bootstrap({ handwritingOpenCount: 3 }) as unknown as { handwritingOpenCount: number };
    expect(staleTrial.handwritingOpenCount).toBe(8);

    const event = (eventId: string, name: string, properties: Record<string, unknown>) => ({
      eventId, name, properties, occurredAt: Date.now(), platform: "web", appVersion: "test", installId: "test-install",
    });
    const firstReview = event(crypto.randomUUID(), "card_reviewed", { mode: "cards", result: "correct", graduated: true });
    const telemetryResponse = await fetch(`${base}/v1/telemetry/batch`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: [
        firstReview,
        event(crypto.randomUUID(), "card_reviewed", { mode: "cards", result: "correct", graduated: false }),
        event(crypto.randomUUID(), "card_reviewed", { mode: "cards", result: "correct", graduated: true }),
        firstReview,
        event(crypto.randomUUID(), "card_graduation_undone", { mode: "cards" }),
      ] }),
    });
    expect(telemetryResponse.ok).toBe(true);
    const metrics = await (await fetch(`${base}/metrics`)).text();
    expect(metrics).toContain('card_graduations_total{mode="cards"} 2');
    expect(metrics).toContain('card_graduations_undone_total{mode="cards"} 1');
    expect(metrics).toContain('client_events_total{event="card_reviewed",graduated="true",mode="cards",result="correct"} 2');
  } finally {
    process.kill();
    await process.exited;
    await rm(directory, { recursive: true, force: true });
  }
});
