# Gut Check

Verify how good your gut actually is.

- **Decision journal.** Write down a decision and what you expect to happen. Months later Gut Check asks how it turned out and scores your judgment, separating good decisions from good luck.
- **Prediction tracker.** Log predictions with a confidence level and see how well calibrated you are (calibration chart, Brier score, over/underconfidence).
- **Devil's advocate (optional).** A polite, well-reasoned counterargument from a local AI model, in one of six skins with their own personalities: Pip the half-angel half-devil sprite, The Tribunal, Old Mort the grumpy mentor, Prosecutor Hale, Professor Hoot the owl, or Classic. Works offline too, with a built-in advocate.

**Full instructions: [docs/USER-GUIDE.md](docs/USER-GUIDE.md)** (how to use it, how to run it, and what every installed piece is for).

## Two ways to run it

| | **GitHub Pages** | **Your Ubuntu server (Docker)** |
|---|---|---|
| Address | https://ryelikebread.github.io/gut-check/ | `http://your-server:8801` |
| Data | In each browser only (backup/restore by file) | On the server, synced across devices, with automatic backups |
| Review reminders | In the app, plus calendar files | Also phone push (ntfy), email or chat webhook, and a live calendar feed |
| Devil's advocate | Built-in advocate, or your server / your own Ollama | Local AI model (Ollama, default `qwen3:8b`, changeable in Settings), nothing leaves the machine |

### Server quick start
```sh
git clone https://github.com/ryelikebread/gut-check.git
cd gut-check
cp .env.example .env        # optional: set SYNC_TOKEN, TZ, reminders, model
docker compose up -d --build
```
Open `http://your-server:8801`. The first start downloads the AI model (about 5 GB for `qwen3:8b`); the app works straight away and the devil's advocate uses its built-in version until the model is ready. NVIDIA GPU: add `-f docker-compose.gpu.yml`. Already run Ollama on the server: `docker compose -f docker-compose.host-ollama.yml up -d --build` (uses your models, see the user guide). No AI: `docker compose -f docker-compose.no-ai.yml up -d --build`.

### Without Docker
```sh
npm start          # Node 18+, no npm install needed; data goes to ./data
```

### Development
```sh
npm test           # 22 tests: scoring, sync merge, skins, server, reminders, Ollama proxy, model picker
python3 -m http.server 8801 -d public    # static copy, no server features
```

## Repo layout

| Path | Purpose |
|---|---|
| `public/` | The whole web app (no build step). This folder is what GitHub Pages serves. |
| `public/lib/core.js` | Scoring, calibration, sync merge rules, calendar/CSV export. Shared with the server. |
| `public/lib/devil.js` | Devil's advocate engine: prompt building, reply parsing, built-in offline advocate. |
| `public/skins/*.js` | One file per devil's advocate skin (look, personality, wording). |
| `server/server.js` | Server: sync API, backups, reminders, Ollama proxy. Node standard library only. |
| `server/mailer.js` | Tiny SMTP client for reminder emails. |
| `docker-compose*.yml`, `Dockerfile*`, `nginx.conf` | Server, GPU, HTTPS, host-Ollama, no-AI and static setups. |
| `.github/workflows/pages.yml` | Runs the tests, then publishes `public/` to GitHub Pages. |
| `tests/` | `node --test` suites and a fake Ollama used by them. |

## Licence
MIT.
