import assert from 'node:assert/strict';
import test from 'node:test';
import { requestExplanation } from './explanation-loading';
import type { WordExplanation } from './types';

const explanation = { pinyin: 'nǐ', translation: 'you', summary: 'Pronoun', parts: [], grammar: 'Pronoun' } as WordExplanation;

test('concurrent loads of the same explanation share one request, including across remounts', async () => {
  let calls = 0;
  let resolve!: (value: WordExplanation) => void;
  const first = requestExplanation('en:word:你', () => {
    calls++;
    return new Promise<WordExplanation>(done => { resolve = done; });
  });
  const second = requestExplanation('en:word:你', () => { calls++; return Promise.resolve(explanation); });
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(first, second);
  resolve(explanation);
  assert.equal(await second, explanation);
});

test('different targets load independently and a failed request can be retried', async () => {
  const a = requestExplanation('en:word:好', async () => explanation);
  const b = requestExplanation('ru:word:好', async () => explanation);
  assert.notEqual(a, b);
  await Promise.all([a, b]);
  let calls = 0;
  await assert.rejects(requestExplanation('en:word:再见', async () => { calls++; throw new Error('offline'); }), /offline/);
  assert.equal(await requestExplanation('en:word:再见', async () => { calls++; return explanation; }), explanation);
  assert.equal(calls, 2);
});
