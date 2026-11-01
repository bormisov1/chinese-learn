import { requireOptionalNativeModule } from 'expo';
import type { Stroke } from './types';

type InkModule = {
  isModelDownloaded(): Promise<boolean>;
  downloadModel(): Promise<boolean>;
  recognize(strokesJSON: string, width: number, height: number): Promise<string[]>;
};

const ink = requireOptionalNativeModule<InkModule>('HanziInk');

export async function prepareRecognition(): Promise<void> {
  if (!ink) throw new Error('Handwriting requires a new native app build. It is unavailable in Expo Go.');
  if (!(await ink.isModelDownloaded())) await ink.downloadModel();
}

export async function recognizeStrokes(strokes: Stroke[], width: number, height: number): Promise<string[]> {
  if (!ink) throw new Error('Handwriting requires a new native app build.');
  const points = strokes.map(stroke => stroke.map(([x, y, t]) => ({ x, y, t })));
  return ink.recognize(JSON.stringify(points), width, height);
}
