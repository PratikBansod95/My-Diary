# My Dairy

An enchanted ink journal. Write with a stylus or mouse; when the ink settles, the diary answers beside your marks — questions, math, diagrams, and small games.

## Quick start

```bash
npm install
npm run dev
```

Open the local URL and write on the page. AI calls use **OpenRouter** with a server env key (`OPENROUTER_API_KEY`) and model `nvidia/nemotron-nano-12b-v2-vl:free` — no key popup.

## Features

- Sparse-tile parchment canvas with pan / zoom and pressure-aware ink
- Auto-ask after a delay, or tap **Ask**
- Draft replies you can Keep, Discard, or drag
- LaTeX formulas via KaTeX
- Tic-tac-toe and Hangman vs the diary
- Local IndexedDB page restore and PNG export

## Deploy

See [docs/DEPLOY.md](docs/DEPLOY.md) for Vercel and tablet testing.

## License

Private project unless you add a license file.
