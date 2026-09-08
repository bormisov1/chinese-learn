import dictionaryRows from "./data/hsk-russian.json";
import type { ImportedWord } from "./ocr";

type DictionaryRow = [string, string, string];
type Match = { words: ImportedWord[]; matchedCharacters: number };

const normalizeHanzi = (value: string) => value.replace(/\s+/g, "");
const dictionary = new Map<string, ImportedWord>();

for (const [rawHanzi, pinyin, russian] of dictionaryRows as DictionaryRow[]) {
  const hanzi = normalizeHanzi(rawHanzi);
  if (hanzi && !dictionary.has(hanzi)) dictionary.set(hanzi, { hanzi, pinyin, russian });
}

const maximumWordLength = Math.max(...[...dictionary.keys()].map((word) => [...word].length));

function betterMatch(candidate: Match, current: Match | undefined) {
  if (!current) return true;
  if (candidate.matchedCharacters !== current.matchedCharacters) {
    return candidate.matchedCharacters > current.matchedCharacters;
  }
  return candidate.words.length < current.words.length;
}

function segment(run: string) {
  const characters = [...run];
  const matches: Match[] = Array(characters.length + 1);
  matches[characters.length] = { words: [], matchedCharacters: 0 };

  for (let start = characters.length - 1; start >= 0; start--) {
    const skipped = matches[start + 1];
    let best: Match = { words: skipped.words, matchedCharacters: skipped.matchedCharacters };
    for (let length = 1; length <= Math.min(maximumWordLength, characters.length - start); length++) {
      const word = characters.slice(start, start + length).join("");
      const item = dictionary.get(word);
      if (!item) continue;
      const remainder = matches[start + length];
      const candidate = {
        words: [item, ...remainder.words],
        matchedCharacters: length + remainder.matchedCharacters,
      };
      if (betterMatch(candidate, best)) best = candidate;
    }
    matches[start] = best;
  }

  return matches[0];
}

export function parseTextVocabulary(text: string) {
  const runs = text.match(/[\p{Script=Han}]+/gu) ?? [];
  const words = new Map<string, ImportedWord>();
  let hanziCount = 0;
  let matchedCharacters = 0;

  for (const run of runs) {
    hanziCount += [...run].length;
    const match = segment(run);
    matchedCharacters += match.matchedCharacters;
    for (const word of match.words) words.set(word.hanzi, word);
  }

  return {
    words: [...words.values()],
    unmatchedCharacters: hanziCount - matchedCharacters,
  };
}
