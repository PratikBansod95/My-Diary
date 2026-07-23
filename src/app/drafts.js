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
 * Diary replies as living ink overlays (no Keep/Discard).
 * Feels like a friend answering beside your marks — not a chat bubble.
 */
export function createDraftLayer({ root, canvasApp, onAcceptGame, onStatus }) {
  const replies = [];

  function clear() {
    replies.forEach((item) => item.remove());
    replies.length = 0;
    root.innerHTML = "";
  }

  function recentMemory(limit = 6) {
    return replies
      .map((item) => item._cmd?.text)
      .filter(Boolean)
      .slice(-limit);
  }

  function resolvePosition(cmd, anchor, fontSize, stackIndex) {
    const gap = Math.round(fontSize * 0.45);
    const stack = Math.round(stackIndex * fontSize * 1.35);
    if (anchor) {
      const x = Math.round(anchor.x ?? cmd.x ?? 0);
      const y = Math.round((anchor.y || 0) + (anchor.h || fontSize) + gap + stack);
      return { x, y };
    }
    let x = Number(cmd.x) || 40;
    let y = Number(cmd.y) || 40;
    if (x < 0) x = 40;
    if (y < 0) y = 40;
    return { x, y: y + stack };
  }

  /** Rough doodle (heart, face): leave room for a drawn reply beside/below */
  function looksLikeDoodle(anchor) {
    if (!anchor) return false;
    const w = anchor.w || 0;
    const h = anchor.h || 0;
    if (w < 40 || h < 40) return false;
    const aspect = w / Math.max(h, 1);
    return aspect > 0.45 && aspect < 2.2 && w < 900 && h < 900;
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
    let textStack = 0;
    const doodle = looksLikeDoodle(anchor);

    // Prefer starting ink-games before placing chat, so we can drop "app-y" game captions.
    const ordered = [...commands].sort((a, b) => {
      const rank = (c) => (c.type === "start_game" ? 0 : c.type === "place_mark" || c.type === "draw" ? 1 : 2);
      return rank(a) - rank(b);
    });

    for (const cmd of ordered) {
      if (cmd.type === "start_game") {
        const textCmds = commands.filter((c) => c.type === "write_text");
        const looksLikeGreeting = textCmds.some((c) =>
          /hello|hi\b|hey|how are you|thanks|thank you|love you|miss you|lonely|sad/i.test(c.text || "")
        );
        const chatOnly =
          anchor &&
          (anchor.h || 0) < 900 &&
          (anchor.w || 0) < 1600 &&
          !commands.some((c) => c.type === "place_mark");
        if (looksLikeGreeting && chatOnly) continue;
        if (startedGame) continue;
        startedGame = true;
        // Play on their marks — pass the ink box, never invent a floating widget.
        onAcceptGame?.(cmd, anchor);
        if (anchor && !firstWorld) {
          firstWorld = { x: anchor.x, y: anchor.y + (anchor.h || 0) + 40 };
        }
        continue;
      }

      if (cmd.type === "write_text") {
        // Drop plastic game-UI captions — the page already speaks in ink marks.
        if (
          startedGame &&
          /tic-?tac-?toe|hangman|i('ll| will) go first|your move|starting a game/i.test(cmd.text || "")
        ) {
          continue;
        }
      }

      if (cmd.type === "place_mark") {
        // During a live board game, marks are placed by the parchment session — skip AI duplicates.
        if (startedGame) continue;
        const markSize = Math.round(cmd.size || fontSize * 1.15);
        let mx = Number(cmd.x) || 0;
        let my = Number(cmd.y) || 0;
        if (anchor) {
          mx = Math.round(anchor.x + (anchor.w || markSize) * 0.15);
          my = Math.round(anchor.y + (anchor.h || markSize) + fontSize * 0.35);
        }
        canvasApp.drawMark(cmd.symbol, mx, my, markSize);
        if (!firstWorld) firstWorld = { x: mx, y: my };
        continue;
      }

      if (cmd.type === "draw") {
        if (startedGame) continue;
        if (anchor && doodle) {
          const items = (cmd.items || []).map((entry) => {
            const shape = String(entry.shape || "").toLowerCase();
            if (shape === "heart" && Array.isArray(entry.points)) {
              const size = entry.points[2] || Math.round(fontSize * 1.4);
              return {
                ...entry,
                points: [
                  Math.round((anchor.w || size) * 0.35),
                  Math.round(fontSize * 0.2),
                  size,
                ],
              };
            }
            return entry;
          });
          canvasApp.drawVectorCommand({
            x: Math.round(anchor.x),
            y: Math.round(anchor.y + (anchor.h || fontSize) + fontSize * 0.25),
            items,
          });
        } else {
          canvasApp.drawVectorCommand(cmd);
        }
        if (!firstWorld && anchor) {
          firstWorld = {
            x: anchor.x,
            y: anchor.y + (anchor.h || fontSize) + 20,
          };
        }
        continue;
      }

      if (cmd.type === "write_text" || cmd.type === "draw_formula") {
        const pos = resolvePosition(cmd, anchor, fontSize, textStack);
        if (doodle && commands.some((c) => c.type === "draw" || c.type === "place_mark")) {
          pos.y += Math.round(fontSize * 1.6);
        }
        // Keep captions clear of a drawn board
        if (startedGame && anchor) {
          pos.y = Math.round(anchor.y + (anchor.h || 0) + fontSize * 1.2 + textStack * fontSize * 1.3);
          pos.x = Math.round(anchor.x);
        }
        cmd.x = pos.x;
        cmd.y = pos.y;
        cmd.fontSize = fontSize;
        mountReply(cmd);
        textStack += 1;
        if (!firstWorld) firstWorld = { ...pos };
      }
    }
    syncPositions();
    onStatus?.("Ink answered.");
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

  function addReply(text, x, y, fontSize = 48) {
    if (!text) return;
    mountReply({
      type: "write_text",
      text,
      x: Math.round(x),
      y: Math.round(y),
      fontSize,
    });
    syncPositions();
  }

  return { clear, placeCommands, syncPositions, serialize, restore, addReply, recentMemory };
}
