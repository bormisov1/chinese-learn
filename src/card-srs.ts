import { Word } from "./types";

export const ACTIVE_CARD_LIMIT = 12;
export const CARD_ROUND_SIZE = 6;
export const CARD_GRADUATION_LEVEL = 3;
export const DAY = 86_400_000;

const retentionDays = [1, 3, 7, 14, 30, 60];

export function fillActivePool(words: Word[], at = Date.now()): Word[] {
  const activeCount = words.filter((word) => word.cardActive).length;
  if (activeCount >= ACTIVE_CARD_LIMIT) return words;
  const vacancies = ACTIVE_CARD_LIMIT - activeCount;
  const candidates = words
    .filter((word) => !word.cardActive && word.cardSrsLevel < CARD_GRADUATION_LEVEL)
    .sort(
      (a, b) =>
        Number(Boolean(a.cardIntroducedAt)) - Number(Boolean(b.cardIntroducedAt)) ||
        a.createdAt - b.createdAt,
    )
    .slice(0, vacancies);
  const selected = new Set(candidates.map((word) => word.id));
  return words.map((word, index) =>
    selected.has(word.id)
      ? {
          ...word,
          cardActive: true,
          cardIntroducedAt: word.cardIntroducedAt ?? at + index,
        }
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
        (hadCardActivity && word.cardSrsLevel < CARD_GRADUATION_LEVEL),
      cardLastStudiedRound: word.cardLastStudiedRound,
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
