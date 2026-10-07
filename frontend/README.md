# Hanzi Deck

Local-first Expo app for Chinese vocabulary study. The import screen accepts a Chinese word or sentence and segments it into vocabulary entries using the bundled dictionary.

```bash
cd frontend
npm ci
npm run web
```

Add a DeepSeek API key under Settings. Vocabulary can be added from typed or pasted Chinese text and by HSK level.

On first launch the app suggests a supported language from the browser locale and asks the learner to confirm it. The language can be changed later in Settings. A change first downloads and validates the target dictionary, then atomically updates the language and saved word meanings. Download failures leave the current language and study data untouched. Generated sentences are cleared after confirmation because their translations belong to the previous language; vocabulary and SRS progress are preserved.

Word meanings are remembered per language, so custom or dictionary-missing meanings return when the learner switches back.

HSK dictionaries are lazy-loaded from the fixed `/dictionaries/hsk-<language>.json` allowlist. Web uses same-origin paths; native uses the deployed HTTPS origin. The loader rejects oversized and malformed files; a stored language value can never become a download URL. Only the active or explicitly requested target dictionary is loaded. Imports merge by Hanzi while preserving study counters.

English card meanings and readings for the 4,991 HSK 2.0 forms come from
`frontend/src/data/hsk-english-card-glosses.json`. They were selected from the full set
of meanings and readings in the pinned HSK source with DeepSeek, then common
words and particles were reviewed by hand. The complete CC-CEDICT dictionary
remains available for all other words. Regenerate the curated set with
`DEEPSEEK_API_KEY=... npm run build:dictionary:en-cards`, then run
`npm run apply:dictionary:en-cards` and `npm run validate:hsk-data`. The apply
step preserves all other dictionary rows. A full `npm run build:dictionary`
downloads the current CC-CEDICT release, which can also change unrelated rows.
The generation script resumes interrupted batches using an ignored progress file.

Russian meanings use the original HSK
dictionary, normalized aliases for legacy spaced keys, and curated corrections from
`frontend/src/data/hsk-russian-supplement.json`. Rebuild it with
`npm run build:dictionary:ru`.

The HSK 2.0 level sets and English dictionary are generated from the pinned
complete-hsk-vocabulary release. The level sets contain all 4,991 distinct written
forms behind the 5,000 syllabus entries; repeated forms with different parts of
speech are intentionally represented once because decks are keyed by Hanzi. Russian
aliases are matched from the downloaded legacy vocabulary by Hanzi and pinyin, and
validation requires every selectable HSK form in every bundled learner dictionary.
Rebuild and validate all generated vocabulary assets with `npm run build:hsk-data`.
The individual level, English, and Russian build scripts remain available for adding
or updating learner-language assets independently.

The English dictionary combines complete HSK 2.0/3.0 vocabulary with the full
CC-CEDICT release. Dictionary meanings are resolved offline first. When a saved
word is still missing during a language change, a configured DeepSeek key
provides a best-effort translation that is cached on-device. Rebuild the English
asset with `npm run build:dictionary`; attribution is in
`frontend/third-party/CC-CEDICT-NOTICE`.
