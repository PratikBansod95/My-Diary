import { CANVAS_W, CANVAS_H, TILE } from "../shared/defaults.js";

function tileKey(tx, ty) {
  return `${tx},${ty}`;
}

export function createCanvasApp({ stage, tileCanvas, inkCanvas, onStrokeEnd, onStatus }) {
  const tileCtx = tileCanvas.getContext("2d", { willReadFrequently: true });
  const inkCtx = inkCanvas.getContext("2d");
  const tiles = new Map();
  let tool = "pen";
  let drawing = false;
  let panMode = false;
  let lastPoint = null;
  let view = { x: 0, y: 0, scale: 0.25 };
  let dirty = null;
  let latestInput = null;
  let pointers = new Map();
  let pinch = null;

  function resize() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const canvas of [tileCanvas, inkCanvas]) {
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    render();
  }

  function screenToWorld(clientX, clientY) {
    const rect = stage.getBoundingClientRect();
    const x = (clientX - rect.left - view.x) / view.scale;
    const y = (clientY - rect.top - view.y) / view.scale;
    return { x, y };
  }

  function expandDirty(x0, y0, x1, y1, pad = 8) {
    const minX = Math.min(x0, x1) - pad;
    const minY = Math.min(y0, y1) - pad;
    const maxX = Math.max(x0, x1) + pad;
    const maxY = Math.max(y0, y1) + pad;
    if (!dirty) {
      dirty = { minX, minY, maxX, maxY };
      return;
    }
    dirty.minX = Math.min(dirty.minX, minX);
    dirty.minY = Math.min(dirty.minY, minY);
    dirty.maxX = Math.max(dirty.maxX, maxX);
    dirty.maxY = Math.max(dirty.maxY, maxY);
  }

  function ensureTile(tx, ty) {
    const key = tileKey(tx, ty);
    let tile = tiles.get(key);
    if (tile) return tile;
    const canvas = document.createElement("canvas");
    canvas.width = TILE;
    canvas.height = TILE;
    tile = { tx, ty, canvas, ctx: canvas.getContext("2d") };
    tiles.set(key, tile);
    return tile;
  }

  function strokeToTiles(x0, y0, x1, y1, width, color, erase = false) {
    const minX = Math.min(x0, x1) - width;
    const minY = Math.min(y0, y1) - width;
    const maxX = Math.max(x0, x1) + width;
    const maxY = Math.max(y0, y1) + width;
    const tx0 = Math.floor(minX / TILE);
    const ty0 = Math.floor(minY / TILE);
    const tx1 = Math.floor(maxX / TILE);
    const ty1 = Math.floor(maxY / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (tx < 0 || ty < 0 || tx * TILE >= CANVAS_W || ty * TILE >= CANVAS_H) continue;
        const tile = ensureTile(tx, ty);
        const ctx = tile.ctx;
        ctx.save();
        ctx.translate(-tx * TILE, -ty * TILE);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = width;
        if (erase) {
          ctx.globalCompositeOperation = "destination-out";
          ctx.strokeStyle = "rgba(0,0,0,1)";
        } else {
          ctx.globalCompositeOperation = "source-over";
          ctx.strokeStyle = color;
        }
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function render() {
    const rect = stage.getBoundingClientRect();
    tileCtx.clearRect(0, 0, rect.width, rect.height);
    inkCtx.clearRect(0, 0, rect.width, rect.height);

    tileCtx.save();
    tileCtx.translate(view.x, view.y);
    tileCtx.scale(view.scale, view.scale);
    for (const tile of tiles.values()) {
      tileCtx.drawImage(tile.canvas, tile.tx * TILE, tile.ty * TILE);
    }
    tileCtx.restore();
  }

  function setTool(next) {
    tool = next;
    panMode = next === "pan";
    inkCanvas.style.cursor = panMode ? "grab" : "crosshair";
  }

  function clearAll() {
    tiles.clear();
    dirty = null;
    latestInput = null;
    render();
  }

  function importTiles(entries) {
    tiles.clear();
    for (const entry of entries || []) {
      const tile = ensureTile(entry.tx, entry.ty);
      const img = new Image();
      img.onload = () => {
        tile.ctx.clearRect(0, 0, TILE, TILE);
        tile.ctx.drawImage(img, 0, 0);
        render();
      };
      img.src = entry.dataUrl;
    }
  }

  async function exportTiles() {
    const out = [];
    for (const tile of tiles.values()) {
      out.push({
        tx: tile.tx,
        ty: tile.ty,
        dataUrl: tile.canvas.toDataURL("image/png"),
      });
    }
    return out;
  }

  function burnImage(img, x, y, w, h) {
    const tx0 = Math.floor(x / TILE);
    const ty0 = Math.floor(y / TILE);
    const tx1 = Math.floor((x + w) / TILE);
    const ty1 = Math.floor((y + h) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const tile = ensureTile(tx, ty);
        tile.ctx.drawImage(img, x - tx * TILE, y - ty * TILE, w, h);
      }
    }
    render();
  }

  async function burnDomElement(el, worldX, worldY) {
    const text = el.innerText || el.textContent || "";
    if (text.trim()) burnWorldText(text, worldX, worldY);
  }

  /** Burn diary prose in large world units so it matches stylus handwriting scale. */
  function burnWorldText(text, worldX, worldY) {
    const raw = String(text || "").trim();
    if (!raw) return;
    const fontSize = 56;
    const lineHeight = 70;
    const maxWidth = 900;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.font = `italic ${fontSize}px "IM Fell English", Georgia, serif`;

    const words = raw.split(/\s+/);
    const lines = [];
    let current = "";
    for (const word of words) {
      const trial = current ? `${current} ${word}` : word;
      if (ctx.measureText(trial).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else current = trial;
    }
    if (current) lines.push(current);

    const width = Math.ceil(
      Math.min(maxWidth + 40, Math.max(...lines.map((line) => ctx.measureText(line).width), 120) + 40)
    );
    const height = Math.ceil(lines.length * lineHeight + 40);
    const scale = 2;
    canvas.width = width * scale;
    canvas.height = height * scale;
    const draw = canvas.getContext("2d");
    draw.scale(scale, scale);
    draw.clearRect(0, 0, width, height);
    draw.fillStyle = "#1a3328";
    draw.font = `italic ${fontSize}px "IM Fell English", Georgia, serif`;
    draw.textBaseline = "top";
    lines.forEach((line, i) => draw.fillText(line, 16, 16 + i * lineHeight));
    burnImage(canvas, worldX, worldY, width, height);
    expandDirty(worldX, worldY, worldX + width, worldY + height, 12);
  }

  function drawMark(symbol, cx, cy, size = 80) {
    const s = Math.max(24, size);
    const half = s / 2;
    if (String(symbol).toUpperCase() === "O") {
      strokeEllipse(cx, cy, half * 0.85, half * 0.85);
    } else {
      const inset = half * 0.25;
      strokeToTiles(cx - half + inset, cy - half + inset, cx + half - inset, cy + half - inset, 5, "#1f3d2e");
      strokeToTiles(cx + half - inset, cy - half + inset, cx - half + inset, cy + half - inset, 5, "#1f3d2e");
    }
    expandDirty(cx - half, cy - half, cx + half, cy + half, 8);
    latestInput = {
      x: cx - half,
      y: cy - half,
      w: s,
      h: s,
    };
    render();
  }

  function drawVectorCommand(cmd) {
    for (const item of cmd.items || []) {
      const pts = item.points || [];
      if (item.shape === "rect" && pts.length >= 4) {
        const [x, y, w, h] = pts;
        strokeRect(cmd.x + x, cmd.y + y, w, h);
      } else if (item.shape === "circle" && pts.length >= 3) {
        const [cx, cy, r] = pts;
        strokeEllipse(cmd.x + cx, cmd.y + cy, r, r);
      } else if (item.shape === "ellipse" && pts.length >= 4) {
        const [cx, cy, rx, ry] = pts;
        strokeEllipse(cmd.x + cx, cmd.y + cy, rx, ry);
      } else if (pts.length >= 4) {
        for (let i = 0; i + 3 < pts.length; i += 2) {
          strokeToTiles(
            cmd.x + pts[i],
            cmd.y + pts[i + 1],
            cmd.x + pts[i + 2],
            cmd.y + pts[i + 3],
            3,
            "#1f3d2e"
          );
        }
      }
    }
    render();
  }

  function strokeRect(x, y, w, h) {
    strokeToTiles(x, y, x + w, y, 3, "#1f3d2e");
    strokeToTiles(x + w, y, x + w, y + h, 3, "#1f3d2e");
    strokeToTiles(x + w, y + h, x, y + h, 3, "#1f3d2e");
    strokeToTiles(x, y + h, x, y, 3, "#1f3d2e");
  }

  function strokeEllipse(cx, cy, rx, ry) {
    let prevX = cx + rx;
    let prevY = cy;
    const steps = 32;
    for (let i = 1; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = cx + Math.cos(a) * rx;
      const y = cy + Math.sin(a) * ry;
      strokeToTiles(prevX, prevY, x, y, 3, "#1f3d2e");
      prevX = x;
      prevY = y;
    }
  }

  function buildAtlas() {
    if (!dirty && !latestInput) return null;
    const box = dirty || {
      minX: latestInput.x,
      minY: latestInput.y,
      maxX: latestInput.x + latestInput.w,
      maxY: latestInput.y + latestInput.h,
    };
    const pad = 80;
    const originX = Math.max(0, Math.floor(box.minX - pad));
    const originY = Math.max(0, Math.floor(box.minY - pad));
    const width = Math.min(CANVAS_W - originX, Math.ceil(box.maxX - originX + pad));
    const height = Math.min(CANVAS_H - originY, Math.ceil(box.maxY - originY + pad));
    const maxSide = 1024;
    const scale = Math.min(1, maxSide / Math.max(width, height, 1));
    const outW = Math.max(1, Math.round(width * scale));
    const outH = Math.max(1, Math.round(height * scale));
    const atlas = document.createElement("canvas");
    atlas.width = outW;
    atlas.height = outH;
    const ctx = atlas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);
    ctx.scale(scale, scale);
    ctx.translate(-originX, -originY);
    for (const tile of tiles.values()) {
      ctx.drawImage(tile.canvas, tile.tx * TILE, tile.ty * TILE);
    }

    const hotspots = Array.from({ length: 8 }, () => Array(8).fill(0));
    if (latestInput) {
      const hx = Math.min(7, Math.max(0, Math.floor(((latestInput.x - originX) / width) * 8)));
      const hy = Math.min(7, Math.max(0, Math.floor(((latestInput.y - originY) / height) * 8)));
      hotspots[hy][hx] = 1;
    }

    return {
      atlasPngBase64: atlas.toDataURL("image/png"),
      geometry: {
        canvasWidth: CANVAS_W,
        canvasHeight: CANVAS_H,
        originX,
        originY,
        width,
        height,
        latestInput,
        hotspots,
      },
    };
  }

  function consumeDirty() {
    dirty = null;
  }

  function onPointerDown(event) {
    if (event.pointerType === "touch" && tool === "pen" && !event.isPrimary && pointers.size >= 1) {
      // multi-touch pan/zoom
    }
    inkCanvas.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      pinch = {
        distance: Math.hypot(dx, dy),
        scale: view.scale,
        midX: (pts[0].x + pts[1].x) / 2,
        midY: (pts[0].y + pts[1].y) / 2,
        viewX: view.x,
        viewY: view.y,
      };
      drawing = false;
      return;
    }
    if (panMode || event.button === 1 || (event.pointerType === "touch" && tool === "pan")) {
      lastPoint = { x: event.clientX, y: event.clientY, pan: true };
      return;
    }
    const world = screenToWorld(event.clientX, event.clientY);
    drawing = true;
    lastPoint = { ...world, pan: false };
    latestInput = { x: world.x, y: world.y, w: 1, h: 1 };
  }

  function onPointerMove(event) {
    if (pointers.has(event.pointerId)) {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (pinch && pointers.size === 2) {
      const pts = [...pointers.values()];
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const distance = Math.hypot(dx, dy);
      const nextScale = Math.min(2.5, Math.max(0.08, pinch.scale * (distance / (pinch.distance || 1))));
      const rect = stage.getBoundingClientRect();
      const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
      const midY = (pts[0].y + pts[1].y) / 2 - rect.top;
      const worldX = (midX - pinch.viewX) / pinch.scale;
      const worldY = (midY - pinch.viewY) / pinch.scale;
      view.scale = nextScale;
      view.x = midX - worldX * nextScale;
      view.y = midY - worldY * nextScale;
      render();
      return;
    }
    if (!lastPoint) return;
    if (lastPoint.pan) {
      view.x += event.clientX - lastPoint.x;
      view.y += event.clientY - lastPoint.y;
      lastPoint = { x: event.clientX, y: event.clientY, pan: true };
      render();
      return;
    }
    if (!drawing) return;
    const world = screenToWorld(event.clientX, event.clientY);
    const pressure = event.pressure > 0 ? event.pressure : 0.5;
    const width = tool === "eraser" ? 18 : 2.2 + pressure * 4.5;
    const color = "#1c2218";
    strokeToTiles(lastPoint.x, lastPoint.y, world.x, world.y, width, color, tool === "eraser");
    expandDirty(lastPoint.x, lastPoint.y, world.x, world.y, width + 4);
    latestInput = {
      x: Math.min(latestInput?.x ?? world.x, world.x, lastPoint.x),
      y: Math.min(latestInput?.y ?? world.y, world.y, lastPoint.y),
      w: Math.abs(world.x - (latestInput?.x ?? world.x)) + 1,
      h: Math.abs(world.y - (latestInput?.y ?? world.y)) + 1,
    };
    // expand latestInput properly
    const minX = Math.min(lastPoint.x, world.x, latestInput.x);
    const minY = Math.min(lastPoint.y, world.y, latestInput.y);
    const maxX = Math.max(lastPoint.x, world.x, latestInput.x + latestInput.w);
    const maxY = Math.max(lastPoint.y, world.y, latestInput.y + latestInput.h);
    latestInput = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    lastPoint = world;
    render();
  }

  function onPointerUp(event) {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    const wasDrawing = drawing && lastPoint && !lastPoint.pan;
    drawing = false;
    lastPoint = null;
    if (wasDrawing) onStrokeEnd?.();
  }

  function onWheel(event) {
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;
    const worldX = (mx - view.x) / view.scale;
    const worldY = (my - view.y) / view.scale;
    const factor = event.deltaY > 0 ? 0.9 : 1.1;
    view.scale = Math.min(2.5, Math.max(0.08, view.scale * factor));
    view.x = mx - worldX * view.scale;
    view.y = my - worldY * view.scale;
    render();
  }

  function centerView() {
    const rect = stage.getBoundingClientRect();
    view.scale = Math.min(rect.width / 1600, rect.height / 2000, 0.45);
    view.x = rect.width * 0.08;
    view.y = rect.height * 0.08;
    render();
  }

  function worldToScreen(x, y) {
    return {
      x: x * view.scale + view.x,
      y: y * view.scale + view.y,
    };
  }

  function getView() {
    return { ...view };
  }

  function setView(next) {
    view = { ...view, ...next };
    render();
  }

  inkCanvas.addEventListener("pointerdown", onPointerDown);
  inkCanvas.addEventListener("pointermove", onPointerMove);
  inkCanvas.addEventListener("pointerup", onPointerUp);
  inkCanvas.addEventListener("pointercancel", onPointerUp);
  stage.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("resize", resize);
  resize();
  centerView();

  return {
    setTool,
    clearAll,
    buildAtlas,
    consumeDirty,
    importTiles,
    exportTiles,
    burnDomElement,
    burnWorldText,
    drawVectorCommand,
    drawMark,
    worldToScreen,
    screenToWorld,
    getView,
    setView,
    centerView,
    render,
    getLatestInput: () => latestInput,
    CANVAS_W,
    CANVAS_H,
  };
}
