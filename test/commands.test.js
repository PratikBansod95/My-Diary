import assert from "node:assert/strict";
import test from "node:test";
import { extractJsonObject, normalizeCommands, parseGameMove } from "../src/ai/commands.js";
import { availableMoves, applyMove, winner } from "../src/games/tictactoe.js";
import { maskWord, isWon } from "../src/games/hangman.js";

test("extractJsonObject handles fenced JSON", () => {
  const obj = extractJsonObject('```json\n{"commands":[]}\n```');
  assert.deepEqual(obj, { commands: [] });
});

test("normalizeCommands validates write_text and games", () => {
  const commands = normalizeCommands({
    commands: [
      { type: "write_text", x: 10, y: 20, text: "Hello" },
      { type: "start_game", x: 1, y: 2, game: "tic_tac_toe" },
      { type: "write_text", x: -5, y: 999999, text: "" },
    ],
  });
  assert.equal(commands.length, 2);
  assert.equal(commands[0].text, "Hello");
  assert.equal(commands[1].game, "tic_tac_toe");
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
