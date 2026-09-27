import { expect, test } from "bun:test";

test("backend source exposes health and auth/sync endpoints", async () => {
  const source = await Bun.file(new URL("../src/server.ts", import.meta.url)).text();
  expect(source).toContain("/health");
  expect(source).toContain("google|telegram");
  expect(source).toContain("providerProfile");
  expect(source).toContain("/v1/sync/bootstrap");
});
