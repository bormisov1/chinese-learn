import assert from "node:assert/strict";
import test from "node:test";
import {
  FREE_HANDWRITING_OPENS,
  hasPremiumFeatureAccess,
  recordFreeHandwritingOpen,
  remainingHandwritingOpens,
} from "./premium-access";

test("ten handwriting openings are free and the eleventh requires premium", () => {
  let count = 0;
  for (let opening = 1; opening <= FREE_HANDWRITING_OPENS; opening += 1) {
    assert.equal(hasPremiumFeatureAccess(count, false), true);
    count = recordFreeHandwritingOpen(count);
  }
  assert.equal(count, 10);
  assert.equal(remainingHandwritingOpens(count), 0);
  assert.equal(hasPremiumFeatureAccess(count, false), false);
  assert.equal(recordFreeHandwritingOpen(count), 10);
});

test("subscription bypasses the exhausted trial", () => {
  assert.equal(hasPremiumFeatureAccess(10, true), true);
});

test("invalid stored counts are normalized", () => {
  assert.equal(remainingHandwritingOpens(undefined), 10);
  assert.equal(remainingHandwritingOpens(-4), 10);
  assert.equal(remainingHandwritingOpens(20), 0);
});
