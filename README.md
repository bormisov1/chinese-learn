# Hanzi Deck

## [Production](https://zh.x.bormisov.com) · [Development](https://dev.zh.x.bormisov.com)

An Expo frontend and one Bun/SQLite backend for Chinese vocabulary study.

| Directory | Purpose |
| --- | --- |
| [`frontend/`](frontend/) | Expo routes (`app/`), client code (`src/`), static assets, dictionaries, data scripts, and native build config |
| [`backend/`](backend/) | The sole HTTP server (`src/server.ts`), API tests, SQLite data, server deployment files, observability, and backend docs |
| [`scripts/deploy-web.sh`](scripts/deploy-web.sh) | VPS web deployment entry point required by the project workflow |

The name `backend` refers only to the Bun service. The frontend HTTP adapter is
[`frontend/src/api-client.ts`](frontend/src/api-client.ts); it sends requests to
that service and does not run another server. Nginx serves the exported Expo web
app and proxies `/api/` and `/v1/` to the Bun service.

## Local development

```bash
cd frontend
npm ci
npm run web
```

```bash
cd backend
cp .env.example .env
bun run dev
```

See [`frontend/README.md`](frontend/README.md) for app and dictionary details and
[`backend/README.md`](backend/README.md) for API setup.

## Checks

Run `npm test`, `npm run typecheck`, and `npm run build:web` from `frontend/`.
Run `bun test` from `backend/`.

## Web deployment

Pushes to any branch run `.github/workflows/web-deploy.yml`. Its dedicated
SSH key invokes `scripts/ci-deploy-web.sh` on the VPS, which fetches the exact
pushed commit and runs `scripts/deploy-web.sh` from that branch's worktree.
`dev` deploys to `https://dev.zh.x.bormisov.com`, `master` to
`https://zh.x.bormisov.com`, and other branches to a hostname based on their
branch name (for example, `feat/cards` becomes
`https://feat-cards.zh.x.bormisov.com`). The script also publishes the backend
architecture page from `backend/docs/`. The web build uses committed HEAD only.
The deploy scripts are VPS-only; they need the server's Node 22.13.0, Nginx,
Certbot, and sudo environment. The workflow requires the repository secret
`WEB_DEPLOY_SSH_KEY`, paired with a VPS `authorized_keys` entry restricted to
the installed CI deploy command. Branch pushes deploy web assets; backend
service restarts remain a separate step after backend code changes.
# iOS TestFlight CI

The GitHub Actions workflow in `.github/workflows/ios-testflight.yml` builds the iOS app on a standard macOS runner and uploads it to TestFlight whenever `master` receives a commit (including a merge from `dev`). Builds of this workflow queue behind earlier iOS builds. It can also be started manually from the Actions tab. The workflow uses Expo prebuild locally on the runner, without EAS Build or EAS Submit.

The repository needs these GitHub Actions secrets from an App Store Connect Team API key: `ASC_KEY_ID`, `ASC_ISSUER_ID`, and `ASC_API_KEY_P8` (the full downloaded `.p8` contents). Keep the key out of the repository. The Linux credentials job checks them before reserving a macOS runner.

Pull requests to `dev` run `.github/workflows/ios-verify.yml`, which compiles an unsigned iOS Simulator build. It needs no Apple secrets.
