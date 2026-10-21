import { test } from "node:test";
import assert from "node:assert/strict";
import { createBackup, mergeBackupData, parseBackup } from "./backup";
import type { StoreData, Word } from "./types";

const baseStore = (): StoreData => ({
  storageVersion: 3, words: [], sentences: [], wordSentenceIndex: {}, attempts: [], sentenceDataByLanguage: {}, explanations: {},
  cardRound: 0, roundCompletions: [], cardGraduations: [], mixQueue: [], mixPosition: 0, onboardingComplete: false, languageSelected: false,
  settings: { language: "en", apiKey: "", apiKeyValidated: false, apiUrl: "https://api.deepseek.com/chat/completions", model: "deepseek-v4-flash", ttsProvider: "browser", ttsVoiceURI: "", ttsRate: 0.85, automaticWordAddition: false, aiChatEnabled: true, handwritingAfterWrong: true },
});

const word = (id: string, hanzi: string, correct = 0): Word => ({
  id, hanzi, pinyin: "nǐ hǎo", russian: "hello", exampleCount: 1, wordShownCount: 2,
  createdAt: 100, srsLevel: 1, srsCorrect: correct, srsIncorrect: 0, srsDueAt: 0,
  cardSrsLevel: 1, cardSrsCorrect: correct, cardSrsIncorrect: 0, cardSrsDueAt: 0,
  cardActive: true, cardLapses: 0,
});

test("backup excludes API keys and round-trips its format", () => {
  const source = { ...baseStore(), settings: { ...baseStore().settings, apiKey: "secret" } };
  const backup = createBackup(source);
  assert.equal(backup.data.settings.apiKey, "");
  assert.deepEqual(parseBackup(JSON.stringify(backup)), backup);
});

test("backup merge unions words, remaps sentence word IDs, and keeps strongest progress", () => {
  const current = {
    ...baseStore(),
    words: [word("current", "你好", 3)],
    settings: { ...baseStore().settings, apiKey: "keep-me" },
  } satisfies StoreData;
  const imported = {
    ...baseStore(),
    words: [word("old", "你好", 1), word("new", "学习", 2)],
    cardGraduations: [{ round: 4, wordId: "old", at: 1000 }, { round: 5, wordId: "new", at: 2000 }],
    sentences: [{ id: "sentence", chinese: "你好 学习", pinyin: "Nǐ hǎo xuéxí", russian: "hello study", wordIds: ["old", "new"], sentenceShownCount: 1 }],
    wordSentenceIndex: {}, attempts: [{ sentenceId: "sentence", answer: "hello study", at: 20 }],
    settings: { ...baseStore().settings, language: "en" as const },
  } satisfies StoreData;
  const result = mergeBackupData(current, createBackup(imported));
  assert.equal(result.data.words.length, 2);
  assert.equal(result.data.words.find((item) => item.hanzi === "你好")?.srsCorrect, 3);
  assert.equal(result.data.sentences[0].wordIds.length, 2);
  assert.equal(result.data.sentences[0].wordIds.includes("old"), false);
  assert.equal(result.summary.wordsAdded, 1);
  assert.equal(result.summary.sentencesAdded, 1);
  assert.equal(result.summary.attemptsAdded, 1);
  assert.equal(result.data.settings.apiKey, "keep-me");
  assert.deepEqual(result.data.cardGraduations, [
    { round: 4, wordId: "current", at: 1000 },
    { round: 5, wordId: "new", at: 2000 },
  ]);
});

test("backup keeps two readings of one Hanzi as independent cards and repeated import is idempotent", () => {
  const current = { ...baseStore(), words: [{ ...word("hai", "还", 2), pinyin: "hái", russian: "still" }] };
  const imported = { ...baseStore(), words: [{ ...word("huan", "还", 5), pinyin: "huán", russian: "return" }] };
  const once = mergeBackupData(current, createBackup(imported)).data;
  const twice = mergeBackupData(once, createBackup(imported)).data;
  assert.deepEqual(once.words.map(item => [item.id, item.pinyin, item.cardSrsCorrect]), [["hai", "hái", 2], ["huan", "huán", 5]]);
  assert.deepEqual(twice.words, once.words);
});
