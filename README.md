# Hanzi Deck

Local-first Expo app for Chinese vocabulary study. The import screen accepts a Chinese word or sentence and segments it into vocabulary entries using the bundled dictionary.

```bash
npm install
npm run web
```

## Web deployment

Deploy the committed `HEAD` of the current branch:

```bash
./scripts/deploy-web.sh
```

`master` publishes to `https://zh.x.bormisov.com`. Other branches publish to
`https://<branch>.zh.x.bormisov.com`; non-DNS characters such as `/` become
`-`. The wildcard DNS record is preconfigured. The script provisions Nginx and
a Let's Encrypt certificate on the first deployment of each branch. Never run
`npm run build:web` directly in the live checkout. Node 22 is mandatory.

The production `dist` directory is served on port 8081. Branch builds are served
directly by Nginx from `/home/claude/chinese-learn-web-deployments`. Neither
requires restarting a Node process after an atomic output swap.

Deployments cache `node_modules` under
`/home/claude/.cache/chinese-learn-web-dependencies`, keyed by the
`package-lock.json` content. An unchanged lockfile reuses the cached dependency
tree; a changed lockfile runs `npm ci` and atomically publishes a new entry.

To clear the cache safely, wait for any active deployment and take the cache
lock while removing it:

```bash
flock /tmp/chinese-learn-web-dependency-cache.lock \
  rm -rf -- /home/claude/.cache/chinese-learn-web-dependencies
```

The next deployment will recreate the directory and perform a cold `npm ci`.

Add a DeepSeek API key under Settings. Screenshot OCR runs locally on web via Tesseract.js. Native apps support pasted vocabulary text; on-device native OCR requires a platform OCR module and development build.

On first launch the app suggests a supported language from the browser locale and asks the learner to confirm it. The language can be changed later in Settings. A change first downloads and validates the target dictionary, then atomically updates the language and saved word meanings. Download failures leave the current language and study data untouched. Generated sentences are cleared after confirmation because their translations belong to the previous language; vocabulary and SRS progress are preserved.

Word meanings are remembered per language, so custom or dictionary-missing meanings return when the learner switches back. QR restores use their encoded source language and relocalize against the active dictionary.

HSK dictionaries are lazy-loaded from the fixed `/dictionaries/hsk-<language>.json` allowlist. Web uses same-origin paths; native uses the deployed HTTPS origin. The loader rejects oversized and malformed files; a stored language value can never become a download URL. Only the active or explicitly requested target dictionary is loaded. Screenshot OCR uses a translation-free Hanzi/pinyin index, and reimports merge by Hanzi while preserving study counters.

English meanings come from CC-CEDICT. Russian meanings use the original HSK
dictionary, normalized aliases for legacy spaced keys, and curated corrections from
`src/data/hsk-russian-supplement.json`. Rebuild it with
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
`third-party/CC-CEDICT-NOTICE`.
