import { Platform } from 'react-native';
import ocrRows from './data/hsk-ocr-index.json';
import type { Dictionary } from './dictionary';

export type ImportedWord = { hanzi: string; pinyin: string; russian: string };
type Box = { x0: number; y0: number; x1: number; y1: number };
type OcrWord = { text: string; confidence: number; bbox: Box };
type OcrLine = { text: string; words: OcrWord[]; bbox: Box };
type Record = { hanzi: string; pinyin: string };
type Evidence = { baseline: string; pinyin: string; gloss: string };

const records: Record[] = (ocrRows as [string, string][]).map(([hanzi, pinyin]) => ({ hanzi, pinyin }));
const dictionary = new Map(records.map(record => [record.hanzi, record]));
const hanPattern = /\p{Script=Han}/u;
const onlyHan = (text: string) => [...text].filter(character => hanPattern.test(character)).join('');
const height = (box: Box) => box.y1 - box.y0;
const normalizePinyin = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f\s0-9'’:\-]/g, '').replaceAll('ü', 'v').replaceAll('u:', 'v').replace(/[^a-zv]/g, '');

function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) { let previous = row[0]; row[0] = i; for (let j = 1; j <= b.length; j++) { const saved = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1)); previous = saved; } }
  return row[b.length];
}

function flattenLines(blocks: unknown): OcrLine[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.flatMap(block => (block?.paragraphs ?? []).flatMap((paragraph: { lines?: OcrLine[] }) => paragraph.lines ?? []));
}

function textFallback(raw: string) {
  let parts: string[] = raw.match(/[\p{Script=Han}]+/gu) ?? [];
  if (/^[^\p{Script=Han}]*[@©]/u.test(raw) && parts.length > 1) parts = parts.slice(1);
  const joined = parts.join('');
  if (joined.length <= 8 && dictionary.has(joined)) return joined;
  const candidates: { word: string; index: number }[] = [];
  for (let start = 0; start < joined.length; start++) for (let length = 1; length <= Math.min(8, joined.length - start); length++) {
    const word = joined.slice(start, start + length);
    if (dictionary.has(word)) candidates.push({ word, index: start });
  }
  candidates.sort((a, b) => b.word.length - a.word.length || b.index - a.index);
  return candidates[0]?.word;
}

function spatialEvidence(line: OcrLine): Evidence | undefined {
  const hanWords = line.words.map(word => ({ text: onlyHan(word.text), bbox: word.bbox })).filter(word => word.text);
  if (!hanWords.length) return undefined;
  const tallest = Math.max(...hanWords.map(word => height(word.bbox)));
  const prominent = hanWords.filter(word => height(word.bbox) >= Math.max(34, tallest * .72)).sort((a, b) => a.bbox.x0 - b.bbox.x0);
  const clusters: { text: string; bbox: Box }[] = [];
  for (const token of prominent) {
    const previous = clusters.at(-1);
    const gap = previous ? token.bbox.x0 - previous.bbox.x1 : Infinity;
    if (!previous || gap > tallest * .9) clusters.push({ text: token.text, bbox: { ...token.bbox } });
    else { previous.text += token.text; previous.bbox.x1 = token.bbox.x1; previous.bbox.y0 = Math.min(previous.bbox.y0, token.bbox.y0); previous.bbox.y1 = Math.max(previous.bbox.y1, token.bbox.y1); }
  }
  const candidates = clusters.filter(cluster => dictionary.has(cluster.text));
  candidates.sort((a, b) => height(b.bbox) - height(a.bbox) || b.text.length - a.text.length || b.bbox.x0 - a.bbox.x0);
  const best = candidates[0];
  if (!best) return undefined;
  const right = line.words.filter(word => word.bbox.x0 > best.bbox.x1).sort((a, b) => a.bbox.x0 - b.bbox.x0);
  const firstLatin = right.findIndex(word => /[A-Za-zÀ-žüÜ]/u.test(word.text));
  if (firstLatin < 0 || right[firstLatin].bbox.x0 - best.bbox.x1 > 150) return { baseline: best.text, pinyin: '', gloss: line.text };
  const pinyinWords = [right[firstLatin]];
  for (let i = firstLatin + 1; i < right.length && pinyinWords.length < best.text.length; i++) {
    const previous = pinyinWords.at(-1)!;
    if (!/^[A-Za-zÀ-žüÜvV0-9:'-]+$/u.test(right[i].text) || right[i].bbox.x0 - previous.bbox.x1 > 70) break;
    pinyinWords.push(right[i]);
  }
  return { baseline: best.text, pinyin: pinyinWords.map(word => word.text).join(' '), gloss: right.slice(firstLatin + pinyinWords.length).map(word => word.text).join(' ') };
}

function resolveConservatively(evidence: Evidence) {
  const observed = normalizePinyin(evidence.pinyin);
  if (!observed) return evidence.baseline;
  const tolerance = Math.max(1, Math.floor(observed.length * .25));
  const candidates = records.map(record => ({ record, pinyinDistance: distance(normalizePinyin(record.pinyin), observed) })).filter(candidate => candidate.pinyinDistance <= tolerance && candidate.record.hanzi.length === evidence.baseline.length);
  candidates.sort((a, b) => a.pinyinDistance - b.pinyinDistance || Number(b.record.hanzi === evidence.baseline) - Number(a.record.hanzi === evidence.baseline));
  const replacement = candidates[0];
  return replacement?.pinyinDistance === 0 ? replacement.record.hanzi : evidence.baseline;
}

export function parseVocabulary(text: string, meanings: Dictionary): ImportedWord[] {
  const found = new Set<string>();
  for (const line of text.split(/\r?\n/)) { const word = textFallback(line); if (word) found.add(word); }
  return [...found].flatMap(hanzi => meanings.has(hanzi) ? [meanings.get(hanzi)!] : []);
}

export async function recognizeVocabulary(uri: string, meanings: Dictionary, onProgress: (value: number) => void): Promise<ImportedWord[]> {
  if (Platform.OS !== 'web') throw new Error('OCR currently runs in the web app.');
  const { createWorker, PSM } = await import('tesseract.js');
  const worker = await createWorker('chi_sim', 1, { logger: message => { if (typeof message.progress === 'number') onProgress(message.progress); } });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
    const response = await worker.recognize(uri, {}, { text: true, blocks: true });
    const found = new Map<string, ImportedWord>();
    for (const line of flattenLines(response.data.blocks)) {
      let evidence = spatialEvidence(line);
      if (!evidence && /[>›》]\s*$/u.test(line.text.trim())) { const baseline = textFallback(line.text); if (baseline) evidence = { baseline, pinyin: '', gloss: line.text }; }
      if (!evidence) continue;
      const item = dictionary.get(resolveConservatively(evidence));
      const localized = item && meanings.get(item.hanzi);
      if (localized) found.set(item.hanzi, localized);
    }
    return [...found.values()];
  } finally { await worker.terminate(); }
}

export async function recognizeHandwrittenHanzi(uri: string, onProgress: (value: number) => void): Promise<{ hanzi: string; confidence: number }> {
  if (Platform.OS !== 'web') throw new Error('OCR currently runs in the web app.');
  const { createWorker, PSM } = await import('tesseract.js');
  const worker = await createWorker('chi_sim', 1, { logger: message => { if (typeof message.progress === 'number') onProgress(message.progress); } });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_CHAR });
    const response = await worker.recognize(uri);
    return { hanzi: onlyHan(response.data.text)[0] ?? '', confidence: Math.round(response.data.confidence ?? 0) };
  } finally { await worker.terminate(); }
}
