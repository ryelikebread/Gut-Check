"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../public/lib/core.js");
const DAY = 86400e3;
const mk = (o = {}) => C.normalizeEntry(Object.assign({ id: "e" + Math.random().toString(36).slice(2), kind: "prediction", title: "x", confidence: 70, createdAt: 1000, updatedAt: 1000 }, o));

test("forecast score endpoints", () => {
  assert.equal(C.forecastScore(50, 1), 75);
  assert.equal(C.forecastScore(50, 0), 75);
  assert.equal(C.forecastScore(90, 1), 99);
  assert.equal(C.forecastScore(90, 0), 19);
  assert.equal(C.forecastScore(99, 0), 2);
  assert.equal(C.forecastScore(150, 1), 100); // clamped to 99 -> 99.99 rounds to 100
});

test("judgment blends forecast and process", () => {
  const e = mk({ kind: "decision", confidence: 80, status: "resolved", resolution: { outcome: 1, process: 5, result: 4 } });
  assert.equal(C.judgmentScore(e), Math.round(0.5 * 96 + 0.5 * 100));
  assert.equal(C.quadrant(e), "earned");
  const lucky = mk({ kind: "decision", status: "resolved", resolution: { outcome: 1, process: 2, result: 5 } });
  assert.equal(C.quadrant(lucky), "lucky");
  assert.equal(C.judgmentScore(mk()), null);
});

test("calibration bins and overconfidence", () => {
  const entries = [];
  for (let i = 0; i < 10; i++) entries.push(mk({ id: "p" + i, confidence: 90, status: "resolved", resolution: { outcome: i < 6 ? 1 : 0 } }));
  const cal = C.calibration({ entries });
  assert.equal(cal.n, 10);
  assert.equal(cal.bins[9].n, 10);
  assert.ok(Math.abs(cal.bins[9].freq - 0.6) < 1e-9);
  assert.ok(cal.overconfidence > 0.29 && cal.overconfidence < 0.31);
  const near = C.hitRateNear({ entries }, 88);
  assert.equal(near.n, 10);
  // folding: a 10% call that didn't happen counts as a correct 90% call
  const low = C.calibration({ entries: [mk({ confidence: 10, status: "resolved", resolution: { outcome: 0 } })] });
  assert.ok(Math.abs(low.hitRate - 1) < 1e-9);
});

test("void and open entries don't count", () => {
  const s = { entries: [mk({ status: "void" }), mk({ status: "open" })] };
  assert.equal(C.calibration(s).n, 0);
});

test("merge: newer copy wins, tombstones win, union of ids", () => {
  const t = Date.now();
  const a = { entries: [mk({ id: "1", title: "old", updatedAt: t + 10 }), mk({ id: "2", updatedAt: t + 10 })] };
  const b = { entries: [mk({ id: "1", title: "new", updatedAt: t + 20 }), mk({ id: "3", updatedAt: t + 5 }), { id: "2", deleted: true, updatedAt: t + 11, createdAt: 1000 }] };
  const m = C.merge(a, b);
  assert.deepEqual(m.entries.map(e => e.id).sort(), ["1", "2", "3"]);
  assert.equal(m.entries.find(e => e.id === "1").title, "new");
  assert.equal(m.entries.find(e => e.id === "2").deleted, true);
  assert.ok(C.sameState(C.merge(a, b), C.merge(b, a)), "merge is symmetric");
});

test("merge drops ancient tombstones and survives junk", () => {
  const old = Date.now() - 400 * DAY;
  const m = C.merge({ entries: [{ id: "z", deleted: true, updatedAt: old, createdAt: old }, null, { nope: 1 }] }, { foo: 1 });
  assert.equal(m.entries.length, 0);
});

test("isDue", () => {
  assert.equal(C.isDue(mk({ reviewAt: Date.now() - 1 })), true);
  assert.equal(C.isDue(mk({ reviewAt: Date.now() + DAY })), false);
  assert.equal(C.isDue(mk({ reviewAt: Date.now() - 1, status: "resolved", resolution: { outcome: 1 } })), false);
});

test("addMonths clamps to month end", () => {
  const d = new Date(C.addMonths(new Date(2027, 0, 31).getTime(), 1));
  assert.equal(d.getMonth(), 1); assert.equal(d.getDate(), 28);
});

test("ics and csv", () => {
  const e = mk({ id: "abc", title: "Ship it, finally; really", reviewAt: Date.UTC(2027, 0, 5) });
  const ics = C.ics([e], "https://x.test/");
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /UID:abc@gut-check/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270105/);
  assert.ok(ics.includes("Ship it\\, finally\\; really"));
  assert.ok(ics.split("\r\n").every(l => l.length <= 75));
  const csv = C.csv({ entries: [e] });
  assert.match(csv, /"Ship it, finally; really"/);
});
