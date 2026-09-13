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
    meaning: string;
    characters?: { character: string; meaning: string }[];
  }[];
  grammar: string;
};
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
export type AppLanguage = "en" | "ru";
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
export type StoreData = {
  words: Word[];
  sentences: Sentence[];
  wordSentenceIndex: Record<string, string[]>;
  attempts: SentenceAttempt[];
  sentenceDataByLanguage: Partial<Record<AppLanguage, LanguageSentenceData>>;
  cardRound: number;
  mixQueue: string[];
  mixPosition: number;
  onboardingComplete: boolean;
  languageSelected: boolean;
  settings: Settings;
};
