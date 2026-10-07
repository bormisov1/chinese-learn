export const HSK_URL =
  "https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/7ac65bf1a6387d35f1ade478906172a19311c7f9/complete.min.json";

const OLD_HSK_LEVEL = /^o([1-6])$/;

export const normalizeHanzi = (value) => value.replace(/\s+/g, "");

export const normalizePinyin = (value) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f\s0-9'’:\-_]/g, "")
    .replaceAll("ü", "v")
    .replaceAll("u:", "v")
    .replace(/[^a-zv]/g, "");

export async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function downloadHsk() {
  return JSON.parse((await download(HSK_URL)).toString("utf8"));
}

export function oldHskLevel(item) {
  for (const value of item.l ?? []) {
    const match = value.match(OLD_HSK_LEVEL);
    if (match) return Number(match[1]);
  }
  return undefined;
}

export function buildOldHskLevels(hsk) {
  const exclusive = Object.fromEntries(
    Array.from({ length: 6 }, (_, index) => [String(index + 1), []]),
  );

  for (const item of hsk) {
    const level = oldHskLevel(item);
    const hanzi = normalizeHanzi(item.s ?? "");
    if (level && hanzi) exclusive[String(level)].push(hanzi);
  }

  const cumulative = {};
  const seen = new Set();
  for (let level = 1; level <= 6; level += 1) {
    for (const hanzi of exclusive[String(level)]) seen.add(hanzi);
    cumulative[String(level)] = [...seen];
  }
  return cumulative;
}
