#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const SOURCE = new URL("../src/data/hsk-russian.json", import.meta.url);
const SUPPLEMENT = new URL("../src/data/hsk-russian-supplement.json", import.meta.url);
const OUTPUT = new URL("../public/dictionaries/hsk-ru.json", import.meta.url);

const normalizeHanzi = (value) => value.replace(/\s+/g, "");
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

const rows = [...entries.values()].sort(([left], [right]) =>
  left < right ? -1 : left > right ? 1 : 0,
);
await writeFile(OUTPUT, JSON.stringify(rows));
console.log(`Wrote ${rows.length} Russian dictionary entries and normalized aliases.`);
