import { Evaluation, Explanation, Sentence, Settings, Word } from './types';
import type { AppLanguage } from './types';
import type { ImportedWord } from './ocr';
import { evaluateChinesePrompt, evaluatePrompt, explainPrompt, generatePrompt, translateWordsPrompt } from './prompts';
import { resolveContextualPinyin, resolveSentencePronunciation } from './pronunciation';

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
  for (let request = 0; request < 4; request++) responses.push(await call(settings, DEEPSEEK_PRO_MODEL, 'Generate natural, semantically coherent Mandarin practice sentences. Follow every vocabulary and formatting constraint exactly. JSON only.', generatePrompt(settings.language, perCall, shuffle(vocabulary), shuffle(targets.map(w => w.hanzi)))));
  const candidates = responses.flatMap(data => data.sentences ?? []);
  const allowed = new Set(words.map(w => w.hanzi));
  return candidates.filter((s, i, all) => typeof s.chinese === 'string' && s.chinese.trim().split(/ +/).every(t => allowed.has(t)) && !!s.pinyin?.trim() && !!s.russian?.trim() && !!s.grammarPattern?.trim() && all.findIndex(x => x.chinese === s.chinese) === i).slice(0, size).map(sentence => ({
    ...sentence,
    pinyin: resolveContextualPinyin(sentence.chinese, sentence.pinyin),
  }));
}
export const evaluate = (settings: Settings, sentence: Sentence, answer: string) => {
  const pronunciation = resolveSentencePronunciation(sentence);
  return call<Evaluation>(settings, DEEPSEEK_FLASH_MODEL, 'Evaluate a Mandarin translation exercise. JSON only.', evaluatePrompt(settings.language, sentence.chinese, pronunciation.pinyin, pronunciation.meaning, answer));
};
export const evaluateChinese = (settings: Settings, sentence: Sentence, answer: string) => {
  const pronunciation = resolveSentencePronunciation(sentence);
  return call<Evaluation>(settings, DEEPSEEK_FLASH_MODEL, 'Evaluate a translation into Mandarin. JSON only.', evaluateChinesePrompt(settings.language, sentence.chinese, pronunciation.pinyin, pronunciation.meaning, answer));
};
export const explain = (settings: Settings, sentence: Sentence, words: Word[]) => call<Explanation>(settings, DEEPSEEK_PRO_MODEL, 'Explain Mandarin to the learner in their selected language. JSON only.', explainPrompt(settings.language, sentence.chinese, words.filter(w => sentence.wordIds.includes(w.id))));
export async function translateWords(settings: Settings, words: string[], language: AppLanguage): Promise<ImportedWord[]> {
  const translated: ImportedWord[] = [];
  for (let start = 0; start < words.length; start += 50) {
    const requested = words.slice(start, start + 50);
    const allowed = new Set(requested);
    const response = await call<{ words?: { hanzi?: unknown; pinyin?: unknown; translation?: unknown }[] }>(
      settings,
      DEEPSEEK_FLASH_MODEL,
      'Translate Mandarin vocabulary accurately and concisely. JSON only.',
      translateWordsPrompt(language, requested),
    );
    for (const item of response.words ?? []) {
      if (typeof item.hanzi !== 'string' || !allowed.has(item.hanzi) || typeof item.pinyin !== 'string' || typeof item.translation !== 'string') continue;
      if (!item.pinyin.trim() || !item.translation.trim() || translated.some(word => word.hanzi === item.hanzi)) continue;
      translated.push({ hanzi: item.hanzi, pinyin: item.pinyin.trim(), russian: item.translation.trim() });
    }
  }
  return translated;
}
