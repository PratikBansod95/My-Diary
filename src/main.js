import { createCanvasApp } from "./app/canvas.js";
import { createDraftLayer } from "./app/drafts.js";
import { createSettingsUI } from "./app/settings-ui.js";
import { createToolbar } from "./app/toolbar.js";
import { exportPagePng } from "./app/export.js";
import { loadPage, savePage, clearPage } from "./app/persistence.js";
import { askDiary, hasApiKey, loadSettings, saveSettings } from "./ai/client.js";
import { createGameMount } from "./games/mount.js";

const statusLine = document.querySelector("#statusLine");
const stage = document.querySelector("#stage");
const tileCanvas = document.querySelector("#tileCanvas");
const inkCanvas = document.querySelector("#inkCanvas");
const draftRoot = document.querySelector("#draftLayer");
const overlayRoot = document.querySelector("#overlayLayer");
const settingsDialog = document.querySelector("#settingsDialog");
const gamesDialog = document.querySelector("#gamesDialog");

let settings = loadSettings();
let autoDelay = settings.autoDelay ?? 2;
let askTimer = null;
let asking = false;

function setStatus(text) {
  if (statusLine) statusLine.textContent = text;
}

const canvasApp = createCanvasApp({
  stage,
  tileCanvas,
  inkCanvas,
  onStrokeEnd: scheduleAsk,
  onStatus: setStatus,
});

const games = createGameMount({
  root: overlayRoot,
  canvasApp,
  getSettings: () => settings,
  onStatus: setStatus,
});

const drafts = createDraftLayer({
  root: draftRoot,
  canvasApp,
  onAcceptGame: (cmd) => games.mountFromCommand(cmd),
  onStatus: setStatus,
});

const settingsUI = createSettingsUI({
  dialog: settingsDialog,
  onSave: (next) => {
    settings = { ...settings, ...next };
    setStatus("The clasp is sealed. Write when ready.");
  },
});

const toolbar = createToolbar({
  root: document.querySelector("#toolbar"),
  onTool: (tool) => canvasApp.setTool(tool),
  onAsk: () => void askNow("manual"),
  onGames: () => gamesDialog.showModal(),
  onNewPage: () => void newPage(),
  onExport: () => void exportNow(),
  onSettings: () => settingsUI.open(true),
  onAutoDelay: (value) => {
    autoDelay = value;
    settings = saveSettings({ autoDelay: value });
  },
});
toolbar.setDelay(autoDelay);

gamesDialog.addEventListener("close", () => {
  const value = gamesDialog.returnValue;
  if (value === "tic_tac_toe" || value === "hangman") {
    const latest = canvasApp.getLatestInput();
    const x = Math.round((latest?.x || 400) + 80);
    const y = Math.round(latest?.y || 400);
    if (value === "tic_tac_toe") games.mountTicTacToe(x, y);
    else void games.mountHangman(x, y);
  }
});

function scheduleAsk() {
  if (autoDelay <= 0) return;
  clearTimeout(askTimer);
  askTimer = setTimeout(() => void askNow("auto"), autoDelay * 1000);
}

async function askNow(userAction) {
  if (asking) return;
  if (!hasApiKey(settings)) {
    settingsUI.open(true);
    setStatus("Inscribe a key before the page can answer.");
    return;
  }
  const atlas = canvasApp.buildAtlas();
  if (!atlas) {
    setStatus("Write something first.");
    return;
  }
  asking = true;
  setStatus("The diary reads your ink…");
  try {
    const data = await askDiary(
      {
        mode: "canvas",
        userAction,
        atlasPngBase64: atlas.atlasPngBase64,
        geometry: atlas.geometry,
      },
      settings
    );
    canvasApp.consumeDirty();
    drafts.placeCommands(data.commands || []);
    setStatus(
      data.commands?.length
        ? "A reply waits — Keep or Discard."
        : "The diary stays silent."
    );
    await persist();
  } catch (error) {
    setStatus(error.message || "The diary could not answer.");
  } finally {
    asking = false;
  }
}

async function persist() {
  const tiles = await canvasApp.exportTiles();
  await savePage({
    tiles,
    view: canvasApp.getView(),
    games: games.serialize(),
  });
}

async function restore() {
  const page = await loadPage();
  if (!page) return;
  if (page.tiles?.length) canvasApp.importTiles(page.tiles);
  if (page.view) canvasApp.setView(page.view);
  if (page.games?.length) games.restore(page.games);
  setStatus("A previous page returns.");
}

async function newPage() {
  clearTimeout(askTimer);
  drafts.clear();
  games.clear();
  canvasApp.clearAll();
  await clearPage();
  canvasApp.centerView();
  setStatus("A fresh page.");
}

async function exportNow() {
  try {
    await exportPagePng(canvasApp);
    setStatus("A copy leaves the book.");
  } catch (error) {
    setStatus(error.message || "Export failed.");
  }
}

function syncOverlays() {
  drafts.syncPositions();
  games.sync();
  requestAnimationFrame(syncOverlays);
}
requestAnimationFrame(syncOverlays);

window.addEventListener("beforeunload", () => {
  void persist();
});

setInterval(() => void persist(), 8000);

settingsUI.open(false);
void restore();
setStatus("The page listens when the ink settles.");
