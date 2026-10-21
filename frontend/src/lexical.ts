/** Canonical, tone-preserving identity for a Mandarin lexeme. */
export function normalizeHanzi(value: string): string {
  return value.normalize("NFC").trim();
}

export function normalizePinyin(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/u:|v/g, "ü")
    .replace(/[’‘`´]/g, "'")
    .replace(/[·・]/g, " ")
    .replace(/\s*([-''])\s*/g, "$1")
    .replace(/[_–—/]+/g, " ")
    .replace(/\s+/g, " ");
}

export function lexicalKey(hanzi: string, pinyin: string): string {
  const normalizedHanzi = normalizeHanzi(hanzi);
  const normalizedPinyin = normalizePinyin(pinyin);
  if (!normalizedHanzi || !normalizedPinyin) return "";
  return JSON.stringify([normalizedHanzi, normalizedPinyin]);
}

export function ensureLexicalKey<T extends { hanzi: string; pinyin: string; lexicalKey?: string }>(value: T): T & { lexicalKey: string } {
  const derived = lexicalKey(value.hanzi, value.pinyin);
  return { ...value, lexicalKey: derived };
}

export function validLexicalKey(value: { hanzi: string; pinyin: string; lexicalKey?: string }): boolean {
  return !!value.lexicalKey && value.lexicalKey === lexicalKey(value.hanzi, value.pinyin);
}
