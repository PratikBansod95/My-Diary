import { DEFAULT_MODELS, loadSettings, saveSettings, testConnection, hasApiKey } from "../ai/client.js";

export function createSettingsUI({ dialog, onSave }) {
  const form = dialog.querySelector("#settingsForm");
  const apiKey = dialog.querySelector("#apiKey");
  const baseUrl = dialog.querySelector("#baseUrl");
  const baseUrlField = dialog.querySelector("#baseUrlField");
  const model = dialog.querySelector("#model");
  const effort = dialog.querySelector("#effort");
  const testResult = dialog.querySelector("#testResult");
  const testBtn = dialog.querySelector("#testKeyBtn");
  const tabs = [...dialog.querySelectorAll(".provider-tab")];
  let provider = "gemini";

  function applyDefaultsForProvider(next) {
    provider = next;
    tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.provider === next));
    baseUrlField.classList.toggle("hidden", next !== "openai");
    if (!model.value || Object.values(DEFAULT_MODELS).includes(model.value)) {
      model.value = DEFAULT_MODELS[next];
    }
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => applyDefaultsForProvider(tab.dataset.provider));
  });

  function fill(settings) {
    provider = settings.provider || "gemini";
    applyDefaultsForProvider(provider);
    apiKey.value = settings.apiKey || "";
    baseUrl.value = settings.baseUrl || "";
    model.value = settings.model || DEFAULT_MODELS[provider];
    effort.value = settings.effort || "medium";
    testResult.hidden = true;
  }

  function readForm() {
    return {
      provider,
      apiKey: apiKey.value.trim(),
      baseUrl: baseUrl.value.trim(),
      model: model.value.trim() || DEFAULT_MODELS[provider],
      effort: effort.value,
    };
  }

  testBtn.addEventListener("click", async () => {
    testResult.hidden = false;
    testResult.classList.remove("error");
    testResult.textContent = "Listening for a reply…";
    try {
      const data = await testConnection(readForm());
      testResult.textContent = `Connected · ${data.provider} · ${data.model}`;
    } catch (error) {
      testResult.classList.add("error");
      const message = error.message || "Connection failed";
      if (/quota|rate limit|429/i.test(message)) {
        testResult.textContent =
          "Quota exceeded for this key/model. Wait a moment or switch model, then try Test again.";
      } else {
        testResult.textContent = message.length > 280 ? `${message.slice(0, 280)}…` : message;
      }
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const settings = saveSettings(readForm());
    dialog.close("save");
    onSave?.(settings);
  });

  function open(force = false) {
    const settings = loadSettings();
    fill(settings);
    if (!force && hasApiKey(settings)) return false;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "true");
    return true;
  }

  return { open, fill, readForm };
}
