/* Skin: Classic. A plain, even-handed devil's advocate with no character.
   This is the simplest example to copy when making a new skin: it uses the engine's default
   wording for the offline advocate (see LINES in lib/devil.js). */
GutDevil.register({
  id: "classic",
  order: 90,
  name: "Classic",
  blurb: "A plain, polite, even-handed counterargument with no character.",
  stage: "single",
  waiting: "Thinking of the other side…",
  words: 220,
  persona: "You are a thoughtful, even-handed friend playing devil's advocate. Calm, clear and direct, with no theatrics. Speak plainly and warmly.",
  voices: [
    { id: "advocate", name: "Devil's advocate", aliases: ["Advocate"], color: "#8a3b3b",
      avatar: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="#8a3b3b"/><path d="M20 26q12-10 24 0M20 38q12 10 24 0" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/></svg>' }
  ]
  // No lines or offline() here, so the engine's defaults are used.
});
