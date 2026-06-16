// =============================================================================
// scoring.ts — THE authoritative scoring + ranking logic.
//
// This formula is the single source of truth. The web app has an identical copy
// in web/src/lib/scoring.ts for display previews, but during a live game the
// VALUE PRODUCED HERE (using server-measured times) is authoritative.
// =============================================================================

/**
 * Compute points for a single answer.
 *
 * Rules (from the PRD, implemented exactly):
 *   - Max 10.0 points per question.
 *   - A wrong answer or no answer scores 0.
 *   - A correct answer scales by speed:
 *
 *         points = 10 * (1 - (timeTakenMs / timeLimitMs) * 0.5)
 *
 *     so an instant correct answer ≈ 10.0, and a correct answer right at the
 *     buzzer ≈ 5.0. Values in between are continuous (9.9, 8.4, 5.2, ...).
 *   - Result is rounded to 1 decimal place for display AND ranking.
 *
 * Timing is ALWAYS server-authoritative. timeTakenMs must be derived from the
 * server's round-start timestamp and the server's receive timestamp. A
 * client-sent timestamp may arrive as a hint but must never be passed in here.
 *
 * @param isCorrect     did the player pick the correct option (by identity)?
 * @param timeTakenMs   server-measured ms from round start to answer receipt
 * @param timeLimitMs   the configured per-question limit, in ms
 * @returns points rounded to 1 decimal place (0 for wrong/no answer)
 */
export function computePoints(
  isCorrect: boolean,
  timeTakenMs: number,
  timeLimitMs: number
): number {
  if (!isCorrect) return 0;
  if (timeLimitMs <= 0) return 0;

  // Clamp elapsed time into [0, timeLimitMs] so a slightly-late receive (within
  // the lock window) can never push points above 10 or below 5 for a correct
  // answer. Answers received AFTER lock are rejected upstream and never reach here.
  const clamped = Math.max(0, Math.min(timeTakenMs, timeLimitMs));
  const fraction = clamped / timeLimitMs; // 0 (instant) .. 1 (buzzer)
  const raw = 10 * (1 - fraction * 0.5); // 10.0 .. 5.0
  return roundTo1dp(raw);
}

/** Round to 1 decimal place (half-up), avoiding float display noise. */
export function roundTo1dp(n: number): number {
  return Math.round(n * 10) / 10;
}

// -----------------------------------------------------------------------------
// Ranking
// -----------------------------------------------------------------------------

export interface RankablePlayer {
  playerId: string;
  nickname: string;
  totalScore: number; // cumulative, already rounded per round
  totalTimeMs: number; // cumulative server-measured response time
}

export interface RankedPlayer extends RankablePlayer {
  rank: number;
}

/**
 * Rank players for the leaderboard.
 *
 * Ordering rules (defined so ordering is NEVER undefined):
 *   1. Higher cumulative score ranks higher.
 *   2. Tie-break: LOWER total response time ranks higher (faster overall).
 *   3. If score AND total time are still equal, the players SHARE the same rank
 *      (standard "competition ranking": equal entries get the same rank, and the
 *      next distinct entry skips ahead by the number of tied players).
 *
 * Within a shared-rank group we still return a stable order (by playerId) so the
 * array order is deterministic, but the `rank` number is identical for ties.
 */
export function rankPlayers(players: RankablePlayer[]): RankedPlayer[] {
  const sorted = [...players].sort((a, b) => {
    // 1. score desc
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    // 2. total time asc (faster is better)
    if (a.totalTimeMs !== b.totalTimeMs) return a.totalTimeMs - b.totalTimeMs;
    // 3. fully tied -> stable, deterministic order by id
    return a.playerId.localeCompare(b.playerId);
  });

  const ranked: RankedPlayer[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const prev = i > 0 ? sorted[i - 1] : null;

    let rank: number;
    if (
      prev &&
      prev.totalScore === p.totalScore &&
      prev.totalTimeMs === p.totalTimeMs
    ) {
      // Genuine tie on BOTH keys -> share the previous rank.
      rank = ranked[i - 1].rank;
    } else {
      // Competition ranking: rank = position (1-based), so ties cause skips.
      rank = i + 1;
    }
    ranked.push({ ...p, rank });
  }
  return ranked;
}
