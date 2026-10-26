/* Gut Check core: data rules, merging for sync, scoring, calibration and calendar files.
   Shared by the browser app and the Node server/tests (no dependencies). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GutCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DAY = 86400e3;

  function uid() {
    const r = (typeof crypto !== "undefined" && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(2)) : [Math.random() * 2 ** 32, Math.random() * 2 ** 32];
    return Date.now().toString(36) + "-" + Array.from(r, n => (n >>> 0).toString(36)).join("");
  }

  function emptyState() { return { app: "gut-check", version: 1, entries: [] }; }

  function validState(s) {
    return !!s && typeof s === "object" && !Array.isArray(s) && Array.isArray(s.entries);
  }

  const clampConf = c => Math.max(1, Math.min(99, Math.round(+c || 50)));

  /* Normalise one entry so older or hand-edited data can't break the app. */
  function normalizeEntry(e) {
    const now = Date.now();
    const out = Object.assign({}, e);
    out.id = String(e.id || uid());
    out.kind = e.kind === "prediction" ? "prediction" : "decision";
    out.createdAt = +e.createdAt || now;
    out.updatedAt = +e.updatedAt || out.createdAt;
    out.deleted = !!e.deleted;
    if (out.deleted) return out;
    out.title = String(e.title || "").slice(0, 500);
    out.details = String(e.details || "").slice(0, 20000);
    out.options = String(e.options || "").slice(0, 5000);
    out.reasoning = String(e.reasoning || "").slice(0, 10000);
    out.expectation = String(e.expectation || "").slice(0, 2000);
    out.confidence = clampConf(e.confidence);
    out.reviewAt = +e.reviewAt || (out.createdAt + 90 * DAY);
    out.tags = Array.isArray(e.tags) ? e.tags.map(t => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 20) : [];
    out.stakes = [1, 2, 3].includes(+e.stakes) ? +e.stakes : 2;
    out.status = ["open", "resolved", "void"].includes(e.status) ? e.status : "open";
    out.resolution = e.resolution && typeof e.resolution === "object" ? Object.assign({}, e.resolution) : null;
    if (out.resolution && out.status === "resolved") {
      const o = +out.resolution.outcome;
      out.resolution.outcome = o >= 0.75 ? 1 : o >= 0.25 ? 0.5 : 0;
    }
    out.snoozes = +e.snoozes || 0;
    out.devil = Array.isArray(e.devil) ? e.devil.slice(-20) : [];
    return out;
  }

  /* ---------- sync merge ----------
     Entries are united by id. For the same id the copy with the later updatedAt wins
     (deletions are kept as tombstones so they win too). Ties go to the copy that is deleted,
     then resolved, then the longer JSON, so every device reaches the same answer. */
  function rank(e) { return [e.updatedAt || 0, e.deleted ? 1 : 0, e.status !== "open" ? 1 : 0, JSON.stringify(e).length]; }
  function newer(a, b) {
    const ra = rank(a), rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] > rb[i] ? a : b;
    return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
  }
  function merge(a, b) {
    const map = new Map();
    for (const s of [a, b]) {
      if (!validState(s)) continue;
      for (const raw of s.entries) {
        if (!raw || !raw.id) continue;
        const e = normalizeEntry(raw);
        const cur = map.get(e.id);
        map.set(e.id, cur ? newer(cur, e) : e);
      }
    }
    // Drop tombstones older than a year; every device has seen them by then.
    const cutoff = Date.now() - 365 * DAY;
    const entries = [...map.values()].filter(e => !(e.deleted && e.updatedAt < cutoff)).sort((x, y) => x.createdAt - y.createdAt || (x.id < y.id ? -1 : 1));
    return { app: "gut-check", version: 1, entries };
  }
  function sameState(a, b) { return JSON.stringify(merge(a, emptyState())) === JSON.stringify(merge(b, emptyState())); }

  /* ---------- scoring ---------- */
  const live = s => (validState(s) ? s.entries : []).filter(e => !e.deleted);
  const isDue = (e, now = Date.now()) => !e.deleted && e.status === "open" && e.reviewAt <= now;

  /* 100 = perfectly confident and right, 75 = a 50% coin-flip guess, 0 = 100% sure and wrong. */
  function forecastScore(confidence, outcome) {
    const p = clampConf(confidence) / 100;
    return Math.round(100 * (1 - (p - outcome) ** 2));
  }
  /* Process rating 1..5 mapped to 0..100. */
  const processPoints = r => Math.round(((Math.max(1, Math.min(5, +r)) - 1) / 4) * 100);

  /* Judgment for one resolved decision: half how well you forecast, half how sound the
     decision was given what you knew (your own hindsight rating). */
  function judgmentScore(e) {
    if (!e || e.status !== "resolved" || !e.resolution) return null;
    const f = forecastScore(e.confidence, e.resolution.outcome);
    if (e.kind !== "decision" || !e.resolution.process) return f;
    return Math.round(0.5 * f + 0.5 * processPoints(e.resolution.process));
  }

  /* Luck vs skill: sound decision = process 3+ out of 5; good outcome = outcome rating 3+ out of 5. */
  function quadrant(e) {
    if (!e || e.kind !== "decision" || e.status !== "resolved" || !e.resolution) return null;
    const p = +e.resolution.process, o = +e.resolution.result;
    if (!p || !o) return null;
    const sound = p >= 3, good = o >= 3;
    return sound && good ? "earned" : sound ? "unlucky" : good ? "lucky" : "lesson";
  }
  const QUADRANTS = {
    earned: { label: "Earned it", hint: "Sound decision, good result" },
    unlucky: { label: "Bad luck", hint: "Sound decision, poor result" },
    lucky: { label: "Dumb luck", hint: "Shaky decision, good result" },
    lesson: { label: "Lesson", hint: "Shaky decision, poor result" }
  };

  /* Everything that has a probability and a known outcome. Partly-true decisions count as 0.5. */
  function forecasts(state) {
    return live(state).filter(e => e.status === "resolved" && e.resolution && e.resolution.outcome !== undefined && e.resolution.outcome !== null)
      .map(e => ({ id: e.id, kind: e.kind, p: clampConf(e.confidence) / 100, o: +e.resolution.outcome, at: e.resolution.at || e.updatedAt }));
  }

  function calibration(state, opts = {}) {
    let fs = forecasts(state);
    if (opts.kind) fs = fs.filter(f => f.kind === opts.kind);
    const n = fs.length;
    const bins = Array.from({ length: 10 }, (_, i) => ({ lo: i * 10, hi: i * 10 + 10, n: 0, sumP: 0, sumO: 0 }));
    let brier = 0, conf = 0, hits = 0;
    for (const f of fs) {
      const b = bins[Math.min(9, Math.floor(f.p * 10))];
      b.n++; b.sumP += f.p; b.sumO += f.o;
      brier += (f.p - f.o) ** 2;
      // Fold to "confidence in the side you picked" for the over/under-confidence figure.
      conf += Math.max(f.p, 1 - f.p);
      hits += f.p >= 0.5 ? f.o : 1 - f.o;
    }
    const out = {
      n,
      brier: n ? brier / n : null,
      score: n ? Math.round(100 * (1 - brier / n)) : null,
      avgConfidence: n ? conf / n : null,
      hitRate: n ? hits / n : null,
      overconfidence: n ? (conf - hits) / n : null, // > 0 means overconfident
      bins: bins.map(b => ({ lo: b.lo, hi: b.hi, n: b.n, avgP: b.n ? b.sumP / b.n : null, freq: b.n ? b.sumO / b.n : null }))
    };
    return out;
  }

  /* How often you were right when you said roughly this confidence (for the devil's advocate). */
  function hitRateNear(state, confidence) {
    const q = Math.max(confidence, 100 - confidence) / 100;
    const fs = forecasts(state).filter(f => Math.abs(Math.max(f.p, 1 - f.p) - q) <= 0.075);
    if (fs.length < 3) return null;
    const hits = fs.reduce((s, f) => s + (f.p >= 0.5 ? f.o : 1 - f.o), 0);
    return { n: fs.length, rate: hits / fs.length };
  }

  function summary(state, now = Date.now()) {
    const es = live(state);
    const decisions = es.filter(e => e.kind === "decision"), predictions = es.filter(e => e.kind === "prediction");
    const judged = decisions.map(judgmentScore).filter(x => x !== null);
    const quads = { earned: 0, unlucky: 0, lucky: 0, lesson: 0 };
    decisions.forEach(e => { const q = quadrant(e); if (q) quads[q]++; });
    return {
      total: es.length,
      decisions: decisions.length,
      predictions: predictions.length,
      open: es.filter(e => e.status === "open").length,
      due: es.filter(e => isDue(e, now)).length,
      resolved: es.filter(e => e.status === "resolved").length,
      judgment: judged.length ? Math.round(judged.reduce((a, b) => a + b, 0) / judged.length) : null,
      judgedCount: judged.length,
      quadrants: quads,
      calibration: calibration(state)
    };
  }

  /* ---------- dates ---------- */
  function addMonths(ts, m) {
    const d = new Date(ts);
    const day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + m);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return d.getTime();
  }

  /* ---------- calendar (.ics) ---------- */
  function icsEscape(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, m => "\\" + m); }
  function icsDate(ts) { const d = new Date(ts); const p = n => String(n).padStart(2, "0"); return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`; }
  function icsStamp(ts) { return new Date(ts).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"); }
  function fold(line) { // RFC 5545: lines longer than 75 octets are folded
    const out = []; let s = line;
    while (s.length > 74) { out.push(s.slice(0, 74)); s = " " + s.slice(74); }
    out.push(s); return out.join("\r\n");
  }
  function icsEvent(e, appUrl) {
    const what = e.kind === "decision" ? "Review decision" : "Resolve prediction";
    const desc = [
      e.kind === "decision" ? `You decided: ${e.title}` : `You predicted: ${e.title}`,
      e.expectation ? `You expected: ${e.expectation}` : "",
      `Confidence: ${e.confidence}%`,
      appUrl ? `Open Gut Check: ${appUrl}#entry/${e.id}` : ""
    ].filter(Boolean).join("\n");
    return [
      "BEGIN:VEVENT",
      `UID:${e.id}@gut-check`,
      `DTSTAMP:${icsStamp(e.updatedAt || Date.now())}`,
      `DTSTART;VALUE=DATE:${icsDate(e.reviewAt)}`,
      `DTEND;VALUE=DATE:${icsDate(e.reviewAt + DAY)}`,
      `SUMMARY:${icsEscape(`Gut Check: ${what} - ${e.title}`)}`,
      `DESCRIPTION:${icsEscape(desc)}`,
      appUrl ? `URL:${icsEscape(appUrl + "#entry/" + e.id)}` : "",
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(what)}`, "TRIGGER:PT9H", "END:VALARM",
      "END:VEVENT"
    ].filter(Boolean).map(fold).join("\r\n");
  }
  function ics(entries, appUrl, name = "Gut Check reviews") {
    return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Gut Check//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsEscape(name)}`,
      ...entries.filter(e => !e.deleted && e.status === "open").map(e => icsEvent(e, appUrl)), "END:VCALENDAR", ""].join("\r\n");
  }

  /* ---------- CSV export ---------- */
  function csv(state) {
    const cols = ["id", "kind", "created", "title", "expectation", "confidence", "review_by", "status", "outcome", "decision_quality", "result_quality", "forecast_score", "judgment_score", "tags", "details", "options", "reasoning", "lesson"];
    const q = v => { const s = v === null || v === undefined ? "" : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const day = ts => ts ? new Date(ts).toISOString().slice(0, 10) : "";
    const rows = live(state).map(e => {
      const r = e.resolution || {};
      return [e.id, e.kind, day(e.createdAt), e.title, e.expectation, e.confidence, day(e.reviewAt), e.status, e.status === "resolved" ? r.outcome : "",
        r.process || "", r.result || "", e.status === "resolved" ? forecastScore(e.confidence, r.outcome) : "", judgmentScore(e) ?? "", e.tags.join(" "), e.details, e.options, e.reasoning, r.lesson || ""].map(q).join(",");
    });
    return [cols.join(","), ...rows].join("\r\n") + "\r\n";
  }

  return { DAY, uid, emptyState, validState, normalizeEntry, merge, sameState, isDue, forecastScore, processPoints, judgmentScore, quadrant, QUADRANTS,
    forecasts, calibration, hitRateNear, summary, addMonths, ics, icsEvent, csv, clampConf };
});
