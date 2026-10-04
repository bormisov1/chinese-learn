#!/usr/bin/env node

/** Update only reviewed card rows in the existing broad English dictionary. */
import { readFile, writeFile } from "node:fs/promises";

const OUTPUT = new URL("../public/dictionaries/hsk-en.json", import.meta.url);
const CARD_GLOSSES = new URL("../src/data/hsk-english-card-glosses.json", import.meta.url);
const existing = JSON.parse(await readFile(OUTPUT, "utf8"));
const curated = JSON.parse(await readFile(CARD_GLOSSES, "utf8"));
const rows = new Map(existing.map(row => [row[0], row]));
for (const row of curated) rows.set(row[0], row);
rows.set("打", ["打", "dǎ", "to hit; to play"]);
await writeFile(OUTPUT, JSON.stringify([...rows.values()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)));
console.log(`Applied ${curated.length} curated HSK card glosses and reviewed standalone 打; preserved ${existing.length} existing dictionary rows.`);
