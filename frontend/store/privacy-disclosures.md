# Store privacy disclosure checklist

Use this checklist with the current Apple App Privacy and Google Play Data safety
forms. Store definitions and SDK behavior change; verify every answer at release.

## Developer account and sync

- Contact/account identifiers: name, email address and/or Google/Telegram user ID,
  avatar; account management and app functionality.
- User content and app activity: vocabulary, sentences, study progress, review
  history; app functionality and cross-device sync.
- Transport encryption: yes. Account/data deletion: in-app or contact route stated
  in `public/privacy.html`.

## DeepSeek — optional, user initiated

- User content sent directly from the device: study words/sentences, submitted
  answers, and chat messages included in prompts.
- Purpose: app functionality. Output: practice sentences/translations,
  evaluations/corrections/feedback, explanations, missing-word translations,
  chat replies/titles, and word suggestions.
- User supplies the API key; it remains on-device and is excluded from backups.

## RevenueCat / stores

- App user identifier, product/transaction details, purchase/subscription status,
  device/app information, and diagnostics used for purchases, restore, entitlement
  management, and account management.
- Classify service-provider processing according to each store's current rules.

## Google ML Kit — native recognition

- Handwriting strokes, images, recognized text, and recognition results stay on
  device and are not sent to Google by ML Kit.
- SDK technical collection: device/app information, per-installation identifiers,
  configured language for digital ink, performance and usage metrics, API
  configuration, input/output sizes, feature versions, event types, and error codes.
- Purpose: diagnostics and usage analytics. Encrypted in transit; Google states it
  is not transferred to third parties.
- Sources: <https://developers.google.com/ml-kit/terms> and
  <https://developers.google.com/ml-kit/android-data-disclosure> (Google Play)
  and <https://developers.google.com/ml-kit/ios-data-disclosure> (App Store).

## Web recognition

- HanziLookup and Tesseract.js process strokes/images locally.
- Browser downloads and caches recognizer/language model files from the app/CDN;
  account for ordinary hosting/CDN network logs in the web privacy inventory.

## Advertising

- No ads, advertising trackers, or sale of personal data.
