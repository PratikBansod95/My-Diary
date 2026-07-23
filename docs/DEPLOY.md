# Deploy My Dairy

## Local development

```bash
npm install
npm run dev
```

Open the printed URL (includes LAN address with `--host`) on your tablet. Enter a Gemini, OpenAI-compatible, or Anthropic API key when prompted.

```bash
npm run check   # syntax + unit tests
npm run build   # production assets in dist/
```

## Vercel

1. Push this repo to GitHub.
2. Import the project in [Vercel](https://vercel.com).
3. Framework preset: Vite. Build command: `npm run build`. Output: `dist`.
4. Root directory: repository root (where `package.json` lives).
5. Deploy. No server env vars are required — users paste their own keys in the browser.

The `/api/ai` and `/api/test` serverless functions proxy provider calls so browser CORS is not an issue. Keys are sent per request in headers and are never stored on the server.

## Tablet + pen tips

- Use HTTPS from Vercel (or the Vite LAN URL on the same Wi‑Fi).
- Prefer the **Pen** tool; use **Pan** or two-finger pinch to move/zoom.
- Set **Auto** delay to 1–3s so the diary answers after the stylus lifts.
- Tap **Ask** for an immediate reply.
- **Games** starts tic-tac-toe or hangman against the diary.
- **Keep** / **Discard** accepts or rejects diary drafts on the page.

## Provider notes

| Provider | Default model | Notes |
|----------|---------------|--------|
| Gemini | `gemini-2.0-flash` | Paste AI Studio / Gemini API key |
| OpenAI-compatible | `gpt-4o-mini` | Set base URL for Kimi or other OpenAI-style APIs |
| Anthropic | `claude-sonnet-4-20250514` | Anthropic API key |

Change the model string in settings to any ID your account supports.
