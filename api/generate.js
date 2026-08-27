// api/generate.js
// Talks to Google's Gemini API (free tier). The key lives only here,
// as a Vercel environment variable — never in the frontend code.

const PERSONAS = {
  sportscenter: `High-energy sports anchor doing a nightly recap. Confident, punchy, present-tense excitement. Frame the day's events as a game: a bold headline, play-by-play commentary, a "final score," and a "Player of the Day" callout. Sports vocabulary: comeback, upset, overtime, MVP, clutch.`,
  tmz: `Breathless tabloid gossip writer. Dramatic, conspiratorial: "sources say," "we've learned exclusively." Treat mundane events as scandalous breaking gossip.`,
  naturedoc: `Calm, dry nature documentary narrator (Attenborough-style). Refer to the person in third person as a specimen in its "natural habitat." Describe ordinary events with the overly serious gravity of a wildlife survival story. No exclamation points.`,
  breakingnews: `24-hour cable news anchor cutting to a "breaking" story. Urgent, red-alert energy, short punchy sentences, "developing story," fake expert soundbites. End with a teaser for "more at 11."`,
  realitytv: `Reality TV confessional cutaway. First person, as if speaking into a handheld camera mid-season. Petty, dramatic, self-aware. End on a dramatic teaser line.`,
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
      const systemInstruction = `Read the full conversation below — it's someone describing their day, possibly with screenshots attached. Write ONE short broadcast segment (150–250 words) based on what actually happened in it, in this persona:\n\n${persona}\n\n${intensityLine}\n\nOutput only the finished segment, nothing else.`;

      // Gemini requires the conversation to end on a "user" turn — the chat
      // history often ends with the AI's last follow-up question instead,
      // so we always close with an explicit instruction turn.
      const contents = [
        ...historyToGeminiContents(history),
        { role: "user", parts: [{ text: "Now write the broadcast segment based on everything above." }] },
      ];

      const story = await callGemini(systemInstruction, contents);
      return res.status(200).json({ story });
    }

    return res.status(400).json({ error: "Unknown mode." });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Something went wrong." });
  }
}