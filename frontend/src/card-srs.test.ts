import assert from "node:assert/strict";
import test from "node:test";
import { fillActivePool, getActivePoolQueue, gradeCard, selectRound } from "./card-srs";
import type { Word } from "./types";

const word = (id: string, overrides: Partial<Word> = {}): Word => ({
  id, hanzi: id, pinyin: id, russian: id,
  exampleCount: 0, wordShownCount: 0, createdAt: 1,
  srsLevel: 0, srsCorrect: 0, srsIncorrect: 0, srsDueAt: 0,
  cardSrsLevel: 0, cardSrsCorrect: 0, cardSrsIncorrect: 0,
  cardSrsDueAt: 0, ...overrides,
});

test("failed retention review keeps twelve learners active and gets reviewed outside the pool", () => {
  const active = Array.from({ length: 12 }, (_, index) => word(`active-${index}`, {
    cardActive: true, cardIntroducedAt: index + 1,
    cardSrsIncorrect: index === 0 ? 5 : 0,
  }));
  const retained = word("retained", {
    cardSrsLevel: 3, cardSrsCorrect: 3, cardSrsDueAt: 10,
  });
  const after = gradeCard([...active, retained], "retained", false, 4, 100);
  assert.deepEqual(after.slice(0, 12), active);
  assert.equal(after[12].cardActive, false);
  assert.equal(after[12].cardRelearning, true);
  assert.equal(after[12].cardSrsLevel, 0);
  assert.ok(selectRound(after, 5, 100).some((item) => item.id === "retained"));
});

test("graduation admits a failed retention word before a new word", () => {
  const active = Array.from({ length: 12 }, (_, index) => word(`active-${index}`, {
    cardActive: true, cardIntroducedAt: index + 1,
    ...(index === 0 ? { cardSrsLevel: 2, cardSrsCorrect: 2 } : {}),
  }));
  const waiting = word("retained", { cardRelearning: true, cardSrsIncorrect: 1,
    cardIntroducedAt: 1 });
  const fresh = word("fresh", { createdAt: 2 });
  const after = gradeCard([...active, waiting, fresh], "active-0", true, 5, 100);
  assert.equal(after[0].cardActive, false);
  assert.equal(after[12].cardActive, true);
  assert.equal(after[12].cardRelearning, false);
  assert.equal(after[13].cardActive, undefined);
});

test("existing paused learners enter before unseen words, even with one slot", () => {
  const active = Array.from({ length: 11 }, (_, index) => word(`active-${index}`, {
    cardActive: true, cardIntroducedAt: index + 1,
  }));
  const paused = word("paused", { cardActive: false,
    cardIntroducedAt: 2, cardSrsIncorrect: 5 });
  const fresh = word("fresh", { createdAt: 3 });
  assert.equal(getActivePoolQueue([...active, paused, fresh])[0].id, "paused");
  const filled = fillActivePool([...active, paused, fresh], 100, 5);
  assert.equal(filled[11].cardActive, true);
  assert.equal(filled[12].cardActive, undefined);
});

test("relearning continues in rounds without blocking active cards", () => {
  const active = Array.from({ length: 12 }, (_, index) => word(`active-${index}`, {
    cardActive: true, cardIntroducedAt: index + 1,
  }));
  const relearning = Array.from({ length: 4 }, (_, index) => word(`relearn-${index}`, {
    cardRelearning: true, cardSrsIncorrect: 1,
    cardLastStudiedRound: 1,
  }));
  const round = selectRound([...active, ...relearning], 5, 100);
  assert.equal(round.length, 6);
  assert.equal(round.filter((item) => item.cardActive).length, 4);
  assert.equal(round.filter((item) => item.cardRelearning).length, 2);
  let progressed = gradeCard([...active, relearning[0]], "relearn-0", true, 5, 100);
  assert.equal(progressed.at(-1)?.cardSrsLevel, 1);
  assert.equal(progressed.at(-1)?.cardActive, false);
  assert.equal(progressed.at(-1)?.cardRelearning, true);
  progressed = gradeCard(progressed, "relearn-0", true, 7, 200);
  progressed = gradeCard(progressed, "relearn-0", true, 9, 300);
  assert.equal(progressed.at(-1)?.cardSrsLevel, 3);
  assert.equal(progressed.at(-1)?.cardRelearning, false);
  assert.equal(progressed.at(-1)?.cardActive, false);
  assert.ok((progressed.at(-1)?.cardSrsDueAt ?? 0) > 300);
});

test("a small active pool still gets a card alongside relearning reviews", () => {
  const active = word("active", { cardActive: true });
  const reviews = Array.from({ length: 3 }, (_, index) => word(`review-${index}`, {
    cardRelearning: true, cardSrsIncorrect: 1,
  }));
  const round = selectRound([active, ...reviews], 5, 100);
  assert.equal(round.length, 4);
  assert.ok(round.some((item) => item.id === "active"));
});
