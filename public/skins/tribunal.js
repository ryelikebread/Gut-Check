/* Skin: The Tribunal. Three justices hear your idea, deliberate among themselves, then rule.
   Personalities: Chief Justice Marlow presides (formal, measured, cites "the record" and how such cases
   usually go). Justice Vance is the dry, incisive skeptic who cross-examines your confidence.
   Justice Okafor is the warm pragmatist who thinks about consequences, people and alternatives. */
(function () {
  const judge = (robe, hair, face) => '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 64q0-22 22-22t22 22z" fill="' + robe + '"/><path d="M28 44l4 8 4-8z" fill="#f4f1ea"/><circle cx="32" cy="27" r="13" fill="' + face + '"/><path d="M19 25q1-14 13-14t13 14q-3-6-13-6t-13 6z" fill="' + hair + '"/><circle cx="27" cy="28" r="1.8" fill="#222"/><circle cx="37" cy="28" r="1.8" fill="#222"/><path d="M28 34q4 2 8 0" stroke="#222" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>';
  GutDevil.register({
    id: "tribunal",
    order: 20,
    name: "The Tribunal",
    blurb: "Three justices hear your case, confer among themselves, and hand down a formal ruling.",
    stage: "tribunal",
    waiting: "The tribunal is deliberating…",
    words: 260,
    persona: [
      "You are a tribunal of three justices hearing the user's decision or prediction as if it were a case put before the court. The tone is formal and courteous, with the dry wit of people who have heard many such cases.",
      "Chief Justice Marlow presides: measured, dignified and fair. Speaks of \"the matter before us\", \"the record\" and \"precedent\", meaning how cases like this usually turn out. Keeps order, invites colleagues to speak, and delivers the ruling.",
      "Justice Vance is the skeptic: dry, precise, faintly sardonic. Cross-examines the user's confidence and logic (\"With respect, the submission assumes...\"). Short, pointed sentences.",
      "Justice Okafor is the pragmatist: warm, humane, grounded. Raises consequences, the people affected, practical risks and the alternatives not taken (\"Let us not forget...\"). Sometimes gently disagrees with Vance.",
      "The justices address each other (\"Colleague\", \"Chief Justice\") as they deliberate, not only the user. They refer to the user as \"the petitioner\"."
    ].join(" "),
    closing: "Open with Chief Justice Marlow stating the matter. The final line must be from Chief Justice Marlow and begin with \"Ruling:\", giving the tribunal's polite verdict, one concrete check, and a fairer confidence if needed.",
    voices: [
      { id: "marlow", name: "Chief Justice Marlow", aliases: ["Marlow", "Chief Justice", "Justice Marlow"], color: "#6d4c9f", avatar: judge("#3d2a5c", "#e8e4dc", "#e9c4a0") },
      { id: "vance", name: "Justice Vance", aliases: ["Vance"], color: "#1f6f8b", avatar: judge("#1d2b38", "#3b2a20", "#f0cfae") },
      { id: "okafor", name: "Justice Okafor", aliases: ["Okafor"], color: "#a15c1d", avatar: judge("#2d1f14", "#1b1410", "#8d5a3b") }
    ],
    voiceLines: {
      marlow: {
        ack: [d => `The matter before us: "${d.title}". The petitioner's submission is not without merit, and the court says so plainly.`,
          d => `We are asked to consider "${d.title}". The court notes the petitioner has given this real thought.`],
        check: ["the petitioner shall speak with one person who chose otherwise in similar circumstances, and hear them out.",
          "the petitioner shall write down what they would expect to observe if mistaken, and look for it within the month.",
          "the petitioner shall spend ten minutes with the strongest opposing argument before committing."],
        suggest: d => `The court would find a confidence of about ${d.suggest}% easier to defend.`
      },
      vance: {
        conf_track_low: d => `With respect, the record is unkind. At about ${d.side}% the petitioner has been right ${d.r}% of the time, over ${d.n} cases. The confidence exceeds the evidence.`,
        conf_track_ok: d => `I concede the petitioner's record at ${d.side}% is respectable: ${d.r}% over ${d.n} cases. The question is whether this case resembles those.`,
        conf_high: d => `${d.side}%. With respect, that is the confidence of someone who has not yet been surprised. On what grounds is this case the exception?`,
        conf_coin: d => `${d.c}%. The petitioner is, in effect, flipping a coin. What evidence would move the needle at all?`,
        conf_mid: d => `At ${d.c}%, the petitioner expects to be wrong ${d.wrong} times in a hundred. Has the petitioner examined which hundred this is?`,
        flip: d => `At ${d.c}%, I am obliged to argue the contrary. How might it occur after all?`,
        premortem: d => `Suppose it is ${d.when} and the matter has gone badly. The most probable cause? If it comes readily to mind, it deserves weight now.`,
        options_none: "The submission lists no alternatives. A choice with no rival will always appear sound. That is not evidence.",
        options_some: d => `The petitioner considered "${d.options}". I should like to hear the best case for the option rejected.`,
        reasoning_short: "The reasoning offered is thin. The court would not accept it from a stranger; it should not accept it from the petitioner.",
        reasoning_long: "The reasoning rests on one load-bearing assumption. Remove it, and does the conclusion stand?",
        baserate: "Precedent matters. In cases like this one, how often does the expected result follow?",
        vague: d => `"${d.exp}" is not a finding the court could make on ${d.when}. Without a number or threshold, it cannot be judged.`,
        stakes: "The stakes are high. A reversible trial would be prudent."
      },
      okafor: {
        conf_track_low: d => `I'd temper my colleague's tone, but not the point: ${d.r}% right at ${d.side}% is worth heeding.`,
        conf_high: d => `Certainty that high can make us stop looking. What would the petitioner notice if things started to go wrong?`,
        conf_coin: d => `A ${d.c}% call is honest. Let us help the petitioner find the one fact that would settle it.`,
        conf_mid: d => `${d.c}% leaves room to be wrong. What would that cost the petitioner, and the people around them?`,
        flip: d => `At ${d.c}%, it seems unlikely, yet let us be fair: what circumstances would bring it about?`,
        premortem: d => `Let us not forget the human side. If on ${d.when} this has gone badly, who bears the cost, and how might it have happened?`,
        options_none: "Colleague, I'd put it more gently: what path is the petitioner not taking? Sometimes the quiet option is the wise one.",
        options_some: d => `Of the paths considered ("${d.options}"), the one set aside may carry fewer risks for the people involved. Worth a second look.`,
        reasoning_short: "I'd ask the petitioner to say a little more about why. Not for us, for their future self.",
        reasoning_long: "The reasoning is thoughtful. Which piece, if wrong, would hurt the most in practice?",
        baserate: "In my experience, people in this position often underestimate the practical costs. How did it go for others?",
        vague: d => `A practical point: on ${d.when}, how will the petitioner know whether "${d.exp}" came true? A clear marker helps.`,
        stakes: "With stakes this high, is there a smaller first step that keeps options open?"
      }
    },
    offline(raw) {
      const p = raw.points;
      const t = [{ voice: "marlow", text: raw.line("ack", "marlow") + " Justice Vance?" }];
      if (p[0]) t.push({ voice: "vance", text: raw.line(p[0].key, "vance") });
      if (p[1]) t.push({ voice: "okafor", text: "Colleague, if I may. " + raw.line(p[1].key, "okafor") });
      if (p[2]) t.push({ voice: "vance", text: "Agreed. " + raw.line(p[2].key, "vance") });
      if (p[3]) t.push({ voice: "okafor", text: raw.line(p[3].key, "okafor") });
      t.push({ voice: "marlow", text: "Ruling: the court does not overturn the petitioner's call. However, " + raw.line("check", "marlow") + (raw.suggest ? " " + raw.line("suggest", "marlow") : "") + " So ordered." });
      return t;
    }
  });
})();
