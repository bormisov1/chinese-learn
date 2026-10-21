import assert from "node:assert/strict";
import test from "node:test";
import { LexicalDictionary } from "./dictionary-index";
import { lexicalKey, normalizePinyin } from "./lexical";

test("lexical keys normalize boundaries but preserve tones and readings", () => {
  assert.equal(normalizePinyin("  NU: ' ER  "), "nü'er");
  assert.equal(lexicalKey(" 还 ", "HÁI"), lexicalKey("还", "hái"));
  assert.notEqual(lexicalKey("还", "hái"), lexicalKey("还", "huán"));
});

test("indexed dictionary retains readings and never silently chooses ambiguous Hanzi", () => {
  const dictionary = new LexicalDictionary([
    { hanzi: "还", pinyin: "hái", russian: "still" },
    { hanzi: "还", pinyin: "huán", russian: "return" },
    { hanzi: "等", pinyin: "děng", russian: "wait" },
    { hanzi: "等", pinyin: "děng", russian: "and so on" },
  ]);
  assert.equal(dictionary.readings("还").length, 2);
  assert.equal(dictionary.get("还"), undefined);
  assert.equal(dictionary.getExact("还", "HUÁN")?.russian, "return");
  assert.equal(dictionary.readings("等").length, 1);
  assert.equal(dictionary.get("等")?.russian, "wait; and so on");
});
