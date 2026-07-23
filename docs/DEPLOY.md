# Deploy My Dairy

## Local development

```bash
npm install
npm run dev
```

Open the printed URL (includes LAN address with `--host`) on your tablet. The diary uses the server-side OpenRouter key — no browser popup.

For local AI calls, copy `.env.example` to `.env` and set `OPENROUTER_API_KEY`.

```bash
npm run check   # syntax + unit tests
npm run build   # production assets in dist/
```

## Vercel

1. Push this repo to GitHub.
2. Import the project in [Vercel](https://vercel.com).
3. Framework preset: Vite. Build command: `npm run build`. Output: `dist`.
4. Root directory: repository root (where `package.json` lives).
5. Deploy. Set **`OPENROUTER_API_KEY`** in Vercel → Settings → Environment Variables (Production + Preview). Optional: `OPENROUTER_MODEL` (default `nvidia/nemotron-nano-12b-v2-vl:free`).

The `/api/ai` and `/api/test` serverless functions call OpenRouter with the server key. The browser never sees the key.

**After adding or changing env vars, redeploy** so the new values load.

## Tablet + pen tips

- Use HTTPS from Vercel (or the Vite LAN URL on the same Wi‑Fi).
- Prefer the **Pen** tool; use **Pan** or two-finger pinch to move/zoom.
- Set **Auto** delay to 1–3s so the diary answers after the stylus lifts.
- Tap **Ask** for an immediate reply.
- **Games** starts tic-tac-toe or hangman against the diary.
- **Keep** / **Discard** accepts or rejects diary drafts on the page.

## Provider notes

| Setting | Value |
|---------|--------|
| Provider | OpenRouter (server-side) |
| Default model | `nvidia/nemotron-nano-12b-v2-vl:free` |
| Env var | `OPENROUTER_API_KEY` |

Override the model with `OPENROUTER_MODEL` if needed. Prefer a **vision** (`vl` / omni) free model so handwriting on the page can be read.
