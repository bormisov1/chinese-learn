export const FREE_HANDWRITING_OPENS = 10;

export const handwritingOpenCount = (value: number | undefined) =>
  Math.max(0, Math.floor(Number.isFinite(value) ? value! : 0));

export const remainingHandwritingOpens = (value: number | undefined) =>
  Math.max(0, FREE_HANDWRITING_OPENS - handwritingOpenCount(value));

export const hasPremiumFeatureAccess = (
  value: number | undefined,
  subscribed: boolean,
) => subscribed || remainingHandwritingOpens(value) > 0;

export const recordFreeHandwritingOpen = (value: number | undefined) =>
  Math.min(FREE_HANDWRITING_OPENS, handwritingOpenCount(value) + 1);
