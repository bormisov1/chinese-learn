import type { Dictionary } from "./dictionary";
import type { AppLanguage, LanguageSentenceData, StoreData, Word } from "./types";

const emptySentenceData = (): LanguageSentenceData => ({
  sentences: [],
  wordSentenceIndex: {},
  attempts: [],
  mixQueue: [],
  mixPosition: 0,
});

const activeSentenceData = (data: StoreData): LanguageSentenceData => ({
  sentences: data.sentences,
  wordSentenceIndex: data.wordSentenceIndex,
  attempts: data.attempts,
  mixQueue: data.mixQueue,
  mixPosition: data.mixPosition,
});

function localizeWord(word: Word, currentLanguage: AppLanguage, targetLanguage: AppLanguage, dictionary: Dictionary): Word {
  const translationByLanguage = { ...word.translationByLanguage };
  if (word.russian.trim()) translationByLanguage[currentLanguage] = word.russian;
  const localized = dictionary.get(word.hanzi);
  if (localized) translationByLanguage[targetLanguage] = localized.russian;
  return {
    ...word,
    pinyin: localized?.pinyin ?? word.pinyin,
    russian: localized?.russian ?? translationByLanguage[targetLanguage] ?? "",
    translationByLanguage,
  };
}

/** Refresh persisted meanings without erasing same-language custom or legacy words. */
export function refreshWords(words: Word[], language: AppLanguage, dictionary: Dictionary): Word[] {
  return words.map((word) => localizeWord(word, language, language, dictionary));
}

/** Build the single state update committed after a target dictionary is available. */
export function switchStoreLanguage(
  data: StoreData,
  language: AppLanguage,
  dictionary: Dictionary,
): StoreData {
  const changed = data.settings.language !== language;
  const sentenceDataByLanguage = changed
    ? { ...data.sentenceDataByLanguage, [data.settings.language]: activeSentenceData(data) }
    : data.sentenceDataByLanguage;
  const sentenceData = changed
    ? sentenceDataByLanguage[language] ?? emptySentenceData()
    : activeSentenceData(data);
  const exampleCountByWord = new Map<string, number>();
  for (const sentence of sentenceData.sentences) {
    for (const wordId of sentence.wordIds) exampleCountByWord.set(wordId, (exampleCountByWord.get(wordId) ?? 0) + 1);
  }
  return {
    ...data,
    languageSelected: true,
    settings: { ...data.settings, language },
    words: data.words.map((word) => ({
      ...localizeWord(word, data.settings.language, language, dictionary),
      exampleCount: exampleCountByWord.get(word.id) ?? 0,
    })),
    ...sentenceData,
    sentenceDataByLanguage,
  };
}
