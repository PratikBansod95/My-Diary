import { createCanvasApp } from "./app/canvas.js";
import { createDraftLayer } from "./app/drafts.js";
import { createSelectionTool } from "./app/selection.js";
import { createToolbar } from "./app/toolbar.js";
import { exportPagePng } from "./app/export.js";
import { loadPage, savePage, clearPage } from "./app/persistence.js";
import { askDiary, loadSettings, saveSettings } from "./ai/client.js";

const statusLine = document.querySelector("#statusLine");
const statusToast = document.querySelector("#statusToast");
const stage = document.querySelector("#stage");
const tileCanvas = document.querySelector("#tileCanvas");
const inkCanvas = document.querySelector("#inkCanvas");
const draftRoot = document.querySelector("#draftLayer");
const overlayRoot = document.querySelector("#overlayLayer");

let settings = loadSettings();
let autoDelay = settings.autoDelay ?? 2;
let uiTheme = settings.uiTheme || "arcane";
let askTimer = null;
let asking = false;
let toastTimer = null;

function setStatus(text, { error = false } = {}) {
  if (statusLine) statusLine.textContent = text;
  if (!statusToast) return;
  statusToast.textContent = text;
  statusToast.classList.toggle("error", Boolean(error));
  statusToast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => statusToast.classList.remove("visible"), error ? 8000 : 4500);
}

document.body.dataset.theme = uiTheme;

const canvasApp = createCanvasApp({
  stage,
  tileCanvas,
  inkCanvas,
  onStrokeEnd: scheduleAsk,
  onStatus: setStatus,
});

const drafts = createDraftLayer({
  root: draftRoot,
  canvasApp,
  onStatus: setStatus,
  onChanged: () => void persist(),
});

const selection = createSelectionTool({
  stage,
  canvasApp,
  overlayRoot,
  onStatus: setStatus,
  onChanged: () => void persist(),
});

const toolbar = createToolbar({
  root: document.querySelector("#toolbar"),
  onTool: (tool) => {
    canvasApp.setTool(tool);
    selection.setActive(tool === "lasso");
  },
  onAsk: () => void askNow("manual"),
  onAcceptAll: () => void drafts.acceptAll().then(() => persist()),
  onDiscardAll: () => {
    drafts.discardAll();
    void persist();
  },
  onNewPage: () => void newPage(),
  onExport: () => void exportNow(),
  onAutoDelay: (value) => {
    autoDelay = value;
    settings = saveSettings({ autoDelay: value });
  },
  onTheme: (value) => {
    uiTheme = value;
    document.body.dataset.theme = value;
    settings = saveSettings({ uiTheme: value });
    setStatus(`Mode: ${value}`);
  },
});
toolbar.setDelay(autoDelay);
toolbar.setTheme(uiTheme);

function scheduleAsk() {
  if (autoDelay <= 0) return;
  if (drafts.hasPending()) {
    // PenEcho: continued ink keeps drafts; still allow auto ask to append
  }
  clearTimeout(askTimer);
  setStatus(`Ink settled — asking in ${autoDelay}s…`);
  askTimer = setTimeout(() => void askNow("auto"), autoDelay * 1000);
}

async function askNow(userAction) {
  if (asking) return;
  const atlas = canvasApp.buildAtlas();
  if (!atlas) {
    setStatus("Leave a mark first, then Speak.", { error: true });
    return;
  }
  asking = true;
  setStatus("Reading the canvas…");
  try {
    const data = await askDiary({
      mode: "canvas",
      userAction,
      atlasPngBase64: atlas.atlasPngBase64,
      geometry: atlas.geometry,
      uiTheme,
    });
    canvasApp.consumeDirty();
    canvasApp.setSelectionFocus(null);
    const anchor = atlas.geometry.latestInput;
    const focus = await drafts.placeCommands(data.commands || [], anchor);
    if (focus) {
      const rect = stage.getBoundingClientRect();
      const view = canvasApp.getView();
      canvasApp.setView({
        ...view,
        x: rect.width * 0.18 - focus.x * view.scale,
        y: rect.height * 0.22 - focus.y * view.scale,
      });
      drafts.syncPositions();
    }
    setStatus(
      data.commands?.length
        ? "Draft ready — Keep or Discard."
        : "No draft returned. Try Speak again."
    );
    await persist();
  } catch (error) {
    const raw = error.message || "Request failed.";
    const timedOut = /504|timeout|FUNCTION_INVOCATION|took too long/i.test(raw);
    setStatus(
      timedOut
        ? "Timed out. Set OPENROUTER_MODEL to google/gemini-2.0-flash-001 on Vercel."
        : raw,
      { error: true }
    );
  } finally {
    asking = false;
  }
}

async function persist() {
  const tiles = await canvasApp.exportTiles();
  await savePage({
    tiles,
    view: canvasApp.getView(),
    theme: uiTheme,
    // Unconfirmed drafts are never persisted
  });
}

async function restore() {
  const page = await loadPage();
  if (!page) return;
  if (page.tiles?.length) canvasApp.importTiles(page.tiles);
  if (page.view) canvasApp.setView(page.view);
  if (page.theme) {
    uiTheme = page.theme;
    document.body.dataset.theme = uiTheme;
    toolbar.setTheme(uiTheme);
    settings = saveSettings({ uiTheme });
  }
  drafts.clear();
  setStatus("Page restored (drafts were not saved).");
}

async function newPage() {
  clearTimeout(askTimer);
  drafts.clear();
  selection.clearSelection();
  canvasApp.clearAll();
  await clearPage();
  canvasApp.centerView();
  setStatus("New canvas.");
}

async function exportNow() {
  try {
    await exportPagePng(canvasApp);
    setStatus("Exported PNG.");
  } catch (error) {
    setStatus(error.message || "Export failed.", { error: true });
  }
}

function syncOverlays() {
  drafts.syncPositions();
  selection.sync();
  requestAnimationFrame(syncOverlays);
}
requestAnimationFrame(syncOverlays);

window.addEventListener("beforeunload", () => {
  void persist();
});

setInterval(() => void persist(), 8000);

void restore();
setStatus("Write with Pen. Speak for drafts — then Keep or Discard.");
