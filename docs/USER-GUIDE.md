# Gut Check — User Guide

Gut Check is a journal for your judgment. You write down decisions and predictions with how sure you are, it checks back later to ask how things turned out, and it scores you. An optional devil's advocate argues the other side before you commit.

- [1. Getting started](#1-getting-started)
- [2. Recording a decision](#2-recording-a-decision)
- [3. Making a prediction](#3-making-a-prediction)
- [4. When it checks back (reviews)](#4-when-it-checks-back-reviews)
- [5. Your scores](#5-your-scores)
- [6. The devil's advocate](#6-the-devils-advocate)
- [7. Reminders](#7-reminders)
- [8. Your data, backups and sync](#8-your-data-backups-and-sync)
- [9. Running it on your Ubuntu server](#9-running-it-on-your-ubuntu-server)
- [10. The local AI model](#10-the-local-ai-model)
- [11. The GitHub Pages copy](#11-the-github-pages-copy)
- [12. Making a new skin](#12-making-a-new-skin)
- [13. What's installed and why](#13-whats-installed-and-why)
- [14. Troubleshooting](#14-troubleshooting)
- [15. Server API reference](#15-server-api-reference)

---

## 1. Getting started

Open Gut Check at one of:

- **GitHub Pages:** https://ryelikebread.github.io/gut-check/ (data stays in that browser)
- **Your server:** `http://your-server:8801` (data is saved on the server and shared by all your devices)

On a phone, use the browser's **Add to Home Screen / Install app** to get an app icon. It works offline (over https).

The five tabs along the bottom:

| Tab | What it's for |
|---|---|
| **Today** | Reviews that are due ("Time to check in"), your headline scores, and what's coming up. A badge on the tab shows how many reviews are due. |
| **New** | Record a decision or make a prediction. |
| **Journal** | Everything you've logged. Search, and filter by type (decisions/predictions) and status (due, open, done). Tap an entry for details. |
| **Scores** | Judgment score, calibration chart, Brier score and the luck-or-skill grid. |
| **Settings** | Devil's advocate (on/off, skin, which AI), reminders, server sync, backups, theme. |

## 2. Recording a decision

**New → Decision**, then fill in:

| Field | Tips |
|---|---|
| **What did you decide?** | One line, e.g. "Take the job offer in Denver". Required. |
| **The situation** | Context: what's going on, what's at stake. |
| **Options you considered** | The alternatives you didn't pick. The devil's advocate will notice if this is empty. |
| **Why this one?** | Your reasons, briefly. |
| **What do you expect to happen?** | The prediction inside the decision. Make it checkable ("earning 20% more within a year", not "it'll be good"). You'll be asked later whether this came true. |
| **How sure are you?** | Slider from 1% to 99%. The word next to the number ("Likely", "Near certain"...) helps you pick honestly. |
| **When should I ask you?** | 1 week, 1 month, 3 months, 6 months, 1 year, or any date. |
| **Stakes** | Low, medium or high. |
| **Tags** | Optional, comma separated (work, money, health...). |

Press **Save to journal**. If the devil's advocate is on, you can press **Argue with me first** before saving; the counterargument is saved with the entry. Unsaved typing is kept as a draft if you leave the page.

## 3. Making a prediction

**New → Prediction**: write the prediction so it will be clearly true or false later ("The project ships before March 1"), optionally why you think so, how likely it is (1–99%), and when you'll know. Below 50% means you think it *won't* happen; that's fine and scored correctly.

## 4. When it checks back (reviews)

When an entry's date arrives it shows under **Today → Time to check in**, the Today tab gets a badge, and (if set up) your server sends a reminder.

Press **How did it turn out?** and answer:

**Decisions**
1. **Did what you expected happen?** Yes / Partly / No.
2. **How did things turn out for you overall?** 1 (terrible) to 5 (great).
3. **Knowing only what you knew back then, how good was the decision?** 1 (bad call) to 5 (excellent). Judge the decision, not the luck.
4. **What did you learn?** Optional.

**Predictions:** Yes / No / **Can't tell** (ambiguous outcomes are marked "can't tell" and left out of your scores), plus optional notes.

You'll immediately see your score for that entry. Not ready yet? **Too early to tell / Not yet / Postpone** asks again in 1 week, 2 weeks, 1, 3 or 6 months. You can also **Review early** from an entry's page, and **Undo review** if you made a mistake.

## 5. Your scores

**Forecast score (0–100)** for one entry = 100 × (1 − (p − o)²), where *p* is how sure you were and *o* is what happened (1 = yes, 0.5 = partly, 0 = no).

| You said | It happened | It didn't |
|---|---|---|
| 50% | 75 | 75 |
| 70% | 91 | 51 |
| 90% | 99 | 19 |
| 99% | 100 | 2 |

So a "50%" shrug always gets 75. Beating 75 consistently means your gut adds information; being very sure and wrong is punished hard.

### The judgment score and the hindsight rating

Your **hindsight rating** is question 3 in the review: *"Knowing only what you knew back then, how good was the decision?"* from 1 (bad call) to 5 (excellent). It is your own verdict on the **decision**, separate from how things turned out. It counts as 0, 25, 50, 75 or 100 points for 1, 2, 3, 4 or 5.

The **judgment score** for one decision is half and half:

> **Judgment = 50% forecast score + 50% hindsight points**

- The **forecast score** (above) is how well your confidence matched what happened. It rewards being right *and* being appropriately sure.
- The **hindsight points** are your honest rating of the quality of the thinking: did you gather what you could, weigh the options, avoid wishful thinking?
- The **"how did it turn out for you" rating (question 2) is not in the judgment score.** It only places the decision on the luck-or-skill grid, so a lucky win can't inflate your judgment.
- *Partly* counts as 0.5 for the forecast score. *Can't tell* and decisions you haven't reviewed are left out.
- **Predictions** have no hindsight rating, so a prediction's score is just its forecast score.
- The big number on Scores is the **average over all reviewed decisions**.

Worked examples (you were 80% sure):

| What happened | Hindsight | Forecast | Judgment | Grid label |
|---|---|---|---|---|
| It worked out | 4/5 (good call) | 96 | **86** | Earned it |
| It didn't work out | 4/5 (good call) | 36 | **56** | Bad luck: the thinking was sound, the dice weren't |
| It worked out | 2/5 (shaky) | 96 | **61** | Dumb luck: it worked, but don't count on it |
| It didn't work out | 2/5 (shaky) | 36 | **31** | Lesson |

How to use it honestly: rate the decision on what you knew **at the time**, before you look at the result. A bad outcome from a well-made decision should still get a 4 or 5, and a lucky win from a sloppy one a 1 or 2. Over many decisions the judgment score rises when you decide well and forecast well, not just when you win. A steady run of "Dumb luck" is a warning that your good results aren't coming from good process.

**Calibration score** = average forecast score over everything resolved (decisions and predictions). **Brier score** is the same idea on the usual 0–1 scale where lower is better and 0.25 is a coin flip.

**Calibration chart:** your forecasts grouped by the confidence you gave (0–10%, 10–20% ... 90–99%). Each dot shows how often things in that group came true; bigger dots have more entries. On the dashed line = well calibrated. Below the line = overconfident (you said 80%, it happened 60% of the time). Hover or tap a dot for the numbers, or open **Show as a table**. Filter by All / Decisions / Predictions.

**Over/underconfidence line:** your average confidence in the side you picked, compared with how often that side was right.

### How good and bad luck are decided (the "Luck or skill?" grid)

Each reviewed decision is sorted using **two ratings you gave in the review**, and nothing else:

- **Was it a sound decision?** Your **hindsight rating** (question 3: how good the decision was, knowing only what you knew then). **3, 4 or 5 = sound. 1 or 2 = shaky.**
- **Was the result good?** Your answer to *"How did things turn out for you overall?"* (question 2). **3, 4 or 5 = good result. 1 or 2 = poor result.**

The midpoint counts in your favour: **3 out of 5 is "sound" and 3 out of 5 is "good".**

| | **Good result** (3–5) | **Poor result** (1–2) |
|---|---|---|
| **Sound decision** (3–5) | **Earned it**: you decided well and it paid off. | **Bad luck**: you decided well, it didn't work out. Don't change your method. |
| **Shaky decision** (1–2) | **Dumb luck**: it worked, but the thinking was thin. Don't count on repeating it. | **Lesson**: shaky thinking, poor result. The one to learn from. |

Things worth knowing:

- **It is your own judgment, not a calculation.** Gut Check doesn't decide what was luck; it places the decision where your two ratings put it. So the labels are only as honest as the ratings. Rate the decision before you look at the result, as described above.
- **The yes / partly / no question ("did what you expected happen?") isn't used here.** It only feeds the forecast score. That is why a decision can be "Bad luck" even though you were confident and it didn't happen: what matters is that you rated the thinking sound.
- Only **decisions** appear in the grid, and only once **both** ratings are filled in. Predictions, entries you marked "Can't tell", and open entries aren't counted.
- The grid and the judgment score are separate. The result rating only places a decision in the grid. The hindsight rating feeds both.
- Changing your mind later (Undo review, then review again) re-sorts the decision.

## 6. The devil's advocate

Optional, and nothing is sent anywhere unless you press a button. Turn it on or off in **Settings → Devil's advocate**.

- **Argue with me first** on the New page, or **Argue with me / Argue again** on an entry's page.
- **Challenge me automatically after saving** (Settings) runs it every time you save a new entry.
- Every counterargument is saved with the entry (newest shown, older ones under "Earlier counterarguments"), along with the confidence you had at the time.

It always tries to: acknowledge what's sensible, argue the strongest honest case against you (how things like this usually go, what you might be missing, what would have to be true), suggest one cheap check before committing, and suggest a fairer confidence if yours looks too high or low. It never tells you what to decide.

### Skins

Pick one in **Settings → Skin**; **Preview this skin** shows it on a sample decision. Each skin has its own look *and* personality, both when the AI model writes the answer and in the built-in offline version.

| Skin | Look | Personality |
|---|---|---|
| **Pip (angel & devil)** | A bobbing sprite, half angel (halo) and half devil (horn and tail); speech bubbles from each side. | The two halves bicker. The Devil is gleeful, theatrical and teasing ("Ooh", "darling", "heh"); the Angel is earnest, a bit prim ("now, now"), defends you and lands on something practical. |
| **The Tribunal** | Three justices at a wooden bench; they sway while "deliberating", and the speaker lights up. Ends with a highlighted **Ruling**. | Formal court. Chief Justice Marlow presides and rules ("the record", "precedent"). Justice Vance is the dry skeptic who cross-examines your confidence. Justice Okafor is the warm pragmatist thinking about people, consequences and alternatives. They address each other and call you "the petitioner". |
| **Old Mort (grumpy mentor)** | Old man with glasses and a moustache. | Gruff, short sentences, "Hmph", calls you "kid", one-line war stories ("Knew a fella in '89..."), allergic to wishful thinking; kind underneath. |
| **Prosecutor Hale** | Barrister in a wig. | Sharp cross-examination: "Isn't it true that...?", points as Exhibit A, B, C, "I rest my case." Courteous to "the defendant". |
| **Professor Hoot (wise owl)** | Owl in a mortarboard. | Calm, Socratic: argues mostly through gentle questions and forest metaphors. Starts with "Hoo." Never lectures. |
| **Classic** | Plain card. | Even-handed friend, no theatrics. |

### Where the counterargument comes from ("Brains")

**Settings → Brains** decides which AI writes it:

| Option | What happens |
|---|---|
| **Automatic** (default) | Your Gut Check server's local model if the app is connected to one and the model is ready; otherwise Ollama directly if you've entered an address; otherwise the built-in advocate. |
| **My Gut Check server's local model** | Always the server. |
| **Ollama directly** | The browser talks to an Ollama address you enter (see [11](#ollama-directly-from-the-browser)). |
| **Built-in advocate only** | No AI. Gut Check picks the most relevant challenges for your entry (your past calibration at that confidence, a pre-mortem, missing alternatives, thin reasoning, base rates, vague expectations, high stakes) and words them in the skin's voice. Instant, private, always available. |

If the AI can't be reached or takes over 4 minutes, you get the built-in advocate with a note saying why. **Test the connection** checks the current choice. Each answer shows its source ("Local model · qwen3:8b" or "Built-in advocate").

### Changing the AI model from the app

Under Brains, the **AI model** box shows which model is in use and which ones are downloaded. It manages the model on your Gut Check server, or, if you use Ollama directly from the browser, that Ollama.

- **Use** switches to a model that's already downloaded. It takes effect at once.
- **Get another model**: type a name (or tap one of the suggestions to fill it in), then **Download and use**. A progress bar shows the download, and **Cancel** stops it. The current model keeps answering until the new one has finished, then Gut Check switches over by itself. Any model from [ollama.com/library](https://ollama.com/library) works; type the name and tag, like `qwen3:4b`.
- **Remove** deletes a downloaded model to free disk space. The model in use can't be removed; switch first.

On the server the download keeps going if you close the page, only one download runs at a time, and the choice is saved in `/data/settings.json`, so every device uses it and it survives restarts and updates. It overrides `DEVIL_MODEL` in `.env`, which is only the starting default. With Ollama directly, the download runs in the browser, so keep the page open until it finishes, and the choice is kept in that browser only. See [Choosing a model](#choosing-a-model) for which model suits your hardware.

## 7. Reminders

- **In the app:** due reviews appear on Today, with a badge on the tab and a short message when you open the app.
- **Calendar file:** an entry's **Add to calendar** button, or **Settings → Reminders → Download calendar file**, gives you an `.ics` file with an all-day event on each review date (with an alert). Works with Google Calendar, Apple Calendar and Outlook, from either copy of the app.
- **From your server** (needs settings in `.env`, see [9](#settings-env)): at `REMINDER_HOUR` (default 9:00 in `TZ`) the server sends one message listing everything that has become due, by any of:
  - **Phone push with ntfy**: install the free ntfy app, subscribe to a topic with a long random name, set `NTFY_URL=https://ntfy.sh/that-topic`. Tapping the notification opens Gut Check (set `APP_URL`).
  - **Email**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `REMINDER_EMAIL_TO`. For Gmail use port 587 and an [app password](https://myaccount.google.com/apppasswords).
  - **Chat webhook**: `WEBHOOK_URL` gets a JSON POST with `text` (Slack/Mattermost) and `content` (Discord) fields.
  - Each entry is announced once per review date; if still unreviewed you get a nudge every `REMINDER_REPEAT_DAYS` (default 7, 0 = never).
  - **Settings → Reminders → Send a test reminder** checks your setup.
- **Live calendar feed (server):** **Copy calendar subscription link** gives `http://your-server/api/calendar.ics` (with `?key=` your sync password if you set one). Subscribe to it in your calendar app and review dates stay up to date. Your calendar provider must be able to reach the server, so this suits a server with a public https address; Google Calendar refreshes feeds only every few hours.

## 8. Your data, backups and sync

**Where it lives**
- Always in the browser you're using (localStorage), so Gut Check works offline.
- On your server too, when the app is served by it or connected to it (Settings → Server).
- Device-only settings (theme, skin, devil's advocate options, Ollama address) are not synced.

**Backups**
- **Settings → Your data → Download backup (.json)**: everything, in one file. **Restore / import** adds a backup's entries to what's there (it never deletes; for the same entry, the most recently edited copy wins).
- **Export spreadsheet (.csv)**: one row per entry with scores, for Excel/Sheets.
- **Server backups:** the server writes `backups/state-YYYYMMDD-HHMMSS.json` (UTC) after changes, at most every 10 minutes (`BACKUP_MIN_INTERVAL_MIN`), plus one on shutdown. It keeps the newest 500 (`BACKUP_KEEP`) and one per day for 90 days. **Back up on server now** and **Download latest server backup** are in Settings → Server. To copy them off the server: `docker cp gut-check:/data/backups ./gut-check-backups`.
- **Erase everything** asks you to type ERASE, and also erases it on the server and your other synced devices.

**How sync works.** On open, every 30 seconds while the app is visible, and a second after each change, the app downloads the server copy, merges it with its own, and uploads the result. Entries are matched by id; when the same entry was changed on two devices, the most recent edit wins; deletions are remembered so a deleted entry doesn't come back. If two devices upload at once the server rejects the older one and the app merges again, so nothing is overwritten. The badge at the top right shows **Synced**, **Syncing** or **Sync problem** (tap it for details).

## 9. Running it on your Ubuntu server

### What you need
- Ubuntu 22.04 or newer with **Docker Engine** and the **compose plugin**. If you don't have them:
  ```sh
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker $USER     # then log out and back in
  ```
- For the AI model: about **8 GB of free RAM** and **10 GB of disk** for the default `qwen3:8b` (see [10](#10-the-local-ai-model) for lighter and heavier options).

### Install
```sh
git clone https://github.com/ryelikebread/gut-check.git
cd gut-check
cp .env.example .env
nano .env                # optional: uncomment and set what you want (see below)
docker compose up -d --build
```
Open `http://<server-ip>:8801`. On the very first start the server downloads the model in the background (watch it with `docker compose logs -f gut-check`, or see "Now using" in Settings). Until it's ready the devil's advocate uses the built-in version.

### Settings (.env)
| Setting | Default | What it does |
|---|---|---|
| `PORT` | 8801 | Port on the server. |
| `TZ` | UTC | Your time zone, e.g. `America/Denver`; used for reminder timing. |
| `SYNC_TOKEN` | (none) | Password for the sync API. The app asks for it once per device (Settings → Server). Strongly recommended if anyone else can reach the port. |
| `APP_URL` | (none) | The address you open Gut Check at; used for links in reminders and calendar events. |
| `CORS_ORIGIN` | (none) | Lets other sites call the API, e.g. `https://ryelikebread.github.io` for the Pages copy. |
| `DEVIL_MODEL` | qwen3:8b | The starting model. Once you pick one in the app (Settings → Brains → AI model), that choice wins. |
| `DEVIL_AUTO_PULL` | 1 | Download the model automatically if missing (retries every 5 minutes on failure). |
| `DEVIL_TIMEOUT_SEC` | 300 | Give up on one answer after this long. |
| `DEVIL_MAX_TOKENS` | 900 | Longest answer, in tokens. |
| `OLLAMA_URL` | http://ollama:11434 | Where Ollama is. The default is the Ollama bundled in Docker. With `docker-compose.host-ollama.yml` it is `http://127.0.0.1:11434` (your own). Point it at an Ollama on another machine if you like. |
| `REMINDER_HOUR` | 9 | Hour of day (0–23) reminders go out. |
| `REMINDER_REPEAT_DAYS` | 7 | Nudge again about an unreviewed entry after this many days. |
| `NTFY_URL`, `NTFY_TOKEN` | | Phone push via ntfy. |
| `WEBHOOK_URL` | | Chat webhook. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `REMINDER_EMAIL_TO` | | Email. `SMTP_SECURE` is `tls` (port 465), `starttls` (587, default) or `none` (local relay). |
| `BACKUP_MIN_INTERVAL_MIN`, `BACKUP_KEEP` | 10, 500 | Backup frequency and how many to keep. |
| `OLLAMA_IMAGE` | ollama/ollama:latest | Pin a specific Ollama version if you want. |

After changing `.env`: `docker compose up -d` (add `--build` after pulling new code).

### Variants
| Command | When |
|---|---|
| `docker compose up -d --build` | Normal: app + local AI. |
| `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up -d --build` | You have an NVIDIA GPU (needs the [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html)). Answers in seconds instead of a minute. |
| `docker compose -f docker-compose.host-ollama.yml up -d --build --remove-orphans` | You already run Ollama on the server (outside Docker) and want to use it and its models. See [Using an Ollama you already have](#using-an-ollama-you-already-have). |
| `docker compose -f docker-compose.no-ai.yml up -d --build` | No AI: sync, backups and reminders only; the built-in advocate still works. |
| `DOMAIN=gutcheck.example.com docker compose -f docker-compose.https.yml up -d --build` | Public https with automatic certificates (Caddy). Needs a domain pointing at the server and ports 80/443 open. Set `SYNC_TOKEN`. |
| `docker compose -f docker-compose.static.yml up -d --build` | Just the static web app (nginx), like GitHub Pages. |
| `npm start` (Node 18+) | Without Docker; data goes to `./data`. Set `OLLAMA_URL=http://localhost:11434` if Ollama runs on the host. |

**HTTPS without a domain:** install [Tailscale](https://tailscale.com) on the server and your devices, then `tailscale serve --bg 8801`; you get `https://<server>.<tailnet>.ts.net`, private to your devices. https is what lets phones install the app and lets the GitHub Pages copy connect.

### Updating
```sh
cd gut-check && git pull && docker compose up -d --build
```
Your journal and the model are in Docker volumes, so they survive updates. To update Ollama itself: `docker compose pull ollama && docker compose up -d`.

### Everyday commands
```sh
docker compose ps                         # is it running?
docker compose logs -f gut-check          # app log (sync, backups, reminders, model download)
docker compose exec ollama ollama list    # installed models
docker compose restart gut-check
docker compose down                       # stop (data is kept)
```

## 10. The local AI model

The devil's advocate runs on **Ollama**, a program that runs open AI models on your own machine. Nothing you write leaves your server. The app sends Ollama your entry and the skin's personality, and streams the answer back as it's written.

### Choosing a model
The easy way is in the app: **Settings → Brains → AI model**, type or tap a name, and press **Download and use** (see [Changing the AI model from the app](#changing-the-ai-model-from-the-app)). You can also set `DEVIL_MODEL` in `.env`, but a model picked in the app takes priority. All of these are free to use.

| Model | Download | RAM needed | Speed on a typical CPU* | Notes |
|---|---|---|---|---|
| `qwen3:1.7b` | ~1.4 GB | 3–4 GB | 10–20 s | For very small machines. Arguments are thinner and multi-voice skins can get muddled. |
| `llama3.2:3b` | ~2 GB | 4 GB | 15–30 s | Small, quick, plain-spoken. |
| `qwen3:4b` | ~2.5 GB | 5–6 GB | 20–40 s | Lightest that still keeps characters straight. Good for small servers or a Raspberry Pi 5 (8 GB). |
| `gemma3:4b` | ~3.3 GB | 6 GB | 25–50 s | Writes well for its size. |
| **`qwen3:8b`** (default) | ~5 GB | 8 GB | 40–90 s | Best balance: strong reasoning and instruction following, handles multi-voice skins (Tribunal, Pip) well. Thinking mode is switched off for speed. |
| `llama3.1:8b` | ~5 GB | 8 GB | 40–90 s | Good alternative with a warmer, chattier style. |
| `gemma3:12b` | ~8 GB | 12–16 GB | 1.5–3 min (seconds on GPU) | Very good, natural writing; best with a GPU with 12 GB+. |
| `qwen3:14b` | ~9 GB | 16 GB | 2–3 min (seconds on GPU) | Sharpest arguments; GPU recommended. |

\* A full answer is 200–500 words. Times are rough guides for a recent 4–8 core CPU; a GPU makes any of these near-instant. The first answer after a while is slower because the model has to load (it stays loaded 15 minutes, `OLLAMA_KEEP_ALIVE`). Only one answer is generated at a time; others wait their turn.

Models are kept in the `ollama-models` volume. Remove one you no longer use with **Remove** in the app, or `docker compose exec ollama ollama rm <name>`.

### Using an Ollama you already have

By default Gut Check starts its **own** Ollama in Docker, with its own empty model storage. Models you downloaded onto the server yourself (for example with `ollama pull gemma3:4b`) live in *your* Ollama and are invisible to the bundled one, so asking for them in the app makes it download them again. To use the Ollama you already run, switch to the host-Ollama setup:

```sh
cd gut-check && git pull
docker compose down --remove-orphans                              # stop the bundled setup (your journal is kept)
docker compose -f docker-compose.host-ollama.yml up -d --build    # start Gut Check using your Ollama
```

1. Make sure your Ollama is running on the server: `curl http://127.0.0.1:11434/api/tags` should list your models (`ollama list` shows the same).
2. Run the three commands above. Your journal and settings are in the `gut-check-data` volume, which both setups share, so nothing is lost.
3. Open Gut Check, go to **Settings → Brains → AI model**. The first line should read **Connected to Ollama at `http://127.0.0.1:11434`** and your models, such as `gemma3:4b`, are listed. Tap **Use** on one. No download happens. (If the line says `http://ollama:11434`, it's still on the bundled one: repeat step 2.)
4. From then on you don't need `-f docker-compose.host-ollama.yml` typed out each time if you add `COMPOSE_FILE=docker-compose.host-ollama.yml` to `.env`; otherwise just keep using that `-f` option for `up`, `logs` and `down`.

How it works: this setup runs the app on the server's own network (`network_mode: host`) so `127.0.0.1:11434` is your Ollama, and it needs no change to Ollama's settings. Because of that, the app listens directly on `PORT` (default 8801) and the `ports:` mapping isn't used. Automatic downloads are off in this setup (`DEVIL_AUTO_PULL=0`), so Gut Check only downloads a model when you press **Download and use**; those downloads go into your Ollama, next to the models you already have. Model names are matched ignoring capitalisation, so `gemma3:4B` finds `gemma3:4b`.

- **Ollama on a different machine:** use the normal `docker-compose.yml` or this one and set `OLLAMA_URL=http://that-machine:11434` in `.env`; that Ollama must listen on the network (`OLLAMA_HOST=0.0.0.0`).
- **No Docker at all:** `OLLAMA_URL=http://127.0.0.1:11434 npm start`.
- **Using the bundled Ollama but want your existing models in it:** copy them in with `docker compose exec ollama ollama pull <name>` (re-downloads), or use the setup above instead.

### Removing downloaded models

**In the app (easiest):** Settings → Brains → AI model, then **Remove** next to the model. You can't remove the one in use, so tap **Use** on another first. This deletes it from whichever Ollama Gut Check is connected to (the first line of the box says which).

**From the command line, bundled Ollama (the normal setup):** the Ollama service is called `ollama` (container `gut-check-ollama`). Run these in the `gut-check` folder on the server:
```sh
docker compose exec ollama ollama list            # what's downloaded, with sizes
docker compose exec ollama ollama rm gemma3:4b    # remove one (use the name from the list)
```

**From the command line, your own Ollama** (the host-Ollama setup): just `ollama list` and `ollama rm gemma3:4b` on the server. Careful: that Ollama is shared, so this also removes the model for anything else you use it for.

**Freeing all the space at once (bundled Ollama only):** all models downloaded through Gut Check live in the `ollama-models` Docker volume. To delete every one of them:
```sh
docker compose down                       # stop (your journal is kept)
docker volume ls | grep ollama-models     # shows the exact name, usually gut-check_ollama-models
docker volume rm gut-check_ollama-models
docker compose up -d                      # starts again; downloads the model again if you still want AI
```
Your journal is in a different volume (`gut-check_gut-check-data`) and is not touched. Never run `docker compose down -v`: the `-v` also deletes the journal volume. To check what the volumes use: `docker system df -v`.

### Hardware
- **RAM** is what matters most: the table's figure is for the whole model plus Gut Check. If the server runs short, pick a smaller model.
- **GPU** (optional): NVIDIA with the container toolkit, using `docker-compose.gpu.yml`. AMD GPUs work with the `ollama/ollama:rocm` image (`OLLAMA_IMAGE=ollama/ollama:rocm` and pass `/dev/kfd` and `/dev/dri` to the ollama service; see Ollama's docs).
- **Disk:** the model size plus a little.

## 11. The GitHub Pages copy

The GitHub Pages copy is the same app, published automatically from the `public/` folder.

**One-time setup** (already done if the site loads): in the repo on GitHub go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**. Every push to `main` then runs the tests and publishes to **https://ryelikebread.github.io/gut-check/** (allow a few minutes; Pages caches for 10).

- **Data** stays in that browser. Use backup/restore to move it, or connect it to your server.
- **Privacy note:** every site under `ryelikebread.github.io` shares one browser storage area, so another page you host there could read Gut Check's saved data. Don't host untrusted pages on the same account.

### Connecting the Pages copy to your server
Gives it sync, backups, server reminders and the server's AI model.
1. The server must be reachable over **https** (an https page can't call an http address): use `tailscale serve`, `docker-compose.https.yml`, or your own reverse proxy.
2. In the server's `.env`: `CORS_ORIGIN=https://ryelikebread.github.io` (and a `SYNC_TOKEN`), then `docker compose up -d`.
3. In the Pages app: **Settings → Server**, enter the https address and the password, **Save & sync now**.

### Ollama directly from the browser
For when you don't run the Gut Check server but have Ollama on your own computer:
1. Install Ollama from https://ollama.com and pull a model: `ollama pull qwen3:8b`.
2. Allow the site to talk to it by setting `OLLAMA_ORIGINS` and restarting Ollama:
   - macOS: `launchctl setenv OLLAMA_ORIGINS "https://ryelikebread.github.io"` then quit and reopen Ollama.
   - Linux (systemd): `sudo systemctl edit ollama`, add `[Service]` / `Environment="OLLAMA_ORIGINS=https://ryelikebread.github.io"`, then `sudo systemctl restart ollama`.
   - Windows: add a user environment variable `OLLAMA_ORIGINS` with that value, then restart Ollama.
3. In Gut Check: **Settings → Brains → Ollama directly**, address `http://localhost:11434`, model `qwen3:8b`, **Test the connection**. Your browser may ask permission to access devices on your local network; allow it.

`http://localhost` works from the https site because browsers trust localhost. Ollama on *another* machine needs an https address (for example `tailscale serve` in front of port 11434) and that machine's `OLLAMA_ORIGINS` set the same way.

## 12. Making a new skin

A skin is one small JavaScript file in `public/skins/`. It defines the look, the personality the AI is given, and (optionally) how the built-in advocate words things.

1. Copy `public/skins/classic.js` to `public/skins/yourskin.js`.
2. Add `<script src="skins/yourskin.js"></script>` next to the other skins in `public/index.html`, and `"skins/yourskin.js"` to the `FILES` list in `public/sw.js` (and bump `VERSION` there). The tests check you didn't forget.
3. Fill it in:

```js
GutDevil.register({
  id: "pirate",                       // unique, lowercase
  order: 60,                          // position in the skin picker
  name: "Captain Doubt",
  blurb: "A salty old pirate who's seen many a sure thing sink.",
  stage: "single",                    // "single", or "pip"/"tribunal" to reuse those stages' visuals
  waiting: "The captain squints at the horizon…",
  words: 200,                         // length limit for the AI answer
  persona: "You are Captain Doubt, a weathered pirate captain... (who they are, tone, vocabulary, " +
           "how they push back, catchphrases, what they never do)",
  voices: [                           // one voice = monologue; two or more = a dialogue
    { id: "captain", name: "Captain Doubt", aliases: ["Captain"], color: "#7a3b10",
      avatar: '<svg viewBox="0 0 64 64">...</svg>' }
  ],
  // Optional: the built-in advocate's wording in this character's voice.
  lines: {
    ack: "Arr, there be sense in yer plan.",
    conf_high: d => `${d.side}% sure? Every captain who sank was that sure, matey.`,
    check: "Before ye sail, ask a sailor who took the other route."
  }
  // Optional: offline(raw) { return [{ voice: "captain", text: ... }] } to arrange the turns yourself.
});
```

**Tips for the personality (`persona`)**: say who the character is, their tone and vocabulary, *how* they push back (questions? exhibits? teasing?), a couple of signature phrases, and anything they must never do. The engine adds the shared rules (polite, specific, base rates, one cheap check, a fairer confidence, plain text). For several voices, the AI is told to write `Name: line` and the app turns those into speech bubbles; `closing` lets you say how the exchange should start or end (see `tribunal.js`).

**Built-in wording keys** (`lines`; for a multi-voice skin use `voiceLines: { voiceId: { ... } }`). Each value is a string, a function of the facts `d`, or a list of those (one is picked per entry). Anything you leave out uses the default wording in `public/lib/devil.js`.

| Key | When it's used |
|---|---|
| `ack` | Opening acknowledgement. |
| `conf_track_low` / `conf_track_ok` | You have 3+ past results at this confidence and were worse / about as good as you claimed. |
| `conf_high` / `conf_coin` / `conf_mid` | No track record yet; confidence 85%+ / near 50% / in between. |
| `flip` | A prediction you gave 30% or less. |
| `premortem` | "Imagine it went wrong..." |
| `options_none` / `options_some` | Decision without / with alternatives listed. |
| `reasoning_short` / `reasoning_long` | Little / plenty of reasoning written. |
| `baserate` | How things like this usually go. |
| `vague` | The expected outcome has no number or date. |
| `stakes` | High-stakes decision. |
| `check` | The one cheap check before committing. |
| `suggest` | The fairer confidence. |

Facts available as `d`: `c` (your confidence), `side` (confidence in the side you picked), `wrong` (100 − side), `r` and `n` (your past hit rate and count at this confidence), `when` (review date), `options`, `exp` (expected outcome), `title`, `kind`, `isDec`, `suggest`.

Run `npm test`, then open Settings → Skin → Preview.

## 13. What's installed and why

### On your server (Docker)
| Piece | Where it comes from | Why it's there |
|---|---|---|
| **Docker Engine + compose plugin** | get.docker.com | Runs everything below in containers, restarts it on boot (`restart: unless-stopped`). |
| **`gut-check` container** | Built from this repo on the `node:22-alpine` image (Node.js 22 on Alpine Linux, ~60 MB) | The Gut Check server (`server/server.js`): serves the web app, stores and syncs your journal, writes backups, sends reminders, and passes devil's advocate requests to Ollama. Uses only Node's built-in modules, no npm packages. Runs as the unprivileged `node` user. |
| **`gut-check-ollama` container** | `ollama/ollama` image (~1.5 GB) | Runs the local AI model. Only reachable by the app container, not published on the network. |
| **The AI model** (default `qwen3:8b`, ~5 GB) | Downloaded by Ollama from ollama.com's registry on first start | Writes the devil's advocate answers. Open-weights model (Qwen3 is Apache 2.0 licensed). |
| **`gut-check-data` volume** | Docker | `/data/state.json` (your journal), `/data/backups/` (timestamped copies), `/data/reminders.json` (which reminders were sent), `/data/settings.json` (the AI model picked in the app). |
| **`ollama-models` volume** | Docker | Downloaded models, so they aren't re-downloaded after updates. |
| **`caddy` container** (only with `docker-compose.https.yml`) | `caddy:2-alpine` | https with automatic Let's Encrypt certificates. Volume `caddy_data` keeps the certificates. |
| **`nginx` container** (only with the static setup) | `nginx:1.27-alpine` | Serves the web files with no server features. |

Network use by the server: Ollama's model download (first start or model change), and outgoing reminders to the ntfy/webhook/email servers you configure. Nothing else.

### On GitHub
| Piece | Why |
|---|---|
| `.github/workflows/pages.yml` | On every push to `main`: runs the tests (`npm test` on Node 22), then publishes `public/` to GitHub Pages using GitHub's official `checkout`, `setup-node`, `configure-pages`, `upload-pages-artifact` and `deploy-pages` actions. Pull requests only run the tests. |

### In your browser
| Piece | Why |
|---|---|
| localStorage `gutcheck.state` | Your journal (works offline). |
| localStorage `gutcheck.prefs`, `gutcheck.sync`, `gutcheck.draft` | Device settings, server address/password, unsaved draft. |
| Service worker (`sw.js`) + cache `gut-check-v1` | Lets the app open offline and be installed (https only). |
| Web app manifest + icons | Home-screen icon and name. |

No trackers, analytics, external fonts or third-party scripts.

### Files in the repo
See the table in the [README](../README.md#repo-layout). Each skin is one file in `public/skins/`.

## 14. Troubleshooting

| Problem | Fix |
|---|---|
| "Sync problem" badge | Tap it. Usually the server is off or unreachable, or the sync password is wrong (Settings → Server). |
| GitHub Pages copy can't connect to the server | The server address must be https, and the server's `.env` needs `CORS_ORIGIN=https://ryelikebread.github.io`. |
| "Couldn't connect from this browser straight to Ollama…" (Safari says "Load failed", Chrome "Failed to fetch") | The app is set to talk to Ollama **directly from your browser** (Settings → Brains → "Ollama directly", or an address typed under "Ollama address"). That only works if your browser can reach Ollama's own port and Ollama allows the site. **If you use the server copy, you don't need it:** set "Where the counterargument comes from" to **Automatic**, clear the "Ollama address" box, and let the Gut Check server talk to Ollama. (`localhost` in that box means the phone or laptop you're holding, not your server.) Browser-direct is only for the GitHub Pages copy. |
| Picker wants to download a model that's already on my server | Gut Check is talking to the bundled Ollama, not yours. The picker's "Connected to Ollama at …" line shows which: see [Using an Ollama you already have](#using-an-ollama-you-already-have). |
| Devil's advocate always says "Built-in advocate" | Settings → Brains shows why. On the server: `docker compose logs gut-check` and `docker compose exec ollama ollama list`. The model may still be downloading. |
| "model download failed" | The server couldn't reach ollama.com, or the model name is wrong (check it on ollama.com/library). The starting model is retried every 5 minutes; a model you picked in the app can be retried with **Download and use**. Or pull it by hand: `docker compose exec ollama ollama pull qwen3:8b`. |
| Disk is full of models | Remove ones you don't use, in the app or from the command line: see [Removing downloaded models](#removing-downloaded-models). |
| Picked a model that's too big | Settings → Brains → AI model → **Use** on a smaller one, then **Remove** the big one. |
| Answers are slow | Switch to a smaller model (`qwen3:4b`) in Settings → Brains → AI model, or use a GPU. The first answer after a pause includes loading the model. |
| Answers time out | Raise `DEVIL_TIMEOUT_SEC`, or use a smaller model. |
| The reply shows the model's planning notes ("First, I need to understand…", "Structure:", "Word count:") | Gut Check removes `<think>…</think>` blocks and other reasoning, and throws away a reply that starts with planning notes, asking the model once more with a firmer instruction. If it still plans, you get the built-in advocate with a note saying so. Notes are never shown or saved. If it happens a lot, the model is a "thinking" model that works poorly here: pick a different one in Settings → Brains → AI model (`qwen3:8b` with thinking switched off, `llama3.1:8b` and `gemma3` models don't plan out loud). |
| AI answer runs together / wrong speaker names | Smaller models sometimes break format in the multi-voice skins; try `qwen3:8b` or larger, or a single-voice skin. |
| No reminder arrived | Settings → Reminders → Send a test reminder; check `TZ` and `REMINDER_HOUR`; check the logs. |
| Out of memory / server sluggish | The model is too big for the RAM; switch to a smaller one in the app, or `OLLAMA_KEEP_ALIVE=2m` to unload it sooner. |
| Changes to the app don't show | Hard-refresh. If you edited `public/`, bump `VERSION` in `public/sw.js`. |
| Port 8801 is taken | `PORT=8802` in `.env`. |

## 15. Server API reference

All under `/api/`, JSON. If `SYNC_TOKEN` is set, send `Authorization: Bearer <token>` (or `?key=<token>`) on everything except `status`.

| Call | What it does |
|---|---|
| `GET status` | Health, version, whether a password is needed, sync revision, backups, AI model state, reminder channels. |
| `GET state` | The journal `{rev, savedAt, state}`. |
| `PUT state` | `{baseRev, state}`; 409 with the current copy if `baseRev` is stale. |
| `GET models` | `{url, active, default, ready, state, installed:[{name, size, params, quant}], pull:{model, status, pct, running, activate, error}}`. |
| `POST models/active` | `{model}`: switch to it; if it isn't downloaded, starts the download (202) and switches when it's done. |
| `POST models/pull` | `{model, activate?}`: download only (or switch after, with `activate: true`). 409 if another download is running. |
| `POST models/cancel` | Stops the running download. |
| `POST models/delete` | `{model}`: removes a downloaded model (not the one in use). |
| `POST devil` | `{messages:[{role, content}]}` → streamed NDJSON lines `{delta}` … `{done, model}` or `{error}`. |
| `POST reminders/test` | Sends a test reminder through every configured channel. |
| `GET calendar.ics` | Live calendar of open reviews. |
| `POST backup`, `GET backups`, `GET backups/<name|latest>` | Server backups. |
