# Hanzi Deck

Local-first Expo app for Chinese vocabulary study.

```bash
npm install
npm run web
```

Production web deployment (includes SPA history fallback for direct route loads):

```bash
npm run build:web
npm run serve:web
```

Add a DeepSeek API key under Settings. Screenshot OCR runs locally on web via Tesseract.js. Native apps support pasted vocabulary text; on-device native OCR requires a platform OCR module and development build.

Screenshot import extracts only Hanzi. Pinyin and Russian meanings come from the bundled HSK 1–6 dictionary; screenshot pronunciation/translation columns are ignored. Dictionary data: `argb/hanzi-data` (`hsk-russian.csv`), MIT licensed. Reimports merge by Hanzi and preserve all study counters.
