import assert from "node:assert/strict";
import test from "node:test";
import { applyBootstrapSnapshot } from "./sync-merge";
import { commitBootstrapResponse, createBootstrapCoordinator } from "./sync-coordinator";
import { switchStoreLanguage } from "./language";
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
  settings: { language: "en", apiKey: "", apiKeyValidated: false, apiUrl: "", model: "", ttsProvider: "browser", ttsVoiceURI: "", ttsRate: 1, automaticWordAddition: false, aiChatEnabled: true },
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

test("bootstrap preserves device-local API settings when remote sends empty or missing values", () => {
  const local = store({
    settings: { ...store().settings, language: "ru", apiKey: "test-key", apiKeyValidated: true, apiUrl: "https://example.test/api", model: "local-model" },
  });
  const remote: StoreData = { ...store({ languageSelected: true }), settings: { ...store().settings, language: "en", apiKey: "", apiKeyValidated: false, apiUrl: "", model: "" } };
  const merged = applyBootstrapSnapshot(local, remote);

  assert.equal(merged.settings.language, "en");
  assert.equal(merged.settings.apiKey, "test-key");
  assert.equal(merged.settings.apiKeyValidated, true);
  assert.equal(merged.settings.apiUrl, "https://example.test/api");
  assert.equal(merged.settings.model, "local-model");
  assert.equal(applyBootstrapSnapshot(local, { ...remote, settings: { language: "en" } as StoreData["settings"] }).settings.apiKey, "test-key");
});

const russianStore = () => store({
  languageSelected: true,
  onboardingComplete: true,
  settings: { ...store().settings, language: "ru" },
  words: [{ id: "word-1", hanzi: "书", pinyin: "shū", russian: "книга", exampleCount: 0 } as never],
});

const switchToEnglish = (data: StoreData) => switchStoreLanguage(data, "en", new Map([
  ["书", { hanzi: "书", pinyin: "shū", russian: "book" }],
]));

test("a delayed Russian sync cannot undo English and the next sync persists English", async () => {
  let current = russianStore();
  let server = current;
  const requests: { submitted: StoreData; resolve: (value: StoreData) => void }[] = [];
  const sync = createBootstrapCoordinator(
    () => current === server ? null : current,
    submitted => new Promise(resolve => { requests.push({ submitted, resolve }); }),
    (submitted, merged) => commitBootstrapResponse(
      update => { current = update(current); },
      submitted,
      merged,
      accepted => accepted,
    ),
  );

  // A Russian request is in flight when the learner finishes downloading English.
  server = store();
  sync();
  current = switchToEnglish(current);
  sync();
  assert.equal(requests.length, 1);
  requests[0].resolve(server = requests[0].submitted);
  await new Promise<void>(resolve => setImmediate(resolve));

  assert.equal(current.settings.language, "en");
  assert.equal(current.words[0].russian, "book");
  assert.equal(requests.length, 2);
  assert.equal(requests[1].submitted.settings.language, "en");

  requests[1].resolve(server = requests[1].submitted);
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.equal(server.settings.language, "en");
  assert.equal(current.settings.language, "en");
  assert.equal(current.words[0].russian, "book");
});

test("a delayed sign-in bootstrap cannot undo a language selection", async () => {
  let current = russianStore();
  const submitted = current;
  let resolveResponse!: (value: StoreData) => void;
  const response = new Promise<StoreData>(resolve => { resolveResponse = resolve; });
  const signIn = response.then(merged => commitBootstrapResponse(
    update => { current = update(current); },
    submitted,
    merged,
    accepted => accepted,
  ));

  current = switchToEnglish(current);
  resolveResponse(submitted);
  await signIn;

  assert.equal(current.settings.language, "en");
  assert.equal(current.words[0].russian, "book");
});

test("a delayed bootstrap cannot erase an API key entered after its request", async () => {
  let current = russianStore();
  const submitted = current;
  let resolveResponse!: (value: StoreData) => void;
  const response = new Promise<StoreData>(resolve => { resolveResponse = resolve; });
  const sync = response.then(merged => commitBootstrapResponse(
    update => { current = update(current); },
    submitted,
    merged,
    accepted => accepted,
  ));

  current = { ...current, settings: { ...current.settings, apiKey: "test-key" } };
  resolveResponse(submitted);
  await sync;

  assert.equal(current.settings.apiKey, "test-key");
  assert.equal(current.settings.language, "ru");
});
