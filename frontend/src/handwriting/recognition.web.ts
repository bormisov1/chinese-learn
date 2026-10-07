import type { Stroke } from './types';

type Match = { hanzi: string; score: number };
let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let pending: ((matches: string[]) => void) | null = null;
let rejectPending: ((error: Error) => void) | null = null;
let lookupQueue: Promise<void> = Promise.resolve();

export function prepareRecognition(): Promise<void> {
  if (ready) return ready;
  ready = new Promise((resolve, reject) => {
    worker = new Worker('/hanzi-lookup/worker.js');
    worker.onmessage = event => {
      if (event.data?.what === 'loaded') resolve();
      if (event.data?.what === 'lookup') {
        pending?.((event.data.matches as Match[] ?? []).map(match => match.hanzi));
        pending = null;
        rejectPending = null;
      }
    };
    worker.onerror = () => {
      const error = new Error('Browser handwriting recognizer failed to load.');
      rejectPending?.(error);
      worker?.terminate();
      worker = null;
      ready = null;
      pending = null;
      rejectPending = null;
      reject(error);
    };
    worker.postMessage({ wasm_uri: '/hanzi-lookup/hanzi_lookup_bg.wasm' });
  });
  return ready;
}

export function recognizeStrokes(strokes: Stroke[], _width: number, _height: number): Promise<string[]> {
  const lookup = lookupQueue.then(async () => {
    await prepareRecognition();
    if (!worker) throw new Error('Browser handwriting recognizer is unavailable.');
    return new Promise<string[]>((resolve, reject) => {
      pending = resolve;
      rejectPending = reject;
      worker!.postMessage({ strokes: strokes.map(stroke => stroke.map(([x, y]) => [x, y])), limit: 12 });
    });
  });
  lookupQueue = lookup.then(() => undefined, () => undefined);
  return lookup;
}
