/* Gut Check devil's advocate engine.
   - Builds the prompt that is sent to a local model (Ollama), shaped by the chosen skin.
   - Parses the model's reply into speaking turns ("Name: line").
   - Has a built-in offline advocate that needs no model at all.
   Skins live in public/skins/*.js and call GutDevil.register({...}). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.GutDevil = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const skins = new Map();
  function register(skin) {
    if (!skin || !skin.id || !Array.isArray(skin.voices) || !skin.voices.length) throw new Error("A skin needs an id and at least one voice");
    skin.mode = skin.voices.length > 1 ? "dialogue" : "single";
    skins.set(skin.id, skin);
    return skin;
  }
  const list = () => [...skins.values()].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  const get = id => skins.get(id) || list()[0];

  const fmtDate = ts => new Date(ts).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const STAKES = { 1: "low", 2: "medium", 3: "high" };

  /* Plain-language description of the entry. ctx.track = {n, rate} from GutCore.hitRateNear. */
  function describe(e, ctx = {}) {
    const lines = [];
    if (e.kind === "decision") {
      lines.push("Type: a decision");
      lines.push("What I decided: " + e.title);
      if (e.details) lines.push("The situation: " + e.details);
      if (e.options) lines.push("Options I considered: " + e.options);
      if (e.reasoning) lines.push("Why I chose this: " + e.reasoning);
      if (e.expectation) lines.push("What I expect to happen: " + e.expectation);
      lines.push(`How sure I am that it turns out as expected: ${e.confidence}%`);
      lines.push("Stakes: " + (STAKES[e.stakes] || "medium"));
    } else {
      lines.push("Type: a prediction");
      lines.push("My prediction: " + e.title);
      if (e.details) lines.push("My reasoning: " + e.details);
      lines.push(`How likely I think it is to come true: ${e.confidence}%`);
    }
    if (e.reviewAt) lines.push("I'll check how it turned out on: " + fmtDate(e.reviewAt));
    if (ctx.track) lines.push(`My track record: when I've said about ${Math.max(e.confidence, 100 - e.confidence)}%, I've been right ${Math.round(ctx.track.rate * 100)}% of the time (${ctx.track.n} past forecasts).`);
    return lines.join("\n");
  }

  const BASE = [
    "You are the devil's advocate inside Gut Check, a private decision journal.",
    "The user has just written down a decision or a prediction. Give a polite, well-reasoned counterargument: the strongest honest case that they could be wrong, or more confident than the evidence allows.",
    "Rules:",
    "- Be warm and respectful. Never mock, lecture or moralise. Acknowledge what is sensible in their reasoning in one short sentence.",
    "- Be specific to what they wrote. No generic self-help advice.",
    "- Cover the outside view (how situations like this usually go), what they may be overlooking (alternatives, risks, people affected, second-order effects), and what would have to be true for them to be right.",
    "- Finish with one concrete, cheap check they could do before committing, and, if their confidence looks too high or too low, a number you would find more defensible.",
    "- Do not decide for them. They may well be right.",
    "- Plain text only: no markdown, no headings, no bullet symbols, no emoji."
  ].join("\n");

  function messages(entry, skin, ctx = {}) {
    skin = typeof skin === "string" ? get(skin) : skin;
    const words = skin.words || 220;
    let format;
    if (skin.mode === "dialogue") {
      const names = skin.voices.map(v => v.name);
      format = `Write it as a short exchange between ${names.join(", ")}. Every line must start with the speaker's name exactly as written here, then a colon, like "${names[0]}: ...". ` +
        `Use 4 to 8 lines in total and give every speaker at least one line. ${skin.closing || ""} Keep the whole exchange under ${words} words.`;
    } else {
      format = `Speak as ${skin.voices[0].name} in the first person. Write two or three short paragraphs, under ${words} words in total.`;
    }
    return [
      { role: "system", content: BASE + "\n\nCharacter:\n" + skin.persona + "\n\nFormat:\n" + format },
      { role: "user", content: describe(entry, ctx) + "\n\nPlease play devil's advocate." }
    ];
  }

  /* ---------- parsing a model reply into turns ---------- */
  function clean(text) {
    return String(text || "")
      .replace(/<think>[\s\S]*?(<\/think>|$)/gi, "")
      .replace(/^\s*#+\s*/gm, "")
      .replace(/\*\*|__/g, "")
      .replace(/^\s*[-*•]\s+/gm, "")
      .trim();
  }
  function parseTurns(text, skin) {
    skin = typeof skin === "string" ? get(skin) : skin;
    const body = clean(text);
    const first = skin.voices[0].id;
    if (skin.mode !== "dialogue") return body ? [{ voice: first, text: body }] : [];
    const names = skin.voices.flatMap(v => [v.name, ...(v.aliases || [])].map(n => ({ n: n.toLowerCase(), id: v.id })))
      .sort((a, b) => b.n.length - a.n.length);
    const turns = [];
    for (const raw of body.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      const m = /^[\s"'(\[]*([^:]{2,40}?)[)\]"']*\s*[:：]\s*(.*)$/.exec(line);
      const who = m && names.find(x => m[1].toLowerCase().replace(/^the\s+/, "") === x.n.replace(/^the\s+/, "") || m[1].toLowerCase().includes(x.n));
      if (who) turns.push({ voice: who.id, text: m[2].trim() });
      else if (turns.length) turns[turns.length - 1].text += (turns[turns.length - 1].text ? " " : "") + line;
      else turns.push({ voice: first, text: line });
    }
    return turns.filter(t => t.text);
  }

  /* ---------- offline advocate ----------
     The built-in advocate works without any model. It picks the most relevant challenges for the
     entry (confidence, pre-mortem, alternatives, reasoning, base rates, vagueness, stakes), then
     words each one in the skin's own voice: a skin can override any line below in its `lines`.
     A line is a string, a function of the facts `d`, or an array of those (one is picked per entry). */
  function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function pick(arr, seed) { return arr[(seed >>> 0) % arr.length]; }

  const LINES = {
    ack: [d => d.isDec ? "You've clearly thought about this, and the choice may well be right." : "That's a reasonable call, and it may well come true.",
      "There's real sense in your reasoning, so take this as a stress test rather than a verdict.",
      "I can see why you landed here. Let me push on it a little."],
    conf_track_low: d => `Your own record is worth a look: when you've said about ${d.side}%, you've been right ${d.r}% of the time across ${d.n} forecasts. That suggests nudging this one down.`,
    conf_track_ok: d => `Your record at about ${d.side}% is decent (right ${d.r}% of the time over ${d.n} forecasts), so the question is whether this case is as typical as those were.`,
    conf_high: d => `${d.side}% is very sure. Forecasting research keeps finding that people's "almost certain" calls come true noticeably less often than they feel they will. What would make this one an exception?`,
    conf_coin: d => `At ${d.c}% you're close to a coin flip. That's honest, but it also means the reasoning hasn't settled it yet. What single piece of information would move you the most?`,
    conf_mid: d => `${d.c}% means you expect to be wrong about ${d.wrong} times in 100 calls like this. Can you picture the version of events where this is one of those times?`,
    flip: d => `You give it only ${d.c}%. Try arguing the other side for a minute: what's the most plausible way it happens anyway?`,
    premortem: [d => `Imagine it's ${d.when} and this went wrong. What's the most likely story of how it happened? If that story comes easily, it deserves more weight.`,
      d => `Fast-forward to ${d.when}: it didn't work out. Write the one-sentence explanation you'd give. Is anything in it already visible today?`],
    options_none: "You didn't write down any alternatives. Decisions made without a real second option tend to look better than they are. What's the best path you're not taking, and what would make it win?",
    options_some: d => `Of the options you listed (${d.options}), make the strongest case for the one you rejected. If it's closer than you thought, that's useful to know now.`,
    reasoning_short: "Your reasoning is short. If a friend handed you just these words as their reason, would it convince you? What evidence would you want to see first?",
    reasoning_long: "Find the weakest link in your reasoning, the one assumption everything else leans on. If that turned out to be false, would your conclusion survive?",
    baserate: ["Think of ten situations like this one, yours or other people's. In how many did it go the way you expect here? Start from that number, then adjust for what's special about this case.",
      "Set the details aside for a moment and look at the category: how do things like this usually turn out for most people? Your plan should beat that average for a reason you can name."],
    vague: d => `One practical point: "${d.exp}" is a little open to interpretation. On ${d.when}, how will you decide whether it came true? Adding a number or a clear threshold now keeps future-you honest.`,
    stakes: "This is high-stakes. Is there a smaller, reversible version you could try first, so being wrong is cheap?",
    check: ["Before you commit, talk to one person who chose differently in a similar spot and ask what they saw that you might not.",
      "Before you commit, write down what you'd expect to notice in the next few weeks if you were wrong, and set yourself a reminder to look for it.",
      "Before you commit, spend ten minutes looking for the best argument against this from someone who knows the area."],
    suggest: d => `If I had to put a number on it, I'd say about ${d.suggest}%.`
  };

  /* Wording lookup: the voice's own lines (skin.voiceLines[voice]), then the skin's lines, then the defaults. */
  function say(skin, key, d, seed, voice) {
    const vl = voice && skin && skin.voiceLines && skin.voiceLines[voice];
    let v = vl && vl[key] !== undefined ? vl[key] : skin && skin.lines && skin.lines[key] !== undefined ? skin.lines[key] : LINES[key];
    if (Array.isArray(v)) v = pick(v, seed);
    return typeof v === "function" ? v(d) : String(v || "");
  }

  /* Returns {ack, points:[{topic,key,text}], check, suggest, suggestText, facts, line(key, voice)} in the skin's voice. */
  function offlinePoints(e, ctx = {}, skin) {
    skin = typeof skin === "string" ? get(skin) : skin;
    const seed = hash(e.id + e.title);
    const c = e.confidence, side = Math.max(c, 100 - c);
    const isDec = e.kind === "decision";
    const cut = (s, n) => { s = String(s || "").trim(); return s.length > n ? s.slice(0, n) + "…" : s; };
    const exp = isDec ? e.expectation : e.title;
    const d = { c, side, wrong: 100 - side, isDec, kind: e.kind, title: cut(e.title, 90), when: e.reviewAt ? fmtDate(e.reviewAt) : "your review date",
      options: cut(e.options, 120), exp: cut(exp, 90), r: ctx.track ? Math.round(ctx.track.rate * 100) : null, n: ctx.track ? ctx.track.n : 0 };
    d.suggest = side >= 75 ? (c >= 50 ? Math.max(55, c - 10) : Math.min(45, c + 10)) : null;

    const keys = [];
    keys.push(ctx.track && ctx.track.n >= 3 ? (d.r < side - 5 ? "conf_track_low" : "conf_track_ok") : side >= 85 ? "conf_high" : side <= 60 ? "conf_coin" : "conf_mid");
    if (!isDec && c <= 30) keys.push("flip");
    if (exp && !/\d|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b(spring|summer|autumn|fall|winter|christmas|week|month|year)\b/i.test(exp)) keys.push("vague"); // nothing measurable or dated
    if (isDec) keys.push(!e.options || e.options.trim().length < 3 ? "options_none" : "options_some");
    keys.push("premortem");
    if (isDec && e.stakes === 3) keys.push("stakes");
    const why = (isDec ? e.reasoning : e.details) || "";
    keys.push(why.trim().length < 60 ? "reasoning_short" : "reasoning_long");
    keys.push("baserate");

    // Keep it short: the confidence point, then the three most relevant others.
    const points = keys.slice(0, 4).map((key, i) => ({ topic: key.split("_")[0], key, text: say(skin, key, d, seed >>> i) }));
    return { ack: say(skin, "ack", d, seed >>> 7), points, check: say(skin, "check", d, seed >>> 5), suggest: d.suggest,
      suggestText: d.suggest ? say(skin, "suggest", d, seed >>> 9) : "", facts: d,
      line: (key, voice, i = 0) => say(skin, key, d, seed >>> (i + 11), voice) }; // re-word any line in a specific voice
  }

  function offline(entry, skin, ctx = {}) {
    skin = typeof skin === "string" ? get(skin) : skin;
    const raw = offlinePoints(entry, ctx, skin);
    const turns = skin.offline ? skin.offline(raw, entry, ctx) : [{ voice: skin.voices[0].id, text: [raw.ack, ...raw.points.map(p => p.text), raw.check, raw.suggestText].filter(Boolean).join("\n\n") }];
    return turns.filter(t => t && t.text);
  }

  return { register, list, get, describe, messages, parseTurns, clean, offline, offlinePoints, LINES, skins };
});
