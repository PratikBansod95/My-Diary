export function maskWord(word, guessed) {
  return word
    .split("")
    .map((ch) => (guessed.has(ch) ? ch : "_"))
    .join(" ");
}

export function isWon(word, guessed) {
  return word.split("").every((ch) => guessed.has(ch));
}

export const MAX_MISSES = 6;
