import { ensureLexicalKey, lexicalKey, normalizeHanzi } from "./lexical";
import type { LanguageSentenceData, MigrationReport, StoreData, Word } from "./types";

export const STORAGE_VERSION = 4;

export const rebuildWordSentenceIndex = (sentences: StoreData["sentences"]) => {
  const index: Record<string, string[]> = {};
  for (const sentence of sentences) for (const wordId of sentence.wordIds ?? []) {
    index[wordId] = [...(index[wordId] ?? []), sentence.id];
  }
  return index;
};

const migrateLanguageData = (value: LanguageSentenceData): LanguageSentenceData => ({
  ...value,
  sentences: (value.sentences ?? []).map(sentence => ({ ...sentence, wordIds: [...(sentence.wordIds ?? [])] })),
  attempts: [...(value.attempts ?? [])],
  mixQueue: [...(value.mixQueue ?? [])],
  wordSentenceIndex: rebuildWordSentenceIndex(value.sentences ?? []),
});

/** Pure, lossless and idempotent v3 -> v4 migration. No dictionary guesses. */
export function migrateStoreV4<T extends Partial<StoreData>>(source: T, migratedAt = Date.now()): T & StoreData {
  if (source.storageVersion === STORAGE_VERSION && (source.words ?? []).every(word => word.lexicalKey === lexicalKey(word.hanzi, word.pinyin))) return source as T & StoreData;
  const words = (source.words ?? []).map(word => ({ ...ensureLexicalKey(word as Word), migrationFlag: "unmatched" as const })) as Word[];
  const readings = new Map<string, Set<string>>();
  for (const word of words) {
    const hanzi = normalizeHanzi(word.hanzi), values = readings.get(hanzi) ?? new Set<string>();
    values.add(word.lexicalKey!); readings.set(hanzi, values);
  }
  const ambiguousTombstones: string[] = [];
  const removedWordKeys = [...new Set([...(source.removedWordKeys ?? []), ...(source.removedWordHanzi ?? []).map(value => {
    const hanzi = normalizeHanzi(value), keys = [...(readings.get(hanzi) ?? [])];
    if (keys.length === 1 && keys[0]) return keys[0];
    const tombstone = `hanzi:${hanzi}`; ambiguousTombstones.push(tombstone); return tombstone;
  })])];
  const sentences = (source.sentences ?? []).map(sentence => ({ ...sentence, wordIds: [...(sentence.wordIds ?? [])] }));
  const sentenceDataByLanguage = Object.fromEntries(Object.entries(source.sentenceDataByLanguage ?? {}).map(([language, value]) => [language, value ? migrateLanguageData(value) : value]));
  const report: MigrationReport = {
    fromVersion: Number(source.storageVersion ?? 0), toVersion: 4, migratedAt,
    wordCount: words.length, sentenceCount: sentences.length, attemptCount: (source.attempts ?? []).length,
    unmatchedWordIds: words.map(word => word.id), ambiguousTombstones, correctedWordIds: [],
  };
  return { ...source, storageVersion: STORAGE_VERSION, words, removedWordKeys, sentences,
    wordSentenceIndex: rebuildWordSentenceIndex(sentences), attempts: [...(source.attempts ?? [])],
    sentenceDataByLanguage, explanations: { ...(source.explanations ?? {}) }, migrationReport: report } as T & StoreData;
}
