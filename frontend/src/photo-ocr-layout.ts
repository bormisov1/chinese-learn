import OpenCC from 'opencc-js/t2cn';
import type { OcrBox, OcrWord } from './photo-ocr';

const toSimplifiedChinese = OpenCC.Converter({ from: 'tw', to: 'cn' });

/** Preserve an OCR element as one word; never segment it with the dictionary. */
export function recognizedWord(text: string): string | null {
  const trimmed = text.trim().replace(/^[^\p{Script=Han}]+|[^\p{Script=Han}]+$/gu, '');
  return /^[\p{Script=Han}]+$/u.test(trimmed) ? toSimplifiedChinese(trimmed) : null;
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
export function containedBox(box: OcrBox, imageWidth: number, imageHeight: number, viewWidth: number, viewHeight: number): OcrBox | null {
  if (![box.x, box.y, box.width, box.height, imageWidth, imageHeight, viewWidth, viewHeight].every(Number.isFinite)) return null;
  if (box.width <= 0 || box.height <= 0 || imageWidth <= 0 || imageHeight <= 0 || viewWidth <= 0 || viewHeight <= 0) return null;
  const scale = Math.min(viewWidth / imageWidth, viewHeight / imageHeight);
  const left = (viewWidth - imageWidth * scale) / 2;
  const top = (viewHeight - imageHeight * scale) / 2;
  const x0 = Math.max(0, Math.min(viewWidth, left + box.x * scale));
  const y0 = Math.max(0, Math.min(viewHeight, top + box.y * scale));
  const x1 = Math.max(0, Math.min(viewWidth, left + (box.x + box.width) * scale));
  const y1 = Math.max(0, Math.min(viewHeight, top + (box.y + box.height) * scale));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
