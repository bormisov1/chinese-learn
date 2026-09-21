import OpenCC from "opencc-js/t2cn";
import type { Dictionary } from "./dictionary";
import type { ImportedWord } from "./ocr";

type Match = { words: ImportedWord[]; matchedCharacters: number; wordLengths: number[] };
const toSimplifiedChinese = OpenCC.Converter({ from: "tw", to: "cn" });

function betterMatch(candidate: Match, current: Match | undefined) {
  if (!current) return true;
  if (candidate.matchedCharacters !== current.matchedCharacters) {
    return candidate.matchedCharacters > current.matchedCharacters;
  }
  if (candidate.words.length !== current.words.length) {
    return candidate.words.length < current.words.length;
  }

  // Prefer several substantial words over one long word plus short fragments.
  for (let index = 0; index < candidate.wordLengths.length; index++) {
    if (candidate.wordLengths[index] !== current.wordLengths[index]) {
      return candidate.wordLengths[index] > current.wordLengths[index];
    }
  }
  return false;
}

function segment(run: string, dictionary: Dictionary, maximumWordLength: number) {
  const characters = [...run];
  const matches: Match[] = Array(characters.length + 1);
  matches[characters.length] = { words: [], matchedCharacters: 0, wordLengths: [] };

  for (let start = characters.length - 1; start >= 0; start--) {
    const skipped = matches[start + 1];
    let best: Match = {
      words: skipped.words,
      matchedCharacters: skipped.matchedCharacters,
      wordLengths: skipped.wordLengths,
    };
    for (let length = 1; length <= Math.min(maximumWordLength, characters.length - start); length++) {
      const word = characters.slice(start, start + length).join("");
      const item = dictionary.get(word);
      if (!item) continue;
      const remainder = matches[start + length];
      const wordLengths = [...remainder.wordLengths];
      const insertionIndex = wordLengths.findIndex((value) => value >= length);
      wordLengths.splice(insertionIndex < 0 ? wordLengths.length : insertionIndex, 0, length);
      const candidate = {
        words: [item, ...remainder.words],
        matchedCharacters: length + remainder.matchedCharacters,
        wordLengths,
      };
      if (betterMatch(candidate, best)) best = candidate;
    }
    matches[start] = best;
  }

  return matches[0];
}

export function parseTextVocabulary(text: string, dictionary: Dictionary | null) {
  if (!dictionary) return { words: [], unmatchedCharacters: 0 };
  const normalizedText = toSimplifiedChinese(text);
  const runs = normalizedText.match(/[\p{Script=Han}]+/gu) ?? [];
  const maximumWordLength = Math.max(1, ...[...dictionary.keys()].map((word) => [...word].length));
  const words = new Map<string, ImportedWord>();
  let hanziCount = 0;
  let matchedCharacters = 0;

  for (const run of runs) {
    hanziCount += [...run].length;
    const match = segment(run, dictionary, maximumWordLength);
    matchedCharacters += match.matchedCharacters;
    for (const word of match.words) words.set(word.hanzi, word);
  }

  return {
    words: [...words.values()],
    unmatchedCharacters: hanziCount - matchedCharacters,
  };
}
