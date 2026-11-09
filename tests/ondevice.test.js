const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path");
const G = require("../public/lib/ondevice.js");

function fakeLib(log = []) {
  return async () => ({
    async CreateMLCEngine(id, o) {
      log.push("create " + id); o.initProgressCallback({ progress: 0.5, text: "half" }); o.initProgressCallback({ progress: 1, text: "done" });
      return { async unload() { log.push("unload"); }, interruptGenerate() { log.push("interrupt"); },
        chat: { completions: { async create() { return (async function* () { for (const t of ["Hel", "lo ", "there"]) yield { choices: [{ delta: { content: t } }] }; })(); } } } };
    },
    async hasModelInCache() { return true; }, async deleteModelAllInfoInCache(id) { log.push("delete " + id); }
  });
}

test("model list only offers builds the GPU can run", () => {
  assert.ok(G.modelsFor({ f16: true }).every(m => m.f16 && /q4f16_1/.test(m.id)));
  assert.ok(G.modelsFor({ f16: false }).every(m => !m.f16 && /q4f32_1/.test(m.id)));
  assert.ok(G.modelsFor({ f16: true })[0].mb < 300, "smallest model first");
});
test("support() says no, politely, without WebGPU", async () => {
  const s = await G.support(); assert.equal(s.ok, false); assert.match(s.reason, /WebGPU/);
});
test("load reports progress, then streams text and can remove", async () => {
  const log = []; G._setLoader(fakeLib(log));
  const prog = []; await G.load("m1", (f, t) => prog.push(f));
  assert.deepEqual(prog, [0.5, 1]);
  let text = ""; const r = await G.stream("m1", [{ role: "user", content: "hi" }], d => text += d, null);
  assert.equal(text, "Hello there"); assert.equal(r.model, "m1");
  assert.equal(log.filter(x => x.startsWith("create")).length, 1, "engine is reused");
  assert.equal(await G.isCached("m1"), true);
  await G.remove("m1"); assert.ok(log.includes("delete m1") && log.includes("unload"));
});
test("an aborted stream is reported", async () => {
  G._setLoader(fakeLib()); const ac = new AbortController(); ac.abort();
  await assert.rejects(G.stream("m2", [], () => {}, ac.signal), /stopped/);
});
test("the vendored library is present, licensed and listed", () => {
  const dir = path.join(__dirname, "..", "public", "vendor", "web-llm");
  assert.ok(fs.statSync(path.join(dir, "web-llm.js")).size > 1e6);
  assert.match(fs.readFileSync(path.join(dir, "LICENSE"), "utf8"), /Apache License/);
  assert.ok(fs.existsSync(path.join(dir, "README.md")));
  assert.ok(fs.readFileSync(path.join(__dirname, "..", "public", "sw.js"), "utf8").includes("lib/ondevice.js"));
  assert.ok(fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8").includes("lib/ondevice.js"));
});
