import type { PhotoOcrResult } from './photo-ocr';
import { clipOverlappingWords } from './photo-ocr-layout';

let workerPromise: ReturnType<typeof import('tesseract.js')['createWorker']> | null = null;

export async function recognizePhoto(uri: string): Promise<PhotoOcrResult> {
  const { createWorker } = await import('tesseract.js');
  workerPromise ??= createWorker(['chi_sim', 'chi_tra', 'eng']).catch(error => {
    workerPromise = null;
    throw error;
  });
  const worker = await workerPromise;
  const image = new globalThis.Image();
  image.src = uri;
  await image.decode();
  const result = await worker.recognize(uri, {}, { blocks: true });
  const words = (result.data.blocks ?? []).flatMap(block =>
    block.paragraphs.flatMap(paragraph => paragraph.lines.flatMap(line =>
      clipOverlappingWords(line.words.map(word => ({
        text: word.text,
        box: { x: word.bbox.x0, y: word.bbox.y0, width: word.bbox.x1 - word.bbox.x0, height: word.bbox.y1 - word.bbox.y0 },
      }))),
    )),
  );
  return { width: image.naturalWidth, height: image.naturalHeight, words };
}
