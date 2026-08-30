# Tonight's Top Story

Tell it about your day. It hands you back tonight's top story — your day, rewritten as a broadcast segment.

## How it works

1. **Pick a desk.** Choose which newsroom covers your day:
   - **Sports** — high-energy play-by-play, your day as a game
   - **Drama** — breathless tabloid gossip, "sources say" energy
   - **Nature Doc** — calm, deadpan nature-documentary narration
   - **Breaking News** — urgent newsroom coverage
   - **Reality TV** — confessional-cam drama
2. **File your notes.** Type what happened, dictate it out loud, or attach a screenshot. Fragments are fine — chat back and forth as much as you want before you're ready.
3. **Send to press.** The AI turns your notes into a short headline + story + sidebar callouts, written entirely in that desk's voice.
4. **Read the back issues.** Every story you file gets saved to the Archive at the bottom of the page, so you can revisit past editions.

### Editorial Settings

Click **Editorial Settings** to control the tone:
- **Low** — warm and wholesome, safe to show anyone
- **Medium** — light teasing and sarcasm (default)
- **High** — sharper, near-the-line roasting humor (still never cruel or aimed at anyone but you)

You can also turn on **read the broadcast aloud** to have your story read back to you.

### Your privacy

Your notes and stories are never stored on a server or shared with other visitors — everything in your Archive lives only in your own browser (`localStorage`). Clearing your browser data clears your archive too.

## Setup (for hosting your own copy)

1. Get a free Gemini API key at aistudio.google.com → "Get API key"
2. Push this repo to GitHub, import it on vercel.com
3. In Vercel's project settings → Environment Variables, add:
   `GEMINI_API_KEY` = your key
4. Deploy — Vercel auto-detects `api/generate.js`
