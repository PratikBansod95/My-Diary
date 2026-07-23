import { CANVAS_W, CANVAS_H } from "../shared/defaults.js";

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function extractJsonObject(text) {
  if (!text || typeof text !== "string") throw new Error("Empty model response");
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  const raw = fence ? fence[1].trim() : trimmed;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error("Model response was not valid JSON");
  }
}

export function normalizeCommands(payload) {
  const root = typeof payload === "string" ? extractJsonObject(payload) : payload;
  const list = Array.isArray(root) ? root : root?.commands;
  if (!Array.isArray(list)) throw new Error("Response missing commands array");

  const commands = [];
  for (const item of list.slice(0, 24)) {
    if (!item || typeof item !== "object") continue;
    const type = String(item.type || item.tool || "");
    const x = clamp(Math.round(num(item.x)), 0, CANVAS_W - 1);
    const y = clamp(Math.round(num(item.y)), 0, CANVAS_H - 1);

    if (type === "write_text") {
      const text = String(item.text || "").trim().slice(0, 4000);
      if (!text) continue;
      const fontSize = clamp(Math.round(num(item.fontSize, 48)), 18, 200);
      const maxWidth = clamp(Math.round(num(item.maxWidth, fontSize * 12)), fontSize, 2000);
      commands.push({ type, x, y, text, fontSize, maxWidth });
      continue;
    }
    if (type === "draw_formula") {
      const latex = String(item.latex || item.text || "").trim().slice(0, 2000);
      if (!latex) continue;
      const fontSize = clamp(Math.round(num(item.fontSize, 48)), 18, 200);
      commands.push({ type, x, y, latex, fontSize });
      continue;
    }
    if (type === "plot_function") {
      const expression = String(item.expression || item.expr || "").trim().slice(0, 200);
      if (!expression) continue;
      commands.push({
        type,
        x,
        y,
        w: clamp(Math.round(num(item.w, 480)), 120, 1400),
        h: clamp(Math.round(num(item.h, 320)), 100, 1000),
        expression,
        xMin: num(item.xMin, -5),
        xMax: num(item.xMax, 5),
      });
      continue;
    }
    if (type === "draw") {
      const items = Array.isArray(item.items) ? item.items.slice(0, 40) : [];
      const normalized = items
        .map((entry) => {
          const shape = String(entry.shape || entry.type || "line");
          const points = Array.isArray(entry.points)
            ? entry.points.map((p) => Math.round(num(p))).slice(0, 64)
            : [];
          return { shape, points };
        })
        .filter((entry) => entry.points.length >= 2);
      if (normalized.length) commands.push({ type, x, y, items: normalized });
      continue;
    }
    if (type === "erase") {
      const w = Math.round(num(item.w));
      const h = Math.round(num(item.h));
      if (w > 0 && h > 0) {
        commands.push({ type, x, y, w, h });
      } else if (Array.isArray(item.points) && item.points.length >= 4) {
        commands.push({
          type,
          points: item.points.map((p) => Math.round(num(p))).slice(0, 64),
          width: clamp(Math.round(num(item.width, 24)), 8, 80),
        });
      }
      continue;
    }
    // Soft-disable games for PenEcho-core milestone
    if (type === "start_game" || type === "place_mark" || type === "mark") continue;
  }
  return commands;
}

export function parseGameMove(payload, game) {
  const root = typeof payload === "string" ? extractJsonObject(payload) : payload;
  if (game === "tic_tac_toe") {
    const index = Number(root.move ?? root.index ?? root.cell);
    if (!Number.isInteger(index) || index < 0 || index > 8) {
      throw new Error("Invalid tic-tac-toe move");
    }
    return { index };
  }
  if (game === "hangman") {
    const word = String(root.word || root.move || "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 16);
    if (word.length < 3) throw new Error("Invalid hangman word");
    return { word };
  }
  throw new Error("Unknown game");
}

export { CANVAS_W, CANVAS_H } from "../shared/defaults.js";
