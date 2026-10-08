# Google Play submission guide — Hanzi Deck

Everything app-side is prepared in this repo. This file lists what the repo already
contains, the one-time Play Console steps only the account owner can do, and the
exact build/submit commands.

## What the repo already contains

- `app.json` — Android app config: package `com.bormisov.hanzideck`, adaptive icon
  (foreground layer + `#F7C07C` background color), splash screen, minimal
  permissions (`[]`, only `INTERNET` ends up in the manifest).
- `assets/adaptive-icon-foreground.png`, `assets/splash-icon.png` — generated from
  `assets/icon.png` by `scripts/build-store-assets.py` (rerun it if the icon changes).
- `store/play/play-icon-512.png` — 512×512 Play Store icon.
- `store/play/feature-graphic-1024x500.png` — 1024×500 feature graphic.
- `public/privacy.html` — privacy policy, published at
  `https://zh.x.bormisov.com/privacy.html` (dev: `https://dev.zh.x.bormisov.com/privacy.html`).
- `eas.json` — `production` profile builds an AAB with auto-incrementing
  `versionCode`; `submit.production.android` points at a local service-account key.

Phone screenshots are still needed (see below).

## One-time steps only you can do (Play Console)

1. **Google Play Developer account** — register at
   <https://play.google.com/console> ($25 one-time registration fee) and complete
   identity verification (can take a few days).
2. **Create the app** — "Create app", name `Hanzi Deck`, default language English,
   *App* (not game), free.
3. **App access** — all functionality is available without special access
   (sign-in is via Google/Telegram but is standard OAuth, no demo credentials needed).
4. **Content rating questionnaire** — Education app, no user-generated content that
   is shared between users, no violence/gambling/etc. Expected rating: *Everyone*.
5. **Target audience** — 13+ (do NOT select child audiences; that would trigger the
   Families policy requirements).
6. **Data safety form** — answers matching `public/privacy.html`:
   - Collected: email address and/or user ID (account management — app
     functionality); app interactions / study progress stored on the developer's
     server (app functionality).
   - Shared with third parties: No.
   - Data encrypted in transit: Yes. Deletion mechanism: Yes (in-app + privacy policy).
   - AI chat/explanations: text is sent **from the device directly** to the AI
     provider (DeepSeek) using the user's own API key; the developer's server does
     not receive it.
7. **Privacy policy URL** — `https://zh.x.bormisov.com/privacy.html`.
   (Deploy this repo's `dev` → `master` first so the production URL is live.)
8. **Screenshots** — at least 2 phone screenshots, min 320px, max 3840px, 16:9 or
   9:16. Capture the real app on a device/emulator, or reuse polished web captures;
   drop them in `store/play/` alongside the other assets.
9. **Service account for automated submission** (optional but recommended):
   - Play Console → Users and permissions → invite a service account, grant it
     *Release to testing tracks*.
   - Create the JSON key and save it to `play-store/service-account.json` at the
     repo root (git-ignored). `eas.json` points at that path.

## Build and submit

```bash
cd frontend
eas build -p android --profile production   # produces the .aab, auto-increments versionCode
eas submit -p android --latest --track internal   # uploads it to the internal testing track
```

Without the service account, download the `.aab` from the EAS dashboard and upload
it manually in Play Console (Testing → Internal testing → create release).

Internal testing first: add yourself as a tester, install, then promote to
production (or closed testing) once happy. New personal developer accounts require
**12 testers for 14 days** in closed testing before production access — plan for that.
