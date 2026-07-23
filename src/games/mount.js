import {
  applyMove,
  createEmptyBoard,
  pickFallbackMove,
  winner,
} from "./tictactoe.js";
import { isWon, maskWord, MAX_MISSES } from "./hangman.js";
import { askDiary } from "../ai/client.js";

export function createGameMount({ root, canvasApp, getSettings, onStatus }) {
  const widgets = [];

  function sync() {
    for (const widget of widgets) {
      const screen = canvasApp.worldToScreen(widget._world.x, widget._world.y);
      widget.style.left = `${screen.x}px`;
      widget.style.top = `${screen.y}px`;
    }
  }

  function clear() {
    widgets.forEach((w) => w.remove());
    widgets.length = 0;
  }

  function serialize() {
    return widgets.map((w) => ({
      game: w._game,
      world: w._world,
      state: w._state,
    }));
  }

  async function mountFromCommand(cmd) {
    if (cmd.game === "tic_tac_toe") return mountTicTacToe(cmd.x, cmd.y);
    if (cmd.game === "hangman") return mountHangman(cmd.x, cmd.y);
  }

  function mountTicTacToe(x, y, saved) {
    const widget = document.createElement("div");
    widget.className = "game-widget";
    widget._game = "tic_tac_toe";
    widget._world = { x, y };
    widget._state = saved || {
      board: createEmptyBoard(),
      turn: "user",
      userMark: "X",
      diaryMark: "O",
      status: "Your move.",
    };

    function render() {
      const { board, status } = widget._state;
      const over = winner(board);
      widget.innerHTML = `<h3>Tic-tac-toe</h3><div class="ttt-board"></div><div class="game-status"></div>`;
      const boardEl = widget.querySelector(".ttt-board");
      const statusEl = widget.querySelector(".game-status");
      statusEl.textContent = over
        ? over === "draw"
          ? "A draw. The page is amused."
          : over === widget._state.userMark
            ? "You win."
            : "The diary wins."
        : status;
      board.forEach((mark, index) => {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "ttt-cell";
        cell.textContent = mark || "";
        cell.disabled = Boolean(mark) || Boolean(over) || widget._state.turn !== "user";
        cell.addEventListener("click", () => userMove(index));
        boardEl.appendChild(cell);
      });
    }

    async function userMove(index) {
      const next = applyMove(widget._state.board, index, widget._state.userMark);
      if (!next) return;
      widget._state.board = next;
      const over = winner(next);
      if (over) {
        widget._state.turn = "done";
        render();
        return;
      }
      widget._state.turn = "diary";
      widget._state.status = "The diary considers…";
      render();
      await diaryMove();
    }

    async function diaryMove() {
      let index = null;
      try {
        const data = await askDiary(
          {
            mode: "game_move",
            game: "tic_tac_toe",
            state: {
              board: widget._state.board,
              diaryMark: widget._state.diaryMark,
              userMark: widget._state.userMark,
            },
            schema: '{"move":0-8}',
          },
          getSettings()
        );
        index = data.move?.index;
      } catch {
        index = null;
      }
      if (index == null || widget._state.board[index]) {
        index = pickFallbackMove(widget._state.board);
      }
      const next = applyMove(widget._state.board, index, widget._state.diaryMark);
      if (next) widget._state.board = next;
      widget._state.turn = winner(widget._state.board) ? "done" : "user";
      widget._state.status = "Your move.";
      render();
    }

    render();
    root.appendChild(widget);
    widgets.push(widget);
    sync();
    onStatus?.("A game appears on the page.");
  }

  async function mountHangman(x, y, saved) {
    const widget = document.createElement("div");
    widget.className = "game-widget";
    widget._game = "hangman";
    widget._world = { x, y };
    widget._state = saved || {
      word: "",
      guessed: [],
      misses: 0,
      status: "Choosing a word…",
    };

    function guessedSet() {
      return new Set(widget._state.guessed);
    }

    function render() {
      const { word, misses, status } = widget._state;
      const guessed = guessedSet();
      const won = word && isWon(word, guessed);
      const lost = misses >= MAX_MISSES;
      widget.innerHTML = `
        <h3>Hangman</h3>
        <div class="hangman-word"></div>
        <div class="game-status"></div>
        <div class="hangman-keys"></div>
      `;
      widget.querySelector(".hangman-word").textContent = word
        ? maskWord(word, guessed)
        : "…";
      widget.querySelector(".game-status").textContent = won
        ? "You guessed it."
        : lost
          ? `The word was ${word}.`
          : `${status} · misses ${misses}/${MAX_MISSES}`;
      const keys = widget.querySelector(".hangman-keys");
      for (let i = 0; i < 26; i++) {
        const ch = String.fromCharCode(65 + i);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = ch;
        btn.disabled = !word || guessed.has(ch) || won || lost;
        btn.addEventListener("click", () => guess(ch));
        keys.appendChild(btn);
      }
    }

    function guess(ch) {
      if (widget._state.guessed.includes(ch)) return;
      widget._state.guessed.push(ch);
      if (!widget._state.word.includes(ch)) widget._state.misses += 1;
      widget._state.status = "Your guess.";
      render();
    }

    render();
    root.appendChild(widget);
    widgets.push(widget);
    sync();

    if (!widget._state.word) {
      try {
        const data = await askDiary({ mode: "hangman_word" }, getSettings());
        widget._state.word = String(data.word || "SHADOW").toUpperCase();
      } catch {
        widget._state.word = "SHADOW";
      }
      widget._state.status = "Guess a letter.";
      render();
    }
    onStatus?.("Hangman waits for a letter.");
  }

  function restore(list) {
    clear();
    for (const entry of list || []) {
      if (entry.game === "tic_tac_toe") mountTicTacToe(entry.world.x, entry.world.y, entry.state);
      if (entry.game === "hangman") mountHangman(entry.world.x, entry.world.y, entry.state);
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
  };
}
