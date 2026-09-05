import { Evaluation, Explanation, Sentence, Settings, Word } from './types';
import { evaluateChinesePrompt, evaluatePrompt, explainPrompt, generatePrompt } from './prompts';

const DEEPSEEK_PRO_MODEL = 'deepseek-v4-pro';
const DEEPSEEK_FLASH_MODEL = 'deepseek-v4-flash';

export async function validateApiKey(apiKey: string, signal?: AbortSignal) {
  const response = await fetch('https://api.deepseek.com/user/balance', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (response.status === 401) throw new Error('Invalid DeepSeek API key.');
  if (!response.ok) throw new Error(`DeepSeek validation error ${response.status}.`);
}

async function call<T>(settings: Settings, model: string, system: string, user: string): Promise<T> {
  if (!settings.apiKey) throw new Error('Add your DeepSeek API key in Settings.');
  let response: Response;
  try { response = await fetch(settings.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` }, body: JSON.stringify({ model, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.8 }) }); }
  catch { throw new Error('Could not reach DeepSeek. Check the API endpoint, network, and browser console.'); }
  if (!response.ok) throw new Error(`DeepSeek error ${response.status}`);
  const json = await response.json();
  return JSON.parse(json.choices?.[0]?.message?.content ?? '{}') as T;
}
export async function generate(settings: Settings, words: Word[], targets: Word[], size: number): Promise<Omit<Sentence, 'id' | 'wordIds' | 'sentenceShownCount'>[]> {
  const shuffle = <T,>(items: T[]) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
    return copy;
  };
  const vocabulary = words.map(({ hanzi, pinyin, russian }) => ({ hanzi, pinyin, russian }));
  const perCall = Math.ceil(size / 4);
  const responses: { sentences?: { chinese: string; pinyin: string; russian: string; grammarPattern: string }[] }[] = [];
  for (let request = 0; request < 4; request++) responses.push(await call(settings, DEEPSEEK_PRO_MODEL, 'Generate natural, semantically coherent Mandarin practice sentences. Follow every vocabulary and formatting constraint exactly. JSON only.', generatePrompt(perCall, shuffle(vocabulary), shuffle(targets.map(w => w.hanzi)))));
  const candidates = responses.flatMap(data => data.sentences ?? []);
  const allowed = new Set(words.map(w => w.hanzi));
  return candidates.filter((s, i, all) => typeof s.chinese === 'string' && s.chinese.trim().split(/ +/).every(t => allowed.has(t)) && !!s.pinyin?.trim() && !!s.russian?.trim() && !!s.grammarPattern?.trim() && all.findIndex(x => x.chinese === s.chinese) === i).slice(0, size);
}
export const evaluate = (settings: Settings, sentence: Sentence, answer: string) => call<Evaluation>(settings, DEEPSEEK_FLASH_MODEL, 'Evaluate Mandarin-to-Russian translation. JSON only.', evaluatePrompt(sentence.chinese, sentence.pinyin, sentence.russian, answer));
export const evaluateChinese = (settings: Settings, sentence: Sentence, answer: string) => call<Evaluation>(settings, DEEPSEEK_FLASH_MODEL, 'Evaluate Russian-to-Mandarin translation. JSON only.', evaluateChinesePrompt(sentence.chinese, sentence.pinyin, sentence.russian, answer));
export const explain = (settings: Settings, sentence: Sentence, words: Word[]) => call<Explanation>(settings, DEEPSEEK_PRO_MODEL, 'Explain Mandarin to a Russian-speaking learner. JSON only.', explainPrompt(sentence.chinese, words.filter(w => sentence.wordIds.includes(w.id))));
