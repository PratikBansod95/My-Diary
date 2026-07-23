import {
  applyMove,
  createEmptyBoard,
  pickFallbackMove,
  winner,
} from "./tictactoe.js";
import { isWon, maskWord, MAX_MISSES } from "./hangman.js";
import { askDiary } from "../ai/client.js";

const DEFAULT_CELL = 140;

/**
 * Play only as ink on the parchment.
 * Never mounts a card, modal, or button grid — only invisible hit targets over the page.
 */
export function createGameMount({ root, canvasApp, onStatus, onInkWhisper, onChanged }) {
  let session = null;
  const hitLayer = document.createElement("div");
  hitLayer.className = "parchment-hits";
  root.appendChild(hitLayer);

  function notify() {
    onChanged?.();
  }

  function isActive() {
    return Boolean(session && session.turn !== "done" && session.turn !== "idle");
  }

  function clearHits() {
    hitLayer.innerHTML = "";
  }

  function clear() {
    clearHits();
    session = null;
  }

  function cellCenter(index, originX, originY, cell) {
    const col = index % 3;
    const row = Math.floor(index / 3);
    return {
      x: originX + col * cell + cell / 2,
      y: originY + row * cell + cell / 2,
    };
  }

  /** Only when the page is empty and they asked to play — never over their own grid. */
  function drawGrid(originX, originY, cell) {
    const size = cell * 3;
    const lines = [];
    for (let i = 1; i <= 2; i++) {
      const o = i * cell;
      lines.push({ shape: "line", points: [originX + o, originY, originX + o, originY + size] });
      lines.push({ shape: "line", points: [originX, originY + o, originX + size, originY + o] });
    }
    canvasApp.drawVectorCommand({ x: 0, y: 0, items: lines });
  }

  function whisper(text, x, y, fontSize = 48) {
    onInkWhisper?.(text, x, y, fontSize);
    onStatus?.(text);
  }

  function sync() {
    if (!session || session.game !== "tic_tac_toe") return;
    const { originX, originY, cell } = session;
    const buttons = [...hitLayer.querySelectorAll(".parchment-cell")];
    buttons.forEach((btn, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const topLeft = canvasApp.worldToScreen(originX + col * cell, originY + row * cell);
      const bottomRight = canvasApp.worldToScreen(
        originX + (col + 1) * cell,
        originY + (row + 1) * cell
      );
      btn.style.left = `${topLeft.x}px`;
      btn.style.top = `${topLeft.y}px`;
      btn.style.width = `${Math.max(28, bottomRight.x - topLeft.x)}px`;
      btn.style.height = `${Math.max(28, bottomRight.y - topLeft.y)}px`;
    });
  }

  function buildTttHits() {
    clearHits();
    for (let i = 0; i < 9; i++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "parchment-cell";
      btn.setAttribute("aria-label", `Square ${i + 1}`);
      btn.addEventListener("pointerdown", (event) => {
        // Stop the pen/pan from eating the tap on the page
        event.preventDefault();
        event.stopPropagation();
      });
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void userTttMove(i);
      });
      hitLayer.appendChild(btn);
    }
    sync();
  }

  /**
   * @param {object} [saved]
   * @param {boolean} [saved.existingInk] — user already drew the board; do not draw a second grid
   */
  async function mountTicTacToe(x, y, saved) {
    clearHits();
    const cell = saved?.cell || DEFAULT_CELL;
    const originX = Math.round(saved?.originX ?? x);
    const originY = Math.round(saved?.originY ?? y);
    const board = saved?.board || createEmptyBoard();
    const existingInk = Boolean(saved?.existingInk);

    session = {
      game: "tic_tac_toe",
      originX,
      originY,
      cell,
      board,
      turn: saved?.turn || "user",
      userMark: "X",
      diaryMark: "O",
      existingInk,
    };

    if (!existingInk && !saved?.board) {
      drawGrid(originX, originY, cell);
      whisper(
        "Your move — touch a square. I answer in ink.",
        originX,
        originY + cell * 3 + 40,
        Math.round(cell * 0.28)
      );
    } else if (existingInk) {
      whisper(
        "I see your board. Touch a square — my mark appears in ink.",
        originX,
        originY + cell * 3 + 28,
        Math.round(cell * 0.26)
      );
    }

    if (session.turn === "user" || session.turn === "diary") {
      buildTttHits();
      onStatus?.("Touch a square on the page.");
    }

    // Redraw saved marks only if tiles were cleared (rare)
    if (saved?.board && !existingInk) {
      board.forEach((mark, index) => {
        if (!mark) return;
        const c = cellCenter(index, originX, originY, cell);
        canvasApp.drawMark(mark, c.x, c.y, cell * 0.55);
      });
    }

    notify();
  }

  async function userTttMove(index) {
    if (!session || session.game !== "tic_tac_toe") return;
    if (session.turn !== "user") return;
    const next = applyMove(session.board, index, session.userMark);
    if (!next) return;

    session.board = next;
    session.turn = "diary";
    const c = cellCenter(index, session.originX, session.originY, session.cell);
    canvasApp.drawMark(session.userMark, c.x, c.y, session.cell * 0.55);

    const over = winner(next);
    if (over) {
      session.turn = "done";
      clearHits();
      endTtt(over);
      notify();
      return;
    }

    onStatus?.("…");
    notify();
    await diaryTttMove();
  }

  async function diaryTttMove() {
    if (!session || session.game !== "tic_tac_toe") return;
    let index = null;
    try {
      const data = await askDiary({
        mode: "game_move",
        game: "tic_tac_toe",
        state: {
          board: session.board,
          diaryMark: session.diaryMark,
          userMark: session.userMark,
        },
        schema: '{"move":0-8}',
      });
      index = data.move?.index;
    } catch {
      index = null;
    }
    if (index == null || session.board[index]) {
      index = pickFallbackMove(session.board);
    }
    if (index == null) {
      session.turn = "done";
      clearHits();
      notify();
      return;
    }

    const next = applyMove(session.board, index, session.diaryMark);
    if (!next) {
      session.turn = "user";
      notify();
      return;
    }
    session.board = next;
    const c = cellCenter(index, session.originX, session.originY, session.cell);
    canvasApp.drawMark(session.diaryMark, c.x, c.y, session.cell * 0.55);

    const over = winner(session.board);
    if (over) {
      session.turn = "done";
      clearHits();
      endTtt(over);
      notify();
      return;
    }
    session.turn = "user";
    onStatus?.("Your turn.");
    notify();
  }

  function endTtt(over) {
    const { originX, originY, cell, userMark } = session;
    const y = originY + cell * 3 + 100;
    if (over === "draw") {
      whisper("A draw. The marks stay.", originX, y, Math.round(cell * 0.28));
    } else if (over === userMark) {
      whisper("You win. I felt that.", originX, y, Math.round(cell * 0.28));
    } else {
      whisper("I take this one. Again, whenever you like.", originX, y, Math.round(cell * 0.28));
    }
  }

  async function mountHangman(x, y, saved) {
    clearHits();
    let word = saved?.word || "";
    if (!word) {
      try {
        const data = await askDiary({ mode: "hangman_word" });
        word = String(data.word || "SHADOW").toUpperCase();
      } catch {
        word = "SHADOW";
      }
    }

    const fontSize = 56;
    const originX = Math.round(saved?.originX ?? x);
    const originY = Math.round(saved?.originY ?? y);

    session = {
      game: "hangman",
      originX,
      originY,
      word,
      guessed: saved?.guessed || [],
      misses: saved?.misses || 0,
      turn: saved?.turn || "user",
      fontSize,
      blankGap: fontSize * 1.1,
    };

    if (!saved?.word) {
      drawHangmanBlanks();
      whisper(
        "A word hides here. Choose a letter.",
        originX,
        originY - fontSize * 1.3,
        Math.round(fontSize * 0.5)
      );
    }

    if (session.turn !== "done") {
      buildHangmanKeys();
      onStatus?.("Choose a letter.");
    }
    notify();
  }

  function drawHangmanBlanks() {
    if (!session || session.game !== "hangman") return;
    const { word, originX, originY, fontSize, blankGap } = session;
    const items = word.split("").map((_, i) => {
      const bx = originX + i * blankGap;
      return {
        shape: "line",
        points: [bx, originY + fontSize, bx + fontSize * 0.85, originY + fontSize],
      };
    });
    canvasApp.drawVectorCommand({ x: 0, y: 0, items });
  }

  function revealHangmanLetter(ch) {
    if (!session || session.game !== "hangman") return;
    session.word.split("").forEach((letter, i) => {
      if (letter !== ch) return;
      const bx = session.originX + i * session.blankGap;
      canvasApp.burnWorldText(letter, bx, session.originY, { fontSize: session.fontSize * 0.9 });
    });
  }

  function buildHangmanKeys() {
    clearHits();
    const bar = document.createElement("div");
    bar.className = "parchment-letterbar";
    for (let i = 0; i < 26; i++) {
      const ch = String.fromCharCode(65 + i);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "parchment-letter";
      btn.textContent = ch;
      btn.disabled = session.guessed.includes(ch);
      btn.addEventListener("click", () => hangmanGuess(ch));
      bar.appendChild(btn);
    }
    hitLayer.appendChild(bar);
  }

  function hangmanGuess(ch) {
    if (!session || session.game !== "hangman" || session.turn === "done") return;
    if (session.guessed.includes(ch)) return;
    session.guessed.push(ch);
    const hit = session.word.includes(ch);
    if (!hit) session.misses += 1;
    else revealHangmanLetter(ch);

    buildHangmanKeys();
    const guessed = new Set(session.guessed);
    if (isWon(session.word, guessed)) {
      session.turn = "done";
      clearHits();
      whisper("You found it.", session.originX, session.originY + session.fontSize * 2, 44);
      notify();
      return;
    }
    if (session.misses >= MAX_MISSES) {
      session.turn = "done";
      clearHits();
      whisper(
        `It was ${session.word}.`,
        session.originX,
        session.originY + session.fontSize * 2,
        44
      );
      notify();
      return;
    }
    onStatus?.(hit ? maskWord(session.word, guessed) : `Miss ${session.misses}/${MAX_MISSES}`);
    notify();
  }

  /**
   * Prefer the user's drawn board (anchor) over inventing a clean digital grid.
   */
  async function mountFromCommand(cmd, anchor = null) {
    if (cmd.game === "tic_tac_toe") {
      if (anchor && (anchor.w || 0) > 60 && (anchor.h || 0) > 60) {
        const side = Math.max(anchor.w, anchor.h);
        const cell = Math.max(72, Math.round(side / 3));
        const boardSize = cell * 3;
        const originX = Math.round(anchor.x + ((anchor.w || boardSize) - boardSize) / 2);
        const originY = Math.round(anchor.y + ((anchor.h || boardSize) - boardSize) / 2);
        return mountTicTacToe(originX, originY, {
          board: createEmptyBoard(),
          turn: "user",
          originX,
          originY,
          cell,
          existingInk: true,
        });
      }
      const x = Math.round(cmd.x || 400);
      const y = Math.round(cmd.y || 400);
      return mountTicTacToe(x, y);
    }
    if (cmd.game === "hangman") {
      const x = Math.round(anchor?.x ?? cmd.x ?? 400);
      const y = Math.round((anchor?.y ?? cmd.y ?? 400) + (anchor?.h || 0) + 40);
      return mountHangman(x, y);
    }
  }

  function serialize() {
    if (!session) return [];
    if (session.game === "tic_tac_toe") {
      return [
        {
          game: "tic_tac_toe",
          world: { x: session.originX, y: session.originY },
          state: {
            board: session.board,
            turn: session.turn,
            originX: session.originX,
            originY: session.originY,
            cell: session.cell,
            existingInk: session.existingInk,
          },
        },
      ];
    }
    if (session.game === "hangman") {
      return [
        {
          game: "hangman",
          world: { x: session.originX, y: session.originY },
          state: {
            word: session.word,
            guessed: session.guessed,
            misses: session.misses,
            turn: session.turn,
            originX: session.originX,
            originY: session.originY,
          },
        },
      ];
    }
    return [];
  }

  function restore(list) {
    clear();
    const entry = (list || [])[0];
    if (!entry) return;
    if (entry.game === "tic_tac_toe") {
      void mountTicTacToe(entry.world.x, entry.world.y, {
        ...entry.state,
        // Never redraw a plastic grid over restored ink pages
        existingInk: true,
      });
    }
    if (entry.game === "hangman") {
      void mountHangman(entry.world.x, entry.world.y, entry.state);
    }
  }

  return {
    mountFromCommand,
    mountTicTacToe,
    mountHangman,
    sync,
    clear,
    serialize,
    restore,
    isActive,
  };
}
