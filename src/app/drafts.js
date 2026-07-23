import { renderLatex } from "../math/katex-render.js";

export function createDraftLayer({ root, canvasApp, onAcceptGame, onStatus }) {
  const drafts = [];

  function clear() {
    root.innerHTML = "";
    drafts.length = 0;
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
        x = Math.round(ax + aw + 40);
        y = Math.round(ay);
      }
    }
    return { x, y };
  }

  function placeCommands(commands, anchor = null) {
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
        const item = document.createElement("div");
        item.className = "draft-item";
        item.dataset.type = "draw";
        item._cmd = cmd;
        item._world = { x: cmd.x, y: cmd.y };
        const screen = canvasApp.worldToScreen(cmd.x, cmd.y);
        item.style.left = `${screen.x}px`;
        item.style.top = `${screen.y}px`;
        item.innerHTML = `<div>Diagram ready</div><div class="draft-actions"><button type="button" data-act="accept">Keep</button><button type="button" data-act="discard">Discard</button></div>`;
        wireDrag(item);
        wireActions(item);
        root.appendChild(item);
        drafts.push(item);
        continue;
      }

      const item = document.createElement("div");
      item.className = "draft-item" + (cmd.type === "draw_formula" ? " draft-formula" : "");
      item._cmd = cmd;
      item._world = { x: cmd.x, y: cmd.y };
      const screen = canvasApp.worldToScreen(cmd.x, cmd.y);
      item.style.left = `${screen.x}px`;
      item.style.top = `${screen.y}px`;

      const body = document.createElement("div");
      body.className = "draft-body";
      if (cmd.type === "draw_formula") renderLatex(cmd.latex, body);
      else body.textContent = cmd.text;
      item.appendChild(body);

      const actions = document.createElement("div");
      actions.className = "draft-actions";
      actions.innerHTML =
        '<button type="button" data-act="accept">Keep</button><button type="button" data-act="discard">Discard</button>';
      item.appendChild(actions);

      wireDrag(item);
      wireActions(item);
      root.appendChild(item);
      drafts.push(item);
    }
    syncPositions();
    return firstWorld;
  }

  function wireDrag(item) {
    let dragging = null;
    item.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      dragging = {
        id: event.pointerId,
        ox: event.clientX - parseFloat(item.style.left || "0"),
        oy: event.clientY - parseFloat(item.style.top || "0"),
      };
      item.setPointerCapture(event.pointerId);
      event.stopPropagation();
    });
    item.addEventListener("pointermove", (event) => {
      if (!dragging || dragging.id !== event.pointerId) return;
      const left = event.clientX - dragging.ox;
      const top = event.clientY - dragging.oy;
      item.style.left = `${left}px`;
      item.style.top = `${top}px`;
      const rect = root.getBoundingClientRect();
      const world = canvasApp.screenToWorld(rect.left + left, rect.top + top);
      item._world = { x: world.x, y: world.y };
      item._cmd.x = Math.round(world.x);
      item._cmd.y = Math.round(world.y);
    });
    item.addEventListener("pointerup", () => {
      dragging = null;
    });
  }

  function wireActions(item) {
    item.addEventListener("click", async (event) => {
      const btn = event.target.closest("button[data-act]");
      if (!btn) return;
      const act = btn.getAttribute("data-act");
      if (act === "discard") {
        item.remove();
        const idx = drafts.indexOf(item);
        if (idx >= 0) drafts.splice(idx, 1);
        return;
      }
      if (act === "accept") {
        const cmd = item._cmd;
        if (cmd.type === "draw") {
          canvasApp.drawVectorCommand(cmd);
        } else {
          await canvasApp.burnDomElement(item.querySelector(".draft-body") || item, cmd.x, cmd.y);
        }
        item.remove();
        const idx = drafts.indexOf(item);
        if (idx >= 0) drafts.splice(idx, 1);
        onStatus?.("The ink stays.");
      }
    });
  }

  function syncPositions() {
    for (const item of drafts) {
      const screen = canvasApp.worldToScreen(item._world.x, item._world.y);
      item.style.left = `${screen.x}px`;
      item.style.top = `${screen.y}px`;
    }
  }

  return { clear, placeCommands, syncPositions };
}
