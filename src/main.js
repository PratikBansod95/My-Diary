import { createCanvasApp } from "./app/canvas.js";
import { createDraftLayer } from "./app/drafts.js";
import { createToolbar } from "./app/toolbar.js";
import { exportPagePng } from "./app/export.js";
import { loadPage, savePage, clearPage } from "./app/persistence.js";
import { askDiary, loadSettings, saveSettings } from "./ai/client.js";
import { createGameMount } from "./games/mount.js";

const statusLine = document.querySelector("#statusLine");
const statusToast = document.querySelector("#statusToast");
const stage = document.querySelector("#stage");
const tileCanvas = document.querySelector("#tileCanvas");
const inkCanvas = document.querySelector("#inkCanvas");
const draftRoot = document.querySelector("#draftLayer");
const overlayRoot = document.querySelector("#overlayLayer");
const gamesDialog = document.querySelector("#gamesDialog");

let settings = loadSettings();
let autoDelay = settings.autoDelay ?? 2;
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
  onAcceptGame: (cmd, anchor) => {
    void games.mountFromCommand(cmd, anchor);
    const focus = anchor || { x: cmd.x || 0, y: cmd.y || 0, w: 0, h: 0 };
    const rect = stage.getBoundingClientRect();
    const view = canvasApp.getView();
    canvasApp.setView({
      ...view,
      x: rect.width * 0.2 - focus.x * view.scale,
      y: rect.height * 0.18 - focus.y * view.scale,
    });
    games.sync();
    void persist();
  },
  onStatus: setStatus,
});

const games = createGameMount({
  root: overlayRoot,
  canvasApp,
  onStatus: setStatus,
  onInkWhisper: (text, x, y, fontSize) => drafts.addReply(text, x, y, fontSize),
  onChanged: () => void persist(),
});

createToolbar({
  root: document.querySelector("#toolbar"),
  onTool: (tool) => canvasApp.setTool(tool),
  onAsk: () => void askNow("manual"),
  onGames: () => {
    if (typeof gamesDialog.showModal === "function") gamesDialog.showModal();
    else gamesDialog.setAttribute("open", "true");
  },
  onNewPage: () => void newPage(),
  onExport: () => void exportNow(),
  onAutoDelay: (value) => {
    autoDelay = value;
    settings = saveSettings({ autoDelay: value });
  },
}).setDelay(autoDelay);

function startGame(game) {
  gamesDialog.close?.();
  gamesDialog.removeAttribute("open");
  const latest = canvasApp.getLatestInput();
  const view = canvasApp.getView();
  const stageRect = stage.getBoundingClientRect();
  const center = canvasApp.screenToWorld(stageRect.left + stageRect.width / 2, stageRect.top + stageRect.height / 2);
  const x = Math.round((latest?.x || center.x || 400) + 80);
  const y = Math.round(latest?.y || center.y || 400);
  if (game === "tic_tac_toe") void games.mountTicTacToe(x, y);
  else if (game === "hangman") void games.mountHangman(x, y);
  canvasApp.setView({
    ...view,
    x: stageRect.width / 2 - (x + 210) * view.scale,
    y: stageRect.height / 2 - (y + 210) * view.scale,
  });
  games.sync();
  void persist();
}

gamesDialog.querySelectorAll("[data-game]").forEach((btn) => {
  btn.addEventListener("click", () => startGame(btn.getAttribute("data-game")));
});
document.querySelector("#gamesCloseBtn")?.addEventListener("click", () => {
  gamesDialog.close?.();
  gamesDialog.removeAttribute("open");
});

function scheduleAsk() {
  if (autoDelay <= 0) return;
  if (games.isActive()) return;
  clearTimeout(askTimer);
  setStatus(`The page waits… answering in ${autoDelay}s`);
  askTimer = setTimeout(() => void askNow("auto"), autoDelay * 1000);
}

async function askNow(userAction) {
  if (asking) return;
  const atlas = canvasApp.buildAtlas();
  if (!atlas) {
    setStatus("Leave a mark first — words, a doodle, anything.", { error: true });
    return;
  }
  asking = true;
  setStatus("The diary is reading you…");
  try {
    const data = await askDiary({
      mode: "canvas",
      userAction,
      atlasPngBase64: atlas.atlasPngBase64,
      geometry: atlas.geometry,
      pageMemory: drafts.recentMemory(6),
    });
    canvasApp.consumeDirty();
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
      games.sync();
    }
    setStatus(
      data.commands?.length
        ? "It answered beside your ink."
        : "It stayed quiet. Speak again when you're ready."
    );
    await persist();
  } catch (error) {
    const raw = error.message || "The diary could not answer.";
    const timedOut = /504|timeout|FUNCTION_INVOCATION|took too long/i.test(raw);
    setStatus(
      timedOut
        ? "Timed out waiting for the model. Free models often queue — set OPENROUTER_MODEL to google/gemini-2.0-flash-001 on Vercel, then try Speak again."
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
    games: games.serialize(),
    replies: drafts.serialize(),
  });
}

async function restore() {
  const page = await loadPage();
  if (!page) return;
  if (page.tiles?.length) canvasApp.importTiles(page.tiles);
  if (page.view) canvasApp.setView(page.view);
  if (page.games?.length) games.restore(page.games);
  if (page.replies?.length) drafts.restore(page.replies);
  drafts.syncPositions();
  games.sync();
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
    setStatus(error.message || "Export failed.", { error: true });
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

void restore();
setStatus("Write or draw. It listens when the ink settles.");
