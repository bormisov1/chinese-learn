import assert from "node:assert/strict";
import { test } from "node:test";
import { cacheTelegramPicture } from "../backend/src/avatar";

test("Telegram avatar bytes are saved as a persistent data URL", async () => {
  const image = new Uint8Array([0xff, 0xd8, 0xff]);
  const result = await cacheTelegramPicture("https://t.me/i/userpic/320/photo.jpg", async () =>
    new Response(image, { headers: { "content-type": "image/jpeg" } })
  );
  assert.equal(result, `data:image/jpeg;base64,${Buffer.from(image).toString("base64")}`);
});

test("unavailable or non-image Telegram photos do not replace the saved avatar", async () => {
  const missing = await cacheTelegramPicture("https://t.me/i/userpic/320/photo.jpg", async () =>
    new Response(null, { status: 404 })
  );
  const invalid = await cacheTelegramPicture("https://t.me/i/userpic/320/photo.jpg", async () =>
    new Response("error", { headers: { "content-type": "text/html" } })
  );
  assert.equal(missing, null);
  assert.equal(invalid, null);
});

test("Telegram avatar caching rejects unrelated hosts", async () => {
  let called = false;
  const result = await cacheTelegramPicture("https://example.com/photo.jpg", async () => {
    called = true;
    return new Response();
  });
  assert.equal(result, null);
  assert.equal(called, false);
});
