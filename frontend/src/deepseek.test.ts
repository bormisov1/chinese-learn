import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, evaluateChinese, explain, explainWordOrSentence, generate, translateWords } from './deepseek';
import type { Sentence, Settings, Word } from './types';

test('all DeepSeek tasks request Flash even with a saved Pro model', async () => {
  const settings: Settings = {
    language: 'en', apiKey: 'test-key', apiKeyValidated: true,
    apiUrl: 'https://example.test/chat/completions', model: 'deepseek-v4-pro',
    ttsProvider: 'browser', ttsVoiceURI: '', ttsRate: 1, automaticWordAddition: false, aiChatEnabled: true, handwritingAfterWrong: true,
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
    await explainWordOrSentence(settings, 'word', { text: '你好', pinyin: 'nǐ hǎo', gloss: 'hello' });
    await translateWords(settings, ['你好'], 'en');
    assert.equal(requests.length, 9);
    assert.ok(requests.every(({ model }) => model === 'deepseek-v4-flash'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('retries without streaming when fetch cannot expose the explanation stream', async () => {
  const settings: Settings = {
    language: 'en', apiKey: 'test-key', apiKeyValidated: true,
    apiUrl: 'https://example.test/chat/completions', model: 'deepseek-v4-pro',
    ttsProvider: 'browser', ttsVoiceURI: '', ttsRate: 1, automaticWordAddition: false, aiChatEnabled: true, handwritingAfterWrong: true,
  };
  const explanation = {
    pinyin: 'bāng zhù', translation: 'help', summary: 'To help someone.', grammar: 'Verb.',
    parts: [{ text: '帮助', pinyin: 'bāng zhù', meaning: 'help', characters: [
      { hanzi: '帮', pinyin: 'bāng', meaning: 'help', semanticComponent: '巾', phoneticComponent: '邦', memoryAssociation: 'Helping hand.' },
      { hanzi: '助', pinyin: 'zhù', meaning: 'assist', semanticComponent: '力', phoneticComponent: '且', memoryAssociation: 'Extra strength.' },
    ] }],
  };
  const originalFetch = globalThis.fetch;
  const streams: boolean[] = [];
  globalThis.fetch = async (_input, init) => {
    const stream = JSON.parse(String(init?.body)).stream as boolean;
    streams.push(stream);
    return stream
      ? { ok: true, headers: new Headers({ 'content-type': 'text/event-stream' }), body: null } as Response
      : new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(explanation) } }] }), { status: 200 });
  };
  try {
    assert.deepEqual(await explainWordOrSentence(settings, 'word', { text: '帮助', pinyin: 'bāng zhù', gloss: 'help' }), explanation);
    assert.deepEqual(streams, [true, false]);
  } finally { globalThis.fetch = originalFetch; }
});

test('requests ordinary JSON explanations in React Native', async () => {
  const settings: Settings = {
    language: 'en', apiKey: 'test-key', apiKeyValidated: true,
    apiUrl: 'https://example.test/chat/completions', model: 'deepseek-v4-pro',
    ttsProvider: 'browser', ttsVoiceURI: '', ttsRate: 1, automaticWordAddition: false, aiChatEnabled: true, handwritingAfterWrong: true,
  };
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalFetch = globalThis.fetch;
  let requestedStream: boolean | undefined;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { product: 'ReactNative' } });
  globalThis.fetch = async (_input, init) => {
    requestedStream = JSON.parse(String(init?.body)).stream;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      pinyin: 'nǐ', translation: 'you', summary: 'Pronoun.', grammar: 'Pronoun.',
      parts: [{ text: '你', pinyin: 'nǐ', meaning: 'you', characters: [{ hanzi: '你', pinyin: 'nǐ', meaning: 'you', semanticComponent: '亻', phoneticComponent: '尔', memoryAssociation: 'A person.' }] }],
    }) } }] }), { status: 200 });
  };
  try {
    assert.equal((await explainWordOrSentence(settings, 'word', { text: '你', pinyin: 'nǐ', gloss: 'you' })).translation, 'you');
    assert.equal(requestedStream, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});

test('explanation request carries the authoritative polyphone reading and gloss', async () => {
  const settings: Settings = {
    language: 'en', apiKey: 'test-key', apiKeyValidated: true,
    apiUrl: 'https://example.test/chat/completions', model: 'deepseek-v4-pro',
    ttsProvider: 'browser', ttsVoiceURI: '', ttsRate: 1, automaticWordAddition: false, aiChatEnabled: true, handwritingAfterWrong: true,
  };
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalFetch = globalThis.fetch;
  let prompt = '';
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { product: 'ReactNative' } });
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    prompt = body.messages[1].content;
    const explanation = {
      pinyin: 'shuì', translation: 'persuade', summary: 'To persuade someone.', grammar: 'Verb.',
      parts: [{ text: '说', pinyin: 'shuì', meaning: 'persuade', characters: [{ hanzi: '说', pinyin: 'shuì', meaning: 'persuade', semanticComponent: '讠', phoneticComponent: '兑', memoryAssociation: 'Use words to persuade.' }] }],
    };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(explanation) } }] }), { status: 200 });
  };
  try {
    await explainWordOrSentence(settings, 'word', { text: '说', pinyin: 'shuì', gloss: 'persuade' });
    assert.match(prompt, /"text":"说","pinyin":"shuì","gloss":"persuade"/);
    assert.match(prompt, /top-level pinyin exactly as supplied: "shuì"/);
    assert.doesNotMatch(prompt, /"pinyin":"shuō"/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
  }
});
