/* On-device advocate: runs a small language model inside this browser (WebGPU, via the vendored WebLLM
   library in vendor/web-llm/). Opt-in; nothing is downloaded until the user asks. Exposes window.GutDevice. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api; else root.GutDevice = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  // Ordered smallest first. ids are WebLLM prebuilt model ids. mb = approximate download, vram = GPU memory needed.
  const MODELS = [
    { id: "SmolLM2-360M-Instruct-q4f16_1-MLC", f16: true, name: "SmolLM2 360M (tiny)", mb: 210, vram: 380, note: "Smallest and safest for phones. Replies are simpler." },
    { id: "SmolLM2-360M-Instruct-q4f32_1-MLC", f16: false, name: "SmolLM2 360M (tiny, compatible)", mb: 210, vram: 580, note: "For phones whose GPU lacks 16-bit support." },
    { id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", f16: true, name: "Qwen2.5 0.5B (small)", mb: 290, vram: 945, note: "Better replies, needs a newer phone." },
    { id: "Qwen2.5-0.5B-Instruct-q4f32_1-MLC", f16: false, name: "Qwen2.5 0.5B (small, compatible)", mb: 290, vram: 1060, note: "" },
    { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", f16: true, name: "Llama 3.2 1B (medium)", mb: 700, vram: 880, note: "Best quality here; slow and heavy on phones." }
  ];
  const LIB_URL = "vendor/web-llm/web-llm.js";
  const CACHE = "gut-check-device"; // survives app updates (see sw.js)
  let loader = null, engine = null, engineId = null, lib = null;

  function setLoader(fn) { loader = fn; engine = null; engineId = null; lib = null; }   // tests inject a fake library
  async function loadLib() {
    if (lib) return lib;
    if (loader) return (lib = await loader());
    const url = new URL(LIB_URL, document.baseURI).href;
    try { const c = await caches.open(CACHE); if (!(await c.match(url))) await c.add(url); } catch (e) {} // keep it for offline use
    return (lib = await import(url));
  }

  /* Can this browser run it? Returns {ok, f16, reason, memGB}. Never throws. */
  async function support() {
    try {
      if (typeof navigator === "undefined" || !navigator.gpu) return { ok: false, reason: "this browser has no WebGPU (needs Chrome 121+ on Android 12+, or Safari on iOS 26+)" };
      const ad = await navigator.gpu.requestAdapter();
      if (!ad) return { ok: false, reason: "this device's graphics chip isn't available to the browser" };
      const mem = navigator.deviceMemory || null;                    // Chrome only, capped at 8
      if (mem && mem < 3) return { ok: false, reason: `this device reports only ${mem} GB of memory`, memGB: mem };
      return { ok: true, f16: !!(ad.features && ad.features.has("shader-f16")), memGB: mem };
    } catch (e) { return { ok: false, reason: "WebGPU check failed (" + e.message + ")" }; }
  }
  function modelsFor(sup) { const f = !!(sup && sup.f16); return MODELS.filter(m => m.f16 === f); }
  const byId = id => MODELS.find(m => m.id === id);

  async function isCached(id) { try { const l = await loadLibLite(); return !!(l && await l.hasModelInCache(id)); } catch (e) { return false; } }
  async function loadLibLite() { return lib || (loader ? loadLib() : null) || (await cachedLibOnly()); }
  async function cachedLibOnly() { try { const url = new URL(LIB_URL, document.baseURI).href; const c = await caches.open(CACHE); return (await c.match(url)) ? loadLib() : null; } catch (e) { return null; } }

  /* Downloads (first time) and loads the model into memory. onProgress(fraction 0..1, text). */
  async function load(id, onProgress) {
    if (engine && engineId === id) return engine;
    const l = await loadLib();
    if (engine) { try { await engine.unload(); } catch (e) {} engine = null; }
    engine = await l.CreateMLCEngine(id, { initProgressCallback: r => onProgress && onProgress(r.progress, r.text) });
    engineId = id; return engine;
  }

  /* Same shape as the other stream functions in app.js: stream(msgs, onDelta, signal) -> {model}. */
  async function stream(id, msgs, onDelta, signal) {
    const eng = await load(id);
    const onAbort = () => { try { eng.interruptGenerate(); } catch (e) {} };
    if (signal) signal.addEventListener("abort", onAbort);
    try {
      const it = await eng.chat.completions.create({ messages: msgs, stream: true, temperature: 0.7, max_tokens: 500 });
      for await (const ch of it) { const d = ch.choices && ch.choices[0] && ch.choices[0].delta && ch.choices[0].delta.content; if (d) onDelta(d); }
    } finally { if (signal) signal.removeEventListener("abort", onAbort); }
    if (signal && signal.aborted) throw new Error("stopped");
    return { model: id };
  }

  async function remove(id) {
    const l = await loadLibLite();
    if (engine && engineId === id) { try { await engine.unload(); } catch (e) {} engine = null; engineId = null; }
    if (l) await l.deleteModelAllInfoInCache(id);
  }
  async function removeLibrary() { try { await caches.delete(CACHE); } catch (e) {} }

  return { MODELS, support, modelsFor, byId, isCached, load, stream, remove, removeLibrary, _setLoader: setLoader };
});
