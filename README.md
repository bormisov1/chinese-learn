# Hanzi Deck

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

After merging a feature PR into `dev`, connect to the VPS, update its checkout
of `dev`, and run `./scripts/deploy-web.sh` there. The script builds committed
HEAD from `frontend/` and deploys the web export to
`https://dev.zh.x.bormisov.com`. It also publishes the backend architecture
page from `backend/docs/`. `master` targets `https://zh.x.bormisov.com`.
The script is VPS-only; it needs the server's Node 22.13.0, Nginx, Certbot,
and sudo environment.
