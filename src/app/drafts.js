import { renderLatex } from "../math/katex-render.js";

export function estimateHandwritingSize(anchor) {
  if (!anchor) return 48;
  const w = Math.max(Number(anchor.w) || 0, 24);
  const h = Math.max(Number(anchor.h) || 0, 24);
  const aspect = h / w;
  const lines = aspect > 0.75 ? Math.max(2, Math.min(5, Math.round(h / Math.max(w * 0.28, 50)))) : 1;
  const letter = h / lines;
  return Math.min(160, Math.max(28, Math.round(letter * 0.85)));
}

/**
 * PenEcho-style unconfirmed drafts: Keep burns into tiles, Discard removes, drag/resize before commit.
 */
export function createDraftLayer({ root, canvasApp, onStatus, onChanged }) {
  const items = [];

  function clear() {
    items.splice(0).forEach((item) => item.el.remove());
    root.innerHTML = "";
  }

  function hasPending() {
    return items.length > 0;
  }

  function syncPositions() {
    const view = canvasApp.getView();
    for (const item of items) {
      const screen = canvasApp.worldToScreen(item.x, item.y);
      item.el.style.left = `${screen.x}px`;
      item.el.style.top = `${screen.y}px`;
      applyScale(item, view.scale);
    }
  }

  function applyScale(item, scale) {
    const fontPx = Math.max(12, (item.fontSize || 48) * scale * (item.scale || 1));
    item.el.style.setProperty("--draft-font", `${fontPx}px`);
    const maxW = Math.min(window.innerWidth * 0.8, (item.maxWidth || item.fontSize * 12) * scale * (item.scale || 1));
    item.el.style.maxWidth = `${maxW}px`;
    if (item.type === "draw" || item.type === "plot_function") {
      const w = (item.previewW || 200) * scale * (item.scale || 1);
      const h = (item.previewH || 160) * scale * (item.scale || 1);
      const canvas = item.el.querySelector("canvas");
      if (canvas) {
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }
    }
  }

  function makeChrome(item) {
    const bar = document.createElement("div");
    bar.className = "draft-chrome";
    const keep = document.createElement("button");
    keep.type = "button";
    keep.className = "draft-keep";
    keep.textContent = "Keep";
    keep.addEventListener("click", (e) => {
      e.stopPropagation();
      void acceptItem(item);
    });
    const discard = document.createElement("button");
    discard.type = "button";
    discard.className = "draft-discard";
    discard.textContent = "Discard";
    discard.addEventListener("click", (e) => {
      e.stopPropagation();
      rejectItem(item);
    });
    bar.append(keep, discard);
    return bar;
  }

  function wireDrag(item) {
    const handle = item.el.querySelector(".draft-body") || item.el;
    let dragging = false;
    let start = null;
    handle.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      dragging = true;
      start = {
        clientX: event.clientX,
        clientY: event.clientY,
        x: item.x,
        y: item.y,
      };
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    });
    handle.addEventListener("pointermove", (event) => {
      if (!dragging || !start) return;
      const view = canvasApp.getView();
      const dx = (event.clientX - start.clientX) / view.scale;
      const dy = (event.clientY - start.clientY) / view.scale;
      item.x = start.x + dx;
      item.y = start.y + dy;
      syncPositions();
    });
    const end = () => {
      dragging = false;
      start = null;
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);

    const resize = item.el.querySelector(".draft-resize");
    if (resize) {
      let resizing = false;
      let r0 = null;
      resize.addEventListener("pointerdown", (event) => {
        resizing = true;
        r0 = { clientY: event.clientY, scale: item.scale || 1 };
        resize.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
      });
      resize.addEventListener("pointermove", (event) => {
        if (!resizing || !r0) return;
        const delta = (event.clientY - r0.clientY) / 120;
        item.scale = Math.min(2.5, Math.max(0.45, r0.scale + delta));
        syncPositions();
      });
      const endR = () => {
        resizing = false;
        r0 = null;
      };
      resize.addEventListener("pointerup", endR);
      resize.addEventListener("pointercancel", endR);
    }
  }

  function mountTextDraft(cmd) {
    const el = document.createElement("div");
    el.className = "draft-item draft-pending diary-ink-appear";
    const body = document.createElement("div");
    body.className = "draft-body";
    if (cmd.type === "draw_formula") {
      el.classList.add("draft-formula");
      renderLatex(cmd.latex, body);
    } else {
      body.textContent = cmd.text;
    }
    const resize = document.createElement("button");
    resize.type = "button";
    resize.className = "draft-resize";
    resize.title = "Resize";
    resize.textContent = "⤡";
    el.append(makeChrome({}), body, resize);
    // fix chrome binding after item exists
    return { el, body, resize };
  }

  function paintDrawPreview(canvas, cmd, scale = 1) {
    const items = cmd.items || [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const entry of items) {
      const pts = entry.points || [];
      for (let i = 0; i + 1 < pts.length; i += 2) {
        minX = Math.min(minX, pts[i]);
        minY = Math.min(minY, pts[i + 1]);
        maxX = Math.max(maxX, pts[i]);
        maxY = Math.max(maxY, pts[i + 1]);
      }
      if (entry.shape === "heart" && pts.length >= 3) {
        const [cx, cy, size] = pts;
        minX = Math.min(minX, cx - size);
        minY = Math.min(minY, cy - size);
        maxX = Math.max(maxX, cx + size);
        maxY = Math.max(maxY, cy + size);
      }
      if ((entry.shape === "circle" || entry.shape === "ellipse") && pts.length >= 3) {
        const cx = pts[0];
        const cy = pts[1];
        const rx = pts[2];
        const ry = pts[3] ?? pts[2];
        minX = Math.min(minX, cx - rx);
        minY = Math.min(minY, cy - ry);
        maxX = Math.max(maxX, cx + rx);
        maxY = Math.max(maxY, cy + ry);
      }
      if (entry.shape === "rect" && pts.length >= 4) {
        minX = Math.min(minX, pts[0]);
        minY = Math.min(minY, pts[1]);
        maxX = Math.max(maxX, pts[0] + pts[2]);
        maxY = Math.max(maxY, pts[1] + pts[3]);
      }
    }
    if (!Number.isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = 120;
      maxY = 80;
    }
    const pad = 12;
    const w = Math.max(40, maxX - minX + pad * 2);
    const h = Math.max(40, maxY - minY + pad * 2);
    const dpr = 2;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#1f3d2e";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const ox = -minX + pad;
    const oy = -minY + pad;
    for (const entry of items) {
      const pts = entry.points || [];
      const shape = String(entry.shape || "line").toLowerCase();
      if (shape === "rect" && pts.length >= 4) {
        ctx.strokeRect(pts[0] + ox, pts[1] + oy, pts[2], pts[3]);
      } else if ((shape === "circle" || shape === "ellipse") && pts.length >= 3) {
        const rx = pts[2];
        const ry = pts[3] ?? pts[2];
        ctx.beginPath();
        ctx.ellipse(pts[0] + ox, pts[1] + oy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (pts.length >= 4) {
        ctx.beginPath();
        ctx.moveTo(pts[0] + ox, pts[1] + oy);
        for (let i = 2; i + 1 < pts.length; i += 2) {
          ctx.lineTo(pts[i] + ox, pts[i + 1] + oy);
        }
        ctx.stroke();
      }
    }
    void scale;
    return { w, h, minX, minY, pad };
  }

  function resolvePlacement(cmd, anchor, fontSize, stackIndex) {
    const gap = Math.round(fontSize * 0.5);
    const stack = Math.round(stackIndex * fontSize * 1.4);
    if (Number.isFinite(cmd.x) && Number.isFinite(cmd.y) && (cmd.x > 0 || cmd.y > 0)) {
      return { x: Math.round(cmd.x), y: Math.round(cmd.y + stack) };
    }
    if (anchor) {
      return {
        x: Math.round(anchor.x ?? 40),
        y: Math.round((anchor.y || 0) + (anchor.h || fontSize) + gap + stack),
      };
    }
    return { x: 80, y: 80 + stack };
  }

  function addItem(partial) {
    items.push(partial);
    root.appendChild(partial.el);
    // rebind chrome with real item refs
    const chrome = partial.el.querySelector(".draft-chrome");
    if (chrome) {
      chrome.innerHTML = "";
      const keep = document.createElement("button");
      keep.type = "button";
      keep.className = "draft-keep";
      keep.textContent = "Keep";
      keep.addEventListener("click", (e) => {
        e.stopPropagation();
        void acceptItem(partial);
      });
      const discard = document.createElement("button");
      discard.type = "button";
      discard.className = "draft-discard";
      discard.textContent = "Discard";
      discard.addEventListener("click", (e) => {
        e.stopPropagation();
        rejectItem(partial);
      });
      chrome.append(keep, discard);
    }
    wireDrag(partial);
    syncPositions();
  }

  async function placeCommands(commands, anchor = null) {
    const fontSize = estimateHandwritingSize(anchor);
    let first = null;
    let stack = 0;

    for (const cmd of commands || []) {
      if (!cmd?.type) continue;
      // Soft-disable games this milestone
      if (cmd.type === "start_game" || cmd.type === "place_mark") continue;

      if (cmd.type === "erase") {
        canvasApp.eraseRegion?.(cmd);
        continue;
      }

      if (cmd.type === "write_text" || cmd.type === "draw_formula") {
        const pos = resolvePlacement(cmd, anchor, fontSize, stack);
        const { el } = mountTextDraft(cmd);
        // mountTextDraft created empty chrome — addItem rewires
        const item = {
          type: cmd.type,
          text: cmd.text,
          latex: cmd.latex,
          x: pos.x,
          y: pos.y,
          fontSize: cmd.fontSize || fontSize,
          maxWidth: cmd.maxWidth || fontSize * 12,
          scale: 1,
          el,
          cmd,
        };
        addItem(item);
        stack += 1;
        if (!first) first = { x: pos.x, y: pos.y };
        continue;
      }

      if (cmd.type === "draw" || cmd.type === "plot_function") {
        const pos = resolvePlacement(cmd, anchor, fontSize, stack);
        const el = document.createElement("div");
        el.className = "draft-item draft-pending draft-draw diary-ink-appear";
        const chrome = document.createElement("div");
        chrome.className = "draft-chrome";
        const body = document.createElement("div");
        body.className = "draft-body";
        const canvas = document.createElement("canvas");
        body.appendChild(canvas);
        const resize = document.createElement("button");
        resize.type = "button";
        resize.className = "draft-resize";
        resize.textContent = "⤡";
        el.append(chrome, body, resize);

        let previewMeta = { w: 200, h: 160 };
        if (cmd.type === "plot_function") {
          previewMeta = canvasApp.paintPlotPreview?.(canvas, cmd) || previewMeta;
        } else {
          previewMeta = paintDrawPreview(canvas, cmd);
        }

        const item = {
          type: cmd.type,
          x: pos.x,
          y: pos.y,
          fontSize,
          scale: 1,
          previewW: previewMeta.w,
          previewH: previewMeta.h,
          el,
          cmd: {
            ...cmd,
            x: pos.x,
            y: pos.y,
          },
        };
        addItem(item);
        stack += 1;
        if (!first) first = { x: pos.x, y: pos.y };
      }
    }

    syncPositions();
    onStatus?.(items.length ? "Draft ready — Keep or Discard." : "No draft returned.");
    onChanged?.();
    return first;
  }

  async function acceptItem(item) {
    const idx = items.indexOf(item);
    if (idx < 0) return;
    const scale = item.scale || 1;
    const fontSize = Math.round((item.fontSize || 48) * scale);

    if (item.type === "write_text") {
      canvasApp.burnWorldText(item.text, item.x, item.y, { fontSize });
    } else if (item.type === "draw_formula") {
      // Burn LaTeX as readable text fallback; visual katex stays draft-quality
      canvasApp.burnWorldText(item.latex || "", item.x, item.y, { fontSize });
    } else if (item.type === "draw") {
      canvasApp.drawVectorCommand({
        ...item.cmd,
        x: item.x,
        y: item.y,
        scale,
      });
    } else if (item.type === "plot_function") {
      canvasApp.commitPlot?.(item.cmd, item.x, item.y, scale);
    }

    item.el.remove();
    items.splice(idx, 1);
    onStatus?.("Kept on the page.");
    onChanged?.();
  }

  function rejectItem(item) {
    const idx = items.indexOf(item);
    if (idx < 0) return;
    item.el.remove();
    items.splice(idx, 1);
    onStatus?.("Draft discarded.");
    onChanged?.();
  }

  async function acceptAll() {
    const copy = [...items];
    for (const item of copy) await acceptItem(item);
  }

  function discardAll() {
    const copy = [...items];
    for (const item of copy) rejectItem(item);
  }

  /** Unconfirmed drafts are never persisted (PenEcho rule). */
  function serialize() {
    return [];
  }

  function restore() {
    clear();
  }

  function recentMemory() {
    return [];
  }

  return {
    clear,
    placeCommands,
    syncPositions,
    serialize,
    restore,
    acceptAll,
    discardAll,
    hasPending,
    recentMemory,
  };
}
