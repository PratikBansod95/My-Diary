import { renderLatex } from "../math/katex-render.js";

export function createDraftLayer({ root, canvasApp, onAcceptGame, onStatus }) {
  const drafts = [];

  function clear() {
    root.innerHTML = "";
    drafts.length = 0;
  }

  function placeCommands(commands) {
    for (const cmd of commands) {
      if (cmd.type === "start_game") {
        onAcceptGame?.(cmd);
        continue;
      }
      if (cmd.type === "draw") {
        const item = document.createElement("div");
        item.className = "draft-item";
        item.dataset.type = "draw";
        item.style.left = `${canvasApp.worldToScreen(cmd.x, cmd.y).x}px`;
        item.style.top = `${canvasApp.worldToScreen(cmd.x, cmd.y).y}px`;
        item.innerHTML = `<div>Diagram ready</div><div class="draft-actions"><button type="button" data-act="accept">Keep</button><button type="button" data-act="discard">Discard</button></div>`;
        item._cmd = cmd;
        item._world = { x: cmd.x, y: cmd.y };
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
