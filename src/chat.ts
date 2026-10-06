import type { AppLanguage, Settings } from './types';

export type ChatPreset = 'none' | 'words' | 'hanzi' | 'reply';
export type ChatTurn = { role: 'user' | 'assistant'; content: string };
export type ChatWord = { hanzi: string; pinyin: string; translation: string };
export type ChatReply = { answer: string; words: ChatWord[] };

export const CHAT_PRESETS: { id: ChatPreset; label: string; prompt: string }[] = [
  { id: 'none', label: 'No prompt', prompt: '' },
  { id: 'words', label: 'Explain words', prompt: 'Explain each word and hanzi in following with pinyin' },
  { id: 'hanzi', label: 'Hanzi components', prompt: 'For following hanzi explain its components, what has meaning, what gives sound, what can be used as association to remember' },
  { id: 'reply', label: 'Suggest a reply', prompt: 'Suggest a reply to following' },
];

export function parseChatReply(value: unknown): ChatReply {
  if (!value || typeof value !== 'object') throw new Error('DeepSeek returned an invalid reply.');
  const result = value as { answer?: unknown; words?: unknown };
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
  return { answer: result.answer.trim(), words };
}

export async function requestChatReply(settings: Settings, preset: ChatPreset, history: ChatTurn[]): Promise<ChatReply> {
  if (!settings.apiKey.trim()) throw new Error('Add your DeepSeek API key in Settings.');
  const language = ({ en: 'English', ru: 'Russian', th: 'Thai' } satisfies Record<AppLanguage, string>)[settings.language];
  const prompt = CHAT_PRESETS.find(item => item.id === preset)?.prompt ?? '';
  const format = `Respond in ${language}. Return JSON only: {"answer":"Your explanation or suggested reply, with clear formatting and pinyin where useful","words":[{"hanzi":"你好","pinyin":"nǐ hǎo","translation":"hello"}]}. The words array is a list of each useful Chinese word from the user's text and your answer; include characters as separate entries when explaining Hanzi. Use ${language} for translations. Use an empty array if there are no Chinese words.`;
  const messages = [
    ...(prompt ? [{ role: 'system', content: `${prompt}. ${format}` }] : []),
    ...history.map((turn, index) => ({ role: turn.role, content: index === history.length - 1 && turn.role === 'user' ? `${turn.content}\n\n${format}` : turn.content })),
  ];
  let response: Response;
  try {
    response = await fetch(settings.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
      body: JSON.stringify({ model: 'deepseek-v4-flash', response_format: { type: 'json_object' }, messages, temperature: 0.3 }),
    });
  } catch { throw new Error('Could not reach DeepSeek. Check your connection and API endpoint.'); }
  if (!response.ok) throw new Error(`DeepSeek error ${response.status}`);
  const data = await response.json();
  try { return parseChatReply(JSON.parse(data.choices?.[0]?.message?.content ?? '{}')); }
  catch (error) { throw error instanceof Error ? error : new Error('DeepSeek returned invalid JSON.'); }
}
