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

Screenshot import extracts only Hanzi. Pinyin and Russian meanings come from the bundled HSK 1–6 dictionary; screenshot pronunciation/translation columns are ignored. Dictionary data: `argb/hanzi-data` (`hsk-russian.csv`), MIT licensed. Reimports merge by Hanzi and preserve all study counters.
