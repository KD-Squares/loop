// =============================================================================
// shuffle.ts — randomise question order and option positions PER GAME.
//
// Critical correctness rule: the correct answer is tracked BY IDENTITY
// (correct_option_id), never by position. Shuffling only reorders the array;
// it never touches which id is correct, so a shuffle can never corrupt scoring.
// =============================================================================

/** Fisher–Yates in-place shuffle on a copy. */
export function shuffled<T>(input: readonly T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
