# The Daily Broadcast

Chat with the AI about your day (text and screenshots both work), pick a
channel, hit Go Live — it turns the conversation into a short satirical
broadcast segment.

## Setup
1. Get a free Gemini API key at aistudio.google.com → "Get API key"
2. Push this repo to GitHub, import it on vercel.com
3. In Vercel's project settings → Environment Variables, add:
   `GEMINI_API_KEY` = your key
4. Deploy — Vercel auto-detects `api/generate.js`