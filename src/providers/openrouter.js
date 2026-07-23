import { callOpenAI } from "./openai.js";

export const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
// Free nano VL models often queue past Vercel's limit — prefer a fast Flash model.
// Override anytime with OPENROUTER_MODEL. For zero-cost routing use: openrouter/free
export const OPENROUTER_DEFAULT_MODEL = "google/gemini-2.0-flash-001";

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
