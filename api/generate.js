// api/generate.js
// Talks to Google's Gemini API (free tier). The key lives only here,
// as a Vercel environment variable — never in the frontend code.

// Per-IP rate limit, best-effort (resets on cold start, not shared across
// instances) — just enough to stop a script from hammering the Gemini key.
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 30;
const rateLimitBuckets = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets) {
    if (now - bucket.windowStart > RATE_LIMIT_WINDOW_MS) rateLimitBuckets.delete(key);
  }
  const bucket = rateLimitBuckets.get(ip);
  if (!bucket) {
    rateLimitBuckets.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX;
}

const PERSONAS = {
  sportscenter: {
    voice: `High-energy sports anchor doing a nightly recap. Confident, punchy, present-tense excitement. Frame the day's events as a game: comeback, upset, overtime, MVP, clutch. Invent a plausible "final score," a nickname for the person, and quote-style soundbites — the kind of specific, vivid detail a real broadcast has, not a summary of what happened.`,
    sidebarHint: `Pick 2-3 of: INJURY REPORT (a real-life friction point in their day framed as a status like Questionable/Doubtful/Probable, with a fake "return timeline"), TRANSACTION WIRE (a one-line "trade" or "signing" joke about something from their day), BY THE NUMBERS (2-3 invented but plausible stats), POWER RANKINGS (where today ranks against a fictional recent streak).`,
    imageScene: `an empty sports arena at night with dramatic stadium lighting and confetti in the air`,
  },
  tmz: {
    voice: `Breathless tabloid gossip writer. Dramatic, conspiratorial: "sources say," "we've learned exclusively," "insiders close to the situation." Invent a specific "insider" detail, a dramatic exclusive-photo-caption style line, and treat mundane events as scandal.`,
    sidebarHint: `Pick 2-3 of: SOURCES SAY (an invented quote from an "insider"), SPOTTED (a paparazzi-style caption of a specific moment), EXCLUSIVE (one juicy invented detail), WHAT WE'VE LEARNED (a follow-up tidbit).`,
    imageScene: `a red carpet event at night with blurred paparazzi camera flash streaks`,
  },
  naturedoc: {
    voice: `Calm, dry nature documentary narrator (Attenborough-style). Third person, treats the person as a specimen in its "natural habitat." Invent specific, deadpan pseudo-scientific detail — a fake Latin-sounding behavioral term, a "migration pattern," a subspecies classification joke.`,
    sidebarHint: `Pick 2-3 of: FIELD NOTES (a specific deadpan observation), CONSERVATION STATUS (a joke classification like "Vulnerable" or "Least Concerned"), BEHAVIORAL OBSERVATION (one invented ritual/pattern noticed today).`,
    imageScene: `a misty forest at dawn with soft natural light breaking through fog`,
  },
  breakingnews: {
    voice: `24-hour cable news anchor cutting to a "breaking" story. Urgent, red-alert energy, short punchy sentences, invented expert soundbites, a fake developing-story angle with wildly disproportionate stakes for something small.`,
    sidebarHint: `Pick 2-3 of: DEVELOPING (a one-line urgent update), BY THE NUMBERS (invented stats treated as alarming), WHAT WE KNOW (a bullet-style fact treated as breaking), EXPERT REACTION (a fake quoted "analyst").`,
    imageScene: `a dark newsroom control room with rows of glowing monitors and red alert lighting`,
  },
  realitytv: {
    voice: `Reality TV confessional cutaway, first person, mid-season energy. Petty, dramatic, self-aware, invents a specific "storyline" framing for the day and a dramatic teaser line.`,
    sidebarHint: `Pick 2-3 of: PREVIOUSLY ON (an invented callback to "earlier this season"), CAST CONFESSIONAL (a second short dramatic aside), NEXT TIME ON (a teaser for "tomorrow's episode").`,
    imageScene: `a single dramatically spotlit empty chair in a dark studio`,
  },
};

const INTENSITY = {
  low: `Tone: warm and wholesome. Playful, gentle, zero edge — safe to show anyone, including family.`,
  medium: `Tone: light teasing and sarcasm, still fundamentally friendly and good-natured.`,
  high: `Tone: sharper, near-the-line roasting humor directed at the user's own choices and day — but never cruel, never targets anyone's identity or protected traits, and never actually demeaning. Think "friends who roast each other," not an insult.`,
};

async function callGemini(systemInstruction, contents) {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
    }),
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message || "Gemini API error");
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

function historyToGeminiContents(history) {
  return history.map((msg) => {
    const parts = [];
    if (msg.text) parts.push({ text: msg.text });
    if (msg.imageBase64) {
      parts.push({ inlineData: { mimeType: "image/jpeg", data: msg.imageBase64 } });
    }
    return { role: msg.role === "user" ? "user" : "model", parts };
  });
}

function extractJson(raw) {
  // Strip markdown code fences if the model added them despite instructions.
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "").trim();
  return JSON.parse(cleaned);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Too many requests — take a breather and try again in a few minutes." });
  }

  const { mode, history, tier, intensity } = req.body || {};
  if (!history || history.length === 0) {
    return res.status(400).json({ error: "No conversation yet." });
  }

  try {
    if (mode === "chat") {
      const systemInstruction = `<role>
You're a warm, curious friend chatting with someone about their day.
</role>

<rules>
- Keep replies short: 1-3 sentences.
- Casual tone, not formal.
- Ask one light follow-up question to draw out more detail.
- You're quietly gathering material for a fun broadcast later — don't mention that explicitly.
</rules>`;
      const reply = await callGemini(systemInstruction, historyToGeminiContents(history));
      return res.status(200).json({ reply });
    }

    if (mode === "broadcast") {
      const persona = PERSONAS[tier] || PERSONAS.sportscenter;
      const intensityLine = INTENSITY[intensity] || INTENSITY.medium;

      const systemInstruction = `<role>
You are a broadcast writer. The conversation below is someone describing their real day, possibly with screenshots attached.
</role>

<persona_voice>
${persona.voice}
</persona_voice>

<tone>
${intensityLine}
</tone>

<sidebar_format>
Pick 2-3 sidebar items matching this genre's typical secondary format: ${persona.sidebarHint}
</sidebar_format>

<rules>
- Do not simply restate or paraphrase what they said.
- Invent vivid, genre-specific embellishment: specific details, numbers, quotes, framing a real segment in this genre would have.
- Stay true to the real underlying facts of their day.
- Never invent a new real-world event that contradicts what they told you — dramatize and stylize, don't fabricate different facts.
</rules>

<output_format>
Respond with ONLY valid JSON. No markdown code fences, no commentary outside the JSON.
Exact shape: {"headline": "string", "main": "string", "sidebars": [{"label": "string", "text": "string"}]}
- headline: punchy, under 12 words
- main: 180-260 words, in the persona voice
- sidebars: exactly 2-3 items, 20-40 words each
</output_format>`;

      const contents = [
        ...historyToGeminiContents(history),
        { role: "user", parts: [{ text: "=== END OF CONVERSATION === Now write the broadcast as instructed, as JSON only." }] },
      ];

      const raw = await callGemini(systemInstruction, contents);
      let parsed;
      try {
        parsed = extractJson(raw);
      } catch (e) {
        // Fallback: if the model didn't return clean JSON, still show something.
        parsed = { headline: "Tonight's Broadcast", main: raw, sidebars: [] };
      }

      // Note: AI image generation was tried here but Gemini's image model
      // (gemini-2.5-flash-image) currently returns a "quota limit: 0" error
      // even on billed accounts — a known issue on Google's side as of
      // writing, not something fixable in this code. Sticking with the
      // fixed per-channel photos instead, which are reliable and free.

      return res.status(200).json(parsed);
    }

    return res.status(400).json({ error: "Unknown mode." });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Something went wrong." });
  }
}