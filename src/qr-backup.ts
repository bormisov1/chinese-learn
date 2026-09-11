import type { AppLanguage, Word } from './types';
import { inflate } from 'pako';
import { isAppLanguage } from './i18n';

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

function decodeBase45(value: string) {
  const bytes: number[] = [];
  for (let i = 0; i < value.length;) {
    if (i + 2 < value.length) { const decoded = alphabet.indexOf(value[i]) + alphabet.indexOf(value[i + 1]) * 45 + alphabet.indexOf(value[i + 2]) * 2025; if (decoded > 65535) throw new Error('Invalid QR backup.'); bytes.push(Math.floor(decoded / 256), decoded % 256); i += 3; }
    else { const decoded = alphabet.indexOf(value[i]) + alphabet.indexOf(value[i + 1]) * 45; if (decoded > 255) throw new Error('Invalid QR backup.'); bytes.push(decoded); i += 2; }
  }
  return new Uint8Array(bytes);
}

export async function decodeQrBackup(payload: string): Promise<{ language: AppLanguage; words: Omit<Word, 'id'>[] }> {
  if (!payload.startsWith('HD1:')) throw new Error('Not a Hanzi Deck QR backup.');
  const compressed = decodeBase45(payload.slice(4));
  const parsed = JSON.parse(new TextDecoder().decode(inflate(compressed)));
  if (parsed?.[0] !== 'HD2' || !isAppLanguage(parsed?.[1]) || !Array.isArray(parsed?.[2])) throw new Error('Unsupported QR backup version.');
  const words = parsed[2].map((tuple: unknown[]) => {
    const lexical = [String(tuple[0]), String(tuple[1]), String(tuple[2])];
    const values = tuple.slice(3).map(Number);
    return { hanzi: lexical[0], pinyin: lexical[1], russian: lexical[2], exampleCount: values[0], wordShownCount: values[1], createdAt: values[2], srsLevel: values[3], srsCorrect: values[4], srsIncorrect: values[5], srsDueAt: values[6], cardSrsLevel: values[7], cardSrsCorrect: values[8], cardSrsIncorrect: values[9], cardSrsDueAt: values[10], cardIntroducedAt: values[11] || undefined, cardActive: values[12] === 1, cardLastStudiedRound: values[13] >= 0 ? values[13] : undefined, cardLastIncorrectAt: values[14] || undefined, cardLapses: values[15] || 0 };
  });
  return { language: parsed[1], words };
}
