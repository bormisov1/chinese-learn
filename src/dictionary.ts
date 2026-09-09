import type { AppLanguage } from "./types";
import type { ImportedWord } from "./ocr";

export type Dictionary = Map<string, ImportedWord>;
const ASSETS: Record<AppLanguage, string> = {
  en: "/dictionaries/hsk-en.json", ru: "/dictionaries/hsk-ru.json",
};
const MAX_BYTES = 2_000_000;
const METADATA_GLOSS = /^(?:CL:|(?:also |Taiwan )?pr\.|(?:old )?variant of |see |abbr\. for )/i;

export function cleanDictionaryMeaning(value: string): string {
  const meanings = value.split(";").map(part => part.trim()).filter(part => part && !METADATA_GLOSS.test(part));
  return meanings.join("; ") || value.trim();
}

export async function downloadDictionary(language: AppLanguage): Promise<Dictionary> {
  const asset = ASSETS[language];
  if (!asset) throw new Error("Unsupported dictionary language.");
  const response = await fetch(asset, { credentials: "same-origin", cache: "force-cache" });
  if (!response.ok) throw new Error(`Dictionary download failed (${response.status}).`);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_BYTES) throw new Error("Dictionary file is unexpectedly large.");
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new Error("Dictionary file is unexpectedly large.");
  const rows: unknown = JSON.parse(text);
  if (!Array.isArray(rows) || rows.length > 10_000) throw new Error("Invalid dictionary file.");
  const dictionary: Dictionary = new Map();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 3 || row.some(value => typeof value !== "string" || value.length > 2_000)) throw new Error("Invalid dictionary entry.");
    const [hanzi, pinyin, rawMeaning] = row;
    const meaning = cleanDictionaryMeaning(rawMeaning);
    if (!hanzi || !pinyin || !meaning || !/^\p{Script=Han}/u.test(hanzi)) throw new Error("Invalid dictionary entry.");
    dictionary.set(hanzi, { hanzi, pinyin, russian: meaning });
  }
  if (dictionary.size < 100) throw new Error("Dictionary is incomplete.");
  return dictionary;
}
