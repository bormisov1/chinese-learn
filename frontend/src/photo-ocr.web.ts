export async function recognizePhoto(uri: string): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('chi_sim+chi_tra+eng');
  try {
    const result = await worker.recognize(uri);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}
