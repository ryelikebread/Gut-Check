"use strict";
/* Gut Check server: serves the app from public/, keeps one synced copy of the journal on disk with
   timestamped backups, proxies the devil's advocate to a local Ollama model, and sends review reminders.
   No npm dependencies; needs Node 18+.

   Environment (all optional):
     PORT                     port to listen on (default 8801)
     DATA_DIR                 where state.json, reminders.json and backups/ live (default /data)
     SYNC_TOKEN               shared password; if set, the app asks for it once
     CORS_ORIGIN              comma-separated web origins allowed to call the API from another site,
                              e.g. https://yourname.github.io
     BACKUP_MIN_INTERVAL_MIN  at most one automatic backup per this many minutes (default 10)
     BACKUP_KEEP              newest backups always kept (default 500); plus the newest per day for 90 days
     APP_URL                  public address of the app, used for links in reminders and calendar events

   Devil's advocate (local model through Ollama):
     OLLAMA_URL               e.g. http://ollama:11434 (empty = devil's advocate uses the built-in fallback)
     DEVIL_MODEL              default Ollama model (qwen3:8b); a model picked in the app's Settings overrides it
     DEVIL_AUTO_PULL          download the model automatically if it's missing (default 1)
     DEVIL_TIMEOUT_SEC        give up on one reply after this long (default 300)
     DEVIL_MAX_TOKENS         longest reply in tokens (default 900)

   Reminders (any combination; none = reminders only show inside the app):
     REMINDER_HOUR            local hour (0-23) to send reminders (default 9); set TZ for your time zone
     REMINDER_REPEAT_DAYS     nudge again about a still-unreviewed entry after this many days (default 7, 0 = never)
     NTFY_URL, NTFY_TOKEN     phone push via ntfy, e.g. https://ntfy.sh/some-long-secret-topic
     WEBHOOK_URL              POST {text, content} JSON (works with Slack, Discord, Mattermost, Home Assistant...)
     SMTP_HOST, SMTP_PORT, SMTP_SECURE (tls|starttls|none), SMTP_USER, SMTP_PASS, SMTP_FROM, REMINDER_EMAIL_TO
*/
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Core = require("../public/lib/core.js");
const { sendMail } = require("./mailer.js");
const VERSION = require("../package.json").version;

const env = process.env;
const PORT = +env.PORT || 8801;
const PUBLIC = path.resolve(env.PUBLIC_DIR || path.join(__dirname, "..", "public"));
const DATA = path.resolve(env.DATA_DIR || "/data");
const TOKEN = env.SYNC_TOKEN || "";
const BACKUP_MIN = (+env.BACKUP_MIN_INTERVAL_MIN || 10) * 60e3;
const BACKUP_KEEP = +env.BACKUP_KEEP || 500;
const CORS = (env.CORS_ORIGIN || "").split(",").map(x => x.trim().replace(/\/+$/, "")).filter(Boolean);
const APP_URL = (env.APP_URL || "").replace(/\/+$/, "") + (env.APP_URL ? "/" : "");
const OLLAMA = (env.OLLAMA_URL || "").replace(/\/+$/, "");
const MODEL = env.DEVIL_MODEL || "qwen3:8b";
const AUTO_PULL = env.DEVIL_AUTO_PULL !== "0";
const DEVIL_TIMEOUT = (+env.DEVIL_TIMEOUT_SEC || 300) * 1000;
const DEVIL_MAX_TOKENS = +env.DEVIL_MAX_TOKENS || 900;
const REM_HOUR = env.REMINDER_HOUR === undefined || env.REMINDER_HOUR === "" ? 9 : Math.max(0, Math.min(23, +env.REMINDER_HOUR));
const REM_REPEAT = (env.REMINDER_REPEAT_DAYS === undefined || env.REMINDER_REPEAT_DAYS === "" ? 7 : +env.REMINDER_REPEAT_DAYS) * 86400e3;
const SMTP = { host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE, user: env.SMTP_USER, pass: env.SMTP_PASS, from: env.SMTP_FROM };
const MAX_BODY = 5 * 1024 * 1024;
const STATE = path.join(DATA, "state.json");
const REMINDERS = path.join(DATA, "reminders.json");
const BACKUPS = path.join(DATA, "backups");
const NAME_RE = /^state-\d{8}-\d{6}(-[a-z0-9]+)?\.json$/;

fs.mkdirSync(BACKUPS, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);

/* ---------- storage ---------- */
function writeAtomic(file, text) {
  const tmp = file + "." + process.pid + ".tmp";
  const fd = fs.openSync(tmp, "w");
  try { fs.writeSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}
function readJson(file, fallback, check) {
  if (!fs.existsSync(file)) return fallback;
  try {
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    if (check && !check(d)) throw new Error("unexpected shape");
    return d;
  } catch (e) {
    const aside = file.replace(/\.json$/, ".corrupt-" + Date.now() + ".json");
    fs.renameSync(file, aside);
    log(path.basename(file), "was unreadable and was moved to", aside, "-", e.message);
    return fallback;
  }
}
let cur = readJson(STATE, { rev: 0, savedAt: 0, state: null }, d => d && typeof d.rev === "number" && (d.state === null || Core.validState(d.state)));
let sent = readJson(REMINDERS, {}, d => d && typeof d === "object" && !Array.isArray(d)); // id -> { reviewAt, at }
let lastBackupAt = 0, dirtySinceBackup = false, backupTimer = null;

const listBackups = () => fs.readdirSync(BACKUPS).filter(n => NAME_RE.test(n)).sort().reverse();
function stamp(d) {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}
function pruneBackups() {
  const names = listBackups();
  const keep = new Set(names.slice(0, BACKUP_KEEP));
  const days = new Set();
  const cutoff = Date.now() - 90 * 86400e3;
  names.forEach(n => {
    const day = n.slice(6, 14);
    const t = Date.UTC(+day.slice(0, 4), +day.slice(4, 6) - 1, +day.slice(6, 8));
    if (t >= cutoff && !days.has(day)) { days.add(day); keep.add(n); }
  });
  names.forEach(n => { if (!keep.has(n)) { try { fs.unlinkSync(path.join(BACKUPS, n)); } catch (e) {} } });
}
function backup(reason) {
  clearTimeout(backupTimer); backupTimer = null;
  if (!cur.state) return null;
  const now = new Date();
  let name = `state-${stamp(now)}.json`, n = 1;
  while (fs.existsSync(path.join(BACKUPS, name))) name = `state-${stamp(now)}-${n++}.json`;
  writeAtomic(path.join(BACKUPS, name), JSON.stringify(cur));
  lastBackupAt = now.getTime(); dirtySinceBackup = false;
  pruneBackups();
  log("backup", name, reason || "");
  return name;
}
function scheduleBackup() {
  dirtySinceBackup = true;
  if (Date.now() - lastBackupAt >= BACKUP_MIN) return backup("interval");
  if (!backupTimer) backupTimer = setTimeout(() => backup("deferred"), Math.max(1000, BACKUP_MIN - (Date.now() - lastBackupAt)));
}
{
  const latest = listBackups()[0];
  if (latest) lastBackupAt = fs.statSync(path.join(BACKUPS, latest)).mtimeMs;
  if (cur.state && Date.now() - lastBackupAt > 86400e3) backup("startup");
}

/* ---------- local model (Ollama) ---------- */
/* The model can be changed from the app (Settings → Devil's advocate). The choice is kept in settings.json;
   DEVIL_MODEL is only the default until someone picks another one. */
const SETTINGS = path.join(DATA, "settings.json");
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._\-\/:@]{0,199}$/;
let settings = readJson(SETTINGS, {}, d => d && typeof d === "object" && !Array.isArray(d));
if (settings.model && !MODEL_RE.test(settings.model)) settings.model = "";
const activeModel = () => settings.model || MODEL;
const sameModel = (a, b) => a === b || a === b + ":latest" || a + ":latest" === b;
const devil = { enabled: !!OLLAMA, model: activeModel(), ready: false, state: OLLAMA ? "checking" : "not configured", busy: 0 };
let installed = [], lastPullAt = 0;
const pull = { model: "", status: "", pct: 0, error: "", activate: false, running: false, startedAt: 0, finishedAt: 0, ctrl: null };
const pullInfo = () => ({ model: pull.model, status: pull.status, pct: pull.pct, error: pull.error, activate: pull.activate, running: pull.running, startedAt: pull.startedAt, finishedAt: pull.finishedAt });

async function checkOllama() {
  if (!OLLAMA) return;
  const model = activeModel();
  devil.model = model;
  try {
    const r = await fetch(OLLAMA + "/api/tags", { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error("status " + r.status);
    installed = ((await r.json()).models || []).map(m => ({ name: m.name, size: m.size || 0, modifiedAt: m.modified_at || "",
      params: (m.details && m.details.parameter_size) || "", quant: (m.details && m.details.quantization_level) || "" }));
    if (installed.some(m => sameModel(m.name, model))) { devil.ready = true; devil.state = "ready"; return; }
    devil.ready = false;
    if (pull.running && sameModel(pull.model, model)) return;
    if (AUTO_PULL && !pull.running && Date.now() - lastPullAt > 5 * 60e3) { lastPullAt = Date.now(); startPull(model, { auto: true }); } // at most one automatic attempt per 5 minutes
    else if (!pull.running) devil.state = `model ${model} isn't downloaded yet (download it in Settings, or run: docker compose exec ollama ollama pull ${model})`;
  } catch (e) {
    devil.ready = false;
    if (!(pull.running && sameModel(pull.model, model))) devil.state = "Ollama not reachable (" + (e.cause && e.cause.code || e.message) + ")";
  }
}
function setActiveModel(name) {
  settings.model = name === MODEL ? "" : name;
  writeAtomic(SETTINGS, JSON.stringify(settings));
  devil.model = name;
  devil.ready = installed.some(m => sameModel(m.name, name));
  devil.state = devil.ready ? "ready" : "checking";
  log("devil's advocate model is now", name);
}
/* Downloads one model at a time in the background. The app polls /api/models for progress. */
function startPull(name, { activate = false, auto = false } = {}) {
  Object.assign(pull, { model: name, status: "starting", pct: 0, error: "", activate, running: true, startedAt: Date.now(), finishedAt: 0, ctrl: new AbortController() });
  const forActive = () => sameModel(pull.model, activeModel());
  if (forActive()) devil.state = "downloading model";
  log("ollama: downloading", name, "(this can take a while)");
  (async () => {
    try {
      const r = await fetch(OLLAMA + "/api/pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: name, stream: true }), signal: pull.ctrl.signal });
      if (!r.ok || !r.body) throw new Error("Ollama said " + r.status + " " + (r.body ? (await r.text().catch(() => "")).slice(0, 200) : ""));
      let buf = "", lastPct = -10, ok = false;
      const dec = new TextDecoder();
      for await (const chunk of r.body) {
        buf += dec.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line) continue;
          const o = JSON.parse(line);
          if (o.error) throw new Error(o.error);
          if (o.status) pull.status = o.status;
          if (o.status === "success") ok = true;
          if (o.total && o.completed) {
            pull.pct = Math.min(100, Math.floor(o.completed / o.total * 100));
            if (forActive()) devil.state = `downloading model (${pull.pct}%)`;
            if (pull.pct >= lastPct + 10) { lastPct = pull.pct; log("ollama: download", name, pull.pct + "%"); }
          }
        }
      }
      if (!ok) throw new Error("the download ended early");
      Object.assign(pull, { running: false, status: "success", pct: 100, finishedAt: Date.now() });
      log("ollama: model ready:", name);
      if (pull.activate) setActiveModel(name);
    } catch (e) {
      const cancelled = pull.ctrl.signal.aborted;
      Object.assign(pull, { running: false, status: cancelled ? "cancelled" : "failed", error: cancelled ? "" : e.message, finishedAt: Date.now() });
      log("ollama: download", cancelled ? "cancelled:" : "failed:", name, cancelled ? "" : e.message);
      if (forActive()) devil.state = cancelled ? "model download cancelled" : `model download failed${auto ? " (will retry in 5 minutes)" : ""}: ${e.message}`;
      if (!auto) lastPullAt = Date.now(); // don't let the automatic download jump straight back in
      return;
    }
    checkOllama();
  })();
}
async function modelsApi(req, res, p) {
  if (!OLLAMA) return send(res, 503, { error: "No local model is configured on the server (OLLAMA_URL is empty)" });
  const list = () => ({ active: activeModel(), default: MODEL, ready: devil.ready, state: devil.state, autoPull: AUTO_PULL, installed, pull: pullInfo() });
  if (p === "/api/models" && req.method === "GET") { await checkOllama(); return send(res, 200, list()); }
  if (req.method !== "POST") return send(res, 405, { error: "method not allowed" });
  const body = await jsonBody(req, res, 4096); if (body === undefined) return;
  const name = body && typeof body.model === "string" ? body.model.trim() : "";
  if (p === "/api/models/cancel") { if (pull.running) pull.ctrl.abort(); return send(res, 200, list()); }
  if (!MODEL_RE.test(name)) return send(res, 400, { error: "That doesn't look like an Ollama model name (for example qwen3:8b)" });
  if (p === "/api/models/pull" || p === "/api/models/active") {
    await checkOllama();
    const activate = p === "/api/models/active" || !!body.activate;
    if (p === "/api/models/active" && installed.some(m => sameModel(m.name, name))) { setActiveModel(name); await checkOllama(); return send(res, 200, list()); }
    if (pull.running) {
      if (!sameModel(pull.model, name)) return send(res, 409, { error: `Already downloading ${pull.model}. Wait for it to finish or cancel it first.`, ...list() });
      if (activate) pull.activate = true;
      return send(res, 202, list());
    }
    startPull(name, { activate });
    return send(res, 202, list());
  }
  if (p === "/api/models/delete") {
    if (sameModel(name, activeModel())) return send(res, 400, { error: "That's the model in use. Switch to another one before removing it." });
    const r = await fetch(OLLAMA + "/api/delete", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: name }) }).catch(e => ({ ok: false, status: 0, text: async () => e.message }));
    if (!r.ok) return send(res, 502, { error: "Ollama couldn't remove it: " + (r.status || "") + " " + (await r.text().catch(() => "")).slice(0, 200) });
    log("ollama: removed", name);
    await checkOllama();
    return send(res, 200, list());
  }
  return send(res, 404, { error: "not found" });
}
if (OLLAMA) { setTimeout(checkOllama, 1500); setInterval(checkOllama, 60e3).unref(); }

/* One reply at a time: a CPU-only server would crawl if several ran together. */
let queue = Promise.resolve();
function exclusive(fn) { const run = queue.then(fn, fn); queue = run.catch(() => {}); return run; }

async function devilProxy(req, res, body) {
  const msgs = body && body.messages;
  if (!Array.isArray(msgs) || !msgs.length || msgs.length > 6 || !msgs.every(m => m && ["system", "user", "assistant"].includes(m.role) && typeof m.content === "string" && m.content.length < 30000))
    return send(res, 400, { error: "bad messages" });
  if (!OLLAMA) return send(res, 503, { error: "No local model is configured on the server (OLLAMA_URL is empty)" });
  if (!devil.ready) { await checkOllama(); if (!devil.ready) return send(res, 503, { error: "The local model isn't ready: " + devil.state }); }
  res.writeHead(200, Object.assign({}, res.cors, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" }));
  const out = o => { try { res.write(JSON.stringify(o) + "\n"); } catch (e) {} };
  const ctrl = new AbortController();
  res.on("close", () => { if (!res.writableFinished) ctrl.abort(); });
  devil.busy++;
  try {
    await exclusive(async () => {
      if (ctrl.signal.aborted) return;
      const timer = setTimeout(() => ctrl.abort(), DEVIL_TIMEOUT);
      try {
        const model = activeModel();
        const payload = { model, messages: msgs, stream: true, think: false, keep_alive: "15m", options: { temperature: 0.7, num_predict: DEVIL_MAX_TOKENS } };
        let r = await fetch(OLLAMA + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ctrl.signal });
        if (r.status === 400) {
          const t = await r.text();
          if (!/think/i.test(t)) throw new Error(t.slice(0, 200));
          delete payload.think; // older Ollama versions or models without a thinking switch
          r = await fetch(OLLAMA + "/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ctrl.signal });
        }
        if (!r.ok || !r.body) throw new Error("Ollama said " + r.status + " " + (await r.text().catch(() => "")).slice(0, 200));
        let buf = "";
        const dec = new TextDecoder();
        for await (const chunk of r.body) {
          buf += dec.decode(chunk, { stream: true });
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
            if (!line) continue;
            const o = JSON.parse(line);
            if (o.error) throw new Error(o.error);
            if (o.message && o.message.content) out({ delta: o.message.content });
          }
        }
        out({ done: true, model });
      } finally { clearTimeout(timer); }
    });
  } catch (e) {
    out({ error: ctrl.signal.aborted ? "the model took too long" : e.message });
  } finally { devil.busy--; res.end(); }
}

/* ---------- reminders ---------- */
function channels() {
  const c = [];
  if (env.NTFY_URL) c.push("ntfy");
  if (env.WEBHOOK_URL) c.push("webhook");
  if (SMTP.host && env.REMINDER_EMAIL_TO) c.push("email");
  return c;
}
async function notify(title, text, link) {
  const results = [], errors = [];
  const tasks = [];
  if (env.NTFY_URL) tasks.push(["ntfy", () => fetch(env.NTFY_URL, { method: "POST", body: text, headers: Object.assign({ Title: title.replace(/[^\x20-\x7e]/g, ""), Tags: "thinking", Priority: "default" }, link ? { Click: link } : {}, env.NTFY_TOKEN ? { Authorization: "Bearer " + env.NTFY_TOKEN } : {}), signal: AbortSignal.timeout(15000) }).then(r => { if (!r.ok) throw new Error("status " + r.status); })]);
  if (env.WEBHOOK_URL) tasks.push(["webhook", () => fetch(env.WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `*${title}*\n${text}`, content: `**${title}**\n${text}`, title, message: text, url: link || undefined }), signal: AbortSignal.timeout(15000) }).then(r => { if (!r.ok) throw new Error("status " + r.status); })]);
  if (SMTP.host && env.REMINDER_EMAIL_TO) tasks.push(["email", () => sendMail(SMTP, { to: env.REMINDER_EMAIL_TO, subject: title, text: text + (link ? "\n\nOpen Gut Check: " + link : "") + "\n\n-- \nSent by your Gut Check server." })]);
  for (const [name, fn] of tasks) {
    try { await fn(); results.push(name); } catch (e) { errors.push(`${name}: ${e.message}`); log("reminder via", name, "failed:", e.message); }
  }
  return { sent: results, errors };
}
function dueToNotify(now = Date.now()) {
  if (!cur.state) return [];
  return cur.state.entries.filter(e => Core.isDue(e, now)).filter(e => {
    const s = sent[e.id];
    if (!s || s.reviewAt !== e.reviewAt) return true;            // never told about this review date
    return REM_REPEAT > 0 && now - s.at >= REM_REPEAT;           // still not reviewed: nudge again
  });
}
let reminding = false;
async function reminderTick(force) {
  if (reminding || !channels().length) return;
  const now = new Date();
  if (!force && now.getHours() < REM_HOUR) return;
  const due = dueToNotify(now.getTime());
  if (!due.length) return;
  reminding = true;
  try {
    const total = cur.state.entries.filter(e => Core.isDue(e)).length;
    const title = due.length === 1 ? "Gut Check: time to review a " + due[0].kind : `Gut Check: ${due.length} entries to review`;
    const lines = due.slice(0, 10).map(e => `• ${e.title} (${e.kind}, logged ${new Date(e.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}, ${e.confidence}% sure)`);
    if (due.length > 10) lines.push(`…and ${due.length - 10} more.`);
    const text = `How did these turn out?\n${lines.join("\n")}${total > due.length ? `\n(${total} reviews are waiting in total.)` : ""}`;
    const link = APP_URL ? APP_URL + "#today" : "";
    const r = await notify(title, text, link);
    if (r.sent.length) {
      const at = Date.now();
      due.forEach(e => { sent[e.id] = { reviewAt: e.reviewAt, at }; });
      // forget entries that no longer exist or are resolved
      const open = new Set(cur.state.entries.filter(e => !e.deleted && e.status === "open").map(e => e.id));
      Object.keys(sent).forEach(id => { if (!open.has(id)) delete sent[id]; });
      writeAtomic(REMINDERS, JSON.stringify(sent));
      log("reminder sent via", r.sent.join(", "), "for", due.length, "entries");
    }
  } finally { reminding = false; }
}
setInterval(() => reminderTick().catch(e => log("reminder error", e.message)), 10 * 60e3).unref();
setTimeout(() => reminderTick().catch(e => log("reminder error", e.message)), 5000).unref();

/* ---------- http helpers ---------- */
function corsFor(req) {
  const o = req.headers.origin;
  if (!o || !CORS.length || !(CORS.includes("*") || CORS.includes(o))) return {};
  return { "Access-Control-Allow-Origin": CORS.includes("*") ? "*" : o, "Vary": "Origin", "Access-Control-Expose-Headers": "Content-Disposition" };
}
function send(res, code, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign({}, res.cors, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }, headers));
  res.end(body);
}
function readBody(req, max = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > max) { reject(Object.assign(new Error("too large"), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}
async function jsonBody(req, res, max) {
  try { return JSON.parse(await readBody(req, max)); }
  catch (e) { send(res, e.code === 413 ? 413 : 400, { error: e.code === 413 ? "too large" : "bad json" }); return undefined; }
}
const digest = s => crypto.createHash("sha256").update(String(s)).digest();
function authed(req, url) {
  if (!TOKEN) return true;
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  const given = m ? m[1] : url.searchParams.get("key");
  return !!given && crypto.timingSafeEqual(digest(given), digest(TOKEN));
}

/* ---------- API ---------- */
async function api(req, res, url) {
  const p = url.pathname;
  res.cors = corsFor(req);
  if (req.method === "OPTIONS") {
    const h = Object.assign({ "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Max-Age": "600" }, res.cors);
    if (res.cors["Access-Control-Allow-Origin"] && req.headers["access-control-request-private-network"]) h["Access-Control-Allow-Private-Network"] = "true";
    res.writeHead(204, h); return res.end();
  }
  if (p === "/api/status" && req.method === "GET") {
    const b = listBackups();
    return send(res, 200, { ok: true, app: "gut-check", version: VERSION, sync: true, auth: !!TOKEN, rev: cur.rev, savedAt: cur.savedAt,
      backups: { count: b.length, latest: b[0] || null },
      devil: { enabled: devil.enabled, model: devil.model, ready: devil.ready, state: devil.state, busy: devil.busy },
      reminders: { channels: channels(), hour: REM_HOUR, tz: Intl.DateTimeFormat().resolvedOptions().timeZone } });
  }
  if (!authed(req, url)) return send(res, 401, { error: "unauthorized" }, { "WWW-Authenticate": "Bearer" });

  if (p === "/api/state") {
    if (req.method === "GET") return send(res, 200, { rev: cur.rev, savedAt: cur.savedAt, state: cur.state });
    if (req.method === "PUT") {
      const body = await jsonBody(req, res); if (body === undefined) return;
      if (!body || !Core.validState(body.state)) return send(res, 400, { error: "bad state" });
      if (body.baseRev !== cur.rev) return send(res, 409, { error: "conflict", rev: cur.rev, savedAt: cur.savedAt, state: cur.state });
      cur = { rev: cur.rev + 1, savedAt: Date.now(), state: Core.merge(body.state, Core.emptyState()) };
      writeAtomic(STATE, JSON.stringify(cur));
      scheduleBackup();
      return send(res, 200, { rev: cur.rev, savedAt: cur.savedAt });
    }
    return send(res, 405, { error: "method not allowed" });
  }
  if (p === "/api/models" || p.startsWith("/api/models/")) return modelsApi(req, res, p);
  if (p === "/api/devil" && req.method === "POST") {
    const body = await jsonBody(req, res, 200 * 1024); if (body === undefined) return;
    return devilProxy(req, res, body);
  }
  if (p === "/api/reminders/test" && req.method === "POST") {
    if (!channels().length) return send(res, 400, { error: "no reminder channels are configured" });
    const r = await notify("Gut Check: test reminder", "If you can read this, review reminders will reach you here.", APP_URL || "");
    return send(res, r.sent.length ? 200 : 502, r.sent.length ? r : { error: r.errors.join("; "), ...r });
  }
  if (p === "/api/calendar.ics" && req.method === "GET") {
    const entries = cur.state ? cur.state.entries : [];
    res.writeHead(200, Object.assign({}, res.cors, { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store", "Content-Disposition": 'inline; filename="gut-check.ics"' }));
    return res.end(Core.ics(entries, APP_URL));
  }
  if (p === "/api/backup" && req.method === "POST") {
    const name = backup("manual");
    return name ? send(res, 200, { name }) : send(res, 409, { error: "nothing to back up yet" });
  }
  if (p === "/api/backups" && req.method === "GET") {
    const list = listBackups().slice(0, 1000).map(n => { const st = fs.statSync(path.join(BACKUPS, n)); return { name: n, size: st.size, mtime: st.mtimeMs }; });
    return send(res, 200, { backups: list });
  }
  const m = /^\/api\/backups\/([^/]+)$/.exec(p);
  if (m && req.method === "GET") {
    const name = m[1] === "latest" ? listBackups()[0] : m[1];
    if (!name || !NAME_RE.test(name) || !fs.existsSync(path.join(BACKUPS, name))) return send(res, 404, { error: "no such backup" });
    res.writeHead(200, { ...res.cors, "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" });
    return fs.createReadStream(path.join(BACKUPS, name)).pipe(res);
  }
  return send(res, 404, { error: "not found" });
}

/* ---------- static files ---------- */
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".md": "text/plain; charset=utf-8" };
function serveStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.resolve(PUBLIC, "." + path.sep + rel);
  if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Content-Length": st.size, "Cache-Control": rel.startsWith("/icons/") ? "public, max-age=86400" : "no-cache",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    return serveStatic(req, res, url);
  } catch (e) {
    log("error", req.method, req.url, e && e.stack || e);
    if (!res.headersSent) send(res, 500, { error: "server error" }); else res.end();
  }
});
server.requestTimeout = 0; // devil's advocate replies can stream for minutes on a CPU
server.listen(PORT, () => log(`Gut Check ${VERSION} listening on :${PORT}, data in ${DATA}` +
  `${TOKEN ? ", sync password required" : ", no sync password set"}` +
  `, devil's advocate: ${OLLAMA ? activeModel() + " via " + OLLAMA : "built-in only"}` +
  `, reminders: ${channels().join(", ") || "in-app only"}`));
function shutdown() { try { if (dirtySinceBackup) backup("shutdown"); } catch (e) {} server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); }
process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);

module.exports = { server, reminderTick, dueToNotify };
