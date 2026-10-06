import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAT_PRESETS, parseChatReply, requestChatReply } from './chat';
import type { Settings } from './types';

test('chat keeps only valid, unique, clickable Chinese words', () => {
  assert.deepEqual(parseChatReply({ answer: 'A greeting', words: [
    { hanzi: '你好', pinyin: 'nǐ hǎo', translation: 'hello' },
    { hanzi: '你好', pinyin: 'duplicate', translation: 'duplicate' },
    { hanzi: 'hello', pinyin: 'x', translation: 'invalid' },
  ] }), { answer: 'A greeting', words: [{ hanzi: '你好', pinyin: 'nǐ hǎo', translation: 'hello' }] });
  assert.throws(() => parseChatReply({ answer: 'missing list' }), /word list/);
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
