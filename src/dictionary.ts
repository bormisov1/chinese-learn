import { Platform } from "react-native";
import { dictionaryAssetUrl } from "./dictionary-url";
import type { AppLanguage } from "./types";
import type { ImportedWord } from "./ocr";

export type Dictionary = Map<string, ImportedWord>;
const ASSET_BYTES: Record<AppLanguage, number> = {
  en: 8_854_286,
  ru: 410_405,
};
const MAX_BYTES: Record<AppLanguage, number> = {
  en: 30_000_000,
  ru: 2_000_000,
};
const MAX_ENTRIES: Record<AppLanguage, number> = {
  en: 150_000,
  ru: 10_000,
};
const METADATA_GLOSS = /^(?:CL:|(?:also |Taiwan )?pr\.|(?:old )?variant of |see |abbr\. for )/i;
const cache = new Map<AppLanguage, Promise<Dictionary>>();

export function cleanDictionaryMeaning(value: string): string {
  const meanings = value.split(";").map(part => part.trim()).filter(part => part && !METADATA_GLOSS.test(part));
  return meanings.join("; ") || value.trim();
}

async function downloadDictionary(language: AppLanguage, onProgress?: (value: number | null) => void): Promise<Dictionary> {
  const response = await fetch(dictionaryAssetUrl(language, Platform.OS), { credentials: "same-origin", cache: "no-cache" });
  if (!response.ok) throw new Error(`Dictionary download failed (${response.status}).`);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_BYTES[language]) throw new Error("Dictionary file is unexpectedly large.");
  let text: string;
  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    text = "";
    onProgress?.(0);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BYTES[language]) throw new Error("Dictionary file is unexpectedly large.");
      text += decoder.decode(value, { stream: true });
      onProgress?.(Math.min(received / ASSET_BYTES[language], 0.99));
    }
    text += decoder.decode();
    onProgress?.(1);
  } else {
    onProgress?.(null);
    text = await response.text();
  }
  if (text.length > MAX_BYTES[language]) throw new Error("Dictionary file is unexpectedly large.");
  const rows: unknown = JSON.parse(text);
  if (!Array.isArray(rows) || rows.length > MAX_ENTRIES[language]) throw new Error("Invalid dictionary file.");
  const dictionary: Dictionary = new Map();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 3 || row.some(value => typeof value !== "string" || value.length > 2_000)) throw new Error("Invalid dictionary entry.");
    const [hanzi, pinyin, rawMeaning] = row;
    const meaning = cleanDictionaryMeaning(rawMeaning);
    // Ignore isolated unusable source rows; the completeness check below still
    // rejects missing or broadly corrupted dictionaries.
    if (!hanzi || !pinyin || !meaning || !/^\p{Script=Han}/u.test(hanzi)) continue;
    dictionary.set(hanzi, { hanzi, pinyin, russian: meaning });
  }
  if (dictionary.size < 100) throw new Error("Dictionary is incomplete.");
  return dictionary;
}

/** Reuse parsed dictionaries and in-flight downloads. Failed requests remain retryable. */
export function loadDictionary(language: AppLanguage, onProgress?: (value: number | null) => void): Promise<Dictionary> {
  const cached = cache.get(language);
  if (cached) return cached;
  const request = downloadDictionary(language, onProgress).catch((error) => {
    if (cache.get(language) === request) cache.delete(language);
    throw error;
  });
  cache.set(language, request);
  return request;
}
