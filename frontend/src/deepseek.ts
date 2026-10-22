import { Evaluation, Explanation, Sentence, Settings, Word, WordExplanation } from './types';
import type { AppLanguage } from './types';
import type { ImportedWord } from './types';
import { evaluateChinesePrompt, evaluatePrompt, explainPrompt, generatePrompt, translateWordsPrompt, wordExplanationPrompt } from './prompts';
import { resolveSentencePronunciation } from './pronunciation';
import { validateWordExplanation } from './word-explanations';
import type { ExplanationKind, ExplanationTarget } from './word-explanations';
import { readExplanationStream } from './explanation-stream';

const DEEPSEEK_FLASH_MODEL = 'deepseek-v4-flash';
type RequestLexeme = { id: string; hanzi: string; pinyin: string; gloss: string; wordId: string };
type GeneratedCandidate = { wordIds?: unknown; russian?: unknown; grammarPattern?: unknown };

export function reconstructGeneratedSentences(candidates: GeneratedCandidate[], requestLexemes: RequestLexeme[], size: number): Omit<Sentence, 'id' | 'sentenceShownCount'>[] {
  const byRequestId = new Map(requestLexemes.map(item => [item.id, item]));
  const valid = candidates.flatMap(sentence => {
    if (!Array.isArray(sentence.wordIds) || !sentence.wordIds.length || sentence.wordIds.some(id => typeof id !== 'string' || !byRequestId.has(id))) return [];
    if (typeof sentence.russian !== 'string' || !sentence.russian.trim() || typeof sentence.grammarPattern !== 'string' || !sentence.grammarPattern.trim()) return [];
    const entries = sentence.wordIds.map(id => byRequestId.get(id as string)!);
    return [{ chinese: entries.map(item => item.hanzi).join(' '), pinyin: entries.map(item => item.pinyin).join(' '), russian: sentence.russian.trim(), grammarPattern: sentence.grammarPattern.trim(), wordIds: entries.map(item => item.wordId) }];
  });
  return valid.filter((sentence, index, all) => all.findIndex(item => item.chinese === sentence.chinese && item.wordIds.join() === sentence.wordIds.join()) === index).slice(0, size);
}

export async function validateApiKey(apiKey: string, signal?: AbortSignal) {
  const response = await fetch('https://api.deepseek.com/user/balance', {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  if (response.status === 401) throw new Error('Invalid DeepSeek API key.');
  if (!response.ok) throw new Error(`DeepSeek validation error ${response.status}.`);
}

async function call<T>(settings: Settings, system: string, user: string, temperature = 0.8): Promise<T> {
  if (!settings.apiKey) throw new Error('Add your DeepSeek API key in Settings.');
  let response: Response;
  try { response = await fetch(settings.apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` }, body: JSON.stringify({ model: DEEPSEEK_FLASH_MODEL, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature }) }); }
  catch { throw new Error('Could not reach DeepSeek. Check the API endpoint, network, and browser console.'); }
  if (!response.ok) throw new Error(`DeepSeek error ${response.status}`);
  const json = await response.json();
  return JSON.parse(json.choices?.[0]?.message?.content ?? '{}') as T;
}
export async function generate(settings: Settings, words: Word[], targets: Word[], size: number): Promise<Omit<Sentence, 'id' | 'sentenceShownCount'>[]> {
  const shuffle = <T,>(items: T[]) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
    return copy;
  };
  const requestLexemes = words.map((word, index) => ({ id: `l${index}`, hanzi: word.hanzi, pinyin: word.pinyin, gloss: word.russian, wordId: word.id }));
  const targetIds = targets.map(target => requestLexemes.find(item => item.wordId === target.id)?.id).filter(Boolean);
  const perCall = Math.ceil(size / 4);
  const responses: { sentences?: { wordIds?: unknown; russian?: unknown; grammarPattern?: unknown }[] }[] = [];
  for (let request = 0; request < 4; request++) responses.push(await call(settings, 'Generate natural, semantically coherent Mandarin practice sentences. Follow every vocabulary and formatting constraint exactly. JSON only.', generatePrompt(settings.language, perCall, shuffle(requestLexemes.map(({ wordId: _wordId, ...item }) => item)), shuffle(targetIds))));
  return reconstructGeneratedSentences(responses.flatMap(data => data.sentences ?? []), requestLexemes, size);
}
export const evaluate = (settings: Settings, sentence: Sentence, answer: string) => {
  const pronunciation = resolveSentencePronunciation(sentence);
  return call<Evaluation>(settings, 'Evaluate a Mandarin translation exercise. JSON only.', evaluatePrompt(settings.language, sentence.chinese, pronunciation.pinyin, pronunciation.meaning, answer));
};
export const evaluateChinese = (settings: Settings, sentence: Sentence, answer: string) => {
  const pronunciation = resolveSentencePronunciation(sentence);
  return call<Evaluation>(settings, 'Evaluate a translation into Mandarin. JSON only.', evaluateChinesePrompt(settings.language, sentence.chinese, pronunciation.pinyin, pronunciation.meaning, answer));
};
export const explain = (settings: Settings, sentence: Sentence, words: Word[]) => call<Explanation>(settings, 'Explain Mandarin to the learner in their selected language. JSON only.', explainPrompt(settings.language, sentence.chinese, words.filter(w => sentence.wordIds.includes(w.id))));
export async function explainWordOrSentence(settings: Settings, kind: ExplanationKind, target: ExplanationTarget, onPartial?: (partial: Partial<WordExplanation>) => void): Promise<WordExplanation> {
  if (!settings.apiKey) throw new Error('Add your DeepSeek API key in Settings.');
  // React Native fetch exposes no readable response body for SSE on iOS.
  const nativeRuntime = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
  const request = async (stream: boolean) => {
    let response: Response;
    try {
      response = await fetch(settings.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.apiKey}` },
        body: JSON.stringify({ model: DEEPSEEK_FLASH_MODEL, response_format: { type: 'json_object' }, stream,
          messages: [{ role: 'system', content: 'You are a precise Mandarin teacher. Follow the JSON schema and respond in the learner language. JSON only.' }, { role: 'user', content: wordExplanationPrompt(settings.language, kind, target) }], temperature: 0.2 }),
      });
    } catch { throw new Error('Could not reach DeepSeek. Check the API endpoint, network, and browser console.'); }
    if (!response.ok) throw new Error(`DeepSeek error ${response.status}`);
    return response;
  };
  let response = await request(!nativeRuntime);
  if (!nativeRuntime && !response.body) response = await request(false);
  const result = response.headers.get('content-type')?.includes('text/event-stream')
    ? await readExplanationStream(response, onPartial)
    : JSON.parse((await response.json()).choices?.[0]?.message?.content ?? '{}');
  return validateWordExplanation(result, target.text, kind, target.pinyin);
}
export async function translateWords(settings: Settings, words: string[], language: AppLanguage): Promise<ImportedWord[]> {
  const translated: ImportedWord[] = [];
  for (let start = 0; start < words.length; start += 50) {
    const requested = words.slice(start, start + 50);
    const allowed = new Set(requested);
    const response = await call<{ words?: { hanzi?: unknown; pinyin?: unknown; translation?: unknown }[] }>(
      settings,
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
