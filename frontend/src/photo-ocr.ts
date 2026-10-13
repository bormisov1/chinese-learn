import { requireOptionalNativeModule } from 'expo';

type PhotoOcrModule = { recognize(uri: string): Promise<string[]> };
const nativeOcr = requireOptionalNativeModule<PhotoOcrModule>('HanziPhotoOcr');

export async function recognizePhoto(uri: string): Promise<string> {
  if (!nativeOcr) throw new Error('Photo recognition requires a new native app build.');
  return (await nativeOcr.recognize(uri)).join('\n');
}
