const STORAGE_KEY = "my-dairy-settings";

const DEFAULTS = {
  autoDelay: 2,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, autoDelay: parsed.autoDelay ?? DEFAULTS.autoDelay };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(partial) {
  const next = { ...loadSettings(), ...partial };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

/** Browser never holds provider keys; the server uses OPENROUTER_API_KEY. */
export async function askDiary(payload) {
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Diary request failed (${response.status})`);
  }
  return data;
}

export async function testConnection() {
  const response = await fetch("/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Test failed (${response.status})`);
  }
  return data;
}

export { STORAGE_KEY };
