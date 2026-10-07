#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { buildOldHskLevels, downloadHsk } from "./hsk-source.mjs";

const OUTPUT = new URL("../src/data/hsk-levels.json", import.meta.url);

const levels = buildOldHskLevels(await downloadHsk());
await writeFile(OUTPUT, `${JSON.stringify(levels)}\n`);

console.log(
  `Wrote ${levels["6"].length} distinct HSK 2.0 spellings across six cumulative levels.`,
);
