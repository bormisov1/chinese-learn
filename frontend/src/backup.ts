import { fillActivePool, migrateCardPool } from "./card-srs";
import { migrateRoundCompletions } from "./round-history";
import { mergeExplanations } from "./word-explanations";
import type {
  AppLanguage,
  LanguageSentenceData,
  Sentence,
  SentenceAttempt,
  StoreData,
  Word,
} from "./types";

export const BACKUP_FORMAT = "hanzi-deck-backup";
export const BACKUP_VERSION = 1;

export type BackupFile = {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  data: StoreData;
};

export type BackupMergeSummary = {
  wordsAdded: number;
  sentencesAdded: number;
  attemptsAdded: number;
  roundCompletionsAdded: number;
};

const emptyLanguageData = (): LanguageSentenceData => ({
  sentences: [],
  wordSentenceIndex: {},
  attempts: [],
  mixQueue: [],
  mixPosition: 0,
});

const languageData = (data: StoreData, language: AppLanguage): LanguageSentenceData => {
  if (language === data.settings.language) {
    return {
      sentences: data.sentences,
      wordSentenceIndex: data.wordSentenceIndex,
      attempts: data.attempts,
      mixQueue: data.mixQueue,
      mixPosition: data.mixPosition,
    };
  }
  return data.sentenceDataByLanguage[language] ?? emptyLanguageData();
};

const maxDefined = (left: number | undefined, right: number | undefined) =>
  Math.max(left ?? 0, right ?? 0) || undefined;

const minOptional = (left: number | undefined, right: number | undefined) => {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return Math.min(left, right);
};

const earliestDue = (left: number, right: number) => {
  if (!left) return right;
  if (!right) return left;
  return Math.min(left, right);
};

function mergeWord(current: Word, imported: Word): Word {
  const translationByLanguage = {
    ...imported.translationByLanguage,
    ...current.translationByLanguage,
  };
  for (const [language, value] of Object.entries(imported.translationByLanguage ?? {})) {
    if (!translationByLanguage[language as AppLanguage] && value) {
      translationByLanguage[language as AppLanguage] = value;
    }
  }
  return {
    ...imported,
    ...current,
    pinyin: current.pinyin || imported.pinyin,
    russian: current.russian || imported.russian,
    translationByLanguage,
    exampleCount: Math.max(current.exampleCount, imported.exampleCount),
    wordShownCount: Math.max(current.wordShownCount, imported.wordShownCount),
    createdAt: Math.min(current.createdAt, imported.createdAt),
    srsLevel: Math.max(current.srsLevel, imported.srsLevel),
    srsCorrect: Math.max(current.srsCorrect, imported.srsCorrect),
    srsIncorrect: Math.max(current.srsIncorrect, imported.srsIncorrect),
    srsDueAt: earliestDue(current.srsDueAt, imported.srsDueAt),
    cardSrsLevel: Math.max(current.cardSrsLevel, imported.cardSrsLevel),
    cardSrsCorrect: Math.max(current.cardSrsCorrect, imported.cardSrsCorrect),
    cardSrsIncorrect: Math.max(current.cardSrsIncorrect, imported.cardSrsIncorrect),
    cardSrsDueAt: earliestDue(current.cardSrsDueAt, imported.cardSrsDueAt),
    cardIntroducedAt: minOptional(current.cardIntroducedAt, imported.cardIntroducedAt),
    cardActive: current.cardActive || imported.cardActive,
    cardLastStudiedRound: maxDefined(current.cardLastStudiedRound, imported.cardLastStudiedRound),
    cardLastIncorrectAt: maxDefined(current.cardLastIncorrectAt, imported.cardLastIncorrectAt),
    cardLapses: Math.max(current.cardLapses ?? 0, imported.cardLapses ?? 0),
  };
}

function mergeSentence(current: Sentence, imported: Sentence, wordIds: string[]): Sentence {
  return {
    ...imported,
    ...current,
    wordIds: [...new Set([...current.wordIds, ...wordIds])],
    sentenceShownCount: Math.max(current.sentenceShownCount, imported.sentenceShownCount),
    lastShownAt: maxDefined(current.lastShownAt, imported.lastShownAt),
    grammarPattern: current.grammarPattern || imported.grammarPattern,
  };
}

const sentenceKey = (sentence: Sentence) => sentence.chinese.replace(/\s+/g, " ").trim();
const attemptKey = (attempt: SentenceAttempt) =>
  JSON.stringify([attempt.sentenceId, attempt.answer, attempt.direction ?? "", attempt.at]);

function rebuildIndex(sentences: Sentence[]) {
  const index: Record<string, string[]> = {};
  for (const sentence of sentences) {
    for (const wordId of sentence.wordIds) {
      index[wordId] = [...(index[wordId] ?? []), sentence.id];
    }
  }
  return index;
}

function mergeLanguageData(
  current: LanguageSentenceData,
  imported: LanguageSentenceData,
  wordIdMap: Map<string, string>,
): { data: LanguageSentenceData; sentencesAdded: number; attemptsAdded: number } {
  const sentences = [...current.sentences];
  const byKey = new Map(sentences.map((sentence) => [sentenceKey(sentence), sentence]));
  let sentencesAdded = 0;
  const sentenceIdMap = new Map<string, string>();
  for (const sentence of imported.sentences) {
    const mappedWordIds = sentence.wordIds.map((wordId) => wordIdMap.get(wordId)).filter(Boolean) as string[];
    const existing = byKey.get(sentenceKey(sentence));
    if (existing) {
      const merged = mergeSentence(existing, sentence, mappedWordIds);
      const index = sentences.indexOf(existing);
      sentences[index] = merged;
      byKey.set(sentenceKey(merged), merged);
      sentenceIdMap.set(sentence.id, merged.id);
    } else {
      let id = `${sentence.id}-import-${sentences.length}`;
      while (sentences.some((item) => item.id === id)) id = `${id}-copy`;
      const added = { ...sentence, id, wordIds: mappedWordIds };
      sentences.push(added);
      byKey.set(sentenceKey(added), added);
      sentenceIdMap.set(sentence.id, added.id);
      sentencesAdded += 1;
    }
  }
  const attempts = [...current.attempts];
  const attemptKeys = new Set(attempts.map(attemptKey));
  let attemptsAdded = 0;
  for (const attempt of imported.attempts) {
    const mappedSentenceId = sentenceIdMap.get(attempt.sentenceId) ?? attempt.sentenceId;
    const added = { ...attempt, sentenceId: mappedSentenceId };
    if (attemptKeys.has(attemptKey(added))) continue;
    attempts.push(added);
    attemptKeys.add(attemptKey(added));
    attemptsAdded += 1;
  }
  return {
    data: {
      sentences,
      wordSentenceIndex: rebuildIndex(sentences),
      attempts,
      mixQueue: current.mixQueue.filter((id) => sentences.some((sentence) => sentence.id === id)),
      mixPosition: Math.min(current.mixPosition, current.mixQueue.length),
    },
    sentencesAdded,
    attemptsAdded,
  };
}

export function createBackup(data: StoreData): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      ...data,
      // API keys are credentials, not study data, and should never be put in a shareable backup.
      settings: { ...data.settings, apiKey: "", apiKeyValidated: false },
    },
  };
}

export function parseBackup(raw: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid Hanzi Deck backup.");
  const candidate = parsed as Partial<BackupFile>;
  if (candidate.format !== BACKUP_FORMAT || candidate.version !== BACKUP_VERSION || !candidate.data || typeof candidate.data !== "object") {
    throw new Error("Unsupported Hanzi Deck backup format.");
  }
  const data = candidate.data as StoreData;
  if (!Array.isArray(data.words) || !Array.isArray(data.sentences) || !Array.isArray(data.attempts)) {
    throw new Error("Backup is missing vocabulary or study data.");
  }
  return candidate as BackupFile;
}

export function mergeBackupData(current: StoreData, backup: BackupFile): { data: StoreData; summary: BackupMergeSummary } {
  const imported = backup.data;
  const words = [...current.words];
  const wordsByHanzi = new Map(words.map((word) => [word.hanzi, word]));
  const usedWordIds = new Set(words.map((word) => word.id));
  const wordIdMap = new Map<string, string>();
  let wordsAdded = 0;
  for (const importedWord of imported.words) {
    const existing = wordsByHanzi.get(importedWord.hanzi);
    if (existing) {
      const merged = mergeWord(existing, importedWord);
      words[words.indexOf(existing)] = merged;
      wordsByHanzi.set(merged.hanzi, merged);
      wordIdMap.set(importedWord.id, merged.id);
    } else {
      let id = importedWord.id;
      while (usedWordIds.has(id)) id = `${id}-import`;
      const added = { ...importedWord, id };
      words.push(added);
      wordsByHanzi.set(added.hanzi, added);
      usedWordIds.add(id);
      wordIdMap.set(importedWord.id, id);
      wordsAdded += 1;
    }
  }

  const languages = new Set<AppLanguage>([
    current.settings.language,
    imported.settings.language,
    ...Object.keys(current.sentenceDataByLanguage) as AppLanguage[],
    ...Object.keys(imported.sentenceDataByLanguage) as AppLanguage[],
  ]);
  const sentenceDataByLanguage: Partial<Record<AppLanguage, LanguageSentenceData>> = {};
  let sentencesAdded = 0;
  let attemptsAdded = 0;
  for (const language of languages) {
    const result = mergeLanguageData(languageData(current, language), languageData(imported, language), wordIdMap);
    if (language === current.settings.language) {
      current = {
        ...current,
        sentences: result.data.sentences,
        wordSentenceIndex: result.data.wordSentenceIndex,
        attempts: result.data.attempts,
        mixQueue: result.data.mixQueue,
        mixPosition: result.data.mixPosition,
      };
    } else {
      sentenceDataByLanguage[language] = result.data;
    }
    sentencesAdded += result.sentencesAdded;
    attemptsAdded += result.attemptsAdded;
  }

  const roundCompletions = [...current.roundCompletions];
  const rounds = new Map(roundCompletions.map((item) => [item.round, item]));
  let roundCompletionsAdded = 0;
  for (const completion of migrateRoundCompletions(imported.roundCompletions)) {
    const existing = rounds.get(completion.round);
    if (!existing) roundCompletionsAdded += 1;
    if (!existing || existing.completedAt < completion.completedAt) rounds.set(completion.round, completion);
  }

  const merged: StoreData = {
    ...current,
    words: migrateCardPool(words, Math.max(current.cardRound, imported.cardRound ?? 0)),
    sentenceDataByLanguage,
    explanations: mergeExplanations(current.explanations, imported.explanations),
    cardRound: Math.max(current.cardRound, imported.cardRound ?? 0),
    roundCompletions: [...rounds.values()].sort((a, b) => a.round - b.round),
    onboardingComplete: current.onboardingComplete || imported.onboardingComplete,
    languageSelected: current.languageSelected || imported.languageSelected,
  };
  return { data: merged, summary: { wordsAdded, sentencesAdded, attemptsAdded, roundCompletionsAdded } };
}
