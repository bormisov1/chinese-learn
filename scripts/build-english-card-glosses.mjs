#!/usr/bin/env node

/** Curate the pinned HSK 2.0 set for flashcards; retain CC-CEDICT for other words. */
import { readFile, writeFile } from "node:fs/promises";
import { downloadHsk, normalizeHanzi } from "./hsk-source.mjs";

const LEVELS = new URL("../src/data/hsk-levels.json", import.meta.url);
const OUTPUT = new URL("../src/data/hsk-english-card-glosses.json", import.meta.url);
const PROGRESS = new URL("../.english-card-gloss-progress.json", import.meta.url);
const BATCH_SIZE = 30;
// High-frequency entries checked by hand after the model pass. Keep these here so
// a repeat generation preserves the reviewed flashcard wording.
const REVIEWED = {
  "一": "one", "二": "two", "三": "three", "四": "four", "五": "five",
  "六": "six", "七": "seven", "八": "eight", "九": "nine", "十": "ten",
  "书": "book; letter",
  "啊": "sentence-ending particle",
  "把": "object marker; to hold",
  "被": "passive marker; by",
  "地": "adverb marker; -ly",
  "呢": "what about?; question particle",
  "过": "to pass; past experience marker",
  "次": "time; occurrence",
  "件": "classifier for items; item",
  "张": "classifier for flat objects; sheet",
  "着": "ongoing action particle",
  "男人": "man",
  "女人": "woman",
};
const limit = Number(process.env.ENGLISH_GLOSS_LIMIT ?? 4991);
if (!Number.isInteger(limit) || limit < 1 || limit > 4991) throw new Error("ENGLISH_GLOSS_LIMIT must be 1..4991.");
let key = process.env.DEEPSEEK_API_KEY || "";
if (!key && process.argv.includes("--key-stdin")) {
  for await (const chunk of process.stdin) key += chunk.toString();
  key = key.trim();
}
if (!key) throw new Error("DEEPSEEK_API_KEY or --key-stdin is required.");
const model = process.env.DEEPSEEK_MODEL || "deepseek-flash";
const hsk = await downloadHsk();
const byWord = new Map(hsk.map(item => [normalizeHanzi(item.s ?? ""), item]));
const words = JSON.parse(await readFile(LEVELS, "utf8"))["6"].slice(0, limit).map(hanzi => {
  const item = byWord.get(hanzi);
  if (!item?.f?.length) throw new Error(`Missing HSK source forms: ${hanzi}`);
  return {
    hanzi,
    forms: item.f.filter(form => form.i?.y && form.m?.length).map(form => ({ pinyin: form.i.y, meanings: form.m })),
  };
});
const pinyinSignature = value => value.trim().toLowerCase().replaceAll("u:", "ü").replaceAll("v", "ü")
  .normalize("NFD").replaceAll(/u\u0308/g, "v").split(/\s+/).map(syllable => {
    const mark = syllable.match(/[\u0304\u0301\u030c\u0300]/)?.[0];
    const tone = mark ? { "\u0304": 1, "\u0301": 2, "\u030c": 3, "\u0300": 4 }[mark] : 5;
    return `${syllable.replaceAll(/[\u0304\u0301\u030c\u0300]/g, "")}${tone}`;
  }).join(" ");
const valid = (word, row) => {
  if (!row || row.hanzi !== word.hanzi || typeof row.pinyin !== "string" || typeof row.translation !== "string") return false;
  const options = word.forms.map(form => pinyinSignature(form.pinyin));
  const meaning = row.translation.trim();
  return options.includes(pinyinSignature(row.pinyin)) && meaning.length > 0 && meaning.length <= 140 &&
    meaning.split(";").length <= 2 && !meaning.startsWith("(") && !/[□\p{Script=Han}\n\r]/u.test(meaning) &&
    !/^(?:CL:|see |variant of |abbr\. for )/i.test(meaning);
};
let state = { rows: {}, inputTokens: 0, outputTokens: 0, batches: 0 };
try { state = JSON.parse(await readFile(PROGRESS, "utf8")); } catch { /* Begin a new run. */ }
const requested = words.filter(word => !valid(word, state.rows?.[word.hanzi]));

async function curate(batch) {
  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      reasoning_effort: "none",
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You are a careful Mandarin-to-English flashcard dictionary editor. Return JSON only." },
        { role: "user", content: [
          "For EVERY Chinese word choose its most common standard Hanyu Pinyin reading from the listed forms and give ONE or TWO short, obvious English meanings useful to an English-speaking beginner studying a flashcard.",
          "The listed meanings are source context. Prefer everyday meanings and grammatical use over proper names, archaic senses, etymology and obscure technical senses. For a polyphonic word, choose the most common reading in isolation and meanings that match it.",
          "Use natural plain English. No Chinese characters, □ placeholders, classifier codes, explanatory notes, parenthetical source text, or transliterations in translations. Separate two meanings with '; '. Do not give more than two meanings.",
          'Return exactly one item per input, preserving hanzi exactly: {"words":[{"hanzi":"上","pinyin":"shàng","translation":"up; above"}]}.',
          JSON.stringify(batch),
        ].join("\n") },
      ],
    }),
  });
  if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  const items = JSON.parse(content || "{}").words;
  if (!Array.isArray(items)) throw new Error("Model did not return a words array.");
  return { items, usage: payload.usage ?? {} };
}

for (let start = 0; start < requested.length; start += BATCH_SIZE) {
  let pending = requested.slice(start, start + BATCH_SIZE);
  for (let attempt = 1; pending.length && attempt <= 5; attempt++) {
    try {
      const { items, usage } = await curate(pending);
      state.inputTokens += Number(usage.prompt_tokens ?? 0);
      state.outputTokens += Number(usage.completion_tokens ?? 0);
      const byHanzi = new Map(items.map(item => [item?.hanzi, item]));
      for (const word of pending) {
        const item = byHanzi.get(word.hanzi);
        if (valid(word, item)) state.rows[word.hanzi] = { hanzi: word.hanzi, pinyin: item.pinyin.trim().replaceAll("u:", "ü"), translation: item.translation.trim() };
      }
      pending = pending.filter(word => !state.rows[word.hanzi]);
    } catch (error) {
      console.error(`Batch ${state.batches + 1}, attempt ${attempt}: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, Math.min(attempt * 1500, 6000)));
    }
  }
  if (pending.length) throw new Error(`Uncurated after retries: ${pending.map(word => word.hanzi).join(", ")}`);
  state.batches++;
  await writeFile(PROGRESS, JSON.stringify(state));
  console.log(`Batch ${state.batches}: ${Object.keys(state.rows).length}/${words.length}; tokens ${state.inputTokens}+${state.outputTokens}`);
}
if (words.length === 4991) {
  const rows = words.map(word => {
    const item = state.rows[word.hanzi];
    if (!valid(word, item)) throw new Error(`Invalid curated word: ${word.hanzi}`);
    return [word.hanzi, item.pinyin, REVIEWED[word.hanzi] ?? item.translation];
  });
  await writeFile(OUTPUT, `${JSON.stringify(rows)}\n`);
  console.log(`Wrote ${rows.length} English card glosses.`);
}
