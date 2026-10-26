"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
global.self = global;
const C = require("../public/lib/core.js");
const D = require("../public/lib/devil.js");
global.GutDevil = D;
const fs = require("fs"), path = require("path");
const skinDir = path.join(__dirname, "..", "public", "skins");
fs.readdirSync(skinDir).filter(f => f.endsWith(".js")).forEach(f => require(path.join(skinDir, f)));

const entries = [
  C.normalizeEntry({ id: "d1", kind: "decision", title: "Take the job", options: "", reasoning: "", expectation: "happier", confidence: 90, stakes: 3, reviewAt: Date.now() + 90 * 86400e3 }),
  C.normalizeEntry({ id: "p1", kind: "prediction", title: "It rains on 2027-01-01", details: "Forecast says so and it usually does around then in this city", confidence: 15 }),
  C.normalizeEntry({ id: "p2", kind: "prediction", title: "Team ships by March", confidence: 50 })
];

test("every skin is listed in index.html and the offline cache", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const sw = fs.readFileSync(path.join(__dirname, "..", "public", "sw.js"), "utf8");
  for (const f of fs.readdirSync(skinDir)) {
    assert.ok(html.includes(`skins/${f}`), `${f} missing from index.html`);
    assert.ok(sw.includes(`skins/${f}`), `${f} missing from sw.js`);
  }
});

test("every skin produces a complete offline answer", () => {
  assert.ok(D.list().length >= 6);
  for (const s of D.list()) for (const e of entries) for (const track of [null, { n: 8, rate: 0.6 }]) {
    const turns = D.offline(e, s, { track });
    assert.ok(turns.length >= 1, s.id);
    for (const t of turns) {
      assert.ok(s.voices.some(v => v.id === t.voice), `${s.id}: unknown voice ${t.voice}`);
      assert.ok(t.text && !/undefined|null|NaN/.test(t.text), `${s.id}: bad text ${t.text}`);
    }
    if (s.mode === "dialogue") assert.ok(new Set(turns.map(t => t.voice)).size >= 2, s.id + " should use several voices");
  }
});

test("prompt mentions the skin's voices and the entry", () => {
  const m = D.messages(entries[0], "tribunal", { track: { n: 5, rate: 0.6 } });
  assert.equal(m.length, 2);
  assert.match(m[0].content, /Chief Justice Marlow/);
  assert.match(m[0].content, /Ruling:/);
  assert.match(m[1].content, /Take the job/);
  assert.match(m[1].content, /right 60% of the time/);
});

test("dialogue parsing tolerates markdown, think blocks and aliases", () => {
  const turns = D.parseTurns("<think>internal</think>\n**Chief Justice Marlow:** We have heard.\nJustice Vance: Too sure.\nstill Vance\n- Okafor: People matter.\nMarlow: Ruling: check.", "tribunal");
  assert.deepEqual(turns.map(t => t.voice), ["marlow", "vance", "okafor", "marlow"]);
  assert.equal(turns[1].text, "Too sure. still Vance");
  const single = D.parseTurns("## Hoo\nSome **bold** words.", "owl");
  assert.equal(single.length, 1);
  assert.equal(single[0].text, "Hoo\nSome bold words.");
  const pip = D.parseTurns("Angel: nice\nDevil: but\nAngel (Pip): check", "pip");
  assert.deepEqual(pip.map(t => t.voice), ["angel", "devil", "angel"]);
});

test("each skin has its own voice offline", () => {
  const e = entries[0];
  const texts = D.list().map(s => D.offline(e, s).map(t => t.text).join(" "));
  assert.equal(new Set(texts).size, texts.length, "two skins produced identical wording");
  // dialogue skins: the non-confidence keys a secondary voice can receive are all worded in that voice
  const keys = Object.keys(D.LINES).filter(k => !/^conf_|^ack$|^check$|^suggest$/.test(k));
  for (const s of D.list().filter(s => s.voiceLines)) for (const v of Object.keys(s.voiceLines))
    if (Object.keys(s.voiceLines[v]).some(k => keys.includes(k))) for (const k of keys) assert.ok(s.voiceLines[v][k] !== undefined, `${s.id}/${v} lacks ${k}`);
});
