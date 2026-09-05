import { fillActivePool, CARD_GRADUATION_LEVEL } from "./card-srs";
import hskLevels from "./data/hsk-levels.json";
import dictionaryRows from "./data/hsk-russian.json";
import { Word } from "./types";

export const AUTOMATIC_WORD_TARGET = 20;

const dictionary = new Map(
  (dictionaryRows as [string, string, string][]).map(([hanzi, pinyin, russian]) => [
    hanzi,
    { hanzi, pinyin, russian },
  ]),
);

const cumulative = hskLevels as Record<string, string[]>;
const orderedHskWords = [1, 2, 3, 4, 5, 6].flatMap((level) => {
  const previous = new Set(level > 1 ? cumulative[String(level - 1)] : []);
  return (cumulative[String(level)] ?? []).filter(
    (hanzi) => !previous.has(hanzi) && dictionary.has(hanzi),
  );
});

const wordId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Keep twenty not-yet-graduated words available, following HSK order. */
export function replenishAutomaticWords(words: Word[], at = Date.now()): Word[] {
  const learningCount = words.filter(
    (word) => word.cardSrsLevel < CARD_GRADUATION_LEVEL,
  ).length;
  const needed = Math.max(0, AUTOMATIC_WORD_TARGET - learningCount);
  if (!needed) return words;

  const existing = new Set(words.map((word) => word.hanzi));
  const additions = orderedHskWords
    .filter((hanzi) => !existing.has(hanzi))
    .slice(0, needed)
    .map((hanzi, index): Word => ({
      ...dictionary.get(hanzi)!,
      id: wordId(),
      exampleCount: 0,
      wordShownCount: 0,
      createdAt: at + index,
      srsLevel: 0,
      srsCorrect: 0,
      srsIncorrect: 0,
      srsDueAt: 0,
      cardSrsLevel: 0,
      cardSrsCorrect: 0,
      cardSrsIncorrect: 0,
      cardSrsDueAt: 0,
      cardLapses: 0,
    }));
  return additions.length ? fillActivePool([...words, ...additions], at) : words;
}
