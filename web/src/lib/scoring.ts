// =============================================================================
// scoring.ts — display-side MIRROR of the server's authoritative scoring.
//
// This exists ONLY so the host UI can show a representative preview/explanation.
// During a live game the realtime server's value (computed from server-measured
// times) is authoritative — never trust a client-computed score.
//
// Keep this in lockstep with server/src/scoring.ts.
// =============================================================================

/** points = 10 * (1 - (timeTakenMs / timeLimitMs) * 0.5); 0 if wrong. */
export function computePoints(
  isCorrect: boolean,
  timeTakenMs: number,
  timeLimitMs: number
): number {
  if (!isCorrect) return 0;
  if (timeLimitMs <= 0) return 0;
  const clamped = Math.max(0, Math.min(timeTakenMs, timeLimitMs));
  const fraction = clamped / timeLimitMs;
  return roundTo1dp(10 * (1 - fraction * 0.5));
}

export function roundTo1dp(n: number): number {
  return Math.round(n * 10) / 10;
}
