import { expect, test } from "bun:test";

test("backend source exposes health and auth/sync endpoints", async () => {
  const source = await Bun.file(new URL("../src/server.ts", import.meta.url)).text();
  expect(source).toContain("/health");
  expect(source).toContain("google|telegram");
  expect(source).toContain("providerProfile");
  expect(source).toContain("/v1/sync/bootstrap");
});

test("sync merges cached explanations across clients and keeps the latest refresh", async () => {
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
  } finally {
    process.kill();
    await process.exited;
    await rm(directory, { recursive: true, force: true });
  }
});
