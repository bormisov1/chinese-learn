#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const LEVELS = new URL("../src/data/hsk-levels.json", import.meta.url);
const DICTIONARIES = {
  en: new URL("../public/dictionaries/hsk-en.json", import.meta.url),
  ru: new URL("../public/dictionaries/hsk-ru.json", import.meta.url),
  th: new URL("../public/dictionaries/hsk-th.json", import.meta.url),
};
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
