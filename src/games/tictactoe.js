export function createEmptyBoard() {
  return Array(9).fill(null);
}

export function availableMoves(board) {
  return board.map((v, i) => (v ? null : i)).filter((v) => v !== null);
}

export function winner(board) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  if (board.every(Boolean)) return "draw";
  return null;
}

export function applyMove(board, index, mark) {
  if (index < 0 || index > 8 || board[index]) return null;
  const next = board.slice();
  next[index] = mark;
  return next;
}

/** Local fallback if the model returns an illegal move */
export function pickFallbackMove(board) {
  const moves = availableMoves(board);
  return moves.length ? moves[Math.floor(Math.random() * moves.length)] : null;
}
