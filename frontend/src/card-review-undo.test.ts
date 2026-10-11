import assert from "node:assert/strict";
import test from "node:test";
import { gradeCard } from "./card-srs";
import { captureCardReviewUndo, restoreCardReview } from "./card-review-undo";
import type { Word } from "./types";

const word = (id: string, overrides: Partial<Word> = {}): Word => ({
  id,
  hanzi: id,
  pinyin: id,
  russian: id,
  exampleCount: 0,
  wordShownCount: 0,
  createdAt: 1,
  srsLevel: 0,
  srsCorrect: 0,
  srsIncorrect: 0,
  srsDueAt: 0,
  cardSrsLevel: 0,
  cardSrsCorrect: 0,
  cardSrsIncorrect: 0,
  cardSrsDueAt: 0,
  cardActive: true,
  cardIntroducedAt: 1,
  ...overrides,
});

test("undoing a graduation restores the studied card and its replacement", () => {
  const before = [
    word("graduating", { cardSrsLevel: 2, cardSrsCorrect: 2 }),
    ...Array.from({ length: 11 }, (_, index) => word(`active-${index}`)),
    word("replacement", { cardActive: false }),
  ];
  const after = gradeCard(before, "graduating", true, 4, 1000);
  assert.equal(after.find((item) => item.id === "graduating")?.cardActive, false);
  assert.equal(after.find((item) => item.id === "replacement")?.cardActive, true);

  const undo = captureCardReviewUndo(before, after);
  assert.deepEqual(Object.keys(undo).sort(), ["graduating", "replacement"]);
  const withNewExample = after.map((item) => item.id === "graduating"
    ? { ...item, exampleCount: 3 }
    : item);
  const restored = restoreCardReview(withNewExample, undo);
  assert.deepEqual(restored.map((item) => item.cardActive), before.map((item) => item.cardActive));
  assert.equal(restored[0].cardSrsLevel, 2);
  assert.equal(restored[0].cardSrsCorrect, 2);
  assert.equal(restored[0].cardSrsDueAt, 0);
  assert.equal(restored[0].exampleCount, 3);
});

test("undoing a failed retention review restores the separate relearning state", () => {
  const before = [
    ...Array.from({ length: 12 }, (_, index) => word(`active-${index}`)),
    word("retention", {
      cardActive: false,
      cardSrsLevel: 3,
      cardSrsCorrect: 3,
      cardSrsDueAt: 500,
    }),
  ];
  const after = gradeCard(before, "retention", false, 4, 1000);
  assert.equal(after.find((item) => item.id === "retention")?.cardSrsIncorrect, 1);
  assert.equal(after.find((item) => item.id === "retention")?.cardRelearning, true);
  assert.equal(after.find((item) => item.id === "retention")?.cardActive, false);
  assert.equal(after.filter((item) => item.cardActive).length, 12);
  assert.deepEqual(after.slice(0, 12), before.slice(0, 12));

  const restored = restoreCardReview(after, captureCardReviewUndo(before, after));
  assert.deepEqual(JSON.parse(JSON.stringify(restored)), before);
  const regraded = gradeCard(restored, "retention", true, 4, 2000);
  const reviewed = regraded.find((item) => item.id === "retention")!;
  assert.equal(reviewed.cardSrsCorrect, 4);
  assert.equal(reviewed.cardSrsIncorrect, 0);
  assert.equal(reviewed.cardLapses ?? 0, 0);
});
