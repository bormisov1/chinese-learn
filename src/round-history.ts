import type { RoundCompletion, StoreData } from "./types";

const DAY_COUNT = 7;

const localDayStart = (value: number) => {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

export function migrateRoundCompletions(
  completions: RoundCompletion[] | undefined,
): RoundCompletion[] {
  return (completions ?? []).filter(
    (item) =>
      Number.isInteger(item?.round) &&
      item.round > 0 &&
      Number.isFinite(item?.completedAt) &&
      item.completedAt > 0,
  );
}

export function recordRoundCompletion(
  data: StoreData,
  round: number,
  completedAt = Date.now(),
): StoreData {
  if (data.roundCompletions.some((item) => item.round === round)) return data;
  return {
    ...data,
    roundCompletions: [...data.roundCompletions, { round, completedAt }],
  };
}

export function roundsByDay(
  completions: RoundCompletion[],
  now = Date.now(),
) {
  const today = localDayStart(now);
  return Array.from({ length: DAY_COUNT }, (_, index) => {
    const day = new Date(today);
    day.setDate(day.getDate() - (DAY_COUNT - 1 - index));
    const start = day.getTime();
    const endDate = new Date(start);
    endDate.setDate(endDate.getDate() + 1);
    const end = endDate.getTime();
    return {
      date: start,
      count: completions.filter(
        (item) => item.completedAt >= start && item.completedAt < end,
      ).length,
      today: index === DAY_COUNT - 1,
    };
  });
}
