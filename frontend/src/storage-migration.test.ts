import assert from "node:assert/strict";
import test from "node:test";
import { migrateStoreV4 } from "./storage-migration";
import { lexicalKey } from "./lexical";
import { reconstructGeneratedSentences } from "./deepseek";
import type { StoreData, Word } from "./types";

const word = (id: string, pinyin: string): Word => ({ id, hanzi: "还", pinyin, russian: id, exampleCount: 4, wordShownCount: 7, createdAt: 9,
  srsLevel: 2, srsCorrect: 3, srsIncorrect: 1, srsDueAt: 10, cardSrsLevel: 2, cardSrsCorrect: 5, cardSrsIncorrect: 1, cardSrsDueAt: 11, cardLapses: 1 });

test("v3 to v4 migration preserves identities, counts, sentence refs and is idempotent", () => {
  const words = [word("hai-id", "hái"), word("huan-id", "huán")];
  const source = { storageVersion: 3, words, removedWordHanzi: ["还"],
    sentences: [{ id: "s", chinese: "还 还", pinyin: "hái huán", russian: "", wordIds: words.map(item => item.id), sentenceShownCount: 2 }],
    wordSentenceIndex: { stale: ["s"] }, attempts: [{ sentenceId: "s", answer: "x", at: 12 }], sentenceDataByLanguage: {}, explanations: {},
    cardRound: 2, roundCompletions: [], cardGraduations: [], mixQueue: ["s"], mixPosition: 0, onboardingComplete: true, languageSelected: true,
    settings: { language: "en", apiKey: "", apiKeyValidated: false, apiUrl: "", model: "", ttsProvider: "", ttsVoiceURI: "", ttsRate: 1, automaticWordAddition: false, aiChatEnabled: true, handwritingAfterWrong: true } } as StoreData;
  const migrated = migrateStoreV4(source, 100);
  assert.equal(migrated.storageVersion, 4);
  assert.deepEqual(migrated.words.map(item => item.id), words.map(item => item.id));
  assert.deepEqual(migrated.words.map(item => item.lexicalKey), [lexicalKey("还", "hái"), lexicalKey("还", "huán")]);
  assert.deepEqual(migrated.wordSentenceIndex, { "hai-id": ["s"], "huan-id": ["s"] });
  assert.equal(migrated.migrationReport?.wordCount, 2);
  assert.deepEqual(migrated.migrationReport?.unmatchedWordIds, ["hai-id", "huan-id"]);
  assert.deepEqual(migrated.removedWordKeys, ["hanzi:还"]);
  assert.equal(migrateStoreV4(migrated), migrated);
});

test("sentence reconstruction trusts ordered lexeme IDs, not model pinyin", () => {
  const result = reconstructGeneratedSentences([{ wordIds: ["a", "b", "c", "d", "e"], russian: "study seriously", grammarPattern: "SVO" }], [
    { id: "a", wordId: "w1", hanzi: "认真", pinyin: "rènzhēn", gloss: "serious" },
    { id: "b", wordId: "w2", hanzi: "地", pinyin: "de", gloss: "adverbial particle" },
    { id: "c", wordId: "w3", hanzi: "学习", pinyin: "xuéxí", gloss: "study" },
    { id: "d", wordId: "w4", hanzi: "的", pinyin: "de", gloss: "particle" },
    { id: "e", wordId: "w5", hanzi: "得", pinyin: "děi", gloss: "must" },
  ], 1);
  assert.equal(result[0].pinyin, "rènzhēn de xuéxí de děi");
  assert.deepEqual(result[0].wordIds, ["w1", "w2", "w3", "w4", "w5"]);
});
