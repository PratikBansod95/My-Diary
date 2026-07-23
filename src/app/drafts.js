import { renderLatex } from "../math/katex-render.js";

/**
 * Estimate user handwriting letter size (world units) from the latest ink bbox.
 */
export function estimateHandwritingSize(anchor) {
  if (!anchor) return 64;
  const w = Math.max(Number(anchor.w) || 0, 24);
  const h = Math.max(Number(anchor.h) || 0, 24);
  // Multi-line blocks are taller than a single line; split height into lines.
  const aspect = h / w;
  const lines = aspect > 0.75 ? Math.max(2, Math.min(5, Math.round(h / Math.max(w * 0.28, 50)))) : 1;
  const letter = h / lines;
  return Math.min(200, Math.max(36, Math.round(letter * 0.9)));
}

/**
 * Diary replies stay on the page as living ink overlays (no Keep/Discard),
 * sized to match the user's handwriting, synced to pan/zoom.
 */
export function createDraftLayer({ root, canvasApp, onAcceptGame, onStatus }) {
  const replies = [];

  function clear() {
    replies.forEach((item) => item.remove());
    replies.length = 0;
    root.innerHTML = "";
  }

  function resolvePosition(cmd, anchor, fontSize) {
    let x = Number(cmd.x) || 0;
    let y = Number(cmd.y) || 0;
    if (anchor) {
      const ax = anchor.x ?? 0;
      const ay = anchor.y ?? 0;
      const aw = anchor.w ?? 40;
      const ah = anchor.h ?? 40;
      const far = Math.abs(x - ax) > 1800 || Math.abs(y - ay) > 1800 || x < 0 || y < 0;
      if (far || (x === 0 && y === 0)) {
        x = Math.round(ax + Math.max(aw, 40) + fontSize * 0.4);
        y = Math.round(ay);
      }
    }
    if (anchor && Math.abs(y - (anchor.y || 0)) < fontSize * 0.4) {
      y = Math.round((anchor.y || 0) + (anchor.h || fontSize) + fontSize * 0.35);
    }
    return { x, y };
  }

  function applyScreenSize(item) {
    const view = canvasApp.getView();
    const px = Math.max(12, (item._worldFontSize || 64) * view.scale);
    item.style.fontSize = `${px}px`;
    item.style.maxWidth = `${Math.min(window.innerWidth * 0.78, (item._worldFontSize || 64) * 12 * view.scale)}px`;
  }

  function mountReply(cmd) {
    const fontSize = cmd.fontSize || 64;
    const item = document.createElement("div");
    item.className =
      "diary-reply diary-ink-appear" + (cmd.type === "draw_formula" ? " draft-formula" : "");
    item._world = { x: cmd.x, y: cmd.y };
    item._worldFontSize = fontSize;
    item._cmd = {
      type: cmd.type,
      x: cmd.x,
      y: cmd.y,
      text: cmd.text,
      latex: cmd.latex,
      fontSize,
    };
    item.style.pointerEvents = "none";

    const body = document.createElement("div");
    body.className = "diary-reply-body";
    if (cmd.type === "draw_formula") {
      renderLatex(cmd.latex, body);
      body.style.fontSize = "1em";
    } else body.textContent = cmd.text;
    item.appendChild(body);

    applyScreenSize(item);
    const screen = canvasApp.worldToScreen(cmd.x, cmd.y);
    item.style.left = `${screen.x}px`;
    item.style.top = `${screen.y}px`;
    root.appendChild(item);
    replies.push(item);
    return item;
  }

  async function placeCommands(commands, anchor = null) {
    const fontSize = estimateHandwritingSize(anchor);
    let firstWorld = null;
    for (const cmd of commands) {
      const pos = resolvePosition(cmd, anchor, fontSize);
      cmd.x = pos.x;
      cmd.y = pos.y;
      cmd.fontSize = fontSize;
      if (!firstWorld) firstWorld = { ...pos };

      if (cmd.type === "start_game") {
        onAcceptGame?.(cmd);
        continue;
      }
      if (cmd.type === "place_mark") {
        const markSize = Math.round(fontSize * 1.15);
        canvasApp.drawMark(cmd.symbol, cmd.x, cmd.y, cmd.size || markSize);
        continue;
      }
      if (cmd.type === "draw") {
        canvasApp.drawVectorCommand(cmd);
        continue;
      }
      if (cmd.type === "write_text" || cmd.type === "draw_formula") {
        mountReply(cmd);
        if (cmd.type === "write_text" && cmd.text) {
          canvasApp.burnWorldText(cmd.text, cmd.x, cmd.y, { fontSize });
        }
      }
    }
    syncPositions();
    onStatus?.("The diary wrote back.");
    return firstWorld;
  }

  function syncPositions() {
    for (const item of replies) {
      const screen = canvasApp.worldToScreen(item._world.x, item._world.y);
      item.style.left = `${screen.x}px`;
      item.style.top = `${screen.y}px`;
      applyScreenSize(item);
    }
  }

  function serialize() {
    return replies.map((item) => ({ ...item._cmd }));
  }

  function restore(list) {
    clear();
    for (const cmd of list || []) {
      if (cmd?.type === "write_text" || cmd?.type === "draw_formula") {
        mountReply(cmd);
      }
    }
    syncPositions();
  }

  return { clear, placeCommands, syncPositions, serialize, restore };
}
