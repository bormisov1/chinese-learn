import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAT_PRESETS, addableChatWords, chatTitleForQuestion, fallbackChatTitle, parseChatReply, partialChatAnswer, requestChatReply } from './chat';
import { loadChatHistory, saveChatHistory } from './chat-history';
import type { Settings } from './types';

test('chat keeps only valid, unique, clickable Chinese words', () => {
  assert.deepEqual(parseChatReply({ answer: 'A greeting', words: [
    { hanzi: '你好', pinyin: 'nǐ hǎo', translation: 'hello' },
    { hanzi: '你好', pinyin: 'duplicate', translation: 'duplicate' },
    { hanzi: 'hello', pinyin: 'x', translation: 'invalid' },
  ] }), { answer: 'A greeting', words: [{ hanzi: '你好', pinyin: 'nǐ hǎo', translation: 'hello' }] });
  assert.throws(() => parseChatReply({ answer: 'missing list' }), /word list/);
});

test('only words present in the user question can be added from a reply', () => {
  const words = [
    { hanzi: '清', pinyin: 'qīng', translation: 'clear' },
    { hanzi: '氵', pinyin: 'shuǐ', translation: 'water radical' },
    { hanzi: '青', pinyin: 'qīng', translation: 'blue-green' },
    { hanzi: '爱', pinyin: 'ài', translation: 'love' },
  ];
  assert.deepEqual(addableChatWords(words, 'What does 清 mean?').map(word => word.hanzi), ['清']);
  assert.deepEqual(addableChatWords(words, 'Correct 我 love 你').map(word => word.hanzi), []);
});

test('chat progressively decodes JSON answer text and completes an SSE response', async () => {
  assert.equal(partialChatAnswer('{"answer":"Line\\n\u4f60'), 'Line\n你');
  assert.equal(partialChatAnswer('{"answer":"Line\\u4f'), 'Line');
  const originalFetch = globalThis.fetch;
  const updates: string[] = [];
  const encoder = new TextEncoder();
  globalThis.fetch = async (_input, init) => {
    assert.equal(JSON.parse(String(init?.body)).stream, true);
    return new Response(new ReadableStream({
      start(controller) {
        const payload = JSON.stringify({ answer: 'Ni hao', words: [{ hanzi: '你好', pinyin: 'nǐ hǎo', translation: 'hello' }] });
        const split = payload.indexOf(' hao');
        const event = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
        const first = event(payload.slice(0, split));
        controller.enqueue(encoder.encode(first.slice(0, 13)));
        controller.enqueue(encoder.encode(first.slice(13) + event(payload.slice(split)) + 'data: [DONE]\n\n'));
        controller.close();
      },
    }), { headers: { 'content-type': 'text/event-stream' } });
  };
  try {
    const settings: Settings = { language: 'en', apiKey: 'test-key', apiKeyValidated: true, apiUrl: 'https://example.com/chat', model: 'deepseek-v4-flash', ttsProvider: 'browser', ttsVoiceURI: '', ttsRate: 1, automaticWordAddition: false, aiChatEnabled: true, handwritingAfterWrong: true };
    const reply = await requestChatReply(settings, 'words', [{ role: 'user', content: '你好' }], answer => updates.push(answer));
    assert.ok(updates.includes('Ni'));
    assert.deepEqual(reply, { answer: 'Ni hao', words: [{ hanzi: '你好', pinyin: 'nǐ hǎo', translation: 'hello' }] });
  } finally { globalThis.fetch = originalFetch; }
});

test('chat accepts SSE replies even when a proxy omits the event-stream content type', async () => {
  const originalFetch = globalThis.fetch;
  const reply = { answer: 'Доброе утро!', words: [] };
  globalThis.fetch = async () => new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(reply) } }] })}\n\ndata: [DONE]\n\n`,
    { headers: { 'content-type': 'text/plain' } },
  );
  try {
    const settings: Settings = { language: 'ru', apiKey: 'test-key', apiKeyValidated: true, apiUrl: 'https://example.com/chat', model: 'deepseek-v4-flash', ttsProvider: 'browser', ttsVoiceURI: '', ttsRate: 1, automaticWordAddition: false, aiChatEnabled: true, handwritingAfterWrong: true };
    assert.deepEqual(await requestChatReply(settings, 'none', [{ role: 'user', content: 'Доброе утро' }]), reply);
  } finally { globalThis.fetch = originalFetch; }
});

test('chat gives a useful error when DeepSeek cuts off JSON', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"answer":"unfinished' } }] }));
  try {
    const settings: Settings = { language: 'en', apiKey: 'test-key', apiKeyValidated: true, apiUrl: 'https://example.com/chat', model: 'deepseek-v4-flash', ttsProvider: 'browser', ttsVoiceURI: '', ttsRate: 1, automaticWordAddition: false, aiChatEnabled: true, handwritingAfterWrong: true };
    await assert.rejects(requestChatReply(settings, 'none', [{ role: 'user', content: 'Hello' }]), /incomplete reply/);
  } finally { globalThis.fetch = originalFetch; }
});

test('first chat request asks for a 2–5 word title with the selected prompt', async () => {
  const originalFetch = globalThis.fetch;
  const requests: { messages: { role: string; content: string }[] }[] = [];
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: '你好', words: [{ hanzi: '你好', pinyin: 'nǐ hǎo', translation: 'hello' }] }) } }] }), { status: 200 });
  };
  try {
    const settings: Settings = { language: 'en', apiKey: 'test-key', apiKeyValidated: true, apiUrl: 'https://example.com/chat', model: 'deepseek-v4-flash', ttsProvider: 'browser', ttsVoiceURI: '', ttsRate: 1, automaticWordAddition: false, aiChatEnabled: true, handwritingAfterWrong: true };
    const history = [{ role: 'user' as const, content: '你好' }];
    const result = await requestChatReply(settings, 'words', history);
    assert.equal(result.words[0].hanzi, '你好');
    assert.equal(requests[0].messages[0].role, 'system');
    assert.match(requests[0].messages[0].content, new RegExp(CHAT_PRESETS[1].prompt));
    assert.match(requests[0].messages[0].content, /2–5 word title/);
    assert.match(requests[0].messages[0].content, /actual first question, not the selected system prompt/);
    assert.match(requests[0].messages[0].content, /include a relevant Chinese word or phrase/);
    await requestChatReply(settings, 'none', history);
    assert.deepEqual(requests[1].messages.map(message => message.role), ['system', 'user']);
    assert.match(requests[1].messages[0].content, /2–5 word title/);
    await requestChatReply(settings, 'none', [...history, { role: 'assistant', content: 'Hello' }, { role: 'user', content: 'Next' }]);
    assert.deepEqual(requests[2].messages.map(message => message.role), ['user', 'assistant', 'user']);
  } finally { globalThis.fetch = originalFetch; }
});

test('chat title accepts only a short summary and history survives reload', () => {
  assert.equal(parseChatReply({ answer: 'Hi', words: [], title: '  Chinese   greeting  ' }).title, 'Chinese greeting');
  assert.equal(parseChatReply({ answer: 'Hi', words: [], title: 'Greeting' }).title, undefined);
  assert.equal(fallbackChatTitle('你好'), 'About 你好');
  assert.equal(chatTitleForQuestion('Chinese greeting', 'What does 你好 mean?'), '你好 Chinese greeting');
  assert.equal(chatTitleForQuestion('你好 Greeting', 'What does 你好 mean?'), '你好 Greeting');
  assert.equal(chatTitleForQuestion('Meaning of Chinese greeting', 'Explain 打篮球'), '打篮球 Meaning of Chinese greeting');
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const conversations = [{ id: 'a', title: 'Chinese greeting', preset: 'words' as const, updatedAt: 2, messages: [
    { role: 'user' as const, text: '你好' },
    { role: 'assistant' as const, text: 'Hello', reply: { answer: 'Hello', words: [] } },
  ] }];
  saveChatHistory(conversations, storage);
  assert.deepEqual(loadChatHistory(storage), conversations);
  saveChatHistory([{ ...conversations[0], preset: 'correct' }], storage);
  assert.equal(loadChatHistory(storage)[0]?.preset, 'correct');
});
