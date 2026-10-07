#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import {
  downloadHsk,
  normalizeHanzi,
  normalizePinyin,
  oldHskLevel,
} from "./hsk-source.mjs";

const SOURCE = new URL("../src/data/hsk-russian.json", import.meta.url);
const SUPPLEMENT = new URL("../src/data/hsk-russian-supplement.json", import.meta.url);
const OUTPUT = new URL("../public/dictionaries/hsk-ru.json", import.meta.url);

const source = JSON.parse(await readFile(SOURCE, "utf8"));
const supplement = JSON.parse(await readFile(SUPPLEMENT, "utf8"));
const entries = new Map();

for (const [hanzi, pinyin, translation] of source) {
  if (hanzi.trim() && pinyin.trim() && translation.trim()) {
    entries.set(hanzi, [hanzi, pinyin.trim(), translation.trim()]);
  }
}

// Keep legacy spaced identifiers working while adding their canonical aliases.
for (const [hanzi, pinyin, translation] of source) {
  const normalized = normalizeHanzi(hanzi);
  if (normalized !== hanzi && !entries.has(normalized)) {
    entries.set(normalized, [normalized, pinyin.trim(), translation.trim()]);
  }
}

// Curated rows win over both legacy entries and generated aliases.
for (const [hanzi, pinyin, translation] of supplement) {
  entries.set(normalizeHanzi(hanzi), [normalizeHanzi(hanzi), pinyin.trim(), translation.trim()]);
}

const commonPrefixLength = (left, right) => {
  let length = 0;
  while (length < left.length && left[length] === right[length]) length += 1;
  return length;
};

const sourceRows = source.map(([hanzi, pinyin, translation], index) => ({
  hanzi: normalizeHanzi(hanzi),
  pinyin: normalizePinyin(pinyin),
  translation: translation.trim(),
  index,
}));

function bestRussianSource(item) {
  const target = normalizeHanzi(item.s ?? "");
  const pinyin = new Set(
    (item.f ?? [])
      .flatMap((form) => [form.i?.y, form.i?.n])
      .filter(Boolean)
      .map(normalizePinyin),
  );

  return sourceRows
    .map((candidate) => {
      const exactPinyin = pinyin.has(candidate.pinyin);
      const relatedPinyin = [...pinyin].some(
        (value) =>
          value &&
          candidate.pinyin &&
          (value.startsWith(candidate.pinyin) || candidate.pinyin.startsWith(value)),
      );
      const prefix = commonPrefixLength(target, candidate.hanzi);
      const matchingPositions = [...target].filter(
        (character, index) => candidate.hanzi[index] === character,
      ).length;
      const sharedCharacters = new Set(
        [...target].filter((character) => candidate.hanzi.includes(character)),
      ).size;
      const score =
        (exactPinyin ? 100 : 0) +
        (relatedPinyin ? 30 : 0) +
        prefix * 40 +
        matchingPositions * 10 +
        sharedCharacters * 3 +
        (candidate.hanzi.startsWith(target) ? 50 : 0);
      return { ...candidate, score };
    })
    .filter((candidate) => candidate.score >= 110)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.hanzi.length - right.hanzi.length ||
        left.index - right.index,
    )[0];
}

// Canonical aliases repair truncation, spacing, and variant-character damage in
// the downloaded legacy Russian list without hand-maintaining vocabulary rows.
const hsk = await downloadHsk();
let aliases = 0;
for (const item of hsk.filter(oldHskLevel)) {
  const hanzi = normalizeHanzi(item.s ?? "");
  if (!hanzi || entries.has(hanzi)) continue;
  const candidate = bestRussianSource(item);
  const pinyin = (item.f ?? []).find((form) =>
    candidate?.pinyin.startsWith(normalizePinyin(form.i?.y ?? "")),
  )?.i?.y?.trim();
  if (candidate && pinyin) {
    entries.set(hanzi, [hanzi, pinyin, candidate.translation]);
    aliases += 1;
  }
}

const missing = hsk
  .filter(oldHskLevel)
  .map((item) => normalizeHanzi(item.s ?? ""))
  .filter((hanzi) => hanzi && !entries.has(hanzi));
if (missing.length) {
  throw new Error(`Russian dictionary misses ${missing.length} HSK words: ${missing.join(", ")}`);
}

const rows = [...entries.values()].sort(([left], [right]) =>
  left < right ? -1 : left > right ? 1 : 0,
);
await writeFile(OUTPUT, JSON.stringify(rows));
console.log(
  `Wrote ${rows.length} Russian dictionary entries, including ${aliases} canonical HSK aliases.`,
);
