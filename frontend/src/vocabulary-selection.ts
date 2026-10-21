import type { LanguageSentenceData, StoreData } from './types';
import { lexicalKey, normalizeHanzi } from './lexical';

function unlinkWord(data: LanguageSentenceData, wordIds: ReadonlySet<string>): LanguageSentenceData {
  if (!wordIds.size) return data;
  const wordSentenceIndex = { ...data.wordSentenceIndex };
  for (const id of wordIds) delete wordSentenceIndex[id];
  return {
    ...data,
    sentences: data.sentences.map(sentence => ({ ...sentence, wordIds: sentence.wordIds.filter(id => !wordIds.has(id)) })),
    wordSentenceIndex,
  };
}

/** Keep an explicitly removed word out of the local vocabulary, including after account sync. */
export function removeVocabularyWord(data: StoreData, wordIdOrHanzi: string): StoreData {
  const byId = data.words.find(word => word.id === wordIdOrHanzi);
  const sameHanzi = data.words.filter(word => normalizeHanzi(word.hanzi) === normalizeHanzi(wordIdOrHanzi));
  // Hanzi-only deletion is accepted only when it identifies one reading.
  const removed = byId ? [byId] : sameHanzi.length === 1 ? sameHanzi : [];
  if (!removed.length) return data;
  const ids = new Set(removed.map(word => word.id));
  const active = unlinkWord(data, ids);
  return {
    ...data,
    words: data.words.filter(word => !ids.has(word.id)),
    removedWordHanzi: [...new Set([...(data.removedWordHanzi ?? []), ...removed.map(word => normalizeHanzi(word.hanzi))])],
    removedWordKeys: [...new Set([...(data.removedWordKeys ?? []), ...removed.map(word => word.lexicalKey || lexicalKey(word.hanzi, word.pinyin) || `hanzi:${normalizeHanzi(word.hanzi)}`)])],
    sentences: active.sentences,
    wordSentenceIndex: active.wordSentenceIndex,
    sentenceDataByLanguage: Object.fromEntries(Object.entries(data.sentenceDataByLanguage).map(([language, value]) =>
      [language, value ? unlinkWord(value, ids) : value])) as StoreData['sentenceDataByLanguage'],
  };
}

export function keepRemovedWordsOut(data: StoreData, removedHanzi: readonly string[]): StoreData {
  const tombstones = new Set([...(data.removedWordKeys ?? []), ...removedHanzi.map(hanzi => `hanzi:${normalizeHanzi(hanzi)}`)]);
  if (!tombstones.size) return data;
  const ids = new Set(data.words.filter(word => {
    const key = word.lexicalKey || lexicalKey(word.hanzi, word.pinyin);
    return (key && tombstones.has(key)) || tombstones.has(`hanzi:${normalizeHanzi(word.hanzi)}`);
  }).map(word => word.id));
  if (!ids.size) return data;
  let result = data;
  for (const id of ids) result = removeVocabularyWord(result, id);
  return result;
}
