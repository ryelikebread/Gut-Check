/* Skin: Pip, a little sprite who is half angel, half devil. The two halves argue it out.
   Personality: the Devil half is gleeful, theatrical and teasing; the Angel half is earnest, a bit prim,
   protective of you, and always lands on something practical. They bicker like siblings. */
GutDevil.register({
  id: "pip",
  order: 10,
  name: "Pip (angel & devil)",
  blurb: "A tiny sprite, half angel and half devil, who bickers with itself about your idea.",
  stage: "pip",
  waiting: "Pip is arguing with itself…",
  words: 200,
  persona: [
    "You are Pip, a tiny sprite who is literally half angel and half devil, and the two halves share one small body and can't stop bickering.",
    "The Devil half is mischievous, gleeful and theatrical. It teases, snickers (\"heh\"), says things like \"ooh\", \"oh come ON\" and \"darling\", and loves a sly what-if. It makes the sharpest counterarguments, but it is never cruel to the user; it's teasing a friend.",
    "The Angel half is earnest, gentle and a little prim (\"now, now\"). It defends what's sensible in the user's thinking, scolds the Devil for being dramatic, admits when the Devil has a point (grudgingly), and always ends on something practical and kind.",
    "They interrupt and answer each other directly, like siblings. Short, lively lines. A little playful drama, no meanness."
  ].join(" "),
  closing: "Start with the Angel acknowledging what's sensible, let the Devil make most of the counterarguments while the Angel reacts, and end with the Angel giving one concrete check.",
  voices: [
    { id: "angel", name: "Angel", aliases: ["Pip (angel)", "Angel Pip", "Angel half"], color: "#b8901c",
      avatar: '<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="10" rx="14" ry="4" fill="none" stroke="#e8c547" stroke-width="3"/><circle cx="32" cy="38" r="20" fill="#fffaf0" stroke="#d9cfb8" stroke-width="2"/><circle cx="25" cy="36" r="3" fill="#2b2b2b"/><circle cx="39" cy="36" r="3" fill="#2b2b2b"/><path d="M25 46q7 5 14 0" stroke="#2b2b2b" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>' },
    { id: "devil", name: "Devil", aliases: ["Pip (devil)", "Devil Pip", "Devil half"], color: "#c0392b",
      avatar: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M16 24 10 6l14 12z M48 24l6-18-14 12z" fill="#a52a1f"/><circle cx="32" cy="38" r="20" fill="#e2483b"/><path d="M22 34l7 3M42 34l-7 3" stroke="#2b1210" stroke-width="2.5" stroke-linecap="round"/><circle cx="26" cy="39" r="2.6" fill="#2b1210"/><circle cx="38" cy="39" r="2.6" fill="#2b1210"/><path d="M24 47q8 4 16-1" stroke="#2b1210" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>' }
  ],
  /* The big sprite on the stage: left half angel, right half devil. */
  sprite: '<svg viewBox="0 0 120 130" class="pip-sprite" aria-hidden="true">' +
    '<ellipse class="pip-halo" cx="44" cy="16" rx="20" ry="5" fill="none" stroke="#e8c547" stroke-width="4"/>' +
    '<path class="pip-horn" d="M80 40l14-30 2 34z" fill="#a52a1f"/>' +
    '<path d="M60 108q24 6 30-6 4 10 12 6" class="pip-tail" stroke="#a52a1f" stroke-width="4" fill="none" stroke-linecap="round"/>' +
    '<path d="M14 64q-14-6-12 8 4 10 16 6z" fill="#fff" stroke="#d9cfb8" stroke-width="2"/>' +
    '<clipPath id="pipL"><rect x="0" y="0" width="60" height="130"/></clipPath><clipPath id="pipR"><rect x="60" y="0" width="60" height="130"/></clipPath>' +
    '<circle cx="60" cy="70" r="40" fill="#fffaf0" stroke="#d9cfb8" stroke-width="2" clip-path="url(#pipL)"/>' +
    '<circle cx="60" cy="70" r="40" fill="#e2483b" clip-path="url(#pipR)"/>' +
    '<circle cx="44" cy="66" r="5" fill="#2b2b2b"/><circle cx="76" cy="66" r="5" fill="#2b1210"/>' +
    '<path d="M68 56l14 5" stroke="#2b1210" stroke-width="3.5" stroke-linecap="round"/>' +
    '<path d="M42 86q18 10 36 0" stroke="#2b2b2b" stroke-width="3.5" fill="none" stroke-linecap="round"/>' +
    '</svg>',

  /* Offline wording, per half. Keys are the challenge types in lib/devil.js (LINES). */
  voiceLines: {
    devil: {
      conf_track_low: d => `Heh. Shall I read out your record, darling? When you say about ${d.side}%, you're right ${d.r}% of the time. ${d.n} forecasts. I keep receipts.`,
      conf_track_ok: d => `Fine, fine, your record at ${d.side}% isn't terrible: ${d.r}% right over ${d.n} calls. But is this one really like those? Ooh, I bet it isn't.`,
      conf_high: d => `${d.side}%? Ooh, I love it when you're that sure. Those are exactly the calls that come back to bite. What makes this one bite-proof?`,
      conf_coin: d => `${d.c}%! You basically flipped a coin and called it a plan. Heh. What one fact would actually tip it?`,
      conf_mid: d => `${d.c}%, so about ${d.wrong} times in 100 you're wrong. Go on, picture one of those times. I'll wait.`,
      flip: d => `Only ${d.c}%? Oh come ON. Let me argue it happens anyway. It's my favourite hobby.`,
      premortem: d => `Picture it: ${d.when}, and it's gone sideways. Delicious. Now tell me the story of how. If it comes easily, hmm, that's a clue.`,
      options_none: "No alternatives written down? Not one? Heh. Every choice looks brilliant when it's the only one in the room.",
      options_some: d => `You listed "${d.options}". Let me be the lawyer for the option you dumped. What if it's actually the better one?`,
      reasoning_short: "Your reasoning is about three words long, darling. Would you buy that from a stranger? I wouldn't.",
      reasoning_long: "Lots of reasons! Ooh, but which one is holding up all the others? Pull that one out and watch the whole thing wobble.",
      baserate: "Forget your special snowflake case for a second. How do things like this go for most people? Heh. Not always this well, I suspect.",
      vague: d => `"${d.exp}". Lovely and squishy. On ${d.when} you'll wriggle out of it, won't you? Put a number on it.`,
      stakes: "Big stakes, too. Ooh. Is there a tiny version you can try first, so if I'm right it doesn't hurt much?",
      suggest: d => `My number? About ${d.suggest}%. The angel says I'm being dramatic. I'm being accurate.`
    },
    angel: {
      ack: [d => d.isDec ? "Now, now. You've clearly thought about this, and I think it may well be the right choice." : "Now, now. That's a perfectly reasonable call, and it may well come true.",
        "Before my other half starts: there's real sense in what you wrote.", "I can see exactly why you landed here. Let's just make sure, gently."],
      conf_track_low: d => `I hate to agree with it, but your record says ${d.r}% right when you feel about ${d.side}% sure. A small step down might be wise.`,
      conf_track_ok: d => `Your record at ${d.side}% is genuinely decent, ${d.r}% over ${d.n} calls. Just check this one is as ordinary as those were.`,
      conf_high: d => `${d.side}% is a lot of certainty, dear. Very sure people are wrong more often than they expect. What would make this the exception?`,
      conf_coin: d => `${d.c}% is honest, and I like honest. But it means you're not settled yet. What would help most to know?`,
      conf_mid: d => `At ${d.c}%, you're expecting to be wrong now and then. It's kind to yourself to imagine what that would look like.`,
      flip: d => `At ${d.c}% it's worth a moment's fairness to the other side. How might it happen after all?`,
      premortem: d => `Let's imagine ${d.when} and it didn't go well. What's the most likely reason? Better to meet it now than then.`,
      options_none: "Annoyingly, it has a point: you didn't write down an alternative. What's the best path you're not taking?",
      options_some: d => `You did weigh "${d.options}", which is lovely. Give the one you turned down a fair hearing, just once more.`,
      reasoning_short: "Your reasons are a bit brief. Could you add the evidence that convinced you? Future-you will thank you.",
      reasoning_long: "Your reasoning is thoughtful. Which part matters most? If that one were wrong, would you still choose this?",
      baserate: "It might help to think of others in your shoes. How did it usually go for them?",
      vague: d => `One kind suggestion: "${d.exp}" could mean many things. How will you know, on ${d.when}, if it came true?`,
      stakes: "This one matters a lot, so is there a gentler, reversible first step?",
      check: ["Here's what I'd do: talk to one person who chose differently and really listen.",
        "Here's what I'd do: write down what you'd notice soon if you were wrong, and look for it in a few weeks.",
        "Here's what I'd do: spend ten honest minutes reading the best argument against this."]
    }
  },
  offline(raw) {
    const p = raw.points;
    const t = [{ voice: "angel", text: raw.line("ack", "angel") }];
    if (p[0]) t.push({ voice: "devil", text: raw.line(p[0].key, "devil") });
    if (p[1]) t.push({ voice: "angel", text: raw.line(p[1].key, "angel") });
    if (p[2]) t.push({ voice: "devil", text: "Ooh, and! " + raw.line(p[2].key, "devil") });
    if (p[3]) t.push({ voice: "angel", text: "Oh, fine, one more from me. " + raw.line(p[3].key, "angel") });
    t.push({ voice: "angel", text: raw.line("check", "angel") });
    if (raw.suggest) t.push({ voice: "devil", text: raw.line("suggest", "devil") });
    return t;
  }
});
