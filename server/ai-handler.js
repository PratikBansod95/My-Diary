import { DIARY_SYSTEM_PROMPT, GAME_MOVE_PROMPT, buildCanvasUserPrompt } from "../src/ai/prompt.js";
import { extractJsonObject, normalizeCommands, parseGameMove } from "../src/ai/commands.js";
import {
  callOpenRouter,
  OPENROUTER_DEFAULT_BASE_URL,
  OPENROUTER_DEFAULT_MODEL,
} from "../src/providers/openrouter.js";

const MAX_BODY_BYTES = 6_500_000;

function serverOpenRouterConfig() {
  const apiKey = (process.env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey) {
    throw Object.assign(
      new Error("Server is missing OPENROUTER_API_KEY. Add it in Vercel env (or local .env)."),
      { status: 503 }
    );
  }
  return {
    provider: "openrouter",
    apiKey,
    model: (process.env.OPENROUTER_MODEL || OPENROUTER_DEFAULT_MODEL).trim(),
    baseUrl: (process.env.OPENROUTER_BASE_URL || OPENROUTER_DEFAULT_BASE_URL).trim(),
    effort: "",
  };
}

async function callProvider(config, { system, userText, imageBase64 }) {
  return callOpenRouter({ ...config, system, userText, imageBase64 });
}

function estimateBodyBytes(body) {
  try {
    return Buffer.byteLength(JSON.stringify(body), "utf8");
  } catch {
    return 0;
  }
}

export async function handleTestRequest() {
  try {
    const config = serverOpenRouterConfig();
    const text = await callProvider(config, {
      system: "Reply with JSON only.",
      userText: 'Return {"ok":true}',
    });
    extractJsonObject(text);
    return { status: 200, body: { ok: true, provider: config.provider, model: config.model } };
  } catch (error) {
    return { status: error.status || 500, body: { ok: false, error: error.message || "Test failed" } };
  }
}

export async function handleAiRequest({ body }) {
  try {
    if (estimateBodyBytes(body) > MAX_BODY_BYTES) {
      return { status: 413, body: { error: "Request too large" } };
    }
    const config = serverOpenRouterConfig();
    const mode = body?.mode || "canvas";

    if (mode === "game_move") {
      const game = body.game;
      const userText = `${GAME_MOVE_PROMPT}\nGame: ${game}\nState: ${JSON.stringify(body.state || {})}\nSchema: ${body.schema || ""}`;
      const text = await callProvider(config, {
        system: GAME_MOVE_PROMPT,
        userText,
      });
      const move = parseGameMove(text, game);
      return { status: 200, body: { move } };
    }

    if (mode === "hangman_word") {
      const userText =
        'Pick one common English noun for hangman (3-10 letters). Return JSON {"word":"EXAMPLE"} only.';
      const text = await callProvider(config, {
        system: GAME_MOVE_PROMPT,
        userText,
      });
      const move = parseGameMove(text, "hangman");
      return { status: 200, body: { word: move.word } };
    }

    const geometry = body.geometry || {};
    const imageBase64 = body.atlasPngBase64 || "";
    if (!imageBase64) return { status: 400, body: { error: "Missing atlas image" } };

    const userText = buildCanvasUserPrompt(geometry, body.userAction || "auto");
    const text = await callProvider(config, {
      system: DIARY_SYSTEM_PROMPT,
      userText,
      imageBase64,
    });
    const commands = normalizeCommands(text);
    return {
      status: 200,
      body: { commands, model: config.model, rawPreview: text.slice(0, 500) },
    };
  } catch (error) {
    return { status: error.status || 500, body: { error: error.message || "AI request failed" } };
  }
}

export { OPENROUTER_DEFAULT_MODEL };
