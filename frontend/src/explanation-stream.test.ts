import assert from 'node:assert/strict';
import test from 'node:test';
import { partialExplanation, readExplanationStream } from './explanation-stream';

test('previews incomplete JSON strings and nested explanation rows', () => {
  assert.equal(partialExplanation('"pinyin":"nǐ hǎ'), null);
  assert.equal(partialExplanation('{"pinyin":"nǐ hǎ')?.pinyin, 'nǐ hǎ');
  const preview = partialExplanation('{"pinyin":"nǐ hǎo","parts":[{"text":"你好","characters":[{"hanzi":"你","meaning":"yo');
  assert.equal(preview?.parts?.[0]?.characters?.[0]?.meaning, 'yo');
});

test('reads split SSE and UTF-8 bytes, shows partial data, then returns the complete JSON', async () => {
  const result = { pinyin: 'nǐ hǎo', translation: '你好', summary: 'Greeting', parts: [], grammar: 'Greeting.' };
  const json = JSON.stringify(result);
  const deltas = [json.slice(0, 14), json.slice(14, 47), json.slice(47)];
  const events = deltas.map(content => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`).join('') + 'data: [DONE]\n\n';
  const bytes = new TextEncoder().encode(events);
  const chunks = [bytes.slice(0, 13), bytes.slice(13, 50), bytes.slice(50, 91), bytes.slice(91)];
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) { chunks.forEach(chunk => controller.enqueue(chunk)); controller.close(); },
  }), { headers: { 'content-type': 'text/event-stream' } });
  const previews: string[] = [];
  assert.deepEqual(await readExplanationStream(response, partial => { if (partial.pinyin) previews.push(partial.pinyin); }), result);
  assert.ok(previews.some(value => value !== result.pinyin));
  assert.equal(previews.at(-1), result.pinyin);
});

test('rejects an interrupted stream instead of returning a partial explanation', async () => {
  const response = new Response('data: {"choices":[{"delta":{"content":"{\\"pinyin\\":\\"nǐ"}}]}\n\n', { headers: { 'content-type': 'text/event-stream' } });
  await assert.rejects(readExplanationStream(response), /ended early/);
});
