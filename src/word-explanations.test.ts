import assert from 'node:assert/strict';
import test from 'node:test';
import { explanationKey, mergeExplanations, validateWordExplanation } from './word-explanations';
import { applyBootstrapSnapshot } from './sync-merge';
import { mergeBackupData, createBackup } from './backup';
import type { CachedExplanation, StoreData } from './types';

const emptyStore: StoreData = {
  storageVersion: 3, words: [], sentences: [], wordSentenceIndex: {}, attempts: [], sentenceDataByLanguage: {}, explanations: {},
  cardRound: 0, roundCompletions: [], mixQueue: [], mixPosition: 0, onboardingComplete: false, languageSelected: false,
  settings: { language: 'en', apiKey: '', apiKeyValidated: false, apiUrl: '', model: '', ttsProvider: 'browser', ttsVoiceURI: '', ttsRate: 1, automaticWordAddition: false },
};

const entry = (updatedAt: number, translation: string): CachedExplanation => ({
  language: 'en', kind: 'word', text: '你好', updatedAt,
  explanation: { pinyin: 'nǐ hǎo', translation, summary: 'Greeting', parts: [{ text: '你好', pinyin: 'nǐ hǎo', meaning: translation, characters: [{ hanzi: '你', pinyin: 'nǐ', meaning: 'you' }, { hanzi: '好', pinyin: 'hǎo', meaning: 'good' }] }], grammar: 'Greeting.' },
});

test('cache keys normalize text and separate language and target kind', () => {
  assert.equal(explanationKey('word', ' 你 好  ', 'en'), explanationKey('word', '你   好', 'en'));
  assert.notEqual(explanationKey('word', '你好', 'en'), explanationKey('word', '你好', 'ru'));
  assert.notEqual(explanationKey('word', '你好', 'en'), explanationKey('sentence', '你好', 'en'));
});

test('rejects explanations that omit target characters or pinyin before caching', () => {
  assert.equal(validateWordExplanation(entry(1, 'hello').explanation, '你好').translation, 'hello');
  assert.throws(() => validateWordExplanation(entry(1, 'hello').explanation, '你好啊'), /incomplete/);
  assert.throws(() => validateWordExplanation({ ...entry(1, 'hello').explanation, pinyin: '' }, '你好'), /incomplete/);
});

test('sync merges concurrent explanation entries and latest refresh wins', () => {
  const key = explanationKey('word', '你好', 'en');
  const other = explanationKey('word', '学习', 'en');
  const local = { ...emptyStore, explanations: { [key]: entry(20, 'hello') } };
  const remote = { ...emptyStore, explanations: { [key]: entry(10, 'hi'), [other]: entry(11, 'study') } };
  const merged = applyBootstrapSnapshot(local, remote);
  assert.equal(merged.explanations[key].explanation.translation, 'hello');
  assert.equal(merged.explanations[other].explanation.translation, 'study');
  assert.equal(mergeExplanations(merged.explanations, { [key]: entry(30, 'greetings') })[key].explanation.translation, 'greetings');
});

test('backup import preserves locally refreshed explanation and adds missing entries', () => {
  const key = explanationKey('word', '你好', 'en');
  const other = explanationKey('word', '学习', 'en');
  const current = { ...emptyStore, explanations: { [key]: entry(20, 'hello') } };
  const imported = { ...emptyStore, explanations: { [key]: entry(10, 'hi'), [other]: entry(11, 'study') } };
  const merged = mergeBackupData(current, createBackup(imported)).data;
  assert.equal(merged.explanations[key].explanation.translation, 'hello');
  assert.equal(merged.explanations[other].explanation.translation, 'study');
});
