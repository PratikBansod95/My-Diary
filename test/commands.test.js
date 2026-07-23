import assert from "node:assert/strict";
import test from "node:test";
import { extractJsonObject, normalizeCommands, parseGameMove } from "../src/ai/commands.js";
import { availableMoves, applyMove, winner } from "../src/games/tictactoe.js";
import { maskWord, isWon } from "../src/games/hangman.js";

test("extractJsonObject handles fenced JSON", () => {
  const obj = extractJsonObject('```json\n{"commands":[]}\n```');
  assert.deepEqual(obj, { commands: [] });
});

test("normalizeCommands keeps drafts and soft-disables games", () => {
  const commands = normalizeCommands({
    commands: [
      { type: "write_text", x: 10, y: 20, text: "Hello", fontSize: 40, maxWidth: 400 },
      { type: "start_game", x: 1, y: 2, game: "tic_tac_toe" },
      { type: "place_mark", x: 50, y: 60, symbol: "O", size: 70 },
      { type: "plot_function", x: 0, y: 0, expression: "sin(x)", w: 400, h: 200 },
      { type: "erase", x: 10, y: 10, w: 50, h: 50 },
      { type: "write_text", x: -5, y: 999999, text: "" },
    ],
  });
  assert.equal(commands.length, 3);
  assert.equal(commands[0].text, "Hello");
  assert.equal(commands[0].fontSize, 40);
  assert.equal(commands[1].type, "plot_function");
  assert.equal(commands[2].type, "erase");
});

test("parseGameMove tic-tac-toe", () => {
  assert.deepEqual(parseGameMove('{"move":4}', "tic_tac_toe"), { index: 4 });
});

test("tic-tac-toe rules", () => {
  let board = Array(9).fill(null);
  board = applyMove(board, 0, "X");
  board = applyMove(board, 1, "X");
  board = applyMove(board, 2, "X");
  assert.equal(winner(board), "X");
  assert.deepEqual(availableMoves(Array(9).fill(null)).length, 9);
});

test("hangman mask", () => {
  const guessed = new Set(["A"]);
  assert.equal(maskWord("CAT", guessed), "_ A _");
  assert.equal(isWon("AA", new Set(["A"])), true);
});
