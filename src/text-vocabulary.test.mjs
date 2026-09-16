import assert from "node:assert/strict";
import test from "node:test";

import { parseTextVocabulary } from "./text-vocabulary.ts";

const entry = (hanzi) => ({ hanzi, pinyin: `${hanzi}-pinyin`, russian: `${hanzi}-meaning` });
const dictionary = (...words) => new Map(words.map((word) => [word, entry(word)]));

test("imports a standalone character when it exists in the active dictionary", () => {
  const parsed = parseTextVocabulary("湿", dictionary("湿"));

  assert.deepEqual(parsed.words.map((word) => word.hanzi), ["湿"]);
  assert.equal(parsed.unmatchedCharacters, 0);
});

test("prefers a whole dictionary word over its individual characters", () => {
  const parsed = parseTextVocabulary("喜欢", dictionary("喜", "欢", "喜欢"));

  assert.deepEqual(parsed.words.map((word) => word.hanzi), ["喜欢"]);
  assert.equal(parsed.unmatchedCharacters, 0);
});

test("prefers the longest first word when segmentations otherwise tie", () => {
  const parsed = parseTextVocabulary("研究生命", dictionary("研究", "研究生", "生命", "命"));

  assert.deepEqual(parsed.words.map((word) => word.hanzi), ["研究生", "命"]);
  assert.equal(parsed.unmatchedCharacters, 0);
});
