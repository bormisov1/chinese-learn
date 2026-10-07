import assert from 'node:assert/strict';
import test from 'node:test';
import { explanationKey, hasWordCharacterAnalysis, mergeExplanations, validateWordExplanation } from './word-explanations';
import { applyBootstrapSnapshot } from './sync-merge';
import { mergeBackupData, createBackup } from './backup';
import { wordExplanationPrompt } from './prompts';
import type { CachedExplanation, StoreData } from './types';

const emptyStore: StoreData = {
  storageVersion: 3, words: [], sentences: [], wordSentenceIndex: {}, attempts: [], sentenceDataByLanguage: {}, explanations: {},
  cardRound: 0, roundCompletions: [], mixQueue: [], mixPosition: 0, onboardingComplete: false, languageSelected: false,
  settings: { language: 'en', apiKey: '', apiKeyValidated: false, apiUrl: '', model: '', ttsProvider: 'browser', ttsVoiceURI: '', ttsRate: 1, automaticWordAddition: false, aiChatEnabled: true },
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

test('word explanations require component notes and a memory association for every Hanzi', () => {
  const explanation = entry(1, 'hello').explanation;
  const detailed = { ...explanation, parts: explanation.parts.map(part => ({ ...part, characters: part.characters.map(character => ({
    ...character,
    semanticComponent: 'Meaning component or none, with a reason.',
    phoneticComponent: 'Sound component or none, with a reason.',
    memoryAssociation: 'A memorable link to the character.',
  })) })) };
  assert.equal(validateWordExplanation(detailed, '你好', 'word'), detailed);
  assert.equal(hasWordCharacterAnalysis(detailed), true);
  assert.equal(hasWordCharacterAnalysis(explanation), false);
  assert.throws(() => validateWordExplanation(explanation, '你好', 'word'), /incomplete/);
  const missingOne = { ...detailed, parts: [{ ...detailed.parts[0], characters: [
    detailed.parts[0].characters[0], { ...detailed.parts[0].characters[1], phoneticComponent: '' },
  ] }] };
  assert.throws(() => validateWordExplanation(missingOne, '你好', 'word'), /incomplete/);
  assert.equal(validateWordExplanation(explanation, '你好', 'sentence'), explanation);
});

test('word prompt requests component analysis without inventing an absent component', () => {
  const prompt = wordExplanationPrompt('en', 'word', '你好');
  assert.match(prompt, /semanticComponent/);
  assert.match(prompt, /phoneticComponent/);
  assert.match(prompt, /memoryAssociation/);
  assert.match(prompt, /rather than inventing one/);
  assert.doesNotMatch(wordExplanationPrompt('en', 'sentence', '你好'), /memoryAssociation/);
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
