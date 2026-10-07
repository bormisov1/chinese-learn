export type Word = {
  id: string;
  hanzi: string;
  pinyin: string;
  russian: string;
  translationByLanguage?: Partial<Record<AppLanguage, string>>;
  exampleCount: number;
  wordShownCount: number;
  createdAt: number;
  srsLevel: number;
  srsCorrect: number;
  srsIncorrect: number;
  srsDueAt: number;
  cardSrsLevel: number;
  cardSrsCorrect: number;
  cardSrsIncorrect: number;
  cardSrsDueAt: number;
  cardIntroducedAt?: number;
  cardActive?: boolean;
  cardLastStudiedRound?: number;
  cardLastIncorrectAt?: number;
  cardLapses?: number;
};
export type ImportedWord = {
  hanzi: string;
  pinyin: string;
  russian: string;
};
export type Sentence = {
  id: string;
  chinese: string;
  pinyin: string;
  russian: string;
  grammarPattern?: string;
  wordIds: string[];
  sentenceShownCount: number;
  lastShownAt?: number;
};
export type Evaluation = {
  correct: boolean;
  pinyin: string;
  correction: string | null;
  feedback: string;
};
export type Explanation = {
  pinyin: string;
  russian: string;
  words: {
    word: string;
    pinyin?: string;
    meaning: string;
    characters?: { character: string; meaning: string }[];
  }[];
  grammar: string;
};
export type WordExplanation = {
  pinyin: string;
  translation: string;
  summary: string;
  parts: { text: string; pinyin: string; meaning: string; characters: { hanzi: string; pinyin: string; meaning: string }[] }[];
  grammar: string;
};
export type CachedExplanation = { language: AppLanguage; kind: "word" | "sentence"; text: string; explanation: WordExplanation; updatedAt: number };
export type Settings = {
  language: AppLanguage;
  apiKey: string;
  apiKeyValidated: boolean;
  apiUrl: string;
  model: string;
  ttsProvider: string;
  ttsVoiceURI: string;
  ttsRate: number;
  automaticWordAddition: boolean;
};
export type AppLanguage = "en" | "ru" | "th";
export type PracticeDirection = "zh-ru" | "ru-zh";
export type SentenceAttempt = {
  sentenceId: string;
  answer: string;
  evaluation?: Evaluation;
  direction?: PracticeDirection;
  at: number;
};
export type LanguageSentenceData = {
  sentences: Sentence[];
  wordSentenceIndex: Record<string, string[]>;
  attempts: SentenceAttempt[];
  mixQueue: string[];
  mixPosition: number;
};
export type RoundCompletion = {
  round: number;
  completedAt: number;
};
export type StoreData = {
  storageVersion: number;
  words: Word[];
  sentences: Sentence[];
  wordSentenceIndex: Record<string, string[]>;
  attempts: SentenceAttempt[];
  sentenceDataByLanguage: Partial<Record<AppLanguage, LanguageSentenceData>>;
  explanations: Record<string, CachedExplanation>;
  cardRound: number;
  roundCompletions: RoundCompletion[];
  mixQueue: string[];
  mixPosition: number;
  onboardingComplete: boolean;
  languageSelected: boolean;
  settings: Settings;
};
