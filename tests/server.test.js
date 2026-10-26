"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path"), http = require("http"), net = require("net");
const fakeOllama = require("./fake-ollama.js");

/* Every server started by these tests, so none is left running (and holding the test run open) if a test fails. */
const children = new Set();
test.after(() => { for (const c of children) c.kill("SIGKILL"); });

function freePort() { return new Promise(r => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); }); }

/* Records anything POSTed to it (stands in for ntfy and a chat webhook). */
function sink() {
  const got = [];
  const s = http.createServer((req, res) => { let b = ""; req.on("data", c => b += c); req.on("end", () => { got.push({ url: req.url, headers: req.headers, body: b }); res.end("ok"); }); });
  return new Promise(r => s.listen(0, "127.0.0.1", () => r({ url: `http://127.0.0.1:${s.address().port}`, got, close: () => s.close() })));
}
/* A tiny plain SMTP server that accepts one message. */
function smtpSink() {
  const mails = [];
  const s = net.createServer(sock => {
    let data = false, buf = "", msg = "";
    sock.write("220 test ESMTP\r\n");
    sock.on("data", d => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (data) { if (line === ".") { data = false; mails.push(msg); msg = ""; sock.write("250 queued\r\n"); } else msg += line + "\n"; continue; }
        if (/^EHLO/i.test(line)) sock.write("250-test\r\n250 AUTH PLAIN\r\n");
        else if (/^AUTH/i.test(line)) sock.write("235 ok\r\n");
        else if (/^DATA/i.test(line)) { data = true; sock.write("354 go\r\n"); }
        else if (/^QUIT/i.test(line)) { sock.write("221 bye\r\n"); sock.end(); }
        else sock.write("250 ok\r\n");
      }
    });
  });
  return new Promise(r => s.listen(0, "127.0.0.1", () => r({ port: s.address().port, mails, close: () => s.close() })));
}

async function startServer(env) {
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gutcheck-"));
  const child = spawn(process.execPath, [path.join(__dirname, "..", "server", "server.js")], { env: Object.assign({}, process.env, { PORT: port, DATA_DIR: dir, REMINDER_HOUR: "0" }, env), stdio: ["ignore", "pipe", "pipe"] });
  children.add(child); child.on("exit", () => children.delete(child));
  let out = ""; child.stdout.on("data", d => out += d); child.stderr.on("data", d => out += d);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { await fetch(base + "/api/status"); break; } catch (e) { await new Promise(r => setTimeout(r, 50)); } }
  return { base, dir, child, log: () => out, stop: () => new Promise(r => { child.on("exit", r); child.kill("SIGTERM"); }) };
}
const H = t => ({ "Content-Type": "application/json", Authorization: "Bearer " + t });
const entry = (o = {}) => Object.assign({ id: "e1", kind: "decision", title: "Take the job", confidence: 80, createdAt: Date.now() - 1e9, updatedAt: Date.now(), reviewAt: Date.now() - 1000, status: "open" }, o);

test("sync, auth, conflicts, backups, calendar, static files", async () => {
  const s = await startServer({ SYNC_TOKEN: "pw", CORS_ORIGIN: "https://me.github.io" });
  try {
    let st = await (await fetch(s.base + "/api/status")).json();
    assert.equal(st.app, "gut-check"); assert.equal(st.auth, true); assert.equal(st.devil.enabled, false);
    assert.equal((await fetch(s.base + "/api/state")).status, 401);
    let r = await fetch(s.base + "/api/state", { headers: H("pw") });
    assert.deepEqual(await r.json(), { rev: 0, savedAt: 0, state: null });
    r = await fetch(s.base + "/api/state", { method: "PUT", headers: H("pw"), body: JSON.stringify({ baseRev: 0, state: { entries: [entry()] } }) });
    assert.equal(r.status, 200); assert.equal((await r.json()).rev, 1);
    r = await fetch(s.base + "/api/state", { method: "PUT", headers: H("pw"), body: JSON.stringify({ baseRev: 0, state: { entries: [] } }) });
    assert.equal(r.status, 409);
    const c = await r.json(); assert.equal(c.rev, 1); assert.equal(c.state.entries[0].title, "Take the job");
    r = await fetch(s.base + "/api/state", { method: "PUT", headers: H("pw"), body: JSON.stringify({ baseRev: 1, state: { nope: 1 } }) });
    assert.equal(r.status, 400);
    // CORS
    r = await fetch(s.base + "/api/status", { headers: { Origin: "https://me.github.io" } });
    assert.equal(r.headers.get("access-control-allow-origin"), "https://me.github.io");
    r = await fetch(s.base + "/api/status", { headers: { Origin: "https://evil.example" } });
    assert.equal(r.headers.get("access-control-allow-origin"), null);
    // backups
    r = await fetch(s.base + "/api/backup", { method: "POST", headers: H("pw") });
    assert.equal(r.status, 200);
    const list = (await (await fetch(s.base + "/api/backups", { headers: H("pw") })).json()).backups;
    assert.ok(list.length >= 1);
    r = await fetch(s.base + "/api/backups/latest", { headers: H("pw") });
    assert.equal((await r.json()).state.entries[0].id, "e1");
    assert.equal((await fetch(s.base + "/api/backups/..%2Fstate.json", { headers: H("pw") })).status, 404);
    // calendar feed with ?key=
    assert.equal((await fetch(s.base + "/api/calendar.ics")).status, 401);
    r = await fetch(s.base + "/api/calendar.ics?key=pw");
    assert.match(await r.text(), /UID:e1@gut-check/);
    // static
    r = await fetch(s.base + "/"); assert.equal(r.status, 200); assert.match(await r.text(), /Gut Check/);
    assert.equal((await fetch(s.base + "/skins/pip.js")).status, 200);
    assert.notEqual((await fetch(s.base + "/%2e%2e/server/server.js")).status, 200);
    // persisted across restart
    await s.stop();
    const s2 = await startServer({ SYNC_TOKEN: "pw", DATA_DIR: s.dir });
    st = await (await fetch(s2.base + "/api/status")).json();
    assert.equal(st.rev, 1);
    await s2.stop();
  } finally { s.child.kill(); }
});

test("devil's advocate proxies to Ollama, auto-pulls the model and streams", async () => {
  const ol = await fakeOllama.start({ models: [], rejectThink: true });
  const s = await startServer({ OLLAMA_URL: ol.url, DEVIL_MODEL: "tiny:1b" });
  try {
    let st;
    for (let i = 0; i < 60; i++) { st = await (await fetch(s.base + "/api/status")).json(); if (st.devil.ready) break; await new Promise(r => setTimeout(r, 100)); }
    assert.equal(st.devil.ready, true, "model should be pulled: " + st.devil.state);
    assert.ok(ol.calls.some(c => c.path === "/api/pull" && c.body.model === "tiny:1b"));
    assert.equal((await fetch(s.base + "/api/devil", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: "x" }) })).status, 400);
    const r = await fetch(s.base + "/api/devil", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "system", content: "be a tribunal" }, { role: "user", content: "hi" }] }) });
    assert.equal(r.status, 200);
    const lines = (await r.text()).trim().split("\n").map(l => JSON.parse(l));
    const text = lines.filter(l => l.delta).map(l => l.delta).join("");
    assert.match(text, /Ruling: check first/);
    assert.deepEqual(lines[lines.length - 1], { done: true, model: "tiny:1b" });
    const chat = ol.calls.filter(c => c.path === "/api/chat");
    assert.equal(chat.length, 2, "retried without think after a 400");
    assert.equal(chat[1].body.model, "tiny:1b"); assert.equal(chat[1].body.stream, true);
  } finally { await s.stop(); ol.close(); }
});

test("a failed model download is retried slowly, not in a loop", async () => {
  const ol = await fakeOllama.start({ models: [], pullError: "no such host" });
  const s = await startServer({ OLLAMA_URL: ol.url, DEVIL_MODEL: "tiny:1b" });
  try {
    await new Promise(r => setTimeout(r, 2500));
    assert.equal(ol.calls.filter(c => c.path === "/api/pull").length, 1);
    const st = await (await fetch(s.base + "/api/status")).json();
    assert.match(st.devil.state, /download failed/);
  } finally { await s.stop(); ol.close(); }
});

test("devil's advocate reports a missing Ollama cleanly", async () => {
  const s = await startServer({ OLLAMA_URL: "http://127.0.0.1:1", DEVIL_AUTO_PULL: "0" });
  try {
    const r = await fetch(s.base + "/api/devil", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }) });
    assert.equal(r.status, 503);
    assert.match((await r.json()).error, /isn't ready/);
  } finally { await s.stop(); }
});

test("reminders go out once via ntfy, webhook and email", async () => {
  const hook = await sink(), mail = await smtpSink();
  const s = await startServer({ NTFY_URL: hook.url + "/topic", WEBHOOK_URL: hook.url + "/hook", SMTP_HOST: "127.0.0.1", SMTP_PORT: String(mail.port), SMTP_SECURE: "none", SMTP_USER: "u", SMTP_PASS: "p", SMTP_FROM: "Gut Check <gc@test>", REMINDER_EMAIL_TO: "me@test", APP_URL: "https://gc.test" });
  try {
    const st = await (await fetch(s.base + "/api/status")).json();
    assert.deepEqual(st.reminders.channels, ["ntfy", "webhook", "email"]);
    let r = await fetch(s.base + "/api/reminders/test", { method: "POST" });
    assert.equal(r.status, 200, await r.clone().text());
    assert.deepEqual((await r.json()).sent, ["ntfy", "webhook", "email"]);
    assert.equal(mail.mails.length, 1); assert.match(mail.mails[0], /Subject: Gut Check: test reminder/);
    hook.got.length = 0; mail.mails.length = 0;
    await fetch(s.base + "/api/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseRev: 0, state: { entries: [entry(), entry({ id: "e2", title: "Not due", reviewAt: Date.now() + 1e9 })] } }) });
    // restart so the startup reminder check runs against the saved journal
    await s.stop();
    const s2 = await startServer({ DATA_DIR: s.dir, NTFY_URL: hook.url + "/topic", WEBHOOK_URL: hook.url + "/hook", SMTP_HOST: "127.0.0.1", SMTP_PORT: String(mail.port), SMTP_SECURE: "none", SMTP_FROM: "gc@test", REMINDER_EMAIL_TO: "me@test", APP_URL: "https://gc.test" });
    for (let i = 0; i < 100 && mail.mails.length < 1; i++) await new Promise(r => setTimeout(r, 100));
    const ntfy = hook.got.find(g => g.url === "/topic");
    assert.ok(ntfy, "ntfy push sent"); assert.match(ntfy.body, /Take the job/); assert.doesNotMatch(ntfy.body, /Not due/);
    assert.equal(ntfy.headers.click, "https://gc.test/#today");
    const wh = JSON.parse(hook.got.find(g => g.url === "/hook").body); assert.match(wh.text, /Take the job/);
    assert.equal(mail.mails.length, 1);
    const sent = JSON.parse(fs.readFileSync(path.join(s.dir, "reminders.json"), "utf8"));
    assert.ok(sent.e1 && !sent.e2);
    await s2.stop();
    // a third start doesn't send again
    const before = hook.got.length;
    const s3 = await startServer({ DATA_DIR: s.dir, NTFY_URL: hook.url + "/topic" });
    await new Promise(r => setTimeout(r, 6000));
    assert.equal(hook.got.length, before);
    await s3.stop();
  } finally { s.child.kill(); hook.close(); mail.close(); }
});
