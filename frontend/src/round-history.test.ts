import assert from "node:assert/strict";
import test from "node:test";
import { migrateRoundCompletions, recordRoundCompletion, roundsByDay, undoRoundCompletion } from "./round-history";
import type { StoreData } from "./types";

const localTime = (day: number, hour = 12) =>
  new Date(2026, 8, day, hour).getTime();

test("roundsByDay returns seven local calendar days", () => {
  const result = roundsByDay(
    [
      { round: 1, completedAt: localTime(14) },
      { round: 2, completedAt: localTime(19) },
      { round: 3, completedAt: localTime(19, 22) },
      { round: 4, completedAt: localTime(20) },
    ],
    localTime(20),
  );

  assert.equal(result.length, 7);
  assert.deepEqual(result.map((item) => item.count), [1, 0, 0, 0, 0, 2, 1]);
  assert.equal(result.at(-1)?.today, true);
});

test("legacy stores start dated history without fabricated activity", () => {
  assert.deepEqual(migrateRoundCompletions(undefined), []);
});

test("existing completion history is retained", () => {
  const existing = [{ round: 2, completedAt: localTime(18) }];
  assert.deepEqual(migrateRoundCompletions(existing), existing);
});

test("undoing the final card removes only its recorded round completion", () => {
  const previous = { round: 1, completedAt: localTime(19) };
  const completedAt = localTime(20);
  const completed = recordRoundCompletion({ roundCompletions: [previous] } as StoreData, 2, completedAt);
  assert.deepEqual(completed.roundCompletions, [previous, { round: 2, completedAt }]);

  const undone = undoRoundCompletion(completed.roundCompletions, 2, completedAt);
  assert.deepEqual(undone, [previous]);
  assert.equal(roundsByDay(undone, completedAt).at(-1)?.count, 0);
  assert.deepEqual(undoRoundCompletion(completed.roundCompletions, 2, completedAt + 1), completed.roundCompletions);
});
