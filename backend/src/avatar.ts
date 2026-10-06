const MAX_AVATAR_BYTES = 256 * 1024;
const AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

// Telegram's picture claim can point to an image that later disappears. Keep
// the bytes while the sign-in URL still works, so the account avatar persists.
export async function cacheTelegramPicture(picture: unknown, fetchImage: typeof fetch = fetch): Promise<string | null> {
  if (typeof picture !== "string") return null;
  let url: URL;
  try { url = new URL(picture); } catch { return null; }
  if (url.protocol !== "https:" || (url.hostname !== "t.me" && url.hostname !== "telegram.org")) return null;

  try {
    const response = await fetchImage(url, { signal: AbortSignal.timeout(3000), redirect: "error" });
    if (!response.ok) return null;
    const type = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (!type || !AVATAR_TYPES.has(type) || Number(response.headers.get("content-length") ?? 0) > MAX_AVATAR_BYTES) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_AVATAR_BYTES) return null;
    return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return null;
  }
}
