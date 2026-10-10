import type { Word } from "./types";

type CardProgress = Pick<Word,
  | "cardSrsLevel"
  | "cardSrsCorrect"
  | "cardSrsIncorrect"
  | "cardSrsDueAt"
  | "cardIntroducedAt"
  | "cardActive"
  | "cardRelearning"
  | "cardLastStudiedRound"
  | "cardLastIncorrectAt"
  | "cardLapses"
>;

export type CardReviewUndo = Record<string, CardProgress>;

const progress = (word: Word): CardProgress => ({
  cardSrsLevel: word.cardSrsLevel,
  cardSrsCorrect: word.cardSrsCorrect,
  cardSrsIncorrect: word.cardSrsIncorrect,
  cardSrsDueAt: word.cardSrsDueAt,
  cardIntroducedAt: word.cardIntroducedAt,
  cardActive: word.cardActive,
  cardRelearning: word.cardRelearning,
  cardLastStudiedRound: word.cardLastStudiedRound,
  cardLastIncorrectAt: word.cardLastIncorrectAt,
  cardLapses: word.cardLapses,
});

/** Save only words whose card progress changed, including pool replacements. */
export function captureCardReviewUndo(before: Word[], after: Word[]): CardReviewUndo {
  const afterById = new Map(after.map((word) => [word.id, word]));
  const undo: CardReviewUndo = {};
  for (const word of before) {
    const updated = afterById.get(word.id);
    if (!updated) continue;
    const previous = progress(word);
    const next = progress(updated);
    if (Object.keys(previous).some((key) =>
      previous[key as keyof CardProgress] !== next[key as keyof CardProgress]
    )) undo[word.id] = previous;
  }
  return undo;
}

/** Keep unrelated word changes made while the learner was studying. */
export function restoreCardReview(words: Word[], undo: CardReviewUndo): Word[] {
  return words.map((word) => undo[word.id]
    ? { ...word, ...undo[word.id] }
    : word);
}
