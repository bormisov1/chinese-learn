import { Word } from "./types";

export const ACTIVE_CARD_LIMIT = 12;
export const CARD_ROUND_SIZE = 6;
export const CARD_GRADUATION_LEVEL = 3;
export const DAY = 86_400_000;

const retentionDays = [1, 3, 7, 14, 30, 60];

function activePriority(a: Word, b: Word) {
  const aAttempts = a.cardSrsCorrect + a.cardSrsIncorrect;
  const bAttempts = b.cardSrsCorrect + b.cardSrsIncorrect;
  const aDifficulty = (a.cardSrsCorrect + 1) / (aAttempts + 2);
  const bDifficulty = (b.cardSrsCorrect + 1) / (bAttempts + 2);
  return (
    Number(Boolean(b.cardActive)) - Number(Boolean(a.cardActive)) ||
    aDifficulty - bDifficulty ||
    bAttempts - aAttempts ||
    a.cardSrsLevel - b.cardSrsLevel ||
    (b.cardLastIncorrectAt ?? 0) - (a.cardLastIncorrectAt ?? 0) ||
    (b.cardLapses ?? 0) - (a.cardLapses ?? 0) ||
    (a.cardIntroducedAt ?? a.createdAt) -
      (b.cardIntroducedAt ?? b.createdAt) ||
    a.createdAt - b.createdAt
  );
}

/** Words waiting to enter the active pool, in the exact order fillActivePool uses. */
export function getActivePoolQueue(words: Word[]): Word[] {
  return words
    .filter(
      (word) =>
        !word.cardActive && word.cardSrsLevel < CARD_GRADUATION_LEVEL,
    )
    .sort(activePriority);
}

export function fillActivePool(words: Word[], at = Date.now()): Word[] {
  const selected = new Set(
    words
      .filter((word) => word.cardSrsLevel < CARD_GRADUATION_LEVEL)
      .sort(activePriority)
      .slice(0, ACTIVE_CARD_LIMIT)
      .map((word) => word.id),
  );
  return words.map((word, index) =>
    selected.has(word.id)
      ? {
          ...word,
          cardActive: true,
          cardIntroducedAt: word.cardIntroducedAt ?? at + index,
        }
      : word.cardActive
        ? { ...word, cardActive: false }
        : word,
  );
}

export function migrateCardPool(words: Word[]): Word[] {
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
  return fillActivePool(migrated);
}

export function selectRound(words: Word[], round: number, now = Date.now()) {
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
  const selected = [...dueReviews, ...active].slice(0, size);
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
  let updated = words.map((word) => {
    if (word.id !== wordId) return word;
    if (!correct)
      return {
        ...word,
        cardActive: true,
        cardIntroducedAt: word.cardIntroducedAt ?? reviewedAt,
        cardLastStudiedRound: round - 1,
        cardSrsLevel: 0,
        cardSrsCorrect: word.cardSrsCorrect,
        cardSrsIncorrect: word.cardSrsIncorrect + 1,
        cardLastIncorrectAt: reviewedAt,
        cardLapses: (word.cardLapses ?? 0) + 1,
        cardSrsDueAt: 0,
      };

    const nextLevel = Math.min(8, word.cardSrsLevel + 1);
    const graduated = nextLevel >= CARD_GRADUATION_LEVEL;
    const dueAt = graduated
      ? reviewedAt + retentionDays[nextLevel - CARD_GRADUATION_LEVEL] * DAY
      : 0;
    return {
      ...word,
      cardActive: !graduated,
      cardIntroducedAt: word.cardIntroducedAt ?? reviewedAt,
      cardLastStudiedRound: round,
      cardSrsLevel: nextLevel,
      cardSrsCorrect: word.cardSrsCorrect + 1,
      cardSrsIncorrect: word.cardSrsIncorrect,
      cardSrsDueAt: dueAt,
    };
  });

  // A failed retention review must return to the bounded pool. Pause the
  // newest other learner if all twelve slots were already occupied.
  const active = updated.filter((word) => word.cardActive);
  if (active.length > ACTIVE_CARD_LIMIT) {
    const toPause = active
      .filter((word) => word.id !== wordId)
      .sort(
        (a, b) =>
          (b.cardIntroducedAt ?? b.createdAt) -
          (a.cardIntroducedAt ?? a.createdAt),
      )[0];
    if (toPause)
      updated = updated.map((word) =>
        word.id === toPause.id ? { ...word, cardActive: false } : word,
      );
  }
  return fillActivePool(updated, reviewedAt);
}
