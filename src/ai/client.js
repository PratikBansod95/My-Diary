import { DEFAULT_MODELS } from "../shared/defaults.js";
import { DEFAULT_BASE_URLS } from "../shared/defaults.js";

const STORAGE_KEY = "my-dairy-settings";

const DEFAULTS = {
  provider: "gemini",
  apiKey: "",
  baseUrl: "",
  model: DEFAULT_MODELS.gemini,
  effort: "medium",
  autoDelay: 2,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(partial) {
  const next = { ...loadSettings(), ...partial };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function hasApiKey(settings = loadSettings()) {
  return Boolean(settings.apiKey && settings.apiKey.trim());
}

export function providerHeaders(settings = loadSettings()) {
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": settings.apiKey.trim(),
    "x-provider": settings.provider,
    "x-model": settings.model || DEFAULT_MODELS[settings.provider] || "",
  };
  if (settings.provider === "openai" || settings.provider === "nvidia") {
    const url = (settings.baseUrl || DEFAULT_BASE_URLS[settings.provider] || "").trim();
    if (url) headers["x-base-url"] = url;
  }
  if (settings.effort) headers["x-effort"] = settings.effort;
  return headers;
}

export async function testConnection(settings = loadSettings()) {
  const response = await fetch("/api/test", {
    method: "POST",
    headers: providerHeaders(settings),
    body: "{}",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Test failed (${response.status})`);
  }
  return data;
}

export async function askDiary(payload, settings = loadSettings()) {
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: providerHeaders(settings),
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Diary request failed (${response.status})`);
  }
  return data;
}

export { DEFAULT_MODELS, DEFAULT_BASE_URLS, STORAGE_KEY };
