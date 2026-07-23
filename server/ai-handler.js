import { DIARY_SYSTEM_PROMPT, GAME_MOVE_PROMPT, buildCanvasUserPrompt } from "../src/ai/prompt.js";
import { extractJsonObject, normalizeCommands, parseGameMove } from "../src/ai/commands.js";
import { DEFAULT_MODELS } from "../src/shared/defaults.js";
import { callGemini } from "../src/providers/gemini.js";
import { callOpenAI } from "../src/providers/openai.js";
import { callAnthropic } from "../src/providers/anthropic.js";

const MAX_BODY_BYTES = 6_500_000;

function header(headers, name) {
  const value = headers?.[name] ?? headers?.[name.toLowerCase()];
  return typeof value === "string" ? value.trim() : "";
}

function readProviderConfig(headers) {
  const provider = (header(headers, "x-provider") || "gemini").toLowerCase();
  if (!["gemini", "openai", "anthropic"].includes(provider)) {
    throw Object.assign(new Error("Unsupported provider"), { status: 400 });
  }
  const apiKey = header(headers, "x-api-key");
  if (!apiKey) throw Object.assign(new Error("Missing API key"), { status: 401 });
  const model = header(headers, "x-model") || DEFAULT_MODELS[provider];
  const baseUrl = header(headers, "x-base-url") || "";
  const effort = header(headers, "x-effort") || "";
  return { provider, apiKey, model, baseUrl, effort };
}

async function callProvider(config, { system, userText, imageBase64, jsonMode = true }) {
  if (config.provider === "gemini") {
    return callGemini({ ...config, system, userText, imageBase64, jsonMode });
  }
  if (config.provider === "openai") {
    return callOpenAI({ ...config, system, userText, imageBase64 });
  }
  return callAnthropic({ ...config, system, userText, imageBase64 });
}

function estimateBodyBytes(body) {
  try {
    return Buffer.byteLength(JSON.stringify(body), "utf8");
  } catch {
    return 0;
  }
}

export async function handleTestRequest({ headers }) {
  try {
    const config = readProviderConfig(headers);
    const text = await callProvider(config, {
      system: "Reply with JSON only.",
      userText: 'Return {"ok":true}',
      jsonMode: true,
    });
    extractJsonObject(text);
    return { status: 200, body: { ok: true, provider: config.provider, model: config.model } };
  } catch (error) {
    return { status: error.status || 500, body: { ok: false, error: error.message || "Test failed" } };
  }
}

export async function handleAiRequest({ headers, body }) {
  try {
    if (estimateBodyBytes(body) > MAX_BODY_BYTES) {
      return { status: 413, body: { error: "Request too large" } };
    }
    const config = readProviderConfig(headers);
    const mode = body?.mode || "canvas";

    if (mode === "game_move") {
      const game = body.game;
      const userText = `${GAME_MOVE_PROMPT}\nGame: ${game}\nState: ${JSON.stringify(body.state || {})}\nSchema: ${body.schema || ""}`;
      const text = await callProvider(config, {
        system: GAME_MOVE_PROMPT,
        userText,
        jsonMode: true,
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
        jsonMode: true,
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
      jsonMode: true,
    });
    const commands = normalizeCommands(text);
    return { status: 200, body: { commands, rawPreview: text.slice(0, 500) } };
  } catch (error) {
    return { status: error.status || 500, body: { error: error.message || "AI request failed" } };
  }
}

export { DEFAULT_MODELS, callProvider, readProviderConfig };
