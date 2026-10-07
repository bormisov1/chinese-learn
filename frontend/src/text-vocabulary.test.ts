import assert from "node:assert/strict";
import test from "node:test";
import { parseTextVocabulary } from "./text-vocabulary";

const entry = (hanzi: string) => ({
  hanzi,
  pinyin: `${hanzi}-pinyin`,
  russian: `${hanzi}-meaning`,
});
const dictionary = (...words: string[]) =>
  new Map(words.map((word) => [word, entry(word)]));

test("normalizes Traditional Chinese before segmentation", () => {
  const parsed = parseTextVocabulary(
    "這世界看來很快樂 始終笑著沉默",
    dictionary("这", "世界", "看来", "很", "快乐", "始终", "笑着", "沉默"),
  );

  assert.deepEqual(
    parsed.words.map((word) => word.hanzi),
    ["这", "世界", "看来", "很", "快乐", "始终", "笑着", "沉默"],
  );
  assert.equal(parsed.unmatchedCharacters, 0);
});

test("prefers a whole dictionary word over individual characters", () => {
  const parsed = parseTextVocabulary("喜欢", dictionary("喜", "欢", "喜欢"));

  assert.deepEqual(parsed.words.map((word) => word.hanzi), ["喜欢"]);
  assert.equal(parsed.unmatchedCharacters, 0);
});

test("prefers several longer words over a short word and long remainder", () => {
  const parsed = parseTextVocabulary(
    "甲乙丙丁",
    dictionary("甲", "甲乙", "乙丙丁", "丙丁"),
  );

  assert.deepEqual(parsed.words.map((word) => word.hanzi), ["甲乙", "丙丁"]);
  assert.equal(parsed.unmatchedCharacters, 0);
});

test("does not sacrifice balanced words for the longest first word", () => {
  const parsed = parseTextVocabulary(
    "研究生命",
    dictionary("研究", "研究生", "生命", "命"),
  );

  assert.deepEqual(parsed.words.map((word) => word.hanzi), ["研究", "生命"]);
  assert.equal(parsed.unmatchedCharacters, 0);
});

test("parses text with a dictionary larger than JavaScript argument limits", () => {
  const largeDictionary = dictionary("喜欢");
  for (let index = 0; index < 130_000; index++) {
    const word = `词${index}`;
    largeDictionary.set(word, entry(word));
  }

  const parsed = parseTextVocabulary("喜欢", largeDictionary);
  assert.deepEqual(parsed.words.map((word) => word.hanzi), ["喜欢"]);
  assert.equal(parsed.unmatchedCharacters, 0);
});
