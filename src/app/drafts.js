import { renderLatex } from "../math/katex-render.js";

/**
 * Estimate user handwriting letter size (world units) from the latest ink bbox.
 */
export function estimateHandwritingSize(anchor) {
  if (!anchor) return 64;
  const w = Math.max(Number(anchor.w) || 0, 24);
  const h = Math.max(Number(anchor.h) || 0, 24);
  const aspect = h / w;
  const lines = aspect > 0.75 ? Math.max(2, Math.min(5, Math.round(h / Math.max(w * 0.28, 50)))) : 1;
  const letter = h / lines;
  return Math.min(200, Math.max(36, Math.round(letter * 0.9)));
}

/**
 * Diary replies as living ink overlays only (no Keep/Discard, no double burn).
 */
export function createDraftLayer({ root, canvasApp, onAcceptGame, onStatus }) {
  const replies = [];

  function clear() {
    replies.forEach((item) => item.remove());
    replies.length = 0;
    root.innerHTML = "";
  }

  function resolvePosition(cmd, anchor, fontSize) {
    const gap = Math.round(fontSize * 0.45);
    if (anchor) {
      // Always sit below the user's marks to avoid covering their ink.
      const x = Math.round(anchor.x ?? cmd.x ?? 0);
      const y = Math.round((anchor.y || 0) + (anchor.h || fontSize) + gap);
      return { x, y };
    }
    let x = Number(cmd.x) || 40;
    let y = Number(cmd.y) || 40;
    if (x < 0) x = 40;
    if (y < 0) y = 40;
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
    let startedGame = false;

    for (const cmd of commands) {
      // Ignore accidental games when the user only wrote short chat (no board intent).
      if (cmd.type === "start_game") {
        const chatOnly =
          anchor &&
          (anchor.h || 0) < 900 &&
          (anchor.w || 0) < 1600 &&
          !commands.some((c) => c.type === "place_mark");
        // Still allow start_game if model insists, but if there's also write_text for hello-style
        // and no place_mark, prefer chat: skip game when multiple write_texts dominate.
        const textCmds = commands.filter((c) => c.type === "write_text");
        const looksLikeGreeting = textCmds.some((c) =>
          /hello|hi\b|hey|how are you|thanks|thank you/i.test(c.text || "")
        );
        if (looksLikeGreeting && chatOnly) continue;
        if (startedGame) continue;
        startedGame = true;
        const pos = resolvePosition(cmd, anchor, fontSize);
        cmd.x = pos.x;
        cmd.y = pos.y;
        onAcceptGame?.(cmd);
        if (!firstWorld) firstWorld = { ...pos };
        continue;
      }

      const pos = resolvePosition(cmd, anchor, fontSize);
      cmd.x = pos.x;
      cmd.y = pos.y;
      cmd.fontSize = fontSize;
      if (!firstWorld) firstWorld = { ...pos };

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
        // Overlay only — burning the same text caused the double/overlapping ink.
        mountReply(cmd);
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
