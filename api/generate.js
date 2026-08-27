// api/generate.js
// Talks to Google's Gemini API (free tier). The key lives only here,
// as a Vercel environment variable — never in the frontend code.

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

async function generateImage(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message || "Image generation error");

  const parts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p) => p.inlineData);
  if (!imagePart) return null;

  return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  const { mode, history, tier, intensity } = req.body || {};
  if (!history || history.length === 0) {
    return res.status(400).json({ error: "No conversation yet." });
  }

  try {
    if (mode === "chat") {
      const systemInstruction = `You're a warm, curious friend chatting with someone about their day. Keep replies short (1-3 sentences), casual, and ask a light follow-up question to draw out more detail — you're gathering material for a fun broadcast later, but don't mention that explicitly.`;
      const reply = await callGemini(systemInstruction, historyToGeminiContents(history));
      return res.status(200).json({ reply });
    }

    if (mode === "broadcast") {
      const persona = PERSONAS[tier] || PERSONAS.sportscenter;
      const intensityLine = INTENSITY[intensity] || INTENSITY.medium;

      const systemInstruction = `Read the full conversation below — someone describing their day, possibly with screenshots attached.

Do NOT simply restate or paraphrase what they said. Your job is to invent vivid, idiomatic, genre-specific embellishment — specific invented details, numbers, quotes, and framing that a real segment in this genre would have — while staying true to the real underlying facts of their day. Never invent a new real-world event that contradicts what they told you, only dramatize and stylize it.

PERSONA VOICE:
${persona.voice}

${intensityLine}

Produce THREE things:
1. A punchy headline, under 12 words.
2. A main segment, 180-260 words, in the persona voice above.
3. Exactly 2-3 short sidebar items (20-40 words each), following this genre's typical secondary format: ${persona.sidebarHint}

Respond with ONLY valid JSON, no markdown code fences, no extra commentary, in exactly this shape:
{"headline": "string", "main": "string", "sidebars": [{"label": "string", "text": "string"}]}`;

      const contents = [
        ...historyToGeminiContents(history),
        { role: "user", parts: [{ text: "Now write the broadcast as instructed, as JSON only." }] },
      ];

      const raw = await callGemini(systemInstruction, contents);
      let parsed;
      try {
        parsed = extractJson(raw);
      } catch (e) {
        // Fallback: if the model didn't return clean JSON, still show something.
        parsed = { headline: "Tonight's Broadcast", main: raw, sidebars: [] };
      }

      // Generate a custom image matching this specific story. If it fails
      // for any reason, we just skip it — the frontend falls back to the
      // fixed per-channel background photo instead of breaking the whole broadcast.
      try {
        const imagePrompt = `Cinematic, moody, dramatic lighting, dark background with red accent lighting, photographic style, high contrast, no text, no logos, no readable words in the image, 16:9. Scene: ${persona.imageScene}, symbolically representing this headline: "${parsed.headline}"`;
        parsed.image = await generateImage(imagePrompt);
      } catch (e) {
        parsed.image = null;
      }

      return res.status(200).json(parsed);
    }

    return res.status(400).json({ error: "Unknown mode." });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Something went wrong." });
  }
}