# Hanzi Deck observability

The backend exposes `/metrics` for Prometheus and accepts privacy-safe client
events at `POST /v1/telemetry/batch`. Events are stored in the backend SQLite
database for durable deduplication, while counters are exported to Prometheus.

Start the local observability stack from this directory:

```sh
docker compose up -d
```

Grafana is available at `http://127.0.0.1:3000`; the default credentials are
`admin` / `change-me` unless overridden with `GRAFANA_ADMIN_USER` and
`GRAFANA_ADMIN_PASSWORD`. Prometheus scrapes the dev backend on port 8787.

Tracked client events include regular and first app opens, login lifecycle,
first-time and later language switches, manual/automatic mode selection, word
additions, card reviews, sentence/listening/mix completions, and card round
starts/completions. Round number, mode, language and bounded result dimensions
are retained. Telegram login telemetry additionally stores the verified chat ID,
full name, and username as requested; learner text, words, answers, and API
keys are not collected.
