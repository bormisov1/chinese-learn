#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const BATCH_SIZE = 50;
const LIMIT = Number(process.env.THAI_TRANSLATION_LIMIT ?? 500);
const MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-flash";
const STATE = new URL("../.thai-translation-progress.json", import.meta.url);
const PARTIAL = new URL("../.thai-translation-partial.json", import.meta.url);
const HSK = new URL("../src/data/hsk-levels.json", import.meta.url);
const ENGLISH = new URL("../public/dictionaries/hsk-en.json", import.meta.url);

const prices = {
  flash: { input: { offpeak: 0.15, peak: 0.30 }, output: { offpeak: 0.60, peak: 1.20 } },
  pro: { input: { offpeak: 0.66, peak: 1.32 }, output: { offpeak: 1.98, peak: 3.96 } },
};
const priceMode = process.env.DEEPSEEK_PRICE_MODE === "peak" ? "peak" : "offpeak";
const priceKey = MODEL.includes("pro") ? "pro" : "flash";

if (!process.env.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY is required.");
if (!Number.isInteger(LIMIT) || LIMIT < 1 || LIMIT > 4991) throw new Error("THAI_TRANSLATION_LIMIT must be 1..4991.");

const levels = JSON.parse(await readFile(HSK, "utf8"));
const englishRows = new Map(JSON.parse(await readFile(ENGLISH, "utf8")).map(row => [row[0], row]));
const words = [...new Set(Object.values(levels).flat())].slice(0, LIMIT).map(hanzi => {
  const row = englishRows.get(hanzi);
  if (!row) throw new Error(`Missing English dictionary row for ${hanzi}`);
  return { hanzi, pinyin: row[1], english: row[2] };
});

let state = { rows: [], inputTokens: 0, outputTokens: 0, batches: 0 };
try { state = JSON.parse(await readFile(STATE, "utf8")); } catch {}
if (state.rows.length > words.length) state = { rows: [], inputTokens: 0, outputTokens: 0, batches: 0 };

const thai = /[\u0E00-\u0E7F]/u;
const requested = words.slice(state.rows.length);
const expected = new Map(requested.map(word => [word.hanzi, word]));

async function translate(batch) {
  let pending = [...batch];
  const translated = new Map();
  let inputTokens = 0;
  let outputTokens = 0;
  let attempts = 0;
  while (pending.length && attempts < 6) {
    attempts += 1;
    const allowed = new Map(pending.map(word => [word.hanzi, word]));
  const prompt = [
    "Translate every Mandarin vocabulary item into concise, natural Thai for a Thai-speaking learner.",
    "Use the English gloss only as context; choose the meaning appropriate to the Chinese word.",
    "Return exactly one item for every requested hanzi, preserving hanzi exactly.",
    "Return JSON only in this format: {\"words\":[{\"hanzi\":\"...\",\"translation\":\"...\"}]}",
    JSON.stringify(pending),
  ].join("\n");
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      reasoning_effort: "none",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a careful Chinese-to-Thai dictionary editor. JSON only." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}: ${await response.text()}`);
  const json = await response.json();
  const usage = json.usage ?? {};
  inputTokens += Number(usage.prompt_tokens ?? 0);
  outputTokens += Number(usage.completion_tokens ?? 0);
  const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
  const rows = parsed.words ?? [];
  for (const item of rows) {
    const source = allowed.get(item?.hanzi);
    const translation = typeof item?.translation === "string" ? item.translation.trim() : "";
    if (source && translation && thai.test(translation) && !translated.has(item.hanzi)) translated.set(item.hanzi, [source.hanzi, source.pinyin, translation]);
  }
    pending = pending.filter(word => !translated.has(word.hanzi));
  }
  if (pending.length) throw new Error(`Could not translate ${pending.length} entries after ${attempts} attempts: ${pending.map(word => word.hanzi).join(", ")}`);
  const cost = ((inputTokens * prices[priceKey].input[priceMode]) + (outputTokens * prices[priceKey].output[priceMode])) / 1_000_000;
  return { rows: batch.map(word => translated.get(word.hanzi)), inputTokens, outputTokens, cost };
}

for (let start = 0; start < requested.length; start += BATCH_SIZE) {
  const batch = requested.slice(start, start + BATCH_SIZE);
  const result = await translate(batch);
  state.rows.push(...result.rows);
  state.inputTokens += result.inputTokens;
  state.outputTokens += result.outputTokens;
  state.batches += 1;
  await writeFile(STATE, JSON.stringify(state, null, 2));
  await writeFile(PARTIAL, JSON.stringify(state.rows));
  const totalCost = ((state.inputTokens * prices[priceKey].input[priceMode]) +
    (state.outputTokens * prices[priceKey].output[priceMode])) / 1_000_000;
  console.log(`Batch ${state.batches}: ${state.rows.length}/${words.length}; input ${result.inputTokens}; output ${result.outputTokens}; batch $${result.cost.toFixed(6)}; total $${totalCost.toFixed(6)}`);
}

if (state.rows.length === words.length) {
  const output = new URL("../public/dictionaries/hsk-th.json", import.meta.url);
  await writeFile(output, JSON.stringify(state.rows));
  console.log(`Wrote ${state.rows.length} Thai dictionary entries.`);
}
