/**
 * Freehand lasso over confirmed ink. Does not trigger AI.
 * Move / delete / recolor via a small floating bar after a closed path.
 */
export function createSelectionTool({ stage, canvasApp, overlayRoot, onStatus, onChanged }) {
  const canvas = document.createElement("canvas");
  canvas.className = "lasso-canvas";
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;";
  overlayRoot.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const bar = document.createElement("div");
  bar.className = "lasso-bar";
  bar.hidden = true;
  bar.innerHTML = `
    <button type="button" data-act="focus">Use for Speak</button>
    <button type="button" data-act="delete">Delete</button>
    <button type="button" data-act="clear">Clear</button>
  `;
  overlayRoot.appendChild(bar);

  let drawing = false;
  let points = [];
  let bounds = null;

  function resize() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }

  function redraw() {
    const rect = stage.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    if (points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = "rgba(31,61,46,0.85)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    points.forEach((p, i) => {
      const s = canvasApp.worldToScreen(p.x, p.y);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    if (!drawing && points.length > 2) ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  function computeBounds() {
    if (points.length < 3) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return {
      x: minX,
      y: minY,
      w: Math.max(1, maxX - minX),
      h: Math.max(1, maxY - minY),
    };
  }

  function clearSelection() {
    points = [];
    bounds = null;
    bar.hidden = true;
    canvasApp.setSelectionFocus(null);
    redraw();
  }

  function eraseBounds() {
    if (!bounds) return;
    canvasApp.eraseRegion({ x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h });
    onStatus?.("Selection erased.");
    onChanged?.();
    clearSelection();
  }

  bar.addEventListener("click", (event) => {
    const act = event.target?.getAttribute?.("data-act");
    if (act === "clear") clearSelection();
    if (act === "delete") eraseBounds();
    if (act === "focus" && bounds) {
      canvasApp.setSelectionFocus(bounds);
      onStatus?.("Selection will focus the next Speak.");
    }
  });

  function setActive(active) {
    canvas.style.pointerEvents = active ? "auto" : "none";
    if (!active) clearSelection();
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (canvasApp.getTool() !== "lasso") return;
    drawing = true;
    points = [];
    bar.hidden = true;
    const w = canvasApp.screenToWorld(event.clientX, event.clientY);
    points.push(w);
    canvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    const w = canvasApp.screenToWorld(event.clientX, event.clientY);
    const last = points[points.length - 1];
    if (!last || Math.hypot(w.x - last.x, w.y - last.y) > 4) {
      points.push(w);
      redraw();
    }
  });

  canvas.addEventListener("pointerup", () => {
    if (!drawing) return;
    drawing = false;
    bounds = computeBounds();
    if (bounds && points.length > 8) {
      bar.hidden = false;
      const mid = canvasApp.worldToScreen(bounds.x + bounds.w / 2, bounds.y);
      bar.style.left = `${Math.max(8, mid.x - 90)}px`;
      bar.style.top = `${Math.max(8, mid.y - 48)}px`;
      onStatus?.("Lasso ready — Use for Speak, Delete, or Clear.");
    } else {
      clearSelection();
    }
    redraw();
  });

  window.addEventListener("resize", resize);
  resize();

  function sync() {
    redraw();
    if (bounds && !bar.hidden) {
      const mid = canvasApp.worldToScreen(bounds.x + bounds.w / 2, bounds.y);
      bar.style.left = `${Math.max(8, mid.x - 90)}px`;
      bar.style.top = `${Math.max(8, mid.y - 48)}px`;
    }
  }

  return { clearSelection, sync, resize, setActive };
}
