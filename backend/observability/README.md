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

iOS card rounds also send two `card_transition_timed` events: `round_start`
records the time from pressing Start until two frames after the first card
commits; `round_summary` records the average and worst card transition, plus
the worst time to receive the native swipe callback, the worst time from that
callback until the next screen is ready, and the last card's completion time.
The app sends these only after the measured frame and flushes them to the
backend, so the measurement does not wait for telemetry. The values are stored
in `analytics_events.properties_json`
and exported as `card_transition_seconds` histograms by stage. No word or
answer data is included.
