// =============================================================================
// game.ts — the authoritative in-memory Game object + its state machine.
//
// One instance == one live game. It owns: the shuffled question deck, the player
// registry, the round lifecycle (broadcast -> countdown -> capture -> lock ->
// reveal -> score -> leaderboard -> advance), and all resilience behaviour
// (player reconnect, host grace, idle auto-close, capacity, late-join).
//
// Timing is server-authoritative throughout: round start is stamped here, and
// each answer's elapsed time is measured here from the server clock.
// =============================================================================

import type { Server } from "socket.io";
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  LobbyPlayer,
  LeaderboardRow,
  GamePhase,
} from "./events.js";
import { computePoints, rankPlayers, roundTo1dp } from "./scoring.js";
import { shuffled } from "./shuffle.js";
import { validateNickname, disambiguate } from "./nicknames.js";
import {
  upsertPlayer,
  checkpointRound,
  saveFinalResults,
  updateGameStatus,
} from "./persistence.js";

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

// ---- Internal data shapes (server-private) ----------------------------------

interface InternalOption {
  id: string;
  text: string;
}

interface InternalQuestion {
  questionId: string;
  text: string;
  type: "mcq" | "truefalse";
  options: InternalOption[]; // shuffled for this game
  correctOptionId: string; // tracked by identity, never by position
}

interface AnswerRecord {
  selectedOptionId: string | null;
  timeTakenMs: number | null; // server-measured
  pointsAwarded: number;
  receivedAt: number;
}

interface Player {
  playerId: string;
  nickname: string;
  resumeToken: string;
  socketId: string | null;
  connected: boolean;
  totalScore: number;
  totalTimeMs: number;
  // answers keyed by questionId, so idempotency is per player per round.
  answers: Map<string, AnswerRecord>;
}

export interface GameConfig {
  gameId: string;
  pin: string;
  quizId: string;
  hostId: string;
  hostToken: string;
  quizTitle: string;
  timeLimitSeconds: number;
  questions: Array<{
    questionId: string;
    text: string;
    type: "mcq" | "truefalse";
    options: InternalOption[];
    correctOptionId: string;
  }>;
  maxPlayers: number;
  hostGraceSeconds: number;
  idleTimeoutSeconds: number;
}

export class Game {
  readonly gameId: string;
  readonly pin: string;
  readonly quizId: string;
  readonly hostId: string;
  readonly hostToken: string;
  readonly quizTitle: string;
  readonly timeLimitMs: number;
  readonly maxPlayers: number;
  readonly hostGraceSeconds: number;
  readonly idleTimeoutSeconds: number;

  private readonly io: IO;
  private readonly deck: InternalQuestion[]; // shuffled question order
  private readonly players = new Map<string, Player>();

  private phase: GamePhase = "lobby";
  private currentIndex = -1; // -1 before start
  private roundId = ""; // unique per round; clients drop stale events
  private roundStartAt = 0; // server ms timestamp of current round start
  private roundLocked = false;

  // Timers
  private roundTimer: NodeJS.Timeout | null = null;
  private hostGraceTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;

  private hostSocketId: string | null = null;
  private hostConnected = false;
  private lastActivityAt = Date.now();

  // Called by the manager when the game fully closes (to free the slot).
  onClosed: (() => void) | null = null;

  constructor(io: IO, cfg: GameConfig) {
    this.io = io;
    this.gameId = cfg.gameId;
    this.pin = cfg.pin;
    this.quizId = cfg.quizId;
    this.hostId = cfg.hostId;
    this.hostToken = cfg.hostToken;
    this.quizTitle = cfg.quizTitle;
    this.timeLimitMs = cfg.timeLimitSeconds * 1000;
    this.maxPlayers = cfg.maxPlayers;
    this.hostGraceSeconds = cfg.hostGraceSeconds;
    this.idleTimeoutSeconds = cfg.idleTimeoutSeconds;

    // Build the deck: randomise QUESTION order, and randomise OPTION positions
    // within each question. Correctness travels with correctOptionId (identity).
    this.deck = shuffled(cfg.questions).map((q) => ({
      questionId: q.questionId,
      text: q.text,
      type: q.type,
      options: shuffled(q.options),
      correctOptionId: q.correctOptionId,
    }));

    this.resetIdleTimer();
  }

  // ---------------------------------------------------------------------------
  // Activity / idle auto-close — guarantees the deployment can never lock up.
  // ---------------------------------------------------------------------------
  private touch() {
    this.lastActivityAt = Date.now();
    this.resetIdleTimer();
  }

  private resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      console.warn(`[game ${this.pin}] idle timeout reached -> closing`);
      this.closeGracefully("This game was closed after a long period of inactivity.");
    }, this.idleTimeoutSeconds * 1000);
  }

  // ---------------------------------------------------------------------------
  // Host connection lifecycle
  // ---------------------------------------------------------------------------
  attachHost(socketId: string) {
    this.hostSocketId = socketId;
    const wasDisconnected = !this.hostConnected;
    this.hostConnected = true;

    if (this.hostGraceTimer) {
      clearTimeout(this.hostGraceTimer);
      this.hostGraceTimer = null;
    }

    // If the host returned mid-pause, resume.
    if (wasDisconnected && this.phase === "paused") {
      if (this._pausedFrom === "question") {
        // We were mid-question when the host dropped. Cleanly end that round
        // now (scoring only what was captured before the pause) and reveal, so
        // players aren't stranded on a frozen question. lockRound sets phase to
        // "reveal" and emits the reveal events itself.
        this.io.to(this.pin).emit("game:resumed", { phase: "reveal" });
        this.lockRound({ skipped: false });
        void updateGameStatus(this.gameId, "active");
      } else {
        this.phase = this.currentIndex < 0 ? "lobby" : "reveal";
        this.io.to(this.pin).emit("game:resumed", { phase: this.phase });
        void updateGameStatus(this.gameId, this.phase === "lobby" ? "lobby" : "active");
      }
    }
    this.touch();
    this.sendLobby();
  }

  /** Host socket dropped — pause and start the grace countdown. */
  handleHostDisconnect(socketId: string) {
    if (this.hostSocketId !== socketId) return;
    this.hostConnected = false;
    this.hostSocketId = null;

    if (this.phase === "finished") return;

    // Pause: timers hold, no new round. Freeze the live round timer if any.
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
    const prevPhase = this.phase;
    this.phase = "paused";
    void updateGameStatus(this.gameId, "paused");
    this.io.to(this.pin).emit("game:paused", {
      reason: "The host disconnected. Waiting for them to return…",
      graceSeconds: this.hostGraceSeconds,
    });

    // If they don't return within grace, end cleanly and save.
    this.hostGraceTimer = setTimeout(() => {
      console.warn(`[game ${this.pin}] host grace expired -> ending`);
      void this.endGame("paused-grace-expired");
    }, this.hostGraceSeconds * 1000);

    // Remember where we were so a resume restores the right phase.
    this._pausedFrom = prevPhase;
  }
  private _pausedFrom: GamePhase = "lobby";

  isHostToken(token: string) {
    return token === this.hostToken;
  }

  // ---------------------------------------------------------------------------
  // Player join / reconnect / kick
  // ---------------------------------------------------------------------------
  joinPlayer(
    socketId: string,
    rawNickname: string,
    resumeToken: string | undefined
  ):
    | { ok: true; playerId: string; nickname: string; resumeToken: string; phase: GamePhase }
    | { ok: false; error: string } {
    // Reconnect path: a known resume token resumes the same entry with score intact.
    if (resumeToken) {
      const existing = [...this.players.values()].find(
        (p) => p.resumeToken === resumeToken
      );
      if (existing) {
        existing.socketId = socketId;
        existing.connected = true;
        this.touch();
        this.sendLobby();
        return {
          ok: true,
          playerId: existing.playerId,
          nickname: existing.nickname,
          resumeToken: existing.resumeToken,
          phase: this.phase,
        };
      }
    }

    // Late join: no mid-game entry in v1.
    if (this.phase !== "lobby") {
      return {
        ok: false,
        error: "This game is already underway — you can't join mid-game.",
      };
    }

    // Capacity check (count distinct player entries).
    if (this.players.size >= this.maxPlayers) {
      return { ok: false, error: "This game is full. Please try another." };
    }

    const check = validateNickname(rawNickname);
    if (!check.ok) return { ok: false, error: check.error! };

    const taken = new Set([...this.players.values()].map((p) => p.nickname));
    const nickname = disambiguate(rawNickname.trim(), taken);

    const playerId = randomId();
    const newResume = randomId() + randomId();
    const player: Player = {
      playerId,
      nickname,
      resumeToken: newResume,
      socketId,
      connected: true,
      totalScore: 0,
      totalTimeMs: 0,
      answers: new Map(),
    };
    this.players.set(playerId, player);

    // Checkpoint 1: persist the player on join.
    void upsertPlayer({
      id: playerId,
      gameId: this.gameId,
      nickname,
      totalScore: 0,
      totalTimeMs: 0,
    });

    this.touch();
    this.sendLobby();
    return { ok: true, playerId, nickname, resumeToken: newResume, phase: this.phase };
  }

  markPlayerDisconnected(socketId: string) {
    const player = [...this.players.values()].find((p) => p.socketId === socketId);
    if (!player) return;
    player.connected = false;
    player.socketId = null;
    this.sendLobby();
    // We KEEP their entry + score so a reconnect resumes intact.
  }

  kickPlayer(playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;
    if (player.socketId) {
      this.io.to(player.socketId).emit("player:kicked", {
        reason: "You were removed from the game by the host.",
      });
    }
    this.players.delete(playerId);
    this.touch();
    this.sendLobby();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Game flow: start -> (question -> reveal)* -> finished
  // ---------------------------------------------------------------------------
  start(): { ok: boolean; error?: string } {
    if (this.phase !== "lobby") return { ok: false, error: "Game already started." };
    const connectedCount = [...this.players.values()].filter((p) => p.connected).length;
    if (this.players.size === 0 || connectedCount === 0) {
      return { ok: false, error: "You need at least one player to start." };
    }
    void updateGameStatus(this.gameId, "active", 0);
    this.advance(); // moves to the first question
    return { ok: true };
  }

  /** Host pressed Next (or Start). Moves to the next question or finishes. */
  advance(): { ok: boolean; error?: string } {
    if (this.phase === "paused")
      return { ok: false, error: "Game is paused (host reconnecting)." };
    if (this.phase === "finished")
      return { ok: false, error: "Game already finished." };

    this.currentIndex += 1;
    if (this.currentIndex >= this.deck.length) {
      void this.endGame("completed");
      return { ok: true };
    }
    this.beginRound();
    return { ok: true };
  }

  /** Host pressed Skip — no points awarded for this question; reveal then wait. */
  skip(): { ok: boolean; error?: string } {
    if (this.phase !== "question")
      return { ok: false, error: "Nothing to skip right now." };
    // Lock immediately with no scoring changes beyond whatever was captured...
    // but PRD says a skipped question awards NO points. So discard this round's
    // captured answers entirely and reveal with zero awarded.
    this.lockRound({ skipped: true });
    return { ok: true };
  }

  private beginRound() {
    const q = this.deck[this.currentIndex];
    this.phase = "question";
    this.roundLocked = false;
    this.roundId = `${this.gameId}:${this.currentIndex}:${randomId()}`;
    // Server-authoritative round start timestamp.
    this.roundStartAt = Date.now();

    // Clear any per-round transient state (answers are stored per player/question).
    this.broadcastQuestion(q);
    this.emitAnswersCount();

    // Countdown: lock when the timer expires.
    if (this.roundTimer) clearTimeout(this.roundTimer);
    this.roundTimer = setTimeout(() => {
      this.lockRound({ skipped: false });
    }, this.timeLimitMs);

    this.touch();
    void updateGameStatus(this.gameId, "active", this.currentIndex + 1);
  }

  private broadcastQuestion(q: InternalQuestion) {
    // Players + host all receive the question simultaneously (same room).
    const payload = {
      roundId: this.roundId,
      questionId: q.questionId,
      index: this.currentIndex,
      total: this.deck.length,
      text: q.text,
      type: q.type,
      options: q.options.map((o) => ({ id: o.id, text: o.text })),
      timeLimitSeconds: Math.round(this.timeLimitMs / 1000),
    };
    this.io.to(this.pin).emit("game:question", payload);
    if (this.hostSocketId) this.io.to(this.hostSocketId).emit("game:question", payload);
  }

  // ---------------------------------------------------------------------------
  // Answer capture — idempotent per player per round, server-timed.
  // ---------------------------------------------------------------------------
  submitAnswer(
    socketId: string,
    payload: { questionId: string; roundId: string; selectedOptionId: string }
  ): { ok: boolean; error?: string } {
    // Reject if not in an active, unlocked question.
    if (this.phase !== "question" || this.roundLocked) {
      return { ok: false, error: "This round is closed." };
    }
    // Drop stale/out-of-order rounds.
    if (payload.roundId !== this.roundId) {
      return { ok: false, error: "That question is no longer active." };
    }

    const player = [...this.players.values()].find((p) => p.socketId === socketId);
    if (!player) return { ok: false, error: "You're not in this game." };

    const q = this.deck[this.currentIndex];
    if (!q || q.questionId !== payload.questionId) {
      return { ok: false, error: "Question mismatch." };
    }

    // Idempotency: only the FIRST answer for this question counts; ignore repeats.
    if (player.answers.has(q.questionId)) {
      return { ok: true }; // silently accepted-but-ignored
    }

    // SERVER-AUTHORITATIVE timing. The client may send clientSentAt as a hint,
    // but we ignore it entirely and use our own measured elapsed time.
    const now = Date.now();
    const timeTakenMs = Math.max(0, now - this.roundStartAt);

    // Validate the option belongs to this question (by identity).
    const validOption = q.options.some((o) => o.id === payload.selectedOptionId);
    const selectedOptionId = validOption ? payload.selectedOptionId : null;

    const isCorrect = selectedOptionId === q.correctOptionId;
    const points = computePoints(isCorrect, timeTakenMs, this.timeLimitMs);

    player.answers.set(q.questionId, {
      selectedOptionId,
      timeTakenMs,
      pointsAwarded: points,
      receivedAt: now,
    });

    this.touch();
    this.emitAnswersCount();

    // Early lock: if every CONNECTED player has answered this question, lock now.
    const connected = [...this.players.values()].filter((p) => p.connected);
    const allAnswered =
      connected.length > 0 &&
      connected.every((p) => p.answers.has(q.questionId));
    if (allAnswered) {
      this.lockRound({ skipped: false });
    }

    return { ok: true };
  }

  private emitAnswersCount() {
    const q = this.deck[this.currentIndex];
    if (!q) return;
    const connected = [...this.players.values()].filter((p) => p.connected);
    const received = connected.filter((p) => p.answers.has(q.questionId)).length;
    const payload = {
      roundId: this.roundId,
      received,
      total: connected.length,
    };
    if (this.hostSocketId) this.io.to(this.hostSocketId).emit("game:answers_count", payload);
  }

  // ---------------------------------------------------------------------------
  // Lock + reveal + score
  // ---------------------------------------------------------------------------
  private lockRound(opts: { skipped: boolean }) {
    if (this.roundLocked) return;
    this.roundLocked = true;
    this.phase = "reveal";
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }

    const q = this.deck[this.currentIndex];

    // Apply scoring to cumulative totals. For a SKIPPED question, no points are
    // awarded to anyone (and we don't count time), per the PRD.
    const roundAnswers: Array<{
      playerId: string;
      selectedOptionId: string | null;
      timeTakenMs: number | null;
      pointsAwarded: number;
    }> = [];

    for (const player of this.players.values()) {
      const rec = player.answers.get(q.questionId);
      if (opts.skipped) {
        // Overwrite any captured record to zero so nothing is awarded.
        player.answers.set(q.questionId, {
          selectedOptionId: rec?.selectedOptionId ?? null,
          timeTakenMs: rec?.timeTakenMs ?? null,
          pointsAwarded: 0,
          receivedAt: rec?.receivedAt ?? Date.now(),
        });
        roundAnswers.push({
          playerId: player.playerId,
          selectedOptionId: rec?.selectedOptionId ?? null,
          timeTakenMs: null,
          pointsAwarded: 0,
        });
        continue;
      }

      if (rec) {
        player.totalScore = roundTo1dp(player.totalScore + rec.pointsAwarded);
        if (rec.timeTakenMs != null) player.totalTimeMs += rec.timeTakenMs;
        roundAnswers.push({
          playerId: player.playerId,
          selectedOptionId: rec.selectedOptionId,
          timeTakenMs: rec.timeTakenMs,
          pointsAwarded: rec.pointsAwarded,
        });
      } else {
        // No answer => 0 points, and we record a null answer for completeness.
        player.answers.set(q.questionId, {
          selectedOptionId: null,
          timeTakenMs: null,
          pointsAwarded: 0,
          receivedAt: Date.now(),
        });
        roundAnswers.push({
          playerId: player.playerId,
          selectedOptionId: null,
          timeTakenMs: null,
          pointsAwarded: 0,
        });
      }
    }

    // Build the leaderboard once, reuse for host + per-player ranks.
    const ranked = rankPlayers(
      [...this.players.values()].map((p) => ({
        playerId: p.playerId,
        nickname: p.nickname,
        totalScore: p.totalScore,
        totalTimeMs: p.totalTimeMs,
      }))
    );
    const leaderboard: LeaderboardRow[] = ranked.map((r) => ({
      rank: r.rank,
      playerId: r.playerId,
      nickname: r.nickname,
      totalScore: r.totalScore,
      totalTimeMs: r.totalTimeMs,
    }));

    // Reveal to host (full leaderboard).
    if (this.hostSocketId) {
      this.io.to(this.hostSocketId).emit("game:reveal_host", {
        roundId: this.roundId,
        questionId: q.questionId,
        correctOptionId: q.correctOptionId,
        leaderboard,
      });
    }

    // Reveal to each player (their own result + rank only).
    const rankByPlayer = new Map(ranked.map((r) => [r.playerId, r]));
    for (const player of this.players.values()) {
      if (!player.socketId) continue;
      const rec = player.answers.get(q.questionId);
      const mine = rankByPlayer.get(player.playerId)!;
      const isCorrect =
        !opts.skipped && rec?.selectedOptionId === q.correctOptionId;
      this.io.to(player.socketId).emit("game:reveal_player", {
        roundId: this.roundId,
        correct: !!isCorrect,
        correctOptionId: q.correctOptionId,
        selectedOptionId: rec?.selectedOptionId ?? null,
        pointsThisRound: opts.skipped ? 0 : rec?.pointsAwarded ?? 0,
        totalScore: player.totalScore,
        rank: mine.rank,
        playersCount: this.players.size,
      });
    }

    // Checkpoint 2: persist this round's answers + running totals.
    void checkpointRound({
      gameId: this.gameId,
      questionId: q.questionId,
      answers: roundAnswers,
      players: [...this.players.values()].map((p) => ({
        playerId: p.playerId,
        totalScore: p.totalScore,
        totalTimeMs: p.totalTimeMs,
      })),
      currentRound: this.currentIndex + 1,
    });

    this.touch();
  }

  // ---------------------------------------------------------------------------
  // End game
  // ---------------------------------------------------------------------------
  async endGame(reason: string): Promise<{ ok: boolean }> {
    if (this.phase === "finished") return { ok: true };
    this.phase = "finished";
    this.clearAllTimers();

    const ranked = rankPlayers(
      [...this.players.values()].map((p) => ({
        playerId: p.playerId,
        nickname: p.nickname,
        totalScore: p.totalScore,
        totalTimeMs: p.totalTimeMs,
      }))
    );
    const leaderboard: LeaderboardRow[] = ranked.map((r) => ({
      rank: r.rank,
      playerId: r.playerId,
      nickname: r.nickname,
      totalScore: r.totalScore,
      totalTimeMs: r.totalTimeMs,
    }));
    const podium = leaderboard.filter((r) => r.rank <= 3).slice(0, 3);

    this.io.to(this.pin).emit("game:finished", {
      podium,
      leaderboard,
      quizTitle: this.quizTitle,
    });
    if (this.hostSocketId) {
      this.io.to(this.hostSocketId).emit("game:finished", {
        podium,
        leaderboard,
        quizTitle: this.quizTitle,
      });
    }

    // Checkpoint 3: final results snapshot (survives quiz deletion).
    await saveFinalResults({
      gameId: this.gameId,
      hostId: this.hostId,
      quizTitle: this.quizTitle,
      ranking: ranked,
    });

    console.log(`[game ${this.pin}] finished (${reason})`);
    if (this.onClosed) this.onClosed();
    return { ok: true };
  }

  /** Hard close without a normal finish (idle/host-gone before any play). */
  private closeGracefully(message: string) {
    if (this.phase === "finished") return;
    // If a game was actually in progress, save results; otherwise just close.
    const hadPlay = this.currentIndex >= 0;
    this.io.to(this.pin).emit("game:closed", { reason: message });
    if (this.hostSocketId) this.io.to(this.hostSocketId).emit("game:closed", { reason: message });

    if (hadPlay) {
      void this.endGame("closed-gracefully");
    } else {
      this.phase = "finished";
      this.clearAllTimers();
      void updateGameStatus(this.gameId, "finished", undefined, true);
      if (this.onClosed) this.onClosed();
    }
  }

  private clearAllTimers() {
    if (this.roundTimer) clearTimeout(this.roundTimer);
    if (this.hostGraceTimer) clearTimeout(this.hostGraceTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.roundTimer = this.hostGraceTimer = this.idleTimer = null;
  }

  // ---------------------------------------------------------------------------
  // Lobby snapshot
  // ---------------------------------------------------------------------------
  private lobbyPlayers(): LobbyPlayer[] {
    return [...this.players.values()].map((p) => ({
      playerId: p.playerId,
      nickname: p.nickname,
      connected: p.connected,
    }));
  }

  sendLobby() {
    const payload = {
      pin: this.pin,
      players: this.lobbyPlayers(),
      phase: this.phase,
    };
    this.io.to(this.pin).emit("game:lobby", payload);
    if (this.hostSocketId) this.io.to(this.hostSocketId).emit("game:lobby", payload);
  }

  // ---------------------------------------------------------------------------
  // Accessors used by index.ts
  // ---------------------------------------------------------------------------
  getPhase(): GamePhase {
    return this.phase;
  }
  getLobbyPlayers(): LobbyPlayer[] {
    return this.lobbyPlayers();
  }
  hasPlayerSocket(socketId: string): boolean {
    return [...this.players.values()].some((p) => p.socketId === socketId);
  }
}

// Small URL-safe random id (no external dep). 9 chars from base36.
function randomId(): string {
  return Math.random().toString(36).slice(2, 11);
}
