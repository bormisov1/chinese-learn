import assert from "node:assert/strict";
import test from "node:test";
import type { Dictionary } from "./dictionary";
import { refreshWords } from "./language";
import type { Word } from "./types";

const word = (values: Partial<Word> = {}): Word => ({
  id: "word-1",
  hanzi: "对不起",
  pinyin: "duì bu qǐ",
  russian: "I'm sorry",
  exampleCount: 0,
  wordShownCount: 0,
  createdAt: 0,
  srsLevel: 0,
  srsCorrect: 0,
  srsIncorrect: 0,
  srsDueAt: 0,
  cardSrsLevel: 0,
  cardSrsCorrect: 0,
  cardSrsIncorrect: 0,
  cardSrsDueAt: 0,
  ...values,
});

test("refresh replaces a stale translation with the canonical dictionary value", () => {
  const dictionary: Dictionary = new Map([
    [
      "对不起",
      { hanzi: "对不起", pinyin: "duìbuqǐ", russian: "извините; простите" },
    ],
  ]);

  const [result] = refreshWords([
    word({ translationByLanguage: { ru: "I'm sorry" } }),
  ], "ru", dictionary);

  assert.equal(result.russian, "извините; простите");
  assert.equal(result.pinyin, "duìbuqǐ");
  assert.equal(result.translationByLanguage?.ru, "извините; простите");
});

test("refresh retains the saved fallback when a word is absent from the dictionary", () => {
  const [result] = refreshWords([
    word({ hanzi: "自定义", russian: "сохранённый перевод" }),
  ], "ru", new Map());

  assert.equal(result.russian, "сохранённый перевод");
  assert.equal(result.translationByLanguage?.ru, "сохранённый перевод");
});

test("refresh repairs a saved English gloss and reading from the new dictionary", () => {
  const dictionary: Dictionary = new Map([
    ["书", { hanzi: "书", pinyin: "shū", russian: "book; letter" }],
  ]);
  const [result] = refreshWords([
    word({ hanzi: "书", pinyin: "Shū", russian: "abbr. for 书经", translationByLanguage: { en: "abbr. for 书经" } }),
  ], "en", dictionary);

  assert.equal(result.pinyin, "shū");
  assert.equal(result.russian, "book; letter");
  assert.equal(result.translationByLanguage?.en, "book; letter");
});
