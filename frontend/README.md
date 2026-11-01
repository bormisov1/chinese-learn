# Hanzi Deck

Local-first Expo app for Chinese vocabulary study. The import screen accepts a Chinese word or sentence and segments it into vocabulary entries using the bundled dictionary.

```bash
cd frontend
npm ci
npm run web
```

Add a DeepSeek API key under Settings. Vocabulary can be added from typed or pasted Chinese text and by HSK level.

The Handwriting tab lets learners draw one Hanzi at a time, choose a recognition
candidate, and append it to an editable, copyable output field. Undo removes the
last stroke; Clear resets the drawing without changing the output. The browser
uses the HanziLookup Rust/WASM worker. Android and iOS use the local
`modules/hanzi-ink` Expo module with Google ML Kit Digital Ink Recognition. The
Chinese model downloads on first use and recognition then runs on device.
Native handwriting needs a new app build and does not work in Expo Go. The
native module requires Android 24+ or iOS 15.5+.

## Premium access

RevenueCat unlocks handwriting, Sentences, Listening, and Mix after ten free
handwriting sessions. Cards, Recognition, vocabulary import, and Settings remain
free. Configure one `premium` entitlement, attach the App Store and Play Store
products to an offering, and attach a RevenueCat Paywall to that offering. Set
the public platform SDK keys with:

```bash
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_...
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_...
EXPO_PUBLIC_REVENUECAT_WEB_API_KEY=rcb_...
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=premium
```

The web key is optional when web purchases are not offered; web purchases need
a separately configured RevenueCat Web Billing app. Public SDK keys are safe to
bundle, but secret RevenueCat keys must never use these variables. Native
purchases and RevenueCat Paywalls require a fresh development or production
build; Expo Go only provides preview behavior. Signed-in users are identified
to RevenueCat with the app account ID, preserving entitlements across platforms.

The Recognition tab keeps the camera preview live on iOS, Android, and web while
OCR boxes update from occasional captures and are visual guides. Recognized
expressions appear in a list below the camera, where learners can select new
words to add or remove saved words. Freezing takes a fresh photo and runs final
OCR on that exact frame; existing photos can also
be scanned. Adjacent single-character OCR elements on one line are grouped into
dictionary words, while multi-character OCR elements remain intact. Mobile OCR
uses the bundled Chinese model of Google ML Kit Text Recognition v2 through the
local `modules/hanzi-photo-ocr` Expo module;
web uses Tesseract.js. Mobile recognition requires a new native build and is
unavailable in Expo Go.

On first launch the app suggests a supported language from the browser locale and asks the learner to confirm it. The language can be changed later in Settings. A change first downloads and validates the target dictionary, then atomically updates the language and saved word meanings. Download failures leave the current language and study data untouched. Generated sentences are cleared after confirmation because their translations belong to the previous language; vocabulary and SRS progress are preserved.

Word meanings are remembered per language, so custom or dictionary-missing meanings return when the learner switches back.

HSK dictionaries are lazy-loaded from the fixed `/dictionaries/hsk-<language>.json` allowlist. Web uses same-origin paths; native uses the deployed HTTPS origin. The loader rejects oversized and malformed files; a stored language value can never become a download URL. Only the active or explicitly requested target dictionary is loaded. Imports merge by Hanzi while preserving study counters.

English card meanings and readings for the 4,991 HSK 2.0 forms come from
`frontend/src/data/hsk-english-card-glosses.json`. The complete CC-CEDICT
dictionary remains available for all other words. Run
`npm run apply:dictionary:en-cards` and `npm run validate:hsk-data` after editing
the curated set. A full `npm run build:dictionary` downloads the current
CC-CEDICT release, which can also change unrelated rows.

Russian meanings are original translations prepared manually by the developer,
with normalized aliases and corrections in
`frontend/src/data/hsk-russian-supplement.json`. Rebuild them with
`npm run build:dictionary:ru`.

The HSK 2.0 level sets and English dictionary are generated from the pinned
complete-hsk-vocabulary release. The level sets contain all 4,991 distinct written
forms behind the 5,000 syllabus entries; repeated forms with different parts of
speech are intentionally represented once because decks are keyed by Hanzi.
Validation requires every selectable HSK form in every bundled learner dictionary.
Rebuild and validate all generated vocabulary assets with `npm run build:hsk-data`.
The individual level, English, and Russian build scripts remain available for adding
or updating learner-language assets independently.

The English dictionary combines complete HSK 2.0/3.0 vocabulary with the full
CC-CEDICT release. Dictionary meanings are resolved offline first. When a saved
word is still missing during a language change, a configured DeepSeek key
provides a best-effort translation that is cached on-device. Rebuild the English
asset with `npm run build:dictionary`; attribution is in
`frontend/third-party/CC-CEDICT-NOTICE`.

The in-app Legal & Credits screen lists licenses, exact source links, and
runtime AI disclosures. `npm run legal:generate` verifies pinned artifact
hashes and generates the full production dependency license report in
`public/legal`.
