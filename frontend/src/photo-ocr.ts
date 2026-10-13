import { requireOptionalNativeModule } from 'expo';

export type OcrBox = { x: number; y: number; width: number; height: number };
export type OcrWord = { text: string; box: OcrBox };
export type PhotoOcrResult = { width: number; height: number; words: OcrWord[] };

type PhotoOcrModule = { recognize(uri: string): Promise<PhotoOcrResult> };
const nativeOcr = requireOptionalNativeModule<PhotoOcrModule>('HanziPhotoOcr');

export async function recognizePhoto(uri: string): Promise<PhotoOcrResult> {
  if (!nativeOcr) throw new Error('Photo recognition requires a new native app build.');
  return nativeOcr.recognize(uri);
}
