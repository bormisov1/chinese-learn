import type { Sentence, Word } from "./types";

/** The single value rendered and handed to TTS for a Chinese expression. */
export type ResolvedPronunciation = {
  hanzi: string;
  pinyin: string;
  meaning: string;
};

type PronunciationSource = {
  hanzi: string;
  pinyin: string;
  meaning: string;
};

const LATIN_SYLLABLE = /[\p{Script=Latin}\p{Mark}]+[1-5]?/gu;
const HAN_CHARACTER = /\p{Script=Han}/u;

// These readings are lexical, not the structural neutral-tone particles.
const DI_GROUND_WORDS = [
  "土地", "地方", "地球", "地上", "地下", "地面", "地点", "地图", "地铁",
  "地址", "地理", "地区", "地震", "地位", "地主", "地板", "地带", "地步",
  "田地", "空地", "陆地", "本地", "外地", "当地", "各地", "大地", "场地",
  "基地", "目的地",
];
const DE_SECOND_TONE_WORDS = ["得到", "获得", "取得", "觉得", "值得", "赢得", "所得", "心得", "难得"];
const DEI_THIRD_TONE_WORDS = ["非得", "总得", "得亏"];
const DI_SECOND_TONE_WORDS = ["的确"];
const DI_TARGET_WORDS = ["目的", "标的", "有的放矢"];
const SUBJECT_BEFORE_DEI = new Set(["我", "你", "您", "他", "她", "它", "谁", "人", "咱"]);

function matchesWordAt(characters: string[], index: number, words: string[]) {
  const text = characters.join("");
  return words.some((word) => {
    const offset = word.indexOf(characters[index]);
    return offset >= 0 && text.slice(index - offset, index - offset + word.length) === word;
  });
}

/**
 * Correct structural-particle readings after the whole phrase is known.
 * Existing lexical pinyin remains authoritative for all other characters.
 */
export function resolveContextualPinyin(hanzi: string, pinyin: string): string {
  const characters = [...hanzi].filter((character) => HAN_CHARACTER.test(character));
  const syllables = [...pinyin.matchAll(LATIN_SYLLABLE)];
  // A single character has no grammatical context; retain its supplied lexical reading.
  if (characters.length <= 1 || characters.length !== syllables.length) return pinyin.trim();

  const replacements = new Map<number, string>();
  const tokenLengths = hanzi.trim().split(/\s+/).map((token) => [...token].filter((character) => HAN_CHARACTER.test(character)).length);
  const hasWordBoundaries = tokenLengths.length > 1;
  const lexicalTokenAt = (index: number) => {
    if (!hasWordBoundaries) return false;
    let end = 0;
    for (const length of tokenLengths) {
      end += length;
      if (index < end) return length > 1;
    }
    return false;
  };
  characters.forEach((character, index) => {
    if (character === "地") {
      if (matchesWordAt(characters, index, DI_GROUND_WORDS)) replacements.set(index, "dì");
      else if (!lexicalTokenAt(index)) replacements.set(index, "de");
      return;
    }
    if (character === "的") {
      if (matchesWordAt(characters, index, DI_SECOND_TONE_WORDS)) replacements.set(index, "dí");
      else if (matchesWordAt(characters, index, DI_TARGET_WORDS)) replacements.set(index, "dì");
      else if (!lexicalTokenAt(index)) replacements.set(index, "de");
      return;
    }
    if (character !== "得") return;
    if (matchesWordAt(characters, index, DE_SECOND_TONE_WORDS)) replacements.set(index, "dé");
    else if (matchesWordAt(characters, index, DEI_THIRD_TONE_WORDS)) replacements.set(index, "děi");
    else if (lexicalTokenAt(index)) return;
    else if (index === 0 || SUBJECT_BEFORE_DEI.has(characters[index - 1])) replacements.set(index, "děi");
    else replacements.set(index, "de");
  });

  let result = "";
  let cursor = 0;
  syllables.forEach((match, index) => {
    result += pinyin.slice(cursor, match.index);
    result += replacements.get(index) ?? match[0];
    cursor = match.index! + match[0].length;
  });
  return (result + pinyin.slice(cursor)).trim();
}

export function resolvePronunciation(source: PronunciationSource): ResolvedPronunciation {
  return {
    hanzi: source.hanzi.replaceAll(" ", "").trim(),
    pinyin: resolveContextualPinyin(source.hanzi, source.pinyin),
    meaning: source.meaning.trim(),
  };
}

export function resolveWordPronunciation(
  word: Pick<Word, "hanzi" | "pinyin" | "russian">,
  meaning = word.russian,
): ResolvedPronunciation {
  return {
    hanzi: word.hanzi.replaceAll(" ", "").trim(),
    pinyin: word.pinyin.trim(),
    meaning: meaning.trim(),
  };
}

export function resolveSentencePronunciation(
  sentence: Pick<Sentence, "chinese" | "pinyin" | "russian">,
): ResolvedPronunciation {
  return resolvePronunciation({ hanzi: sentence.chinese, pinyin: sentence.pinyin, meaning: sentence.russian });
}

export function resolveExplainedPronunciation(
  entry: { word: string; pinyin?: string; meaning: string },
  words: Pick<Word, "hanzi" | "pinyin">[],
): ResolvedPronunciation {
  const lexicalPinyin = words.find(({ hanzi }) => hanzi === entry.word)?.pinyin ?? "";
  return resolveWordPronunciation({
    hanzi: entry.word,
    pinyin: entry.pinyin?.trim() || lexicalPinyin,
    russian: entry.meaning,
  });
}
