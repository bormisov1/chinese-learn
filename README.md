# Hanzi Deck

Local-first Expo app for Chinese vocabulary study.

```bash
npm install
npm run web
```

## Production deployment

Deploy the production web app with this single authoritative command:

```bash
./scripts/deploy-web.sh
```

Production always deploys `origin/master`. Never run `npm run build:web`
directly in the live checkout. Node 22 is mandatory.

The `dist` directory is actively served on port 8081. The serving process does
not need restarting after an output swap.

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

On first launch the app suggests a supported language from the browser locale and asks the learner to confirm it. The language can be changed later in Settings. Changing it refreshes saved word meanings and clears generated sentences because their translations belong to the previous language.

HSK dictionaries are lazy-loaded from the fixed, same-origin `/dictionaries/hsk-<language>.json` allowlist. The loader rejects oversized and malformed files; a stored language value can never become a download URL. Only the selected dictionary is requested. Screenshot OCR uses a translation-free Hanzi/pinyin index, and reimports merge by Hanzi while preserving study counters.
