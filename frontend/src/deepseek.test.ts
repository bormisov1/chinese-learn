import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, evaluateChinese, explain, explainWordOrSentence, generate, translateWords } from './deepseek';
import type { Sentence, Settings, Word } from './types';

test('all DeepSeek tasks request Flash even with a saved Pro model', async () => {
  const settings: Settings = {
    language: 'en', apiKey: 'test-key', apiKeyValidated: true,
    apiUrl: 'https://example.test/chat/completions', model: 'deepseek-v4-pro',
    ttsProvider: 'browser', ttsVoiceURI: '', ttsRate: 1, automaticWordAddition: false,
  };
  const word: Word = {
    id: 'word', hanzi: '你好', pinyin: 'nǐ hǎo', russian: 'hello',
    exampleCount: 0, wordShownCount: 0, createdAt: 0,
    srsLevel: 0, srsCorrect: 0, srsIncorrect: 0, srsDueAt: 0,
    cardSrsLevel: 0, cardSrsCorrect: 0, cardSrsIncorrect: 0, cardSrsDueAt: 0,
  };
  const sentence: Sentence = {
    id: 'sentence', chinese: '你好', pinyin: 'nǐ hǎo', russian: 'hello',
    wordIds: [word.id], sentenceShownCount: 0,
  };
  const requests: { model: string; messages: { content: string }[] }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    const system = body.messages[0].content as string;
    const result = system.startsWith('Generate')
      ? { sentences: [{ chinese: '你好', pinyin: 'nǐ hǎo', russian: 'hello', grammarPattern: 'greeting' }] }
      : system.startsWith('Translate')
        ? { words: [{ hanzi: '你好', pinyin: 'nǐ hǎo', translation: 'hello' }] }
        : system.startsWith('You are a precise')
          ? { pinyin: 'nǐ hǎo', translation: 'hello', summary: 'greeting', grammar: 'greeting', parts: [{ text: '你好', pinyin: 'nǐ hǎo', meaning: 'hello', characters: [
            { hanzi: '你', pinyin: 'nǐ', meaning: 'you', semanticComponent: '亻 hints at a person.', phoneticComponent: '尔 suggests the sound.', memoryAssociation: 'Picture a person greeting you.' },
            { hanzi: '好', pinyin: 'hǎo', meaning: 'good', semanticComponent: '女 and 子 combine in the character.', phoneticComponent: 'No clear phonetic component.', memoryAssociation: 'Imagine a happy family saying hello.' },
          ] }] }
          : {};
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }), { status: 200 });
  };

  try {
    await generate(settings, [word], [word], 1);
    await evaluate(settings, sentence, 'hello');
    await evaluateChinese(settings, sentence, '你好');
    await explain(settings, sentence, [word]);
    await explainWordOrSentence(settings, 'word', '你好');
    await translateWords(settings, ['你好'], 'en');
    assert.equal(requests.length, 9);
    assert.ok(requests.every(({ model }) => model === 'deepseek-v4-flash'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
