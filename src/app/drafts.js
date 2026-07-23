import { renderLatex } from "../math/katex-render.js";

/**
 * Diary replies stay on the page as living ink overlays (no Keep/Discard),
 * synced to pan/zoom, and also burned large into tiles for snapshots/export.
 */
export function createDraftLayer({ root, canvasApp, onAcceptGame, onStatus }) {
  const replies = [];

  function clear() {
    replies.forEach((item) => item.remove());
    replies.length = 0;
    root.innerHTML = "";
  }

  function resolvePosition(cmd, anchor) {
    let x = Number(cmd.x) || 0;
    let y = Number(cmd.y) || 0;
    if (anchor) {
      const ax = anchor.x ?? 0;
      const ay = anchor.y ?? 0;
      const aw = anchor.w ?? 40;
      const ah = anchor.h ?? 40;
      const far = Math.abs(x - ax) > 1800 || Math.abs(y - ay) > 1800 || x < 0 || y < 0;
      if (far || (x === 0 && y === 0)) {
        x = Math.round(ax + Math.max(aw, 40) + 36);
        y = Math.round(ay);
      }
    }
    // Prefer sitting just under the user's latest marks when overlapping heavily
    if (anchor && Math.abs(y - (anchor.y || 0)) < 20) {
      y = Math.round((anchor.y || 0) + (anchor.h || 60) + 28);
    }
    return { x, y };
  }

  function mountReply(cmd) {
    const item = document.createElement("div");
    item.className =
      "diary-reply diary-ink-appear" + (cmd.type === "draw_formula" ? " draft-formula" : "");
    item._world = { x: cmd.x, y: cmd.y };
    item._cmd = { type: cmd.type, x: cmd.x, y: cmd.y, text: cmd.text, latex: cmd.latex };
    item.style.pointerEvents = "none";

    const body = document.createElement("div");
    body.className = "diary-reply-body";
    if (cmd.type === "draw_formula") renderLatex(cmd.latex, body);
    else body.textContent = cmd.text;
    item.appendChild(body);

    const screen = canvasApp.worldToScreen(cmd.x, cmd.y);
    item.style.left = `${screen.x}px`;
    item.style.top = `${screen.y}px`;
    root.appendChild(item);
    replies.push(item);
    return item;
  }

  async function placeCommands(commands, anchor = null) {
    let firstWorld = null;
    for (const cmd of commands) {
      const pos = resolvePosition(cmd, anchor);
      cmd.x = pos.x;
      cmd.y = pos.y;
      if (!firstWorld) firstWorld = { ...pos };

      if (cmd.type === "start_game") {
        onAcceptGame?.(cmd);
        continue;
      }
      if (cmd.type === "place_mark") {
        canvasApp.drawMark(cmd.symbol, cmd.x, cmd.y, cmd.size);
        continue;
      }
      if (cmd.type === "draw") {
        canvasApp.drawVectorCommand(cmd);
        continue;
      }
      if (cmd.type === "write_text" || cmd.type === "draw_formula") {
        mountReply(cmd);
        // Large world-space burn so export/snapshots keep the ink
        if (cmd.type === "write_text" && cmd.text) {
          canvasApp.burnWorldText(cmd.text, cmd.x, cmd.y);
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
