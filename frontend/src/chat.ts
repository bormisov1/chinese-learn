import type { AppLanguage, Settings } from './types';

export type ChatPreset = 'none' | 'words' | 'hanzi' | 'reply' | 'correct';
export type ChatTurn = { role: 'user' | 'assistant'; content: string };
export type ChatWord = { hanzi: string; pinyin: string; translation: string };
export type ChatReply = { answer: string; words: ChatWord[]; title?: string };

export function fallbackChatTitle(question: string): string {
  return `About ${question.trim().replace(/\s+/g, ' ').split(' ').slice(0, 4).join(' ').slice(0, 60)}`;
}

export function chatTitleForQuestion(title: string | undefined, question: string): string {
  const words = (title ?? fallbackChatTitle(question)).trim().split(/\s+/).filter(Boolean);
  const firstChinese = question.match(/[\p{Script=Han}]+/u)?.[0];
  const includesQuestionChinese = words.flatMap(word => word.match(/[\p{Script=Han}]+/gu) ?? [])
    .some(fragment => question.includes(fragment));
  if (firstChinese && !includesQuestionChinese) words.unshift([...firstChinese].slice(0, 8).join(''));
  return words.slice(0, 5).join(' ');
}

export const CHAT_PRESETS: { id: ChatPreset; label: string; prompt: string }[] = [
  { id: 'none', label: 'No prompt', prompt: '' },
  { id: 'words', label: 'Explain words', prompt: 'Explain each word and hanzi in following with pinyin' },
  { id: 'hanzi', label: 'Hanzi components', prompt: 'For following hanzi explain its components, what has meaning, what gives sound, what can be used as association to remember' },
  { id: 'reply', label: 'Suggest a reply', prompt: 'Suggest a reply to following' },
  { id: 'correct', label: 'Correct & translate', prompt: 'Correct the following text. Translate any English parts into natural Chinese so the complete corrected text is in Chinese. Show the corrected Chinese text first, then explain each correction and translation.' },
];

export function addableChatWords(words: ChatWord[], question: string): ChatWord[] {
  return words.filter(word => question.includes(word.hanzi));
}

export function parseChatReply(value: unknown): ChatReply {
  if (!value || typeof value !== 'object') throw new Error('DeepSeek returned an invalid reply.');
  const result = value as { answer?: unknown; words?: unknown; title?: unknown };
  if (typeof result.answer !== 'string' || !Array.isArray(result.words)) throw new Error('DeepSeek returned an invalid word list.');
  const seen = new Set<string>();
  const words: ChatWord[] = [];
  for (const item of result.words) {
    if (!item || typeof item !== 'object') continue;
    const word = item as Record<string, unknown>;
    if (typeof word.hanzi !== 'string' || !/^[\p{Script=Han}]+$/u.test(word.hanzi.trim()) ||
      typeof word.pinyin !== 'string' || !word.pinyin.trim() ||
      typeof word.translation !== 'string' || !word.translation.trim()) continue;
    const hanzi = word.hanzi.trim();
    if (seen.has(hanzi)) continue;
    seen.add(hanzi);
    words.push({ hanzi, pinyin: word.pinyin.trim(), translation: word.translation.trim() });
    if (words.length >= 40) break;
  }
  const title = typeof result.title === 'string' ? result.title.trim().replace(/\s+/g, ' ') : '';
  return { answer: result.answer.trim(), words, ...(title && title.split(' ').length >= 2 && title.split(' ').length <= 5 ? { title } : {}) };
}

// JSON is still being streamed while the answer field is arriving. Decode only
// complete string escapes; the finished payload is parsed normally below.
export function partialChatAnswer(content: string): string {
  const start = /"answer"\s*:\s*"/.exec(content);
  if (!start) return '';
  const from = start.index + start[0].length;
  let end = from;
  let escaped = false;
  for (; end < content.length; end++) {
    const char = content[end];
    if (!escaped && char === '"') break;
    if (!escaped && char === '\\') escaped = true;
    else escaped = false;
  }
  let fragment = content.slice(from, end);
  if (escaped) fragment = fragment.slice(0, -1);
  // An incomplete unicode escape may span chunks.
  fragment = fragment.replace(/\\u[0-9a-fA-F]{0,3}$/, '');
  try { return JSON.parse(`"${fragment}"`); } catch { return ''; }
}

export async function requestChatReply(settings: Settings, preset: ChatPreset, history: ChatTurn[], onPartial?: (answer: string) => void): Promise<ChatReply> {
  if (!settings.apiKey.trim()) throw new Error('Add your DeepSeek API key in Settings.');
  const language = ({ en: 'English', ru: 'Russian', th: 'Thai' } satisfies Record<AppLanguage, string>)[settings.language];
  const prompt = CHAT_PRESETS.find(item => item.id === preset)?.prompt ?? '';
  const firstQuestion = history.filter(turn => turn.role === 'user').length === 1 && !history.some(turn => turn.role === 'assistant');
  const titleInstruction = firstQuestion ? ` Also return "title": a short 2–5 word title in ${language} about the user's actual first question, not the selected system prompt. If the question contains Chinese text, include a relevant Chinese word or phrase from it in the title.` : '';
  const format = `Respond in ${language}. Return JSON only: {"answer":"Your explanation or suggested reply, with clear formatting and pinyin where useful","words":[{"hanzi":"你好","pinyin":"nǐ hǎo","translation":"hello"}]${firstQuestion ? ',"title":"Short question summary"' : ''}}. Put the word-by-word breakdown in the words array only; do not repeat that list in answer. The words array lists each useful Chinese word from the user's text and your answer once; include characters as separate entries when explaining Hanzi. Use ${language} for translations. Use an empty array if there are no Chinese words.${titleInstruction}`;
  const messages = [
    ...(prompt || firstQuestion ? [{ role: 'system', content: `${prompt ? `${prompt}. ` : ''}${format}` }] : []),
    ...history.map((turn, index) => ({ role: turn.role, content: index === history.length - 1 && turn.role === 'user' ? `${turn.content}\n\n${format}` : turn.content })),
  ];
  let response: Response;
  try {
    response = await fetch(settings.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
      body: JSON.stringify({ model: 'deepseek-v4-flash', response_format: { type: 'json_object' }, messages, temperature: 0.3, stream: true }),
    });
  } catch { throw new Error('Could not reach DeepSeek. Check your connection and API endpoint.'); }
  if (!response.ok) throw new Error(`DeepSeek error ${response.status}`);
  let content = '';
  const consume = (line: string) => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    let chunk: { choices?: { delta?: { content?: string }; finish_reason?: string }[]; error?: { message?: string } };
    try { chunk = JSON.parse(payload); }
    catch { throw new Error('DeepSeek returned an unreadable chat stream. Please try again.'); }
    if (chunk.error) throw new Error(chunk.error.message || 'DeepSeek chat failed. Please try again.');
    if (chunk.choices?.[0]?.finish_reason === 'length') throw new Error('DeepSeek cut off its reply. Please try again.');
    const delta = chunk.choices?.[0]?.delta?.content;
    if (typeof delta === 'string') {
      content += delta;
      onPartial?.(partialChatAnswer(content));
    }
  };
  if (response.body && response.headers.get('content-type')?.includes('text/event-stream')) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) consume(line);
      if (done) { if (buffer) consume(buffer); break; }
    }
  } else {
    const body = await response.text();
    if (body.trimStart().startsWith('data:')) {
      for (const line of body.trimStart().split(/\r?\n/)) consume(line);
    } else {
      let data: { choices?: { message?: { content?: string }; finish_reason?: string }[] };
      try { data = JSON.parse(body); }
      catch { throw new Error('DeepSeek returned an unreadable response. Check the API endpoint and try again.'); }
      if (data.choices?.[0]?.finish_reason === 'length') throw new Error('DeepSeek cut off its reply. Please try again.');
      content = data.choices?.[0]?.message?.content ?? '';
    }
  }
  if (!content.trim()) throw new Error('DeepSeek returned an empty reply. Please try again.');
  let parsed: unknown;
  try { parsed = JSON.parse(content); }
  catch { throw new Error('DeepSeek returned an incomplete reply. Please try again.'); }
  return parseChatReply(parsed);
}
