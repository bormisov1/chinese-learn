import type { LanguageSentenceData, StoreData } from './types';

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
export function removeVocabularyWord(data: StoreData, hanzi: string): StoreData {
  const removed = data.words.filter(word => word.hanzi === hanzi);
  if (!removed.length) return data;
  const ids = new Set(removed.map(word => word.id));
  const active = unlinkWord(data, ids);
  return {
    ...data,
    words: data.words.filter(word => word.hanzi !== hanzi),
    removedWordHanzi: [...new Set([...(data.removedWordHanzi ?? []), hanzi])],
    sentences: active.sentences,
    wordSentenceIndex: active.wordSentenceIndex,
    sentenceDataByLanguage: Object.fromEntries(Object.entries(data.sentenceDataByLanguage).map(([language, value]) =>
      [language, value ? unlinkWord(value, ids) : value])) as StoreData['sentenceDataByLanguage'],
  };
}

export function keepRemovedWordsOut(data: StoreData, removedHanzi: readonly string[]): StoreData {
  if (!removedHanzi.length) return data;
  const removed = new Set(removedHanzi);
  const ids = new Set(data.words.filter(word => removed.has(word.hanzi)).map(word => word.id));
  if (!ids.size) return data;
  let result = data;
  for (const hanzi of removed) result = removeVocabularyWord(result, hanzi);
  return result;
}
