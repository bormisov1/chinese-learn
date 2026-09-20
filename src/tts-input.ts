import type { ResolvedPronunciation } from "./pronunciation";

export type TtsInput = {
  cacheKey: string;
  text: string;
  ssml: string;
};

const cache = new Map<string, TtsInput>();

const escapeXml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll('"', "&quot;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;");

export function prepareTtsInput(pronunciation: ResolvedPronunciation, voice: string): TtsInput {
  const cacheKey = JSON.stringify([pronunciation.hanzi, pronunciation.pinyin, voice]);
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const input = {
    cacheKey,
    text: pronunciation.pinyin,
    ssml: `<speak version="1.0" xml:lang="zh-CN"><sub alias="${escapeXml(pronunciation.pinyin)}">${escapeXml(pronunciation.hanzi)}</sub></speak>`,
  };
  cache.set(cacheKey, input);
  return input;
}

export const clearTtsInputCache = () => cache.clear();
export const ttsInputCacheSize = () => cache.size;
