#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const LEVELS = new URL("../src/data/hsk-levels.json", import.meta.url);
const DICTIONARIES = {
  en: new URL("../public/dictionaries/hsk-en.json", import.meta.url),
  ru: new URL("../public/dictionaries/hsk-ru.json", import.meta.url),
  th: new URL("../public/dictionaries/hsk-th.json", import.meta.url),
};
const ENGLISH_CARD_GLOSSES = new URL("../src/data/hsk-english-card-glosses.json", import.meta.url);
const EXPECTED_COUNTS = [150, 297, 595, 1193, 2491, 4991];

const levels = JSON.parse(await readFile(LEVELS, "utf8"));
let previous = new Set();
for (let level = 1; level <= 6; level += 1) {
  const words = levels[String(level)] ?? [];
  const unique = new Set(words);
  if (unique.size !== words.length) {
    throw new Error(`HSK ${level} contains duplicate spellings.`);
  }
  if (words.length !== EXPECTED_COUNTS[level - 1]) {
    throw new Error(
      `HSK ${level} has ${words.length} spellings; expected ${EXPECTED_COUNTS[level - 1]}.`,
    );
  }
  for (const word of previous) {
    if (!unique.has(word)) throw new Error(`HSK ${level} is not cumulative.`);
  }
  previous = unique;
}

for (const [language, url] of Object.entries(DICTIONARIES)) {
  const rows = JSON.parse(await readFile(url, "utf8"));
  const words = new Set(rows.map(([hanzi]) => hanzi));
  const missing = [...previous].filter((hanzi) => !words.has(hanzi));
  if (missing.length) {
    throw new Error(`${language} dictionary misses ${missing.length} HSK words.`);
  }
  console.log(`${language}: all ${previous.size} distinct HSK spellings covered.`);
}

const curated = JSON.parse(await readFile(ENGLISH_CARD_GLOSSES, "utf8"));
if (curated.length !== previous.size) throw new Error(`English card glosses contain ${curated.length} rows; expected ${previous.size}.`);
const english = new Map(JSON.parse(await readFile(DICTIONARIES.en, "utf8")).map(row => [row[0], row]));
const seenCurated = new Set();
for (const row of curated) {
  if (!Array.isArray(row) || row.length !== 3) throw new Error("Invalid English card gloss row.");
  const [hanzi, pinyin, meaning] = row;
  if (!previous.has(hanzi) || seenCurated.has(hanzi)) throw new Error(`Unexpected or repeated English card gloss: ${hanzi}`);
  seenCurated.add(hanzi);
  if (!pinyin || !meaning || meaning.length > 140 || meaning.split(";").length > 2 || /[□\p{Script=Han}\r\n]/u.test(meaning)) {
    throw new Error(`Invalid English card gloss for ${hanzi}`);
  }
  if (JSON.stringify(english.get(hanzi)) !== JSON.stringify(row)) throw new Error(`English dictionary is stale for ${hanzi}.`);
}
console.log(`en: ${curated.length} curated card glosses applied with clean English meanings.`);
if (JSON.stringify(english.get("打")) !== JSON.stringify(["打", "dǎ", "to hit; to play"])) {
  throw new Error("Reviewed standalone 打 entry was not applied.");
}
