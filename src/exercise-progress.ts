import { gradeCard } from "./card-srs";
import { StoreData } from "./types";

const DAY = 86_400_000;
const intervals = [1, 3, 7, 14, 30];

export type ExerciseCompletion =
  | { kind: "sentence"; sentenceId: string; correct: boolean }
  | { kind: "word"; wordId: string }
  | { kind: "card"; wordId: string; correct: boolean; round: number };

/** Apply the progress earned when an exercise is left, regardless of its screen. */
export function finishExercise(
  data: StoreData,
  completion: ExerciseCompletion,
  reviewedAt = Date.now(),
): StoreData {
  if (completion.kind === "card") {
    return {
      ...data,
      words: gradeCard(
        data.words,
        completion.wordId,
        completion.correct,
        completion.round,
        reviewedAt,
      ),
    };
  }

  if (completion.kind === "word") {
    return {
      ...data,
      words: data.words.map((word) =>
        word.id === completion.wordId
          ? { ...word, wordShownCount: word.wordShownCount + 1 }
          : word,
      ),
    };
  }

  const sentence = data.sentences.find(
    (item) => item.id === completion.sentenceId,
  );
  if (!sentence) return data;

  return {
    ...data,
    sentences: data.sentences.map((item) =>
      item.id === sentence.id
        ? {
            ...item,
            sentenceShownCount: item.sentenceShownCount + 1,
            lastShownAt: reviewedAt,
          }
        : item,
    ),
    words: data.words.map((word) => {
      if (!sentence.wordIds.includes(word.id)) return word;
      const nextLevel = completion.correct
        ? Math.min(intervals.length, word.srsLevel + 1)
        : 0;
      return {
        ...word,
        wordShownCount: word.wordShownCount + 1,
        srsLevel: nextLevel,
        srsCorrect: word.srsCorrect + (completion.correct ? 1 : 0),
        srsIncorrect: word.srsIncorrect + (completion.correct ? 0 : 1),
        srsDueAt: completion.correct
          ? reviewedAt + intervals[nextLevel - 1] * DAY
          : reviewedAt,
      };
    }),
  };
}
