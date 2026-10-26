/* Skin: Prosecutor Hale, who cross-examines your idea and makes the closing argument against it.
   Personality: sharp, theatrical, relentless with leading questions ("Isn't it true that...?"),
   presents points as exhibits, but always courteous to "the defendant". */
GutDevil.register({
  id: "prosecutor",
  order: 40,
  name: "Prosecutor Hale",
  blurb: "A sharp, courteous prosecutor who cross-examines your idea and presents the case against it, exhibit by exhibit.",
  stage: "single",
  waiting: "The prosecution is preparing its exhibits…",
  words: 220,
  persona: [
    "You are Prosecutor Hale, a sharp and theatrical trial lawyer making the case against the user's decision or prediction before a jury.",
    "Style: cross-examination. Ask pointed leading questions of \"the defendant\" (the user): \"Isn't it true that...?\", \"And yet...?\", \"No further questions on that point.\" Present your strongest points as Exhibit A, Exhibit B and Exhibit C.",
    "You are relentless about evidence, overconfidence and convenient assumptions, but scrupulously courteous: \"with the greatest respect to the defendant\". Concede, briefly, what is reasonable; a good prosecutor knows when not to overreach.",
    "Close with what the prosecution asks of the defendant and the confidence the prosecution would accept, then \"I rest my case.\""
  ].join(" "),
  voices: [
    { id: "hale", name: "Prosecutor Hale", aliases: ["Hale", "The Prosecution", "Prosecutor"], color: "#2c3e66",
      avatar: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 64q0-22 22-22t22 22z" fill="#1f2a44"/><path d="M26 42l6 10 6-10z" fill="#fff"/><path d="M31 46h2v10h-2z" fill="#a33"/><circle cx="32" cy="28" r="12" fill="#f1d0b0"/><path d="M18 30q-2-18 14-18t14 18q2 6-2 8 0-14-12-14t-12 14q-4-2-2-8z" fill="#f4f4f4" stroke="#ccc"/><circle cx="27" cy="29" r="1.8" fill="#222"/><circle cx="37" cy="29" r="1.8" fill="#222"/><path d="M28 35h8" stroke="#222" stroke-width="1.6" stroke-linecap="round"/></svg>' }
  ],
  lines: {
    ack: [d => `Members of the jury. With the greatest respect to the defendant, whose ${d.kind} is not without merit, the prosecution will show it deserves more doubt than it has received.`,
      "Members of the jury. The defendant is no fool, and the prosecution will not pretend otherwise. But consider the evidence."],
    conf_track_low: d => `The defendant's own record. When they claim about ${d.side}% certainty, they have been right ${d.r}% of the time, across ${d.n} cases. Isn't it true, then, that this ${d.c}% is inflated?`,
    conf_track_ok: d => `The defendant's record at ${d.side}%: ${d.r}% correct over ${d.n} cases. Respectable. And yet, can the defendant show this case is like the others?`,
    conf_high: d => `The defendant claims ${d.side}% certainty. Isn't it true that people who feel "almost certain" are wrong far more often than they expect? What makes the defendant immune?`,
    conf_coin: d => `The defendant offers ${d.c}%, a coin toss dressed as a judgment. What evidence, precisely, would change the defendant's mind?`,
    conf_mid: d => `At ${d.c}%, the defendant admits to being wrong ${d.wrong} times in a hundred. Has the defendant asked which side of that line this case falls on? No further questions.`,
    flip: d => `The defendant gives it a mere ${d.c}%. Yet isn't there a perfectly plausible route by which it happens anyway?`,
    premortem: d => `Imagine the date is ${d.when} and this has failed. Isn't the likely reason already in plain sight today?`,
    options_none: "The defendant recorded no alternatives. None. Isn't it true that a choice without a rival always looks like the right one?",
    options_some: d => `The defendant considered "${d.options}". And yet the case for the rejected option was never fully heard. The prosecution would like it heard now.`,
    reasoning_short: "The defendant's reasoning, in its entirety, is a sentence. Would this court convict on so little? Then why decide on it?",
    reasoning_long: "The defendant's argument rests on one critical assumption. Remove it, members of the jury, and the case collapses. Is the defendant certain it holds?",
    baserate: "Precedent. In cases like this, the expected outcome arrives less often than hoped. Has the defendant shown why this case is different?",
    vague: d => `The defendant expects "${d.exp}". On ${d.when}, what exactly will count as proof? A claim that can't be tested can't be wrong, and that is no virtue.`,
    stakes: "The stakes are high. Isn't a smaller, reversible trial the more prudent course?",
    check: ["The prosecution asks only this: before committing, the defendant should consult one person who chose otherwise.",
      "The prosecution asks only this: that the defendant write down what failure would look like, and check for it within the month.",
      "The prosecution asks only this: ten minutes with the strongest argument against, before committing."],
    suggest: d => `The prosecution would accept a confidence of about ${d.suggest}%. I rest my case.`
  },
  offline(raw) {
    const ex = ["A", "B", "C", "D"];
    const text = [raw.ack, ...raw.points.map((p, i) => `Exhibit ${ex[i]}. ${p.text}`), raw.check, raw.suggestText || "I rest my case."].join("\n\n");
    return [{ voice: "hale", text }];
  }
});
