import assert from 'node:assert/strict';
import test from 'node:test';
import { applyBootstrapSnapshot } from './sync-merge';
import { replenishAutomaticWords } from './hsk-vocabulary';
import { removeVocabularyWord } from './vocabulary-selection';
import type { StoreData, Word } from './types';

const word = (id: string, hanzi: string) => ({ id, hanzi, pinyin: '', russian: '', exampleCount: 0 } as Word);

test('removing a selected word unlinks its sentence references and survives a union sync response', () => {
  const local: StoreData = {
    storageVersion: 3,
    words: [word('one', '你好'), word('two', '学习')],
    sentences: [{ id: 'sentence', chinese: '你好 学习', pinyin: '', russian: '', wordIds: ['one', 'two'], sentenceShownCount: 0 }],
    wordSentenceIndex: { one: ['sentence'], two: ['sentence'] },
    attempts: [], sentenceDataByLanguage: {}, explanations: {}, cardRound: 0, roundCompletions: [], mixQueue: [], mixPosition: 0,
    onboardingComplete: true,
    languageSelected: true,
    settings: { language: 'en', apiKey: '', apiKeyValidated: false, apiUrl: '', model: '', ttsProvider: '', ttsVoiceURI: '', ttsRate: 1, automaticWordAddition: false, aiChatEnabled: true },
  };
  const removed = removeVocabularyWord(local, '你好');
  assert.deepEqual(removed.words.map(item => item.hanzi), ['学习']);
  assert.deepEqual(removed.sentences[0].wordIds, ['two']);
  assert.deepEqual(removed.wordSentenceIndex, { two: ['sentence'] });
  assert.deepEqual(removed.removedWordHanzi, ['你好']);

  const synced = applyBootstrapSnapshot(removed, local);
  assert.deepEqual(synced.words.map(item => item.hanzi), ['学习']);
  assert.deepEqual(synced.sentences[0].wordIds, ['two']);
  assert.deepEqual(synced.removedWordHanzi, ['你好']);
});

test('automatic vocabulary refill skips an explicitly removed word', () => {
  const dictionary = new Map([
    ['爱', { hanzi: '爱', pinyin: 'ài', russian: 'love' }],
    ['八', { hanzi: '八', pinyin: 'bā', russian: 'eight' }],
  ]);
  const added = replenishAutomaticWords([], dictionary, 1, 0, new Set(['爱']));
  assert.deepEqual(added.map(item => item.hanzi), ['八']);
});
