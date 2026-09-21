import assert from "node:assert/strict";
import test from "node:test";
import { resolvePronunciation, resolveWordPronunciation } from "./pronunciation";
import { clearTtsInputCache, prepareTtsInput, ttsInputCacheSize } from "./tts-input";

const cases = [
  ["他认真地学习", "tā rèn zhēn dì xué xí", "tā rèn zhēn de xué xí"],
  ["这个地方", "zhè ge dì fāng", "zhè ge dì fāng"],
  ["这片土地", "zhè piàn tǔ dì", "zhè piàn tǔ dì"],
  ["我的书", "wǒ dí shū", "wǒ de shū"],
  ["他的确来过", "tā de què lái guò", "tā dí què lái guò"],
  ["跑得很快", "pǎo dé hěn kuài", "pǎo de hěn kuài"],
  ["得到帮助", "de dào bāng zhù", "dé dào bāng zhù"],
  ["我得走了", "wǒ dé zǒu le", "wǒ děi zǒu le"],
] as const;

for (const [hanzi, supplied, displayed] of cases) {
  test(`${hanzi}: resolves displayed pinyin and speaks the complete Hanzi expression`, () => {
    const pronunciation = resolvePronunciation({ hanzi, pinyin: supplied, meaning: "test" });
    assert.equal(pronunciation.pinyin, displayed);
    const input = prepareTtsInput(pronunciation, "voice-a");
    assert.equal(input.text, hanzi);
    assert.equal(input.ssml, `<speak version="1.0" xml:lang="zh-CN">${hanzi}</speak>`);
  });
}

test("TTS never sends Latin pinyin for a word", () => {
  const input = prepareTtsInput(resolveWordPronunciation({
    hanzi: "房地产",
    pinyin: "fáng dì chǎn",
    russian: "real estate",
  }), "voice-a");
  assert.equal(input.text, "房地产");
  assert.doesNotMatch(input.text, /[a-z]/i);
  assert.doesNotMatch(input.ssml, /fáng|dì|chǎn/);
});

test("TTS cache identity includes hanzi, resolved pinyin, and voice", () => {
  clearTtsInputCache();
  const base = resolvePronunciation({ hanzi: "地", pinyin: "de", meaning: "particle" });
  const first = prepareTtsInput(base, "voice-a");
  assert.strictEqual(prepareTtsInput(base, "voice-a"), first);
  assert.notStrictEqual(prepareTtsInput({ ...base, pinyin: "dì" }, "voice-a"), first);
  assert.notStrictEqual(prepareTtsInput(base, "voice-b"), first);
  assert.equal(ttsInputCacheSize(), 3);
});

test("a lexical word keeps its supplied phrase-level reading", () => {
  assert.equal(resolveWordPronunciation({
    hanzi: "房地产",
    pinyin: "fáng dì chǎn",
    russian: "real estate",
  }).pinyin, "fáng dì chǎn");
});
