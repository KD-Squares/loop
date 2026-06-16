// =============================================================================
// persistence.ts — DB checkpoints via the service-role client.
//
// Source-of-truth rule: during a live game the in-memory Game object is
// authoritative. We checkpoint to Postgres at three moments so a crash loses at
// most the current round:
//   1. player join
//   2. end of each round
//   3. end of game
//
// All writes are best-effort and never block gameplay: a failed checkpoint logs
// and continues, because the in-memory state remains correct.
// =============================================================================

import { getAdmin } from "./supabaseAdmin.js";
import type { RankedPlayer } from "./scoring.js";

export async function createGameRow(row: {
  id: string;
  quizId: string;
  hostId: string;
  pin: string;
}): Promise<void> {
  try {
    const admin = getAdmin();
    const { error } = await admin.from("games").insert({
      id: row.id,
      quiz_id: row.quizId,
      host_id: row.hostId,
      pin: row.pin,
      status: "lobby",
      current_round: 0,
    });
    if (error) console.error("[persistence] createGameRow:", error.message);
  } catch (e) {
    console.error("[persistence] createGameRow threw:", e);
  }
}

export async function updateGameStatus(
  gameId: string,
  status: "lobby" | "active" | "paused" | "finished",
  currentRound?: number,
  endedAt?: boolean
): Promise<void> {
  try {
    const admin = getAdmin();
    const patch: Record<string, unknown> = { status };
    if (typeof currentRound === "number") patch.current_round = currentRound;
    if (endedAt) patch.ended_at = new Date().toISOString();
    const { error } = await admin.from("games").update(patch).eq("id", gameId);
    if (error) console.error("[persistence] updateGameStatus:", error.message);
  } catch (e) {
    console.error("[persistence] updateGameStatus threw:", e);
  }
}

/** Checkpoint 1: upsert a player on join (so a reconnect keeps their row). */
export async function upsertPlayer(player: {
  id: string;
  gameId: string;
  nickname: string;
  totalScore: number;
  totalTimeMs: number;
}): Promise<void> {
  try {
    const admin = getAdmin();
    const { error } = await admin.from("game_players").upsert(
      {
        id: player.id,
        game_id: player.gameId,
        nickname: player.nickname,
        total_score: player.totalScore,
        total_time_ms: player.totalTimeMs,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (error) console.error("[persistence] upsertPlayer:", error.message);
  } catch (e) {
    console.error("[persistence] upsertPlayer threw:", e);
  }
}

/** Checkpoint 2: persist a round's answers and the running player totals. */
export async function checkpointRound(input: {
  gameId: string;
  questionId: string;
  answers: Array<{
    playerId: string;
    selectedOptionId: string | null;
    timeTakenMs: number | null;
    pointsAwarded: number;
  }>;
  players: Array<{
    playerId: string;
    totalScore: number;
    totalTimeMs: number;
  }>;
  currentRound: number;
}): Promise<void> {
  try {
    const admin = getAdmin();

    if (input.answers.length > 0) {
      const rows = input.answers.map((a) => ({
        game_id: input.gameId,
        question_id: input.questionId,
        player_id: a.playerId,
        selected_option_id: a.selectedOptionId,
        time_taken_ms: a.timeTakenMs,
        points_awarded: a.pointsAwarded,
      }));
      // Idempotent: the unique index (game,question,player) means a re-run of the
      // same checkpoint will not duplicate rows.
      const { error } = await admin
        .from("answers")
        .upsert(rows, { onConflict: "game_id,question_id,player_id" });
      if (error) console.error("[persistence] checkpointRound answers:", error.message);
    }

    for (const p of input.players) {
      const { error } = await admin
        .from("game_players")
        .update({
          total_score: p.totalScore,
          total_time_ms: p.totalTimeMs,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", p.playerId);
      if (error) console.error("[persistence] checkpointRound player:", error.message);
    }

    await updateGameStatus(input.gameId, "active", input.currentRound);
  } catch (e) {
    console.error("[persistence] checkpointRound threw:", e);
  }
}

/** Checkpoint 3: write the final result snapshot (survives quiz deletion). */
export async function saveFinalResults(input: {
  gameId: string;
  hostId: string;
  quizTitle: string;
  ranking: RankedPlayer[];
}): Promise<void> {
  try {
    const admin = getAdmin();

    await admin
      .from("games")
      .update({ status: "finished", ended_at: new Date().toISOString() })
      .eq("id", input.gameId);

    const { error } = await admin.from("game_results").insert({
      game_id: input.gameId,
      host_id: input.hostId,
      quiz_title_snapshot: input.quizTitle,
      finished_at: new Date().toISOString(),
      ranking: input.ranking.map((r) => ({
        rank: r.rank,
        nickname: r.nickname,
        total_score: r.totalScore,
        total_time_ms: r.totalTimeMs,
      })),
    });
    if (error) console.error("[persistence] saveFinalResults:", error.message);
  } catch (e) {
    console.error("[persistence] saveFinalResults threw:", e);
  }
}
