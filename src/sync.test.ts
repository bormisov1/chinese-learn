import assert from "node:assert/strict";
import test from "node:test";
import { applyBootstrapSnapshot } from "./sync-merge";
import type { StoreData } from "./types";

const store = (overrides: Partial<StoreData> = {}) => ({
  storageVersion: 3,
  words: [],
  sentences: [],
  wordSentenceIndex: {},
  attempts: [],
  sentenceDataByLanguage: {},
  cardRound: 0,
  roundCompletions: [],
  mixQueue: [],
  mixPosition: 0,
  onboardingComplete: false,
  languageSelected: false,
  settings: { language: "en", apiKey: "", apiKeyValidated: false, apiUrl: "", model: "", ttsProvider: "browser", ttsVoiceURI: "", ttsRate: 1, automaticWordAddition: false },
  ...overrides,
} as StoreData);

test("bootstrap never replaces a used local store with an empty response", () => {
  const local = {
    ...store(),
    languageSelected: true,
    onboardingComplete: true,
    words: [{ hanzi: "你好" } as never],
  };

  assert.deepEqual(applyBootstrapSnapshot(local, {}), local);
});

test("bootstrap still applies a non-empty remote snapshot", () => {
  const local = store();
  const remote = { ...store(), languageSelected: true, onboardingComplete: true };

  assert.equal(applyBootstrapSnapshot(local, remote).languageSelected, true);
});
