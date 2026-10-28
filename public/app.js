/* Gut Check app (browser). Depends on lib/core.js, lib/devil.js and the skins. */
(() => {
  "use strict";
  const C = window.GutCore, D = window.GutDevil;
  const VERSION = "1.1.4";
  const DAY = C.DAY;

  /* ---------- tiny helpers ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const KEY = "gutcheck.state", PREF = "gutcheck.prefs", SYNC = "gutcheck.sync", DRAFT = "gutcheck.draft";
  const reduceMotion = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const fmtDate = ts => new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const rtf = typeof Intl !== "undefined" && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }) : null;
  function rel(ts) {
    const d = (ts - Date.now()) / DAY;
    if (!rtf) return fmtDate(ts);
    const a = Math.abs(d);
    if (a < 1) return rtf.format(Math.round(d * 24), "hour");
    if (a < 14) return rtf.format(Math.round(d), "day");
    if (a < 60) return rtf.format(Math.round(d / 7), "week");
    if (a < 365 * 1.5) return rtf.format(Math.round(d / 30.4), "month");
    return rtf.format(Math.round(d / 365), "year");
  }
  const dateInput = ts => { const d = new Date(ts); const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const fromDateInput = v => { const [y, m, d] = v.split("-").map(Number); return new Date(y, m - 1, d, 9, 0, 0).getTime(); };

  function confWord(c) {
    return c <= 10 ? "Almost certainly not" : c <= 30 ? "Unlikely" : c <= 45 ? "Leaning no" : c <= 54 ? "Coin flip" : c <= 69 ? "Leaning yes" : c <= 84 ? "Likely" : c <= 94 ? "Very likely" : "Near certain";
  }
  function toast(msg, ms = 2800) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), ms);
  }
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---------- state ---------- */
  let state = C.merge(store.get(KEY, C.emptyState()), C.emptyState());
  const prefs = Object.assign({ theme: "auto", devil: true, autoDevil: false, skin: "pip", engine: "auto", ollamaUrl: "", ollamaModel: "qwen3:8b" }, store.get(PREF, {}));
  const sync = Object.assign({ url: "", token: "", rev: 0, lastAt: 0, lastError: "" }, store.get(SYNC, {}));
  let server = null;        // /api/status of a reachable Gut Check server
  let sameOrigin = false;   // the page itself is served by a Gut Check server

  const savePrefs = () => store.set(PREF, prefs);
  const saveSync = () => store.set(SYNC, { url: sync.url, token: sync.token, rev: sync.rev, lastAt: sync.lastAt, lastError: sync.lastError });
  function persist() {
    if (!store.set(KEY, state)) toast("Couldn't save in this browser (storage full or blocked). Export a backup!", 6000);
    updateDue(); scheduleSync();
  }
  const live = () => state.entries.filter(e => !e.deleted);
  const getEntry = id => state.entries.find(e => e.id === id && !e.deleted);
  function upsert(e) {
    const prev = state.entries.find(x => x.id === e.id);
    e.updatedAt = Math.max(Date.now(), ((prev && prev.updatedAt) || 0) + 1);
    state = C.merge(state, { entries: [e] });
    persist();
    return getEntry(e.id) || e;
  }

  function applyTheme() {
    if (prefs.theme === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = prefs.theme;
  }
  function updateDue() {
    const n = live().filter(e => C.isDue(e)).length;
    const dot = $("#dueDot"); dot.hidden = !n; dot.textContent = n;
    document.title = n ? `(${n}) Gut Check` : "Gut Check";
  }

  /* ---------- routing ---------- */
  const view = $("#view");
  function route() {
    const h = (location.hash || "#today").slice(1);
    const [name, arg] = h.split("/");
    $$(".tabs a").forEach(a => a.classList.toggle("on", a.dataset.tab === (name === "entry" || name === "edit" ? "journal" : name)));
    return { name: name || "today", arg };
  }
  function render() {
    const r = route();
    const fn = { today: viewToday, new: viewNew, edit: viewNew, journal: viewJournal, entry: viewEntry, scores: viewScores, settings: viewSettings }[r.name] || viewToday;
    fn(r.arg);
    updateDue();
  }
  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
  const go = h => { if (location.hash === h) render(); else location.hash = h; };

  /* ---------- shared pieces ---------- */
  function entryCard(e) {
    const due = C.isDue(e);
    let status;
    if (e.status === "resolved") {
      const o = e.resolution.outcome;
      status = `<span class="pill ${o === 1 ? "good" : o === 0 ? "bad" : "neutral"}">${o === 1 ? "Came true" : o === 0 ? "Didn't happen" : "Partly"}</span>`;
    } else if (e.status === "void") status = `<span class="pill neutral">Can't tell</span>`;
    else status = due ? `<span class="pill due">Due for review</span>` : "";
    const when = e.status === "open" ? (due ? `was due ${rel(e.reviewAt)}` : `check back ${rel(e.reviewAt)}`) : `logged ${fmtDate(e.createdAt)}`;
    return `<a class="card entry${due ? " due" : ""}" href="#entry/${esc(e.id)}">
      <div class="row"><span class="pill ${e.kind}">${e.kind}</span>${status}</div>
      <div class="t">${esc(e.title)}</div>
      <div class="meta">${e.confidence}% sure · ${when}${e.status === "resolved" ? ` · score ${C.judgmentScore(e)}` : ""}${e.tags.length ? " · " + e.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("") : ""}</div>
    </a>`;
  }
  const scoreText = v => v === null || v === undefined ? "–" : String(v);

  /* ---------- Today ---------- */
  function viewToday() {
    const es = live();
    const due = es.filter(e => C.isDue(e)).sort((a, b) => a.reviewAt - b.reviewAt);
    const upcoming = es.filter(e => e.status === "open" && !C.isDue(e)).sort((a, b) => a.reviewAt - b.reviewAt).slice(0, 5);
    const s = C.summary(state);
    if (!es.length) {
      view.innerHTML = `
        <div class="card">
          <h1>Is your gut any good?</h1>
          <p>Gut Check keeps you honest about your own judgment.</p>
          <div class="stack">
            <div><b>Decision journal.</b> Write down a decision and what you expect to happen. Months later, it asks how it actually went and scores your judgment.</div>
            <div><b>Prediction tracker.</b> Log predictions with how sure you are. Over time you'll see whether "90% sure" really means 90% for you.</div>
            <div><b>Devil's advocate.</b> Optional. Ask for a polite, well-reasoned counterargument before you commit${prefs.devil ? "" : " (turned off in Settings)"}.</div>
          </div>
          <hr>
          <div class="row"><a class="btn primary" href="#new">Record a decision</a><a class="btn" href="#new/prediction">Make a prediction</a></div>
        </div>
        <p class="muted small center">Your journal is saved ${server ? "on your Gut Check server and in this browser" : "in this browser only. See Settings for backups and server sync"}.</p>`;
      return;
    }
    view.innerHTML = `
      ${due.length ? `<div class="section-title"><h2>Time to check in</h2><span class="muted small">${due.length} due</span></div>
        ${due.map(e => `<div class="card due">
          <div class="row between"><span class="pill ${e.kind}">${e.kind}</span><span class="muted small">logged ${fmtDate(e.createdAt)}</span></div>
          <div class="t" style="font-weight:650;font-size:1.05rem;margin:8px 0 4px">${esc(e.title)}</div>
          <p class="muted small">${e.kind === "decision" && e.expectation ? `You expected: ${esc(e.expectation)} · ` : ""}${e.confidence}% sure</p>
          <div class="row"><button class="btn primary small" data-review="${esc(e.id)}">How did it turn out?</button><button class="btn small ghost" data-snooze="${esc(e.id)}">Not yet</button></div>
        </div>`).join("")}` : ""}
      <div class="grid4" style="margin-top:${due.length ? 18 : 0}px">
        <div class="tile"><div class="k">Judgment</div><div class="v">${scoreText(s.judgment)}</div><div class="s">${s.judgedCount ? `${s.judgedCount} reviewed` : "after your first review"}</div></div>
        <div class="tile"><div class="k">Calibration</div><div class="v">${scoreText(s.calibration.score)}</div><div class="s">${s.calibration.n ? `${s.calibration.n} resolved` : "no results yet"}</div></div>
        <div class="tile"><div class="k">Open</div><div class="v">${s.open}</div><div class="s">${s.decisions} decisions, ${s.predictions} predictions</div></div>
        <div class="tile"><div class="k">Resolved</div><div class="v">${s.resolved}</div><div class="s"><a href="#scores">see scores</a></div></div>
      </div>
      <div class="row" style="margin:16px 0"><a class="btn primary" href="#new">+ Decision</a><a class="btn" href="#new/prediction">+ Prediction</a></div>
      ${upcoming.length ? `<div class="section-title"><h2>Coming up</h2><a class="small" href="#journal">all entries</a></div>${upcoming.map(entryCard).join("")}` : ""}
      ${!due.length && !upcoming.length ? `<div class="card empty">Nothing open right now. <a href="#journal">Browse your journal</a>.</div>` : ""}`;
    wireReviewButtons(view);
  }
  function wireReviewButtons(root) {
    $$("[data-review]", root).forEach(b => b.onclick = () => openReview(b.dataset.review));
    $$("[data-snooze]", root).forEach(b => b.onclick = () => openSnooze(b.dataset.snooze));
  }

  /* ---------- New / Edit ---------- */
  const PRESETS = [["1 week", 0, 7], ["1 month", 1], ["3 months", 3], ["6 months", 6], ["1 year", 12]];
  function presetTs(p, from = Date.now()) { return p[2] ? from + p[2] * DAY : C.addMonths(from, p[1]); }

  function viewNew(arg) {
    const editing = route().name === "edit" ? getEntry(arg) : null;
    let d;
    if (editing) d = JSON.parse(JSON.stringify(editing));
    else {
      const saved = store.get(DRAFT, null);
      const kind = arg === "prediction" ? "prediction" : "decision";
      d = saved && saved.kind === kind ? saved : { kind, title: "", details: "", options: "", reasoning: "", expectation: "", confidence: kind === "decision" ? 70 : 60, stakes: 2, tags: [], reviewAt: presetTs(kind === "decision" ? PRESETS[2] : PRESETS[1]), devil: [] };
    }
    const isDec = () => d.kind === "decision";
    const keepDraft = () => { if (!editing) store.set(DRAFT, d); };

    const draw = () => {
      view.innerHTML = `
      <h1>${editing ? "Edit entry" : isDec() ? "Record a decision" : "Make a prediction"}</h1>
      ${editing ? "" : `<div class="seg" role="tablist" style="margin-bottom:6px"><button type="button" data-kind="decision" class="${isDec() ? "on" : ""}">Decision</button><button type="button" data-kind="prediction" class="${isDec() ? "" : "on"}">Prediction</button></div>`}
      <form id="entryForm" class="card" autocomplete="off">
        ${isDec() ? `
          <label class="f"><span>What did you decide?</span><input type="text" name="title" maxlength="500" required placeholder="e.g. Take the job offer in Denver" value="${esc(d.title)}"></label>
          <label class="f"><span>The situation</span><textarea name="details" placeholder="What's going on, what's at stake, what you know so far">${esc(d.details)}</textarea></label>
          <label class="f"><span>Options you considered</span><textarea name="options" rows="2" placeholder="e.g. Stay and ask for a raise; keep looking">${esc(d.options)}</textarea></label>
          <label class="f"><span>Why this one?</span><textarea name="reasoning" rows="3" placeholder="Your reasons, in a sentence or three">${esc(d.reasoning)}</textarea></label>
          <label class="f"><span>What do you expect to happen?</span><input type="text" name="expectation" maxlength="2000" placeholder="e.g. I'll earn 20% more and be happier within a year" value="${esc(d.expectation)}"><small>Make it checkable. You'll be asked whether this came true.</small></label>`
        : `
          <label class="f"><span>Your prediction</span><input type="text" name="title" maxlength="500" required placeholder="e.g. The project ships before March 1" value="${esc(d.title)}"><small>Phrase it so it's clearly true or false later.</small></label>
          <label class="f"><span>Why you think so <span class="muted">(optional)</span></span><textarea name="details" rows="3" placeholder="Your reasoning or evidence">${esc(d.details)}</textarea></label>`}
        <div class="f conf" style="margin-top:16px">
          <span style="font-weight:600;display:block">${isDec() ? "How sure are you it turns out as expected?" : "How likely is it to come true?"}</span>
          <div class="readout"><span class="num" id="confNum">${d.confidence}%</span><span class="word" id="confWord">${confWord(d.confidence)}</span></div>
          <input type="range" name="confidence" min="1" max="99" step="1" value="${d.confidence}" aria-label="Confidence in percent">
          <div class="scale"><span>1% no way</span><span>50% coin flip</span><span>99% certain</span></div>
        </div>
        <div class="f" style="margin-top:16px"><span style="font-weight:600;display:block;margin-bottom:6px">${isDec() ? "When should I ask you how it went?" : "When will you know?"}</span>
          <div class="chips" id="presets">${PRESETS.map((p, i) => `<button type="button" class="chip" data-p="${i}">${p[0]}</button>`).join("")}</div>
          <input type="date" name="reviewAt" style="margin-top:8px" value="${dateInput(d.reviewAt)}" min="${dateInput(Date.now())}">
          <small class="hint" id="reviewHint"></small>
        </div>
        ${isDec() ? `<div class="f" style="margin-top:14px"><span style="font-weight:600;display:block;margin-bottom:6px">Stakes</span>
          <div class="seg" id="stakes">${[[1, "Low"], [2, "Medium"], [3, "High"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${d.stakes === v ? "on" : ""}">${l}</button>`).join("")}</div></div>` : ""}
        <label class="f"><span>Tags <span class="muted">(optional)</span></span><input type="text" name="tags" placeholder="work, money, health" value="${esc(d.tags.join(", "))}"></label>
        <div id="devilArea"></div>
        <div class="row" style="margin-top:18px">
          <button class="btn primary" type="submit">${editing ? "Save changes" : "Save to journal"}</button>
          ${prefs.devil ? `<button class="btn devil-btn" type="button" id="argue">Argue with me first</button>` : ""}
          <button class="btn ghost" type="button" id="cancel">${editing ? "Cancel" : "Clear"}</button>
        </div>
      </form>`;
      wire();
      if (d.devil && d.devil.length && !editing) showDevilResult($("#devilArea"), d.devil[d.devil.length - 1]);
    };

    const readForm = f => {
      d.title = f.title.value.trim();
      d.details = f.details ? f.details.value : "";
      if (isDec()) { d.options = f.options.value; d.reasoning = f.reasoning.value; d.expectation = f.expectation.value.trim(); }
      d.confidence = +f.confidence.value;
      if (f.reviewAt.value) d.reviewAt = fromDateInput(f.reviewAt.value);
      d.tags = f.tags.value.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
    };
    const wire = () => {
      const f = $("#entryForm");
      const hint = () => { $("#reviewHint").textContent = `${fmtDate(d.reviewAt)} (${rel(d.reviewAt)})`; $$("#presets .chip").forEach((c, i) => c.classList.toggle("on", dateInput(presetTs(PRESETS[i])) === dateInput(d.reviewAt))); };
      hint();
      $$("[data-kind]").forEach(b => b.onclick = () => { readForm(f); keepDraft(); go(b.dataset.kind === "prediction" ? "#new/prediction" : "#new"); });
      f.confidence.oninput = () => { d.confidence = +f.confidence.value; $("#confNum").textContent = d.confidence + "%"; $("#confWord").textContent = confWord(d.confidence); keepDraft(); };
      $$("#presets .chip").forEach(c => c.onclick = () => { d.reviewAt = presetTs(PRESETS[+c.dataset.p]); f.reviewAt.value = dateInput(d.reviewAt); hint(); keepDraft(); });
      f.reviewAt.onchange = () => { if (f.reviewAt.value) { d.reviewAt = fromDateInput(f.reviewAt.value); hint(); keepDraft(); } };
      $$("#stakes button").forEach(b => b.onclick = () => { d.stakes = +b.dataset.v; $$("#stakes button").forEach(x => x.classList.toggle("on", x === b)); keepDraft(); });
      f.addEventListener("input", () => { readForm(f); keepDraft(); });
      $("#cancel").onclick = () => {
        if (editing) return go("#entry/" + editing.id);
        if (d.title && !confirm("Clear this draft?")) return;
        store.del(DRAFT); render();
      };
      const argue = $("#argue");
      if (argue) argue.onclick = async () => {
        readForm(f);
        if (!d.title) { f.title.focus(); return toast("Write the decision or prediction first."); }
        argue.disabled = true;
        const res = await runDevil(Object.assign({ id: d.id || "draft-" + Date.now() }, C.normalizeEntry(d)), $("#devilArea"));
        argue.disabled = false; argue.textContent = "Argue again";
        if (res) { d.devil = (d.devil || []).concat(res); keepDraft(); }
      };
      f.onsubmit = ev => {
        ev.preventDefault();
        readForm(f);
        if (!d.title) { f.title.focus(); return; }
        if (d.reviewAt < Date.now() - DAY && !editing) { toast("Pick a review date in the future."); return; }
        const e = C.normalizeEntry(Object.assign({}, d, { id: d.id || C.uid(), createdAt: d.createdAt || Date.now(), status: d.status || "open" }));
        const saved = upsert(e);
        store.del(DRAFT);
        toast(editing ? "Saved." : `Saved. I'll ask you about it ${rel(saved.reviewAt)}.`);
        go("#entry/" + saved.id + (!editing && prefs.devil && prefs.autoDevil && !saved.devil.length ? "?argue" : ""));
      };
    };
    draw();
  }

  /* ---------- Journal ---------- */
  const jf = { q: "", kind: "all", status: "all" };
  function viewJournal() {
    const draw = () => {
      const q = jf.q.trim().toLowerCase();
      let es = live().filter(e => (jf.kind === "all" || e.kind === jf.kind) &&
        (jf.status === "all" || (jf.status === "due" ? C.isDue(e) : jf.status === "open" ? e.status === "open" : e.status !== "open")) &&
        (!q || [e.title, e.details, e.options, e.reasoning, e.expectation, e.tags.join(" ")].join(" ").toLowerCase().includes(q)));
      es.sort((a, b) => b.createdAt - a.createdAt);
      $("#list").innerHTML = es.length ? es.map(entryCard).join("") : `<div class="card empty">${live().length ? "Nothing matches." : `Your journal is empty. <a href="#new">Record your first decision</a>.`}</div>`;
      $("#count").textContent = `${es.length} ${es.length === 1 ? "entry" : "entries"}`;
    };
    view.innerHTML = `
      <div class="row between"><h1 style="margin:0">Journal</h1><span class="muted small" id="count"></span></div>
      <input type="search" id="q" placeholder="Search your journal" value="${esc(jf.q)}" style="margin:12px 0 10px" aria-label="Search">
      <div class="row" style="margin-bottom:14px">
        <div class="seg" id="fk">${[["all", "All"], ["decision", "Decisions"], ["prediction", "Predictions"]].map(([v, l]) => `<button data-v="${v}" class="${jf.kind === v ? "on" : ""}">${l}</button>`).join("")}</div>
        <div class="seg" id="fs">${[["all", "Any"], ["due", "Due"], ["open", "Open"], ["done", "Done"]].map(([v, l]) => `<button data-v="${v}" class="${jf.status === v ? "on" : ""}">${l}</button>`).join("")}</div>
      </div>
      <div id="list"></div>`;
    $("#q").oninput = e => { jf.q = e.target.value; draw(); };
    $$("#fk button").forEach(b => b.onclick = () => { jf.kind = b.dataset.v; $$("#fk button").forEach(x => x.classList.toggle("on", x === b)); draw(); });
    $$("#fs button").forEach(b => b.onclick = () => { jf.status = b.dataset.v; $$("#fs button").forEach(x => x.classList.toggle("on", x === b)); draw(); });
    draw();
  }

  /* ---------- Entry detail ---------- */
  function viewEntry(arg) {
    const [id, flag] = String(arg || "").split("?");
    const e = getEntry(id);
    if (!e) { view.innerHTML = `<div class="card empty">That entry doesn't exist (it may have been deleted). <a href="#journal">Back to the journal</a></div>`; return; }
    const isDec = e.kind === "decision";
    const r = e.resolution;
    const row = (k, v) => v ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : "";
    let result = "";
    if (e.status === "resolved") {
      const fs = C.forecastScore(e.confidence, r.outcome), js = C.judgmentScore(e), q = C.quadrant(e);
      result = `<div class="card">
        <h2>How it turned out</h2>
        <div class="grid2 wrap">
          <div class="tile"><div class="k">${isDec ? "Judgment score" : "Forecast score"}</div><div class="v">${isDec ? js : fs}</div><div class="s">out of 100</div></div>
          <div class="tile"><div class="k">Outcome</div><div class="v" style="font-size:1.3rem">${r.outcome === 1 ? "Came true" : r.outcome === 0 ? "Didn't happen" : "Partly"}</div><div class="s">you said ${e.confidence}%${isDec ? ` · forecast ${fs}` : ""}</div></div>
        </div>
        ${q ? `<p style="margin-top:12px"><span class="pill ${q === "earned" ? "good" : q === "lesson" ? "bad" : "neutral"}">${C.QUADRANTS[q].label}</span> <span class="muted small">${C.QUADRANTS[q].hint}: decision rated ${r.process}/5, result ${r.result}/5</span></p>` : ""}
        ${r.lesson ? `<p class="prose" style="margin-top:10px"><b>Lesson:</b> ${esc(r.lesson)}</p>` : ""}
        <p class="muted small">Reviewed ${fmtDate(r.at || e.updatedAt)}.</p>
        <button class="btn small ghost" id="reopen">Undo review</button>
      </div>`;
    } else if (e.status === "void") {
      result = `<div class="card"><h2>Couldn't tell</h2><p class="muted">You marked this as impossible to judge, so it doesn't count toward your scores.</p>${r && r.lesson ? `<p class="prose">${esc(r.lesson)}</p>` : ""}<button class="btn small ghost" id="reopen">Re-open</button></div>`;
    }
    view.innerHTML = `
      <p><a href="#journal">← Journal</a></p>
      <div class="card">
        <div class="row between"><div class="row"><span class="pill ${e.kind}">${e.kind}</span>${C.isDue(e) ? `<span class="pill due">Due for review</span>` : ""}</div><span class="muted small">${fmtDate(e.createdAt)}</span></div>
        <h1 style="margin-top:10px" class="prose">${esc(e.title)}</h1>
        <dl class="kv">
          ${row(isDec ? "Situation" : "Reasoning", e.details)}
          ${isDec ? row("Options", e.options) + row("Why", e.reasoning) + row("Expected", e.expectation) : ""}
          <dt>Confidence</dt><dd>${e.confidence}% · ${confWord(e.confidence).toLowerCase()}</dd>
          ${isDec ? `<dt>Stakes</dt><dd>${["", "Low", "Medium", "High"][e.stakes]}</dd>` : ""}
          <dt>${e.status === "open" ? "Check back" : "Review date"}</dt><dd>${fmtDate(e.reviewAt)} (${rel(e.reviewAt)})${e.snoozes ? ` · postponed ${e.snoozes}×` : ""}</dd>
          ${e.tags.length ? `<dt>Tags</dt><dd>${e.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</dd>` : ""}
        </dl>
        <div class="row" style="margin-top:16px">
          ${e.status === "open" ? `<button class="btn primary" data-review="${esc(e.id)}">${C.isDue(e) ? "How did it turn out?" : "Review early"}</button><button class="btn" data-snooze="${esc(e.id)}">Postpone</button>` : ""}
          ${e.status === "open" ? `<button class="btn" id="ics">Add to calendar</button>` : ""}
          <a class="btn ghost" href="#edit/${esc(e.id)}">Edit</a>
          <button class="btn ghost danger" id="del">Delete</button>
        </div>
      </div>
      ${result}
      ${prefs.devil || e.devil.length ? `<div class="section-title"><h2>Devil's advocate</h2>${prefs.devil ? `<button class="btn small devil-btn" id="argue">${e.devil.length ? "Argue again" : "Argue with me"}</button>` : ""}</div>
        <div id="devilArea">${e.devil.length ? "" : `<p class="muted small">Ask for the strongest polite case against this ${e.kind}.</p>`}</div>
        ${e.devil.length > 1 ? `<details><summary>Earlier counterarguments (${e.devil.length - 1})</summary><div id="olderDevil"></div></details>` : ""}` : ""}`;
    wireReviewButtons(view);
    const latest = e.devil[e.devil.length - 1];
    if (latest) showDevilResult($("#devilArea"), latest);
    if (e.devil.length > 1) { const box = $("#olderDevil"); e.devil.slice(0, -1).reverse().forEach(x => { const div = document.createElement("div"); box.appendChild(div); showDevilResult(div, x); }); }
    const ics = $("#ics"); if (ics) ics.onclick = () => download(`gut-check-${e.id}.ics`, C.ics([e], appUrl(), "Gut Check"), "text/calendar");
    $("#del").onclick = () => { if (!confirm("Delete this entry for good? It will be removed from every synced device.")) return; upsert(Object.assign({}, e, { deleted: true })); toast("Deleted."); go("#journal"); };
    const ro = $("#reopen"); if (ro) ro.onclick = () => { upsert(Object.assign({}, e, { status: "open", resolution: null })); render(); };
    const argue = $("#argue");
    const doArgue = async () => {
      argue.disabled = true;
      const res = await runDevil(e, $("#devilArea"));
      argue.disabled = false;
      if (res) { const cur = getEntry(e.id); upsert(Object.assign({}, cur, { devil: cur.devil.concat(res) })); }
    };
    if (argue) argue.onclick = doArgue;
    if (argue && flag === "argue") { history.replaceState(null, "", "#entry/" + e.id); doArgue(); }
  }
  const appUrl = () => location.href.split("#")[0];

  /* ---------- Review & postpone dialogs ---------- */
  const modal = $("#modal"), modalBody = $("#modalBody");
  function openModal(html) { modalBody.innerHTML = html; if (!modal.open) modal.showModal(); return modalBody; }
  function closeModal() { if (modal.open) modal.close(); }
  modal.addEventListener("click", ev => { if (ev.target === modal) closeModal(); });

  function openReview(id) {
    const e = getEntry(id); if (!e) return;
    const isDec = e.kind === "decision";
    const ans = { outcome: null, result: null, process: null, lesson: "" };
    const rateRow = (name, labels) => `<div class="rate" data-name="${name}">${labels.map((l, i) => `<button type="button" data-v="${i + 1}"><b>${i + 1}</b>${l}</button>`).join("")}</div>`;
    const b = openModal(`
      <h2>${isDec ? "How did it go?" : "Did it happen?"}</h2>
      <p class="muted small">On ${fmtDate(e.createdAt)} you ${isDec ? "decided" : "predicted"}:</p>
      <p style="font-weight:650" class="prose">${esc(e.title)}</p>
      ${isDec && e.expectation ? `<p class="small prose">You expected: <b>${esc(e.expectation)}</b> and were <b>${e.confidence}%</b> sure.</p>` : `<p class="small">You were <b>${e.confidence}%</b> sure.</p>`}
      <hr>
      <p style="font-weight:600;margin-bottom:6px">${isDec ? "Did what you expected happen?" : "Did it come true?"}</p>
      <div class="choice3" id="oc">${isDec ? `<button type="button" data-v="1">Yes</button><button type="button" data-v="0.5">Partly</button><button type="button" data-v="0">No</button>`
        : `<button type="button" data-v="1">Yes</button><button type="button" data-v="0">No</button><button type="button" data-v="void">Can't tell</button>`}</div>
      ${isDec ? `
        <p style="font-weight:600;margin:16px 0 6px">How did things turn out for you overall?</p>
        ${rateRow("result", ["Terrible", "Poor", "Okay", "Good", "Great"])}
        <p style="font-weight:600;margin:16px 0 4px">Knowing only what you knew back then, how good was the decision?</p>
        <small class="hint" style="margin:0 0 6px">Try to judge the decision, not the luck.</small>
        ${rateRow("process", ["Bad call", "Weak", "Fair", "Good", "Excellent"])}` : ""}
      <label class="f"><span>${isDec ? "What did you learn?" : "Notes"} <span class="muted">(optional)</span></span><textarea id="lesson" rows="3"></textarea></label>
      <div class="row" style="margin-top:16px"><button class="btn primary" id="saveRev" disabled>Save review</button><button class="btn ghost" id="later">Too early to tell</button><button class="btn ghost" id="x">Close</button></div>`);
    const ready = () => { $("#saveRev", b).disabled = ans.outcome === null || (isDec && ans.outcome !== "void" && (!ans.result || !ans.process)); };
    $$("#oc button", b).forEach(x => x.onclick = () => { ans.outcome = x.dataset.v; $$("#oc button", b).forEach(y => y.classList.toggle("on", y === x)); ready(); });
    $$(".rate", b).forEach(rw => $$("button", rw).forEach(x => x.onclick = () => { ans[rw.dataset.name] = +x.dataset.v; $$("button", rw).forEach(y => y.classList.toggle("on", y === x)); ready(); }));
    $("#x", b).onclick = closeModal;
    $("#later", b).onclick = () => openSnooze(id);
    $("#saveRev", b).onclick = () => {
      const lesson = $("#lesson", b).value.trim();
      const cur = getEntry(id);
      let upd;
      if (ans.outcome === "void") upd = Object.assign({}, cur, { status: "void", resolution: { at: Date.now(), lesson } });
      else upd = Object.assign({}, cur, { status: "resolved", resolution: { at: Date.now(), outcome: +ans.outcome, result: ans.result || null, process: ans.process || null, lesson } });
      const saved = upsert(upd);
      showReviewResult(saved);
      render();
    };
  }
  function showReviewResult(e) {
    if (e.status !== "resolved") { closeModal(); toast("Marked as can't tell. It won't affect your scores."); return; }
    const r = e.resolution, fs = C.forecastScore(e.confidence, r.outcome), js = C.judgmentScore(e), q = C.quadrant(e);
    const right = r.outcome === 1 ? e.confidence >= 50 : r.outcome === 0 ? e.confidence < 50 : null;
    const s = C.calibration(state);
    const b = openModal(`
      <h2>${right === null ? "Partly right" : right ? "Your gut was right" : "Your gut missed this one"}</h2>
      <div class="hero" style="margin:10px 0 14px"><div class="big">${e.kind === "decision" ? js : fs}</div><div><b>${e.kind === "decision" ? "Judgment score" : "Forecast score"}</b><div class="muted small">out of 100. A 50% guess scores 75, being 99% sure and wrong scores 2.</div></div></div>
      ${e.kind === "decision" ? `<p class="small">Forecast: <b>${fs}</b> (you said ${e.confidence}%). Decision quality: <b>${r.process}/5</b>. The judgment score is the average of the two.</p>` : ""}
      ${q ? `<p><span class="pill ${q === "earned" ? "good" : q === "lesson" ? "bad" : "neutral"}">${C.QUADRANTS[q].label}</span> <span class="small muted">${C.QUADRANTS[q].hint}</span></p>` : ""}
      <p class="small muted">Across ${s.n} resolved ${s.n === 1 ? "forecast" : "forecasts"} your calibration score is ${scoreText(s.score)}.</p>
      <div class="row"><button class="btn primary" id="ok">Done</button><a class="btn ghost" href="#scores" id="sc">See all scores</a></div>`);
    $("#ok", b).onclick = closeModal; $("#sc", b).onclick = closeModal;
  }
  function openSnooze(id) {
    const e = getEntry(id); if (!e) return;
    const b = openModal(`<h2>Ask me again in…</h2><p class="muted small">${esc(e.title)}</p>
      <div class="chips" id="sn">${[["1 week", 0, 7], ["2 weeks", 0, 14], ["1 month", 1], ["3 months", 3], ["6 months", 6]].map((p, i) => `<button class="chip" data-i="${i}">${p[0]}</button>`).join("")}</div>
      <div class="row" style="margin-top:16px"><button class="btn ghost" id="x">Cancel</button></div>`);
    const opts = [[0, 7], [0, 14], [1], [3], [6]];
    $$("#sn .chip", b).forEach(c => c.onclick = () => {
      const o = opts[+c.dataset.i];
      const at = o[1] ? Date.now() + o[1] * DAY : C.addMonths(Date.now(), o[0]);
      upsert(Object.assign({}, getEntry(id), { reviewAt: at, snoozes: (e.snoozes || 0) + 1 }));
      closeModal(); toast(`Okay, I'll ask again ${rel(at)}.`); render();
    });
    $("#x", b).onclick = closeModal;
  }

  /* ---------- Scores ---------- */
  let scoreKind = "";
  function viewScores() {
    const s = C.summary(state);
    const cal = C.calibration(state, scoreKind ? { kind: scoreKind } : {});
    const resolved = live().filter(e => e.status === "resolved").sort((a, b) => (b.resolution.at || 0) - (a.resolution.at || 0));
    let calLine = "Resolve a few predictions or decisions to see how calibrated you are.";
    if (cal.n) {
      const oc = Math.round(cal.overconfidence * 100);
      const ac = Math.round(cal.avgConfidence * 100), hr = Math.round(cal.hitRate * 100);
      calLine = Math.abs(oc) <= 4 ? `Nicely calibrated: on average you're ${ac}% sure and right ${hr}% of the time.`
        : oc > 0 ? `You're overconfident by about ${oc} points: on average you're ${ac}% sure but right only ${hr}% of the time.`
        : `You're underconfident by about ${-oc} points: on average you're ${ac}% sure but right ${hr}% of the time. Trust your gut a bit more.`;
      if (cal.n < 10) calLine += ` (Only ${cal.n} results so far, so take this lightly.)`;
    }
    const qd = s.quadrants;
    view.innerHTML = `
      <h1>Scores</h1>
      <div class="card">
        <div class="hero"><div class="big">${scoreText(s.judgment)}</div><div><h2 style="margin:0">Judgment</h2><div class="muted small">${s.judgedCount ? `Average over ${s.judgedCount} reviewed ${s.judgedCount === 1 ? "decision" : "decisions"}. Half forecast accuracy, half how sound the decision was in hindsight.` : "Review your first decision to get a judgment score."}</div></div></div>
      </div>
      <div class="card">
        <div class="row between"><h2 style="margin:0">Calibration</h2>
          <div class="seg" id="ck">${[["", "All"], ["decision", "Decisions"], ["prediction", "Predictions"]].map(([v, l]) => `<button data-v="${v}" class="${scoreKind === v ? "on" : ""}">${l}</button>`).join("")}</div></div>
        <div class="grid2" style="margin:14px 0">
          <div class="tile"><div class="k">Calibration score</div><div class="v">${scoreText(cal.score)}</div><div class="s">100 is perfect, always guessing 50% gets 75</div></div>
          <div class="tile"><div class="k">Brier score</div><div class="v">${cal.brier === null ? "–" : cal.brier.toFixed(3)}</div><div class="s">lower is better · 0.25 = coin flip</div></div>
        </div>
        <p>${calLine}</p>
        ${calChart(cal)}
        <details><summary>Show as a table</summary>
          <table class="data"><thead><tr><th>You said</th><th>Times</th><th>Came true</th></tr></thead><tbody>
          ${cal.bins.filter(b => b.n).map(b => `<tr><td>${b.lo}–${b.hi === 100 ? 99 : b.hi - 1}%</td><td>${b.n}</td><td>${Math.round(b.freq * 100)}%</td></tr>`).join("") || `<tr><td colspan="3" class="muted">No results yet</td></tr>`}
          </tbody></table></details>
      </div>
      <div class="card">
        <h2>Luck or skill?</h2>
        <p class="muted small">Every reviewed decision, sorted by how sound the decision was (your hindsight rating) and how it turned out. Good results from shaky decisions are luck, not skill.</p>
        <div class="quad">
          <div></div><div class="ax">Good result</div><div class="ax">Poor result</div>
          <div class="ax v">Sound decision</div><div class="cell earned"><b>${qd.earned}</b>${C.QUADRANTS.earned.label}</div><div class="cell"><b>${qd.unlucky}</b>${C.QUADRANTS.unlucky.label}</div>
          <div class="ax v">Shaky decision</div><div class="cell"><b>${qd.lucky}</b>${C.QUADRANTS.lucky.label}</div><div class="cell lesson"><b>${qd.lesson}</b>${C.QUADRANTS.lesson.label}</div>
        </div>
      </div>
      ${resolved.length ? `<div class="section-title"><h2>Recent results</h2></div>${resolved.slice(0, 12).map(entryCard).join("")}` : ""}
      <details class="card flat"><summary>How the scores work</summary>
        <p class="small"><b>Forecast score</b> = 100 × (1 − (p − o)²), where p is how sure you were and o is the outcome (1 = it happened, 0 = it didn't, 0.5 = partly). Being 90% sure and right scores 99; 90% sure and wrong scores 19; a 50% shrug always scores 75.</p>
        <p class="small"><b>Calibration score</b> is the average forecast score across everything you've resolved. The <b>Brier score</b> is the same thing on the usual 0–1 scale (lower is better).</p>
        <p class="small"><b>Judgment score</b> (decisions) averages the forecast score with your hindsight rating of the decision (1/5 = 0, 5/5 = 100).</p>
        <p class="small"><b>The chart</b> groups your forecasts by the confidence you gave. Dots on the dashed line mean that when you say 70%, things happen about 70% of the time. Dots below the line mean overconfidence.</p>
      </details>`;
    $$("#ck button").forEach(b => b.onclick = () => { scoreKind = b.dataset.v; viewScores(); });
    wireChart();
  }
  function calChart(cal) {
    const W = 320, H = 280, L = 40, R = 12, T = 12, B = 34, w = W - L - R, h = H - T - B;
    const x = v => L + v * w, y = v => T + (1 - v) * h;
    const pts = cal.bins.filter(b => b.n);
    const ticks = [0, .25, .5, .75, 1];
    return `<div class="chart" id="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Calibration chart: how often things came true at each confidence level">
      <g class="grid">${ticks.map(t => `<line x1="${L}" x2="${L + w}" y1="${y(t)}" y2="${y(t)}"/>`).join("")}</g>
      <g class="axis">${ticks.map(t => `<text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${t * 100}%</text><text x="${x(t)}" y="${T + h + 16}" text-anchor="middle">${t * 100}%</text>`).join("")}
        <text x="${L + w / 2}" y="${H - 2}" text-anchor="middle">How sure you said you were</text>
        <text transform="translate(11 ${T + h / 2}) rotate(-90)" text-anchor="middle">Came true</text></g>
      <line class="ideal" x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}"/>
      ${pts.length > 1 ? `<polyline class="series" points="${pts.map(b => `${x(b.avgP)},${y(b.freq)}`).join(" ")}"/>` : ""}
      ${pts.map(b => `<circle class="pt" cx="${x(b.avgP)}" cy="${y(b.freq)}" r="${Math.min(11, 5 + Math.sqrt(b.n) * 1.6)}"/>
        <circle class="hit" cx="${x(b.avgP)}" cy="${y(b.freq)}" r="16" data-tip="Said ${b.lo}–${b.hi === 100 ? 99 : b.hi - 1}% (avg ${Math.round(b.avgP * 100)}%) · ${b.n}× · came true ${Math.round(b.freq * 100)}%"/>`).join("")}
      ${pts.length ? "" : `<text x="${L + w / 2}" y="${T + h / 2}" text-anchor="middle" class="muted" fill="currentColor" opacity=".6" font-size="13">Your results will appear here</text>`}
    </svg><div class="tip" hidden></div></div>`;
  }
  function wireChart() {
    const ch = $("#chart"); if (!ch) return;
    const tip = $(".tip", ch);
    $$(".hit", ch).forEach(c => {
      const show = () => { const r = ch.getBoundingClientRect(), cr = c.getBoundingClientRect(); tip.textContent = c.dataset.tip; tip.style.left = (cr.left + cr.width / 2 - r.left) + "px"; tip.style.top = (cr.top - r.top) + "px"; tip.hidden = false; };
      c.addEventListener("mouseenter", show); c.addEventListener("click", show); c.addEventListener("mouseleave", () => tip.hidden = true);
    });
  }

  /* ---------- Devil's advocate ---------- */
  function engineInfo() {
    if (!prefs.devil) return { engine: "off" };
    const srv = server && server.devil && server.devil.enabled;
    if (prefs.engine === "offline") return { engine: "offline" };
    if (prefs.engine === "server") return srv ? { engine: "server", model: server.devil.model } : { engine: "offline", why: "no Gut Check server with a local model is connected" };
    if (prefs.engine === "ollama") return prefs.ollamaUrl ? { engine: "ollama", model: prefs.ollamaModel } : { engine: "offline", why: "no Ollama address is set" };
    if (srv) return { engine: "server", model: server.devil.model };
    if (prefs.ollamaUrl) return { engine: "ollama", model: prefs.ollamaModel };
    return { engine: "offline" };
  }
  async function readNDJSON(res, onObj) {
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) onObj(JSON.parse(line)); }
    }
    if (buf.trim()) onObj(JSON.parse(buf));
  }
  async function streamServer(msgs, onDelta, signal) {
    const res = await api("devil", { method: "POST", body: JSON.stringify({ messages: msgs }), signal });
    if (!res.ok) { let m = "server said " + res.status; try { m = (await res.json()).error || m; } catch (e) {} throw new Error(m); }
    let model = "";
    await readNDJSON(res, o => { if (o.error) throw new Error(o.error); if (o.delta) onDelta(o.delta); if (o.done) model = o.model || model; });
    return { model };
  }
  async function streamOllama(msgs, onDelta, signal) {
    const url = prefs.ollamaUrl.replace(/\/+$/, "") + "/api/chat";
    const body = { model: prefs.ollamaModel, messages: msgs, stream: true, think: false, keep_alive: "15m", options: { temperature: 0.7, num_predict: 900 } };
    let res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
    if (res.status === 400) { const t = await res.text(); if (/think/i.test(t)) { delete body.think; res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal }); } else throw new Error(t.slice(0, 200)); }
    if (!res.ok) { const t = await res.text().catch(() => ""); throw new Error(res.status === 404 ? `model "${prefs.ollamaModel}" isn't installed (run: ollama pull ${prefs.ollamaModel})` : `Ollama said ${res.status} ${t.slice(0, 160)}`); }
    await readNDJSON(res, o => { if (o.error) throw new Error(o.error); if (o.message && o.message.content) onDelta(o.message.content); });
    return { model: prefs.ollamaModel };
  }

  /* The stage is built once and then patched in place, so streaming text doesn't replay every bubble's
     entrance animation or restart the sprite (that looked like flashing). Only new bubbles animate. */
  function turnParts(skin, t, i, all) {
    const v = skin.voices.find(x => x.id === t.voice) || skin.voices[0];
    const right = skin.stage === "pip" && v.id === "devil";
    const ruling = skin.stage === "tribunal" && i === all.length - 1 && /^ruling/i.test(t.text);
    return { cls: `turn v-${v.id}${right ? " right" : ""}${ruling ? " ruling" : ""}`, av: skin.stage === "tribunal" ? "" : v.avatar,
      bubble: `<span class="who" style="color:${esc(v.color)}">${esc(v.name)}</span>${esc(t.text)}` };
  }
  function srcText(o) {
    const srcLabel = o.source === "offline" ? "Built-in advocate" : o.source ? `Local model${o.model ? " · " + o.model : ""}` : "";
    return srcLabel + (o.at ? " · " + fmtDate(o.at) : "") + (o.confidence ? ` · you were ${o.confidence}% sure` : "");
  }
  function stageShell(skin) {
    let top = "";
    if (skin.stage === "pip") top = `<div class="pip-wrap">${skin.sprite}</div>`;
    if (skin.stage === "tribunal") top = `<div class="bench">${skin.voices.map(v => `<div class="judge" data-v="${esc(v.id)}">${v.avatar}<span>${esc(v.name)}</span></div>`).join("")}</div>`;
    return `<div class="devil stage-${esc(skin.stage || "single")}" data-skin="${esc(skin.id)}">
      <div class="head"><h3>${esc(skin.name)}</h3><span class="src"></span></div>
      ${top}
      <div class="notice warn small stage-note" hidden></div>
      <div class="turns"></div>
      <div class="turn waiting" hidden><div class="av"></div><div class="bubble"><span class="muted small">${esc(skin.waiting || "Thinking…")}</span> <span class="typing"><i></i><i></i><i></i></span></div></div>
    </div>`;
  }
  function renderStage(box, skin, turns, o = {}) {
    let st = box.firstElementChild;
    if (!st || !st.classList.contains("devil") || st.dataset.skin !== skin.id) { box.innerHTML = stageShell(skin); st = box.firstElementChild; }
    st.classList.toggle("thinking", !!o.thinking);
    if (o.still) st.classList.add("still"); // a saved reply: show it as-is, no entrance animations
    const src = st.querySelector(".src"), txt = srcText(o);
    if (src.textContent !== txt) src.textContent = txt;
    const speaking = turns.length ? turns[turns.length - 1].voice : null;
    st.querySelectorAll(".judge").forEach(j => j.classList.toggle("speaking", !o.thinking && j.dataset.v === speaking));
    const note = st.querySelector(".stage-note");
    note.hidden = !o.note; if (note.textContent !== (o.note || "")) note.textContent = o.note || "";
    const list = st.querySelector(".turns");
    turns.forEach((t, i, all) => {
      const p = turnParts(skin, t, i, all);
      let el = list.children[i];
      if (!el) { el = document.createElement("div"); el.innerHTML = '<div class="av"></div><div class="bubble"></div>'; list.appendChild(el); }
      if (el.className !== p.cls) el.className = p.cls;
      if (el._av !== p.av) { el._av = p.av; el.firstElementChild.innerHTML = p.av; }
      if (el._bubble !== p.bubble) { el._bubble = p.bubble; el.lastElementChild.innerHTML = p.bubble; }
    });
    while (list.children.length > turns.length) list.lastElementChild.remove();
    st.querySelector(".turn.waiting").hidden = !o.thinking;
  }
  function showDevilResult(box, res) {
    const skin = D.get(res.skin);
    renderStage(box, skin, res.turns || [], { source: res.source, model: res.model, at: res.at, confidence: res.confidence, still: true });
  }

  /* Runs the advocate for an entry, drawing into box. Resolves with the stored result, or null. */
  async function runDevil(entry, box, skinId) {
    const skin = D.get(skinId || prefs.skin);
    const ctx = { track: C.hitRateNear(state, entry.confidence) };
    const info = engineInfo();
    let turns = null, source = "offline", model = "", note = info.why ? `Using the built-in advocate because ${info.why}.` : "";
    box.innerHTML = "";
    renderStage(box, skin, [], { thinking: true });
    box.scrollIntoView({ block: "nearest", behavior: reduceMotion() ? "auto" : "smooth" });
    if (info.engine === "server" || info.engine === "ollama") {
      let last = 0, timedOut = false;
      try {
        // Each try (there is at most one retry, if the model writes out its planning notes) gets 4 minutes.
        const stream = async (msgs, onDelta) => {
          const ctrl = new AbortController();
          const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, 240e3);
          try { return info.engine === "server" ? await streamServer(msgs, onDelta, ctrl.signal) : await streamOllama(msgs, onDelta, ctrl.signal); }
          finally { clearTimeout(timer); }
        };
        const r = await D.answer(entry, skin, ctx, stream, shown => {
          if (Date.now() - last > 250) { last = Date.now(); renderStage(box, skin, shown, { thinking: true, source: info.engine, model: info.model }); }
        });
        turns = r.turns; model = r.model || info.model || ""; source = info.engine;
      } catch (err) {
        turns = null;
        note = `Couldn't get an answer from the local model (${timedOut ? "it took longer than 4 minutes" : err.message}), so here's the built-in advocate instead.`;
      }
    }
    if (!turns) {
      turns = D.offline(entry, skin, ctx); source = "offline"; model = "";
      if (!reduceMotion()) for (let i = 1; i < turns.length; i++) { renderStage(box, skin, turns.slice(0, i), { thinking: true, note }); await sleep(650 + Math.min(900, turns[i - 1].text.length * 6)); }
    }
    const res = { at: Date.now(), skin: skin.id, source, model, confidence: entry.confidence, turns };
    renderStage(box, skin, turns, { source, model, at: res.at, confidence: entry.confidence, note });
    return res;
  }

  /* ---------- server sync ---------- */
  function apiBase() {
    if (sync.url) return sync.url.replace(/\/+$/, "") + "/api/";
    if (sameOrigin) return new URL("api/", location.href).href;
    return null;
  }
  async function api(path, opts = {}) {
    const base = apiBase();
    if (!base) throw new Error("No server connected");
    const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    if (sync.token) headers.Authorization = "Bearer " + sync.token;
    const res = await fetch(base + path, Object.assign({ cache: "no-store" }, opts, { headers }));
    if (res.status === 401) throw new Error("The server wants a sync password (or the one saved here is wrong). Set it in Settings → Server.");
    return res;
  }
  async function fetchStatus(base) {
    const r = await fetch(base + "status", { cache: "no-store", headers: sync.token ? { Authorization: "Bearer " + sync.token } : {} });
    if (!r.ok) throw new Error("status " + r.status);
    const j = await r.json();
    if (j.app !== "gut-check") throw new Error("That address isn't a Gut Check server");
    return j;
  }
  async function detectServer() {
    server = null;
    if (!sync.url && /^https?:$/.test(location.protocol)) {
      try { server = await fetchStatus(new URL("api/", location.href).href); sameOrigin = true; } catch (e) { sameOrigin = false; }
    }
    if (!server && sync.url) {
      try { server = await fetchStatus(sync.url.replace(/\/+$/, "") + "/api/"); } catch (e) { sync.lastError = "Can't reach the server: " + e.message; saveSync(); }
    }
    badge();
    return server;
  }
  let syncing = false, syncTimer = null;
  function scheduleSync() { if (!apiBase()) return; clearTimeout(syncTimer); syncTimer = setTimeout(doSync, 1000); }
  async function doSync(manual) {
    if (!apiBase() || syncing) return;
    if (!server) { await detectServer(); if (!server) return; }
    syncing = true; badge();
    const before = JSON.stringify(state);
    try {
      let j = await (await api("state")).json();
      for (let i = 0; i < 5; i++) {
        const merged = C.merge(state, j.state || C.emptyState());
        state = merged; store.set(KEY, state);
        if (j.state && C.sameState(merged, j.state)) { sync.rev = j.rev; break; }
        const p = await api("state", { method: "PUT", body: JSON.stringify({ baseRev: j.rev, state: merged }) });
        if (p.status === 409) { j = await p.json(); continue; }
        if (!p.ok) throw new Error("server said " + p.status);
        sync.rev = (await p.json()).rev; break;
      }
      sync.lastAt = Date.now(); sync.lastError = "";
      if (manual) toast("Synced.");
    } catch (e) {
      sync.lastError = e.message;
      if (manual) toast("Sync failed: " + e.message, 5000);
    } finally {
      syncing = false; saveSync(); badge(); updateDue();
      const r = route().name;
      if (JSON.stringify(state) !== before && !modal.open && r !== "new" && r !== "edit" && !document.querySelector(".devil.thinking")) render();
    }
  }
  function badge() {
    const b = $("#syncBadge");
    if (!apiBase()) { b.hidden = true; return; }
    b.hidden = false;
    b.className = "sync-badge " + (syncing ? "busy" : sync.lastError ? "err" : server ? "ok" : "err");
    b.textContent = syncing ? "Syncing" : sync.lastError ? "Sync problem" : server ? "Synced" : "Offline";
    b.title = sync.lastError || (sync.lastAt ? "Last synced " + new Date(sync.lastAt).toLocaleString() : "Server sync");
  }
  $("#syncBadge").onclick = () => go("#settings");

  /* ---------- Settings ---------- */
  const SAMPLE = { id: "sample", kind: "decision", title: "Take the job offer in Denver", details: "Current job is stable but flat. The new role pays more and leads a team, but means moving away from friends.", options: "Stay and ask for a raise; keep looking", reasoning: "Better pay and more room to grow", expectation: "I'll be happier and earning 20% more within a year", confidence: 85, stakes: 3, tags: [], reviewAt: Date.now() + 180 * DAY, createdAt: Date.now(), status: "open", devil: [] };

  /* ---------- AI model picker (Settings) ---------- */
  /* Models that suit the devil's advocate, smallest to largest. Sizes are approximate downloads. */
  const SUGGESTED_MODELS = [
    ["qwen3:1.7b", "1.4 GB", "for small machines; weaker arguments"],
    ["llama3.2:3b", "2.0 GB", "small, quick and plain-spoken"],
    ["qwen3:4b", "2.5 GB", "faster on a server without a GPU"],
    ["gemma3:4b", "3.3 GB", "writes well for its size"],
    ["qwen3:8b", "5.2 GB", "the default: best all-round, wants 8 GB+ RAM"],
    ["llama3.1:8b", "4.9 GB", "warmer, chattier style; 8 GB RAM"],
    ["gemma3:12b", "8.1 GB", "sharper; wants 16 GB RAM or a GPU"],
    ["qwen3:14b", "9.3 GB", "strongest here; best with a GPU"],
  ];
  const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._\-\/:@]{0,199}$/;
  const modelKey = n => String(n).toLowerCase().replace(/:latest$/, ""); // gemma3:4B is gemma3:4b; "x" is "x:latest"
  const sameModel = (a, b) => modelKey(a) === modelKey(b);
  const gb = n => n ? (n / 1e9).toFixed(n < 1e10 ? 1 : 0) + " GB" : "";
  async function jsonOrThrow(r) { const j = await r.json().catch(() => ({})); if (!r.ok && r.status !== 202) throw new Error(j.error || "status " + r.status); return j; }

  /* Your Gut Check server: it downloads in the background and remembers the choice for every device. */
  const serverModels = {
    list: async () => jsonOrThrow(await api("models")),
    use: async name => jsonOrThrow(await api("models/active", { method: "POST", body: JSON.stringify({ model: name }) })),
    pull: async (name, activate) => jsonOrThrow(await api("models/pull", { method: "POST", body: JSON.stringify({ model: name, activate }) })),
    cancel: async () => jsonOrThrow(await api("models/cancel", { method: "POST", body: "{}" })),
    remove: async name => jsonOrThrow(await api("models/delete", { method: "POST", body: JSON.stringify({ model: name }) })),
  };
  /* Ollama talked to straight from this browser: the download runs while this page stays open. */
  const olPull = { model: "", status: "", pct: 0, error: "", activate: false, running: false, ctrl: null };
  const olBase = () => prefs.ollamaUrl.replace(/\/+$/, "");
  /* Plain-English reason a browser-to-Ollama request failed. Browsers hide the real cause behind
     "Load failed" / "Failed to fetch", so work it out from the addresses involved. */
  function explainOllamaFailure(err) {
    const url = olBase();
    let host = "", proto = "";
    try { const u = new URL(url); host = u.hostname; proto = u.protocol; } catch (e) { return `"${url}" isn't a valid address. It should look like http://192.168.1.20:11434.`; }
    const here = location.hostname, local = h => /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?)$/.test(h);
    const tips = [];
    if (location.protocol === "https:" && proto === "http:") tips.push(`This page is https but ${url} is http, and browsers block that. Use an https address for Ollama, or skip this address: connect Gut Check to your own server (Settings → Server) and let the server talk to Ollama.`);
    if (local(host) && !local(here)) tips.push(`"${host}" means the device you're holding, not your server. Use the server's address instead (for example http://${here}:11434), or skip this address and let the Gut Check server talk to Ollama.`);
    if (server && server.devil && server.devil.enabled) tips.push(`You don't need this address: your Gut Check server already talks to its own Ollama. Set "Where the counterargument comes from" to Automatic and clear the address.`);
    if (!tips.length) tips.push(`Check that Ollama is running and that ${url}/api/tags opens in this browser. If it does, Ollama is refusing this site: start it with OLLAMA_ORIGINS=${location.origin}.`);
    return tips.join(" ");
  }
  const ollamaModels = {
    async list() {
      const r = await fetch(olBase() + "/api/tags", { cache: "no-store" }).catch(e => { throw new Error(`can't reach Ollama at ${olBase()} from this browser (${e.message}). ${explainOllamaFailure(e)}`); });
      if (!r.ok) throw new Error("Ollama said " + r.status);
      const installed = ((await r.json()).models || []).map(m => ({ name: m.name, size: m.size || 0, params: (m.details && m.details.parameter_size) || "", quant: (m.details && m.details.quantization_level) || "" }));
      const ready = installed.some(m => sameModel(m.name, prefs.ollamaModel));
      return { url: olBase(), active: prefs.ollamaModel, installed, ready, state: ready ? "ready" : "not downloaded yet", pull: Object.assign({}, olPull, { ctrl: undefined }) };
    },
    async use(name) {
      const d = await this.list();
      const have = d.installed.find(m => sameModel(m.name, name));
      if (have) { prefs.ollamaModel = have.name; savePrefs(); return this.list(); }
      return this.pull(name, true);
    },
    async pull(name, activate) {
      if (olPull.running) { if (!sameModel(olPull.model, name)) throw new Error(`Already downloading ${olPull.model}. Wait for it or cancel it first.`); olPull.activate = olPull.activate || activate; return this.list(); }
      Object.assign(olPull, { model: name, status: "starting", pct: 0, error: "", activate, running: true, ctrl: new AbortController() });
      (async () => {
        try {
          const r = await fetch(olBase() + "/api/pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: name, stream: true }), signal: olPull.ctrl.signal });
          if (!r.ok) throw new Error("Ollama said " + r.status);
          let ok = false;
          await readNDJSON(r, o => {
            if (o.error) throw new Error(o.error);
            if (o.status) olPull.status = o.status;
            if (o.status === "success") ok = true;
            if (o.total && o.completed) olPull.pct = Math.min(100, Math.floor(o.completed / o.total * 100));
          });
          if (!ok) throw new Error("the download ended early");
          Object.assign(olPull, { running: false, status: "success", pct: 100, finishedAt: Date.now() });
          if (olPull.activate) { prefs.ollamaModel = name; savePrefs(); }
        } catch (e) {
          Object.assign(olPull, { running: false, status: olPull.ctrl.signal.aborted ? "cancelled" : "failed", error: olPull.ctrl.signal.aborted ? "" : e.message, finishedAt: Date.now() });
        }
      })();
      return this.list();
    },
    async cancel() { if (olPull.running) olPull.ctrl.abort(); return this.list(); },
    async remove(name) {
      if (sameModel(name, prefs.ollamaModel)) throw new Error("That's the model in use. Switch to another one before removing it.");
      const r = await fetch(olBase() + "/api/delete", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: name }) });
      if (!r.ok) throw new Error("Ollama couldn't remove it (" + r.status + ")");
      return this.list();
    },
  };

  /* Draws the picker into el. Only the list and progress parts are redrawn while a download runs,
     so what you're typing in the box isn't lost. */
  function modelPicker(el, A, label) {
    el.innerHTML = `<h3 style="margin-top:18px">AI model <span class="muted small">on ${esc(label)}</span></h3>
      <div class="m-list"><p class="small muted">Looking for models…</p></div>
      <div class="m-progress"></div>
      <label class="f" style="margin-top:10px"><span>Get another model</span>
        <div class="row nowrap"><input type="text" class="m-name" list="m-suggest" placeholder="e.g. qwen3:4b" autocapitalize="off" spellcheck="false"><button class="btn small primary m-get" type="button">Download and use</button></div></label>
      <datalist id="m-suggest">${SUGGESTED_MODELS.map(m => `<option value="${esc(m[0])}">${esc(m[1] + ", " + m[2])}</option>`).join("")}</datalist>
      <div class="m-suggest">${SUGGESTED_MODELS.map(m => `<button type="button" class="m-pick" data-m="${esc(m[0])}"><b>${esc(m[0])}</b> <span class="muted">${esc(m[1])} · ${esc(m[2])}</span></button>`).join("")}</div>
      <small class="hint">Any model from <a href="https://ollama.com/library" target="_blank" rel="noopener">ollama.com/library</a> works; type its name and tag. The current model keeps answering until the new one has finished downloading.</small>`;
    let timer = null;
    const input = $(".m-name", el);
    const busy = (b, on) => { b.disabled = on; };
    const act = async (fn, b) => { if (b) busy(b, true); try { draw(await fn()); } catch (e) { toast(e.message, 5000); refresh(); } finally { if (b) busy(b, false); } };
    function draw(d) {
      if (!el.isConnected) return;
      const p = d.pull || {};
      const bundled = /^https?:\/\/ollama(:\d+)?\/?$/i.test(d.url || "");
      $(".m-list", el).innerHTML = `${d.url ? `<p class="small muted">Connected to Ollama at <code>${esc(d.url)}</code>${bundled ? ` (the one bundled in Docker). To use an Ollama you already run on the server, see "Using an Ollama you already have" in the user guide.` : ""}</p>` : ""}
        <p class="small">In use: <b>${esc(d.active)}</b> · ${d.ready ? `<span style="color:var(--good)">ready</span>` : esc(d.state || "not ready")}</p>
        ${d.installed.length ? `<div class="m-rows">${d.installed.map(m => {
          const on = sameModel(m.name, d.active);
          return `<div class="m-row${on ? " on" : ""}"><div><b>${esc(m.name)}</b><br><span class="muted small">${esc([gb(m.size), m.params, m.quant].filter(Boolean).join(" · "))}</span></div>
            <div class="row nowrap">${on ? `<span class="pill good">In use</span>` : `<button class="btn small" data-use="${esc(m.name)}">Use</button><button class="btn small ghost danger" data-rm="${esc(m.name)}" aria-label="Remove ${esc(m.name)}">Remove</button>`}</div></div>`;
        }).join("")}</div>` : `<p class="small muted">No models downloaded yet.</p>`}`;
      $(".m-progress", el).innerHTML = p.running
        ? `<div class="m-dl"><div class="small"><b>Downloading ${esc(p.model)}</b> · ${p.pct ? p.pct + "%" : esc(p.status || "starting")}${p.activate ? " · switches over when done" : ""}</div>
            <progress max="100" value="${p.pct || 0}"></progress><button class="btn small ghost m-cancel" type="button">Cancel</button></div>`
        : p.status === "failed" ? `<div class="notice warn small">Couldn't download ${esc(p.model)}: ${esc(p.error)}. Check the name on ollama.com/library.</div>`
        : p.status === "cancelled" ? `<p class="small muted">Download of ${esc(p.model)} cancelled.</p>`
        : p.status === "success" && Date.now() - (p.finishedAt || Date.now()) < 120e3 ? `<p class="small" style="color:var(--good)">${esc(p.model)} downloaded.</p>` : "";
      $$("[data-use]", el).forEach(b => b.onclick = () => act(() => A.use(b.dataset.use), b).then(afterChange));
      $$("[data-rm]", el).forEach(b => b.onclick = () => { if (confirm(`Remove ${b.dataset.rm} from ${label}? You can download it again later.`)) act(() => A.remove(b.dataset.rm), b); });
      const c = $(".m-cancel", el); if (c) c.onclick = () => act(() => A.cancel(), c);
      clearTimeout(timer);
      if (p.running) timer = setTimeout(refresh, 1000);
      else if (wasRunning) afterChange();
      wasRunning = !!p.running;
    }
    let wasRunning = false;
    function afterChange() { // refresh "Now using" above once a switch has happened
      const s = $("#olModel"); if (s) s.value = prefs.ollamaModel;
      (A === serverModels ? detectServer() : Promise.resolve()).then(() => { if (el.isConnected && !input.value && location.hash === "#settings") viewSettings(); });
    }
    function refresh() { if (el.isConnected) A.list().then(draw, e => { if (el.isConnected) $(".m-list", el).innerHTML = `<p class="small muted">Couldn't list the models: ${esc(e.message)}</p>`; }); }
    $(".m-get", el).onclick = ev => {
      const name = input.value.trim();
      if (!MODEL_RE.test(name)) { input.focus(); return toast("Type a model name, like qwen3:4b"); }
      act(() => A.use(name), ev.target).then(() => { input.value = ""; afterChange(); });
    };
    input.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); $(".m-get", el).click(); } };
    $$(".m-pick", el).forEach(b => b.onclick = () => { input.value = b.dataset.m; input.focus(); });
    refresh();
  }

  function viewSettings() {
    const info = engineInfo();
    const engLabel = { server: `Your Gut Check server's local model (${info.model || "?"})`, ollama: `Ollama at ${prefs.ollamaUrl} (${prefs.ollamaModel})`, offline: "Built-in advocate (no AI model)", off: "Off" }[info.engine];
    const srvDevil = server && server.devil;
    view.innerHTML = `
      <h1>Settings</h1>

      <div class="card">
        <h2>Devil's advocate</h2>
        <label class="check"><input type="checkbox" id="devOn" ${prefs.devil ? "checked" : ""}><span><b>Offer a counterargument</b><br><span class="muted small">Adds "Argue with me" buttons. Nothing is ever sent unless you press one.</span></span></label>
        <label class="check"><input type="checkbox" id="devAuto" ${prefs.autoDevil ? "checked" : ""} ${prefs.devil ? "" : "disabled"}><span><b>Challenge me automatically after saving</b></span></label>
        <h3 style="margin-top:14px">Skin</h3>
        <div class="skins">${D.list().map(s => `<button type="button" class="skin${s.id === prefs.skin ? " on" : ""}" data-skin="${esc(s.id)}"><div class="faces">${s.voices.slice(0, 3).map(v => v.avatar).join("")}</div><b>${esc(s.name)}</b><small>${esc(s.blurb)}</small></button>`).join("")}</div>
        <button class="btn small" id="preview" style="margin-top:10px">Preview this skin</button>
        <h3 style="margin-top:18px">Brains</h3>
        <label class="f"><span>Where the counterargument comes from</span>
          <select id="engine">
            <option value="auto" ${prefs.engine === "auto" ? "selected" : ""}>Automatic (best available)</option>
            <option value="server" ${prefs.engine === "server" ? "selected" : ""}>My Gut Check server's local model</option>
            <option value="ollama" ${prefs.engine === "ollama" ? "selected" : ""}>Ollama directly (address below)</option>
            <option value="offline" ${prefs.engine === "offline" ? "selected" : ""}>Built-in advocate only (no AI)</option>
          </select><small>Now using: <b>${esc(engLabel)}</b>${srvDevil ? ` · server model ${esc(srvDevil.model)}: ${srvDevil.ready ? "ready" : esc(srvDevil.state || "not ready yet")}` : ""}</small></label>
        ${prefs.engine === "ollama" && srvDevil && srvDevil.enabled ? `<div class="notice warn small" style="margin:8px 0">This browser is set to talk to Ollama <b>directly</b>, but your Gut Check server already has its own connection to Ollama. Choose <b>Automatic</b> above and the address below isn't needed.</div>` : ""}
        <div class="grid2 wrap">
          <label class="f"><span>Ollama address <span class="muted">(optional)</span></span><input type="url" id="olUrl" placeholder="http://localhost:11434" value="${esc(prefs.ollamaUrl)}"></label>
          <label class="f"><span>Model</span><input type="text" id="olModel" placeholder="qwen3:8b" value="${esc(prefs.ollamaModel)}"></label>
        </div>
        <small class="hint">Only needed to talk to Ollama directly from this browser (for example the GitHub Pages copy with Ollama on this computer). Ollama must allow this site: <code>OLLAMA_ORIGINS=${esc(location.origin)}</code>. See the user guide.</small>
        <div class="row" style="margin-top:10px"><button class="btn small" id="testDevil">Test the connection</button><span class="small muted" id="testOut"></span></div>
        <div id="models"></div>
      </div>

      <div class="card">
        <h2>Reminders</h2>
        <p class="small">Due reviews show up on the Today tab (with a badge) whenever you open Gut Check.${server ? "" : " To be reminded when the app is closed, add them to your calendar:"}</p>
        <div class="row"><button class="btn small" id="icsAll">Download calendar file (all open reviews)</button></div>
        ${server ? `<hr><p class="small"><b>Server reminders:</b> ${server.reminders && server.reminders.channels.length ? `sent by ${server.reminders.channels.map(esc).join(", ")} at ${server.reminders.hour}:00 (${esc(server.reminders.tz || "server time")}) when something becomes due.` : "none set up. Your server can send a phone push (ntfy), an email or a chat webhook when a review is due; see the user guide."}</p>
          <div class="row">${server.reminders && server.reminders.channels.length ? `<button class="btn small" id="testRem">Send a test reminder</button>` : ""}<button class="btn small" id="feed">Copy calendar subscription link</button></div>
          <small class="hint">The subscription link keeps your calendar up to date automatically. Your calendar app must be able to reach the server.</small>` : ""}
      </div>

      <div class="card">
        <h2>Server</h2>
        ${sameOrigin && !sync.url ? `<p class="small">This copy is served by your Gut Check server, so everything you write is saved there and shared with your other devices.</p>`
          : `<p class="small">Connect to your own Gut Check server to keep devices in step, get backups, reminders and the local AI model. Leave empty to keep everything in this browser.</p>
          <label class="f"><span>Server address</span><input type="url" id="srvUrl" placeholder="https://gutcheck.your-tailnet.ts.net" value="${esc(sync.url)}"></label>`}
        <label class="f"><span>Sync password <span class="muted">(if the server has one)</span></span><input type="password" id="srvTok" value="${esc(sync.token)}" autocomplete="off"></label>
        <p class="small muted" style="margin-top:8px">${apiBase() ? (server ? `Connected. ${sync.lastAt ? "Last synced " + new Date(sync.lastAt).toLocaleString() + "." : ""}` : "Not reachable right now.") : "Not connected."} ${sync.lastError ? `<br><span style="color:var(--bad)">${esc(sync.lastError)}</span>` : ""}</p>
        <div class="row"><button class="btn small primary" id="srvSave">Save & sync now</button>${sync.url ? `<button class="btn small ghost" id="srvOff">Disconnect</button>` : ""}
          ${server ? `<button class="btn small" id="bk">Back up on server now</button><button class="btn small" id="bkDl">Download latest server backup</button>` : ""}</div>
      </div>

      <div class="card">
        <h2>Your data</h2>
        <p class="small">${live().length} entries. Saved in this browser${server ? " and on your server" : ""}.</p>
        <div class="row">
          <button class="btn small" id="expJson">Download backup (.json)</button>
          <button class="btn small" id="expCsv">Export spreadsheet (.csv)</button>
          <label class="btn small" style="cursor:pointer">Restore / import<input type="file" id="imp" accept=".json,application/json" hidden></label>
          <button class="btn small ghost danger" id="erase">Erase everything</button>
        </div>
        <small class="hint">Importing adds the backup's entries to what's here (nothing is overwritten except older copies of the same entry).</small>
      </div>

      <div class="card">
        <h2>Appearance</h2>
        <div class="seg" id="theme">${[["auto", "Match device"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) => `<button data-v="${v}" class="${prefs.theme === v ? "on" : ""}">${l}</button>`).join("")}</div>
      </div>
      <p class="muted small center">Gut Check ${VERSION}${server ? ` · server ${esc(server.version || "")}` : ""} · <a href="https://github.com/ryelikebread/Gut-Check/blob/main/docs/USER-GUIDE.md" target="_blank" rel="noopener">User guide</a></p>`;

    const pickFor = info.engine === "ollama" ? "ollama" : srvDevil && srvDevil.enabled ? "server" : prefs.ollamaUrl ? "ollama" : null;
    if (pickFor && prefs.devil) modelPicker($("#models"), pickFor === "server" ? serverModels : ollamaModels, pickFor === "server" ? "your Gut Check server" : "Ollama at " + prefs.ollamaUrl);
    $("#devOn").onchange = e => { prefs.devil = e.target.checked; savePrefs(); viewSettings(); };
    $("#devAuto").onchange = e => { prefs.autoDevil = e.target.checked; savePrefs(); };
    $$("[data-skin]").forEach(b => b.onclick = () => { prefs.skin = b.dataset.skin; savePrefs(); $$("[data-skin]").forEach(x => x.classList.toggle("on", x === b)); });
    $("#preview").onclick = async () => {
      const b = openModal(`<h2>Preview</h2><p class="small muted">Sample decision: "${esc(SAMPLE.title)}", 85% sure.</p><div id="pv"></div><div class="row" style="margin-top:12px"><button class="btn" id="x">Close</button></div>`);
      $("#x", b).onclick = closeModal;
      await runDevil(SAMPLE, $("#pv", b));
    };
    $("#engine").onchange = e => { prefs.engine = e.target.value; savePrefs(); viewSettings(); };
    $("#olUrl").onchange = e => { prefs.ollamaUrl = e.target.value.trim(); savePrefs(); viewSettings(); };
    $("#olModel").onchange = e => { prefs.ollamaModel = e.target.value.trim() || "qwen3:8b"; savePrefs(); };
    $("#testDevil").onclick = async () => {
      const out = $("#testOut"); prefs.ollamaUrl = $("#olUrl").value.trim(); prefs.ollamaModel = $("#olModel").value.trim() || "qwen3:8b"; savePrefs();
      const inf = engineInfo(); out.textContent = inf.engine === "ollama" ? `Testing this browser → Ollama at ${prefs.ollamaUrl}…` : "Testing…";
      try {
        if (inf.engine === "server") { const s = await detectServer(); out.textContent = s && s.devil && s.devil.ready ? `Server model ${s.devil.model} is ready.` : `Server reachable, model not ready: ${(s && s.devil && s.devil.state) || "unknown"}.`; }
        else if (inf.engine === "ollama") {
          const r = await fetch(prefs.ollamaUrl.replace(/\/+$/, "") + "/api/tags");
          const j = await r.json(); const names = (j.models || []).map(m => m.name);
          out.textContent = names.some(n => n === prefs.ollamaModel || n === prefs.ollamaModel + ":latest") ? `Connected. ${prefs.ollamaModel} is installed.` : `Connected, but ${prefs.ollamaModel} isn't installed. Installed: ${names.join(", ") || "none"}.`;
        } else out.textContent = inf.engine === "off" ? "The devil's advocate is turned off." : "Using the built-in advocate, which always works.";
      } catch (e) { out.textContent = inf.engine === "ollama" ? `Couldn't connect from this browser straight to Ollama at ${prefs.ollamaUrl} (${e.message}). ${explainOllamaFailure(e)}` : "Couldn't connect: " + e.message; }
    };
    $("#icsAll").onclick = () => { const open = live().filter(e => e.status === "open"); if (!open.length) return toast("No open entries."); download("gut-check-reviews.ics", C.ics(open, appUrl()), "text/calendar"); };
    const tr = $("#testRem"); if (tr) tr.onclick = async () => { try { const r = await api("reminders/test", { method: "POST" }); const j = await r.json(); toast(r.ok ? "Test sent via " + j.sent.join(", ") : "Failed: " + (j.error || r.status), 5000); } catch (e) { toast(e.message, 5000); } };
    const fd = $("#feed"); if (fd) fd.onclick = async () => {
      const link = apiBase() + "calendar.ics" + (sync.token ? "?key=" + encodeURIComponent(sync.token) : "");
      try { await navigator.clipboard.writeText(link); toast("Link copied. Add it in your calendar app as a subscription."); } catch (e) { prompt("Copy this link:", link); }
    };
    $("#srvSave").onclick = async () => {
      const u = $("#srvUrl"); if (u) sync.url = u.value.trim().replace(/\/+$/, "");
      sync.token = $("#srvTok").value; sync.lastError = ""; saveSync();
      if (sync.url && location.protocol === "https:" && sync.url.startsWith("http:")) toast("Note: an https page can't talk to an http server. Use an https address.", 6000);
      await detectServer(); await doSync(true); viewSettings();
    };
    const off = $("#srvOff"); if (off) off.onclick = () => { sync.url = ""; sync.token = ""; sync.rev = 0; sync.lastError = ""; saveSync(); server = null; detectServer().then(viewSettings); };
    const bk = $("#bk"); if (bk) bk.onclick = async () => { try { const r = await api("backup", { method: "POST" }); const j = await r.json(); toast(r.ok ? "Backup saved: " + j.name : j.error); } catch (e) { toast(e.message); } };
    const bkDl = $("#bkDl"); if (bkDl) bkDl.onclick = async () => { try { const r = await api("backups/latest"); if (!r.ok) throw new Error("no backups yet"); download("gut-check-server-backup.json", await r.text(), "application/json"); } catch (e) { toast(e.message); } };
    $("#expJson").onclick = () => download(`gut-check-backup-${dateInput(Date.now())}.json`, JSON.stringify({ app: "gut-check", exportedAt: new Date().toISOString(), state }, null, 1), "application/json");
    $("#expCsv").onclick = () => download(`gut-check-${dateInput(Date.now())}.csv`, C.csv(state), "text/csv");
    $("#imp").onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        const s = C.validState(j) ? j : C.validState(j.state) ? j.state : null;
        if (!s) throw new Error("that file isn't a Gut Check backup");
        const before = live().length;
        state = C.merge(state, s); persist();
        toast(`Imported. ${live().length - before} new entries.`); viewSettings();
      } catch (err) { toast("Couldn't import: " + err.message, 5000); }
    };
    $("#erase").onclick = () => {
      const t = prompt('This deletes every entry here' + (apiBase() ? " and on your server" : "") + '. Type ERASE to confirm.');
      if (t !== "ERASE") return;
      const now = Date.now();
      state = { app: "gut-check", version: 1, entries: state.entries.map(e => ({ id: e.id, kind: e.kind, createdAt: e.createdAt, updatedAt: Math.max(now, (e.updatedAt || 0) + 1), deleted: true })) };
      persist(); store.del(DRAFT); toast("Erased."); go("#today");
    };
    $$("#theme button").forEach(b => b.onclick = () => { prefs.theme = b.dataset.v; savePrefs(); applyTheme(); $$("#theme button").forEach(x => x.classList.toggle("on", x === b)); });
  }

  /* ---------- start ---------- */
  applyTheme();
  render();
  detectServer().then(s => {
    if (s) doSync();
    if (route().name === "settings" || (route().name === "today" && !live().length)) render();
  });
  setInterval(() => { if (apiBase() && document.visibilityState === "visible") doSync(); }, 30e3);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { updateDue(); if (apiBase()) doSync(); } });
  window.addEventListener("storage", ev => { if (ev.key === KEY) { state = C.merge(store.get(KEY, C.emptyState()), C.emptyState()); render(); } });
  const dueNow = live().filter(e => C.isDue(e)).length;
  if (dueNow) setTimeout(() => toast(`${dueNow} ${dueNow === 1 ? "review is" : "reviews are"} due. How did things turn out?`, 4000), 600);
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  window.GutApp = { get state() { return state; }, runDevil, render }; // handy for debugging in the console
})();
