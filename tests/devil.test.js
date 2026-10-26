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

/* ---------- reasoning must never reach the screen ---------- */
const MORT = "Hmph. Kid, you're ninety percent sure about a job you've never seen from the inside. Knew a fella who said the same. Sleep on it.";
const NOTES = [
  "First, I need to understand the user's decision. They want to take the job and feel 90% sure.",
  "Structure:",
  "1. Acknowledge what's sensible",
  "2. Outside view",
  "Word count: under 180 words",
  "Now draft in Old Mort's voice."
].join("\n");

test("a <think> block is stripped, however the model leaves it", () => {
  const mort = D.get("mentor");
  const shown = t => D.parseTurns(t, mort).map(x => x.text).join(" ");
  assert.equal(shown(`<think>\nOkay, so the user wants a counterargument. Structure: ...\nWord count: 100\n</think>\n\n${MORT}`), MORT, "closed block");
  assert.equal(shown(`<think>\nFirst, I need to understand... still thinking`), "", "block that never closes yields nothing");
  assert.equal(shown(`First, I need to understand the user.\nWord count: 100\n</think>\n${MORT}`), MORT, "closing tag only");
  assert.equal(shown(`<thinking>plan plan</thinking>${MORT}`), MORT, "<thinking> variant");
  assert.equal(shown(`Thinking...\nFirst, I need to look at this.\n...done thinking.\n\n${MORT}`), MORT, "console-style thinking");
  assert.equal(shown(`Planning notes here.\nFinal answer: ${MORT}`), MORT, "text after a 'Final answer:' label");
  assert.ok(!/think|Word count|Structure/i.test(shown(`<think>Structure: x\nWord count: 5</think>${MORT}`)));
});

test("planning notes are recognised, in-character replies are not", () => {
  assert.equal(D.looksLikePlanning(NOTES), true);
  assert.equal(D.looksLikePlanning(`${NOTES}\n\n${MORT}`), true, "notes followed by the reply are still rejected");
  assert.equal(D.looksLikePlanning("Okay, so the user is thinking about taking a new job."), true);
  assert.equal(D.looksLikePlanning("Structure: acknowledge, outside view, check"), true);
  assert.equal(D.looksLikePlanning("Let me think about how Old Mort would say this."), true);
  assert.equal(D.looksLikePlanning(`<think>First, I need to plan.</think>${MORT}`), false, "reasoning in a think block is fine once removed");
  for (const ok of [MORT, "Okay, kid, here's the thing.", "I need to tell you something, kid.", "Hmm, ninety percent. Interesting.", "First, kid, ask yourself why.", "Hoo. Tell me, what would change your mind?",
    "Chief Justice Marlow: The court has heard the petitioner.\nJustice Vance: Ninety percent is a lot.\nChief Justice Marlow: Ruling: check first."])
    assert.equal(D.looksLikePlanning(ok), false, ok);
  for (const s of D.list()) for (const e of entries) {
    const text = D.offline(e, s, {}).map(t => s.mode === "dialogue" ? `${s.voices.find(v => v.id === t.voice).name}: ${t.text}` : t.text).join("\n");
    assert.equal(D.looksLikePlanning(text), false, `${s.id}'s own offline wording must not trip the guard`);
  }
});

test("the prompt asks for the finished reply only, and keeps the skin's personality", () => {
  for (const s of D.list()) {
    const sys = D.messages(entries[0], s)[0].content;
    assert.match(sys, /Answer directly with only the finished reply/);
    assert.ok(sys.includes(s.persona), `${s.id}'s personality text is unchanged`);
  }
  const retry = D.messages(entries[0], "mentor", { stricter: true })[1].content;
  assert.match(retry, /planning notes instead of the reply/);
});

test("a reply of planning notes is thrown away and asked for once more", async () => {
  const calls = [], shown = [];
  const stream = async (msgs, onDelta) => {
    calls.push(msgs);
    const text = calls.length === 1 ? NOTES : `<think>draft</think>${MORT}`;
    for (const piece of text.match(/[\s\S]{1,9}/g)) onDelta(piece);
    return { model: "qwen3:8b" };
  };
  const r = await D.answer(entries[0], "mentor", {}, stream, t => shown.push(t));
  assert.equal(calls.length, 2, "exactly one retry");
  assert.equal(r.retried, true);
  assert.equal(r.model, "qwen3:8b");
  assert.deepEqual(r.turns.map(t => t.text), [MORT]);
  assert.ok(!calls[0][1].content.includes("planning notes instead"), "first try is the normal prompt");
  assert.match(calls[1][1].content, /planning notes instead of the reply/, "second try is firmer");
  assert.ok(shown.every(t => !JSON.stringify(t).match(/Word count|Structure|I need to understand/)), "notes were never shown while streaming");
});

test("if the model keeps planning, it gives up so the built-in advocate can answer", async () => {
  let n = 0;
  await assert.rejects(D.answer(entries[0], "mentor", {}, async (m, onDelta) => { n++; onDelta(NOTES); return {}; }), e => e.code === "planning");
  assert.equal(n, 2, "tried once and retried once, no more");
  let k = 0;
  const ok = await D.answer(entries[0], "mentor", {}, async (m, onDelta) => { k++; onDelta(MORT); return {}; });
  assert.equal(k, 1, "a good reply is not retried");
  assert.equal(ok.retried, false);
});
