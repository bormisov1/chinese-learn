import { Word } from "./types";

export const ACTIVE_CARD_LIMIT = 12;
export const CARD_ROUND_SIZE = 6;
export const CARD_GRADUATION_LEVEL = 3;
export const DAY = 86_400_000;

const retentionDays = [1, 3, 7, 14, 30, 60];

const attempts = (word: Word) => word.cardSrsCorrect + word.cardSrsIncorrect;

const inferredRound = (words: Word[]) =>
  Math.max(0, ...words.map((word) => word.cardLastStudiedRound ?? 0));

const roundsWaiting = (word: Word, round: number) =>
  Math.max(0, round - (word.cardLastStudiedRound ?? 0));

export function cardLearningNeed(word: Word, round: number): number {
  const total = attempts(word);
  const failureRate = (word.cardSrsIncorrect + 1) / (total + 2);
  const novelty = 1 / Math.sqrt(total + 1);
  const waiting = Math.min(1, roundsWaiting(word, round) / 10);
  return 0.55 * failureRate + 0.3 * novelty + 0.15 * waiting;
}

const learningNeedComparator = (round: number) => (a: Word, b: Word) =>
  cardLearningNeed(b, round) - cardLearningNeed(a, round) ||
  a.createdAt - b.createdAt ||
  a.id.localeCompare(b.id);

const queueComparator = (round: number) => (a: Word, b: Word) =>
  Number(Boolean(b.cardRelearning)) - Number(Boolean(a.cardRelearning)) ||
  Number(Boolean(b.cardIntroducedAt)) - Number(Boolean(a.cardIntroducedAt)) ||
  learningNeedComparator(round)(a, b);

/** Words waiting to enter the active pool, ordered by learning need. */
export function getActivePoolQueue(
  words: Word[],
  round = inferredRound(words),
): Word[] {
  return words
    .filter(
      (word) =>
        !word.cardActive && word.cardSrsLevel < CARD_GRADUATION_LEVEL,
    )
    .sort(queueComparator(round));
}

export function fillActivePool(
  words: Word[],
  at = Date.now(),
  round = inferredRound(words),
): Word[] {
  const active = words.filter(
    (word) => word.cardActive && word.cardSrsLevel < CARD_GRADUATION_LEVEL,
  );
  const selected = new Set(
    active.slice(0, ACTIVE_CARD_LIMIT).map((word) => word.id),
  );
  const openSlots = ACTIVE_CARD_LIMIT - selected.size;
  const waiting = words.filter(
    (word) => !selected.has(word.id) && word.cardSrsLevel < CARD_GRADUATION_LEVEL,
  );

  if (openSlots > 0)
    waiting.sort(queueComparator(round)).slice(0, openSlots)
      .forEach((word) => selected.add(word.id));

  return words.map((word, index) =>
    selected.has(word.id)
      ? {
          ...word,
          cardActive: true,
          ...(word.cardRelearning ? { cardRelearning: false } : {}),
          cardIntroducedAt: word.cardIntroducedAt ?? at + index,
        }
      : word.cardActive
        ? { ...word, cardActive: false }
        : word,
  );
}

export function migrateCardPool(
  words: Word[],
  round = inferredRound(words),
): Word[] {
  let migrated = words.map((word) => {
    const hadCardActivity =
      word.cardSrsLevel > 0 || word.cardSrsCorrect > 0 || word.cardSrsIncorrect > 0;
    return {
      ...word,
      cardIntroducedAt:
        word.cardIntroducedAt ?? (hadCardActivity ? word.createdAt : undefined),
      cardActive:
        word.cardActive ??
        false,
      cardRelearning: Boolean(word.cardRelearning) && !word.cardActive &&
        word.cardSrsLevel < CARD_GRADUATION_LEVEL,
      cardLastStudiedRound: word.cardLastStudiedRound,
      cardLastIncorrectAt:
        word.cardLastIncorrectAt ??
        (word.cardSrsIncorrect > 0 && word.cardSrsLevel === 0
          ? word.cardIntroducedAt ?? word.createdAt
          : undefined),
      cardLapses: word.cardLapses ?? word.cardSrsIncorrect,
    };
  });
  const active = migrated
    .filter((word) => word.cardActive)
    .sort(
      (a, b) =>
        (a.cardIntroducedAt ?? a.createdAt) -
        (b.cardIntroducedAt ?? b.createdAt),
    );
  if (active.length > ACTIVE_CARD_LIMIT) {
    const keep = new Set(active.slice(0, ACTIVE_CARD_LIMIT).map((word) => word.id));
    migrated = migrated.map((word) =>
      word.cardActive && !keep.has(word.id) ? { ...word, cardActive: false } : word,
    );
  }
  return fillActivePool(migrated, Date.now(), round);
}

export function selectRound(words: Word[], round: number, now = Date.now()) {
  const relearning = words
    .filter((word) =>
      word.cardRelearning && !word.cardActive &&
      (word.cardLastStudiedRound === undefined ||
        round - word.cardLastStudiedRound >= 2))
    .sort((a, b) =>
      (a.cardLastStudiedRound ?? -1) - (b.cardLastStudiedRound ?? -1));
  const dueReviews = words
    .filter(
      (word) =>
        !word.cardActive &&
        word.cardSrsLevel >= CARD_GRADUATION_LEVEL &&
        word.cardSrsDueAt <= now,
    )
    .sort((a, b) => a.cardSrsDueAt - b.cardSrsDueAt);
  const active = words
    .filter(
      (word) =>
        word.cardActive &&
        (word.cardLastStudiedRound === undefined ||
          round - word.cardLastStudiedRound >= 2),
    )
    .sort(
      (a, b) =>
        (a.cardLastStudiedRound ?? -1) - (b.cardLastStudiedRound ?? -1) ||
        a.cardSrsLevel - b.cardSrsLevel ||
        (a.cardIntroducedAt ?? a.createdAt) - (b.cardIntroducedAt ?? b.createdAt),
    );
  const activeTotal = words.filter((word) => word.cardActive).length;
  const size = Math.min(
    CARD_ROUND_SIZE,
    Math.max(1, Math.ceil(activeTotal / 2), Math.min(dueReviews.length, CARD_ROUND_SIZE)),
  );
  // Keep active learners present even when many retention reviews are due.
  const reviews = [...relearning, ...dueReviews];
  const reviewSlots = active.length ? Math.max(2, size - active.length) : size;
  const selected = [...reviews.slice(0, reviewSlots), ...active].slice(0, size);
  if (selected.length) return selected;
  // With a one-word deck a full skipped round is impossible.
  return words.filter((word) => word.cardActive).slice(0, 1);
}

export function gradeCard(
  words: Word[],
  wordId: string,
  correct: boolean,
  round: number,
  reviewedAt = Date.now(),
) {
  const updated = words.map((word) => {
    if (word.id !== wordId) return word;
    if (!correct) {
      const relearning = !word.cardActive &&
        (word.cardRelearning || word.cardSrsLevel >= CARD_GRADUATION_LEVEL);
      return {
        ...word,
        cardActive: Boolean(word.cardActive),
        cardRelearning: relearning,
        cardIntroducedAt: word.cardIntroducedAt ?? reviewedAt,
        cardLastStudiedRound: round - 1,
        cardSrsLevel: 0,
        cardSrsCorrect: word.cardSrsCorrect,
        cardSrsIncorrect: word.cardSrsIncorrect + 1,
        cardLastIncorrectAt: reviewedAt,
        cardLapses: (word.cardLapses ?? 0) + 1,
        cardSrsDueAt: 0,
      };
    }

    const nextLevel = Math.min(8, word.cardSrsLevel + 1);
    const graduated = nextLevel >= CARD_GRADUATION_LEVEL;
    const dueAt = graduated
      ? reviewedAt + retentionDays[nextLevel - CARD_GRADUATION_LEVEL] * DAY
      : 0;
    return {
      ...word,
      cardActive: Boolean(word.cardActive) && !graduated,
      cardRelearning: Boolean(word.cardRelearning) && !graduated,
      cardIntroducedAt: word.cardIntroducedAt ?? reviewedAt,
      cardLastStudiedRound: round,
      cardSrsLevel: nextLevel,
      cardSrsCorrect: word.cardSrsCorrect + 1,
      cardSrsIncorrect: word.cardSrsIncorrect,
      cardSrsDueAt: dueAt,
    };
  });

  return fillActivePool(updated, reviewedAt, round);
}
