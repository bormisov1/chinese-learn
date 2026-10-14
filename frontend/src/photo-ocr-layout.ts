import OpenCC from 'opencc-js/t2cn';
import type { OcrBox, OcrWord } from './photo-ocr';
import type { Dictionary } from './dictionary';

const toSimplifiedChinese = OpenCC.Converter({ from: 'tw', to: 'cn' });
const maximumLengths = new WeakMap<Dictionary, number>();

/** Preserve an OCR element as one word; never segment it with the dictionary. */
export function recognizedWord(text: string): string | null {
  const trimmed = text.trim().replace(/^[^\p{Script=Han}]+|[^\p{Script=Han}]+$/gu, '');
  return /^[\p{Script=Han}]+$/u.test(trimmed) ? toSimplifiedChinese(trimmed) : null;
}

type Match = { words: OcrWord[]; matchedCharacters: number; wordLengths: number[] };

function maximumWordLength(dictionary: Dictionary) {
  const cached = maximumLengths.get(dictionary);
  if (cached) return cached;
  let maximum = 1;
  for (const word of dictionary.keys()) maximum = Math.max(maximum, [...word].length);
  maximumLengths.set(dictionary, maximum);
  return maximum;
}

function betterMatch(candidate: Match, current: Match) {
  if (candidate.matchedCharacters !== current.matchedCharacters) return candidate.matchedCharacters > current.matchedCharacters;
  if (candidate.words.length !== current.words.length) return candidate.words.length < current.words.length;
  for (let index = 0; index < candidate.wordLengths.length; index++) {
    if (candidate.wordLengths[index] !== current.wordLengths[index]) return candidate.wordLengths[index] > current.wordLengths[index];
  }
  return false;
}

function joinedBox(words: OcrWord[]): OcrBox {
  const x = Math.min(...words.map(word => word.box.x));
  const y = Math.min(...words.map(word => word.box.y));
  return {
    x, y,
    width: Math.max(...words.map(word => word.box.x + word.box.width)) - x,
    height: Math.max(...words.map(word => word.box.y + word.box.height)) - y,
  };
}

function segmentCharacters(run: OcrWord[], dictionary: Dictionary): OcrWord[] {
  const matches: Match[] = Array(run.length + 1);
  matches[run.length] = { words: [], matchedCharacters: 0, wordLengths: [] };
  const limit = maximumWordLength(dictionary);
  for (let start = run.length - 1; start >= 0; start--) {
    const single = run[start];
    const remainder = matches[start + 1];
    const singleMatched = dictionary.has(single.text) ? 1 : 0;
    let best: Match = {
      words: [single, ...remainder.words],
      matchedCharacters: singleMatched + remainder.matchedCharacters,
      wordLengths: singleMatched ? [1, ...remainder.wordLengths].sort((a, b) => a - b) : remainder.wordLengths,
    };
    let text = single.text;
    for (let length = 2; length <= Math.min(limit, run.length - start); length++) {
      text += run[start + length - 1].text;
      if (!dictionary.has(text)) continue;
      const tail = matches[start + length];
      const candidate: Match = {
        words: [{ text, box: joinedBox(run.slice(start, start + length)) }, ...tail.words],
        matchedCharacters: length + tail.matchedCharacters,
        wordLengths: [length, ...tail.wordLengths].sort((a, b) => a - b),
      };
      if (betterMatch(candidate, best)) best = candidate;
    }
    matches[start] = best;
  }
  return matches[0].words;
}

function adjacentOnLine(first: OcrWord, second: OcrWord) {
  if (second.box.x <= first.box.x) return false;
  const overlap = Math.min(first.box.y + first.box.height, second.box.y + second.box.height) - Math.max(first.box.y, second.box.y);
  const gap = second.box.x - first.box.x - first.box.width;
  return overlap >= Math.min(first.box.height, second.box.height) * 0.45 && gap <= Math.max(first.box.height, second.box.height) * 0.8;
}

/** Join adjacent single-character OCR elements into dictionary words on the same line. */
export function groupOcrCharacters(words: OcrWord[], dictionary: Dictionary | null): OcrWord[] {
  const output: OcrWord[] = [];
  let run: OcrWord[] = [];
  const flush = () => {
    if (run.length) output.push(...(dictionary ? segmentCharacters(run, dictionary) : run));
    run = [];
  };
  for (const word of words) {
    const normalized = recognizedWord(word.text);
    const unit = { ...word, text: normalized ?? word.text };
    if (normalized && [...normalized].length === 1) {
      if (run.length && !adjacentOnLine(run[run.length - 1], unit)) flush();
      run.push(unit);
    } else {
      flush();
      output.push(unit);
    }
  }
  flush();
  return output;
}

/** Tesseract sometimes stretches a word's box across following words in a line. */
export function clipOverlappingWords(words: OcrWord[]): OcrWord[] {
  return words.map((word, index) => {
    const next = words[index + 1];
    if (!next || next.box.x <= word.box.x || next.box.x >= word.box.x + word.box.width) return word;
    const overlap = Math.min(word.box.y + word.box.height, next.box.y + next.box.height) - Math.max(word.box.y, next.box.y);
    if (overlap < Math.min(word.box.height, next.box.height) * 0.45) return word;
    return { ...word, box: { ...word.box, width: next.box.x - word.box.x } };
  });
}

/** Map a source-image rectangle into an Image with resizeMode="contain". */
function scaledBox(box: OcrBox, imageWidth: number, imageHeight: number, viewWidth: number, viewHeight: number, mode: 'contain' | 'cover'): OcrBox | null {
  if (![box.x, box.y, box.width, box.height, imageWidth, imageHeight, viewWidth, viewHeight].every(Number.isFinite)) return null;
  if (box.width <= 0 || box.height <= 0 || imageWidth <= 0 || imageHeight <= 0 || viewWidth <= 0 || viewHeight <= 0) return null;
  const scale = mode === 'cover' ? Math.max(viewWidth / imageWidth, viewHeight / imageHeight) : Math.min(viewWidth / imageWidth, viewHeight / imageHeight);
  const left = (viewWidth - imageWidth * scale) / 2;
  const top = (viewHeight - imageHeight * scale) / 2;
  const x0 = Math.max(0, Math.min(viewWidth, left + box.x * scale));
  const y0 = Math.max(0, Math.min(viewHeight, top + box.y * scale));
  const x1 = Math.max(0, Math.min(viewWidth, left + (box.x + box.width) * scale));
  const y1 = Math.max(0, Math.min(viewHeight, top + (box.y + box.height) * scale));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function containedBox(box: OcrBox, imageWidth: number, imageHeight: number, viewWidth: number, viewHeight: number): OcrBox | null {
  return scaledBox(box, imageWidth, imageHeight, viewWidth, viewHeight, 'contain');
}

export function coveredBox(box: OcrBox, imageWidth: number, imageHeight: number, viewWidth: number, viewHeight: number): OcrBox | null {
  return scaledBox(box, imageWidth, imageHeight, viewWidth, viewHeight, 'cover');
}
