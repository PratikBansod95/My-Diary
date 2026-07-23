import { renderLatex } from "../math/katex-render.js";

/**
 * Commits diary replies straight onto the page — no Keep/Discard.
 * A short ink fade-in keeps the “writing itself” feel.
 */
export function createDraftLayer({ root, canvasApp, onAcceptGame, onStatus }) {
  function clear() {
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
        x = Math.round(ax + aw + 48);
        y = Math.round(ay + Math.min(ah, 80));
      }
    }
    return { x, y };
  }

  async function commitTextOrFormula(cmd) {
    const host = document.createElement("div");
    host.className =
      "draft-item diary-ink-appear" + (cmd.type === "draw_formula" ? " draft-formula" : "");
    host.style.left = "-9999px";
    host.style.top = "0";
    host.style.pointerEvents = "none";
    const body = document.createElement("div");
    body.className = "draft-body";
    if (cmd.type === "draw_formula") renderLatex(cmd.latex, body);
    else body.textContent = cmd.text;
    host.appendChild(body);
    root.appendChild(host);
    // Allow layout/fonts to settle briefly before burning into tiles
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await canvasApp.burnDomElement(body, cmd.x, cmd.y);
    host.remove();
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
      if (cmd.type === "draw") {
        canvasApp.drawVectorCommand(cmd);
        continue;
      }
      if (cmd.type === "write_text" || cmd.type === "draw_formula") {
        await commitTextOrFormula(cmd);
      }
    }
    onStatus?.("The diary has answered.");
    return firstWorld;
  }

  function syncPositions() {
    // No floating drafts to track — replies are burned into the page.
  }

  return { clear, placeCommands, syncPositions };
}
