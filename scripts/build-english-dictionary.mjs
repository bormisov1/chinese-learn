#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import {
  download,
  downloadHsk,
  normalizeHanzi,
  normalizePinyin,
} from "./hsk-source.mjs";

const CEDICT_URL = "https://cc-cedict.org/editor/editor_export_cedict.php?c=gz";
const OUTPUT = new URL("../public/dictionaries/hsk-en.json", import.meta.url);
const RUSSIAN = new URL("../public/dictionaries/hsk-ru.json", import.meta.url);
const CARD_GLOSSES = new URL("../src/data/hsk-english-card-glosses.json", import.meta.url);
const METADATA_GLOSS = /^(?:CL:|(?:also |Taiwan )?pr\.|(?:old )?variant of |see |abbr\. for )/i;

const cleanMeanings = (values) => {
  const present = values.map(value => value.trim()).filter(Boolean);
  const cleaned = [...new Set(present.filter(value => !METADATA_GLOSS.test(value)))];
  return cleaned.length ? cleaned : present;
};
function markedSyllable(value) {
  const match = value.match(/^(.*?)([0-5])$/);
  if (!match) return value.replaceAll("u:", "ü").replaceAll("v", "ü");
  let syllable = match[1].replaceAll("u:", "ü").replaceAll("v", "ü");
  const tone = Number(match[2]);
  if (!tone || tone === 5) return syllable;
  const lower = syllable.toLowerCase();
  let index = lower.indexOf("a");
  if (index < 0) index = lower.indexOf("e");
  if (index < 0 && lower.includes("ou")) index = lower.indexOf("o");
  if (index < 0) {
    for (let position = syllable.length - 1; position >= 0; position--) {
      if ("aeiouü".includes(lower[position])) { index = position; break; }
    }
  }
  if (index < 0) return syllable;
  const plain = "aeiouüAEIOUÜ";
  const marked = [
    "āēīōūǖĀĒĪŌŪǕ",
    "áéíóúǘÁÉÍÓÚǗ",
    "ǎěǐǒǔǚǍĚǏǑǓǙ",
    "àèìòùǜÀÈÌÒÙǛ",
  ];
  const vowel = plain.indexOf(syllable[index]);
  if (vowel < 0) return syllable;
  return `${syllable.slice(0, index)}${marked[tone - 1][vowel]}${syllable.slice(index + 1)}`;
}

const markPinyin = (value) => value.split(/\s+/).map(markedSyllable).join(" ");

const hsk = await downloadHsk();
const cedict = gunzipSync(await download(CEDICT_URL)).toString("utf8");
const russian = JSON.parse(await readFile(RUSSIAN, "utf8"));
const cardGlosses = JSON.parse(await readFile(CARD_GLOSSES, "utf8"));
const entries = new Map();
const hskByPinyin = new Map();
const cedictTraditional = new Map();

// Prefer the curated HSK forms and glosses for graded vocabulary.
for (const item of hsk) {
  const form = item.f?.[0];
  const meanings = cleanMeanings(form?.m ?? []);
  const hanzi = normalizeHanzi(item.s ?? "");
  if (hanzi && form?.i?.y && meanings.length) {
    const row = [hanzi, form.i.y, meanings.join("; ")];
    entries.set(hanzi, row);
    const pinyin = normalizePinyin(form.i.y);
    hskByPinyin.set(pinyin, hskByPinyin.has(pinyin) ? null : row);
  }
}

// Fill the general-purpose lookup with the complete CC-CEDICT release.
for (const line of cedict.split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const match = line.match(/^(\S+) (\S+) \[([^\]]+)] \/(.*)\/$/);
  if (!match) continue;
  const [, traditional, hanzi, numericPinyin, rawMeanings] = match;
  const meanings = cleanMeanings(rawMeanings.split("/"));
  if (!hanzi || !meanings.length) continue;
  if (!entries.has(hanzi)) entries.set(hanzi, [hanzi, markPinyin(numericPinyin), meanings.slice(0, 12).join("; ").slice(0, 1800)]);
  if (traditional !== hanzi) cedictTraditional.set(traditional, hanzi);
}

// Reviewed HSK readings and short meanings override the uncurated source forms.
for (const [hanzi, pinyin, meaning] of cardGlosses) entries.set(hanzi, [hanzi, pinyin, meaning]);
// Common standalone character used outside the 4,991 HSK 2.0 card list.
entries.set("打", ["打", "dǎ", "to hit; to play"]);

// Preserve malformed spacing used by the legacy Russian HSK identifiers.
for (const [legacyHanzi, legacyPinyin] of russian) {
  const normalized = normalizeHanzi(legacyHanzi);
  const simplified = cedictTraditional.get(normalized);
  const source = entries.get(normalized) ?? (simplified ? entries.get(simplified) : undefined) ?? hskByPinyin.get(normalizePinyin(legacyPinyin));
  if (source && legacyHanzi !== source[0]) entries.set(legacyHanzi, [legacyHanzi, source[1], source[2]]);
}

const rows = [...entries.values()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
await writeFile(OUTPUT, JSON.stringify(rows));

const missing = russian.filter(([hanzi]) => !entries.has(hanzi));
console.log(`Wrote ${rows.length} entries; ${russian.length - missing.length}/${russian.length} legacy Russian words covered.`);
if (missing.length) console.log(`Remaining legacy misses: ${missing.map(([hanzi]) => hanzi).join(", ")}`);
