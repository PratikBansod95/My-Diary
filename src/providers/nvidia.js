import { callOpenAI } from "./openai.js";

export const NVIDIA_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";

/**
 * NVIDIA NIM / build.nvidia.com — OpenAI-compatible chat completions.
 * Default host is integrate.api.nvidia.com; override baseUrl for self-hosted NIM.
 */
export async function callNvidia(options) {
  return callOpenAI({
    ...options,
    // NIM chat completions reject OpenAI reasoning_effort on most Nemotron models.
    effort: "",
    baseUrl: options.baseUrl || NVIDIA_DEFAULT_BASE_URL,
  });
}
