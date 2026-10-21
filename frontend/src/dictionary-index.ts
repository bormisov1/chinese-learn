import type { ImportedWord } from "./types";
import { ensureLexicalKey, lexicalKey, normalizeHanzi } from "./lexical";

export class LexicalDictionary {
  readonly byKey = new Map<string, ImportedWord & { lexicalKey: string }>();
  readonly byHanzi = new Map<string, (ImportedWord & { lexicalKey: string })[]>();
  constructor(rows: Iterable<ImportedWord> = []) { for (const row of rows) this.add(row); }
  add(value: ImportedWord) {
    const entry = ensureLexicalKey(value);
    if (!entry.lexicalKey) return;
    const previous = this.byKey.get(entry.lexicalKey);
    const merged = previous ? { ...previous, russian: [...new Set([...previous.russian.split("; "), ...entry.russian.split("; ")])].join("; ") } : entry;
    this.byKey.set(entry.lexicalKey, merged);
    const hanzi = normalizeHanzi(entry.hanzi);
    this.byHanzi.set(hanzi, [...this.byKey.values()].filter(item => normalizeHanzi(item.hanzi) === hanzi));
  }
  get size() { return this.byKey.size; }
  get(keyOrHanzi: string) {
    const exact = this.byKey.get(keyOrHanzi);
    if (exact) return exact;
    const readings = this.byHanzi.get(normalizeHanzi(keyOrHanzi)) ?? [];
    return readings.length === 1 ? readings[0] : undefined;
  }
  getExact(hanzi: string, pinyin: string) { return this.byKey.get(lexicalKey(hanzi, pinyin)); }
  readings(hanzi: string) { return [...(this.byHanzi.get(normalizeHanzi(hanzi)) ?? [])]; }
  has(keyOrHanzi: string) { return this.byKey.has(keyOrHanzi) || this.byHanzi.has(normalizeHanzi(keyOrHanzi)); }
  keys() { return this.byHanzi.keys(); }
  values() { return this.byKey.values(); }
  [Symbol.iterator]() { return this.byKey[Symbol.iterator](); }
}

export type Dictionary = LexicalDictionary | Map<string, ImportedWord>;
export const dictionaryByKey = (dictionary: Dictionary, key: string) => dictionary instanceof LexicalDictionary
  ? dictionary.byKey.get(key)
  : [...dictionary.values()].map(ensureLexicalKey).find(item => item.lexicalKey === key);
export const dictionaryWithEntries = (dictionary: Dictionary, entries: ImportedWord[]) => new LexicalDictionary([...dictionary.values(), ...entries]);
export const dictionaryReadings = (dictionary: Dictionary, hanzi: string) => dictionary instanceof LexicalDictionary
  ? dictionary.readings(hanzi)
  : [...dictionary.values()].filter(item => normalizeHanzi(item.hanzi) === normalizeHanzi(hanzi)).map(ensureLexicalKey);
