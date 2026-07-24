import { callOpenAI } from "./openai.js";

export const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
// NVIDIA Nemotron VL via OpenRouter (matches Vercel OPENROUTER_MODEL / key setup).
// Override anytime with OPENROUTER_MODEL.
export const OPENROUTER_DEFAULT_MODEL = "nvidia/nemotron-nano-12b-v2-vl:free";

/**
 * OpenRouter OpenAI-compatible chat completions.
 * Uses server-side OPENROUTER_API_KEY; never expose the key to the browser.
 */
export async function callOpenRouter(options) {
  return callOpenAI({
    ...options,
    effort: "",
    // Many free models reject response_format; we parse JSON from text instead.
    jsonMode: false,
    baseUrl: options.baseUrl || OPENROUTER_DEFAULT_BASE_URL,
    extraHeaders: {
      "HTTP-Referer": options.referer || "https://github.com/PratikBansod95/My-Diary",
      "X-Title": options.appTitle || "My Dairy",
      ...(options.extraHeaders || {}),
    },
  });
}
