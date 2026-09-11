import type { Dictionary } from "./dictionary";
import type { AppLanguage, StoreData, Word } from "./types";

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
  return {
    ...data,
    languageSelected: true,
    settings: { ...data.settings, language },
    words: data.words.map((word) => localizeWord(word, data.settings.language, language, dictionary)),
    sentences: changed ? [] : data.sentences,
    wordSentenceIndex: changed ? {} : data.wordSentenceIndex,
    attempts: changed ? [] : data.attempts,
    mixQueue: changed ? [] : data.mixQueue,
    mixPosition: changed ? 0 : data.mixPosition,
  };
}
