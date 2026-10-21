import { dictionaryByKey, dictionaryReadings, LexicalDictionary, type Dictionary } from "./dictionary-index";
import type { AppLanguage, LanguageSentenceData, StoreData, Word } from "./types";
import { lexicalKey } from "./lexical";

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
  const currentMeaning = word.russian.trim();
  if (currentMeaning) translationByLanguage[currentLanguage] = currentMeaning;
  const key = word.lexicalKey || lexicalKey(word.hanzi, word.pinyin);
  const localized = dictionary instanceof LexicalDictionary ? dictionaryByKey(dictionary, key) : dictionary.get(word.hanzi);
  const protectedUserMeaning = word.translationSource === "user";
  const contaminated = localized && currentMeaning && dictionaryReadings(dictionary, word.hanzi).some(entry => entry.lexicalKey !== key && entry.russian === currentMeaning);
  if (localized && !protectedUserMeaning) translationByLanguage[targetLanguage] = localized.russian;
  const targetMeaning = protectedUserMeaning ? translationByLanguage[targetLanguage] ?? currentMeaning : localized?.russian ?? translationByLanguage[targetLanguage] ?? "";
  return {
    ...word,
    lexicalKey: key,
    pinyin: dictionary instanceof LexicalDictionary ? word.pinyin : localized?.pinyin ?? word.pinyin,
    russian: targetMeaning,
    translationByLanguage,
    migrationFlag: localized ? "dictionary-bound" : word.migrationFlag ?? "unmatched",
    ...(contaminated ? { translationCorrectionBackup: { ...word.translationCorrectionBackup, [targetLanguage]: currentMeaning } } : {}),
  };
}

/** Refresh known words from the canonical dictionary and retain fallbacks for unknown words. */
export function refreshWords(words: Word[], language: AppLanguage, dictionary: Dictionary): Word[] {
  return words.map((word) => localizeWord(word, language, language, dictionary));
}

export function refreshStoreWords(data: StoreData, language: AppLanguage, dictionary: Dictionary): StoreData {
  const words = refreshWords(data.words, language, dictionary);
  if (!data.migrationReport) return { ...data, words };
  return { ...data, words, migrationReport: {
    ...data.migrationReport,
    unmatchedWordIds: words.filter(word => word.migrationFlag === "unmatched").map(word => word.id),
    correctedWordIds: words.filter(word => Object.keys(word.translationCorrectionBackup ?? {}).length).map(word => word.id),
  } };
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
