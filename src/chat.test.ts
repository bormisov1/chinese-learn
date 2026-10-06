import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAT_PRESETS, parseChatReply, partialChatAnswer, requestChatReply } from './chat';
import type { Settings } from './types';

test('chat keeps only valid, unique, clickable Chinese words', () => {
  assert.deepEqual(parseChatReply({ answer: 'A greeting', words: [
    { hanzi: '你好', pinyin: 'nǐ hǎo', translation: 'hello' },
    { hanzi: '你好', pinyin: 'duplicate', translation: 'duplicate' },
    { hanzi: 'hello', pinyin: 'x', translation: 'invalid' },
  ] }), { answer: 'A greeting', words: [{ hanzi: '你好', pinyin: 'nǐ hǎo', translation: 'hello' }] });
  assert.throws(() => parseChatReply({ answer: 'missing list' }), /word list/);
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
    const settings: Settings = { language: 'en', apiKey: 'test-key', apiKeyValidated: true, apiUrl: 'https://example.com/chat', model: 'deepseek-v4-flash', ttsProvider: 'browser', ttsVoiceURI: '', ttsRate: 1, automaticWordAddition: false };
    const reply = await requestChatReply(settings, 'words', [{ role: 'user', content: '你好' }], answer => updates.push(answer));
    assert.ok(updates.includes('Ni'));
    assert.deepEqual(reply, { answer: 'Ni hao', words: [{ hanzi: '你好', pinyin: 'nǐ hǎo', translation: 'hello' }] });
  } finally { globalThis.fetch = originalFetch; }
});

test('chat sends the selected prompt and allows a truly empty system prompt', async () => {
  const originalFetch = globalThis.fetch;
  const requests: { messages: { role: string; content: string }[] }[] = [];
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: '你好', words: [{ hanzi: '你好', pinyin: 'nǐ hǎo', translation: 'hello' }] }) } }] }), { status: 200 });
  };
  try {
    const settings: Settings = { language: 'en', apiKey: 'test-key', apiKeyValidated: true, apiUrl: 'https://example.com/chat', model: 'deepseek-v4-flash', ttsProvider: 'browser', ttsVoiceURI: '', ttsRate: 1, automaticWordAddition: false };
    const history = [{ role: 'user' as const, content: '你好' }];
    const result = await requestChatReply(settings, 'words', history);
    assert.equal(result.words[0].hanzi, '你好');
    assert.equal(requests[0].messages[0].role, 'system');
    assert.match(requests[0].messages[0].content, new RegExp(CHAT_PRESETS[1].prompt));
    await requestChatReply(settings, 'none', history);
    assert.deepEqual(requests[1].messages.map(message => message.role), ['user']);
  } finally { globalThis.fetch = originalFetch; }
});
