// =============================================================================
// gameManager.ts — registry + single-game enforcement.
//
// v1 scope: ONE live game per deployment at a time. The manager refuses a new
// launch while a game is active, hands out a unique 6-digit PIN, and frees the
// slot when a game closes (normal finish, host-grace expiry, or idle timeout).
// =============================================================================

import type { Server } from "socket.io";
import { Game, GameConfig } from "./game.js";
import { createGameRow } from "./persistence.js";
import type { ClientToServerEvents, ServerToClientEvents } from "./events.js";

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

export interface LaunchRequest {
  quizId: string;
  hostId: string;
  quizTitle: string;
  timeLimitSeconds: number;
  questions: GameConfig["questions"];
}

export interface LaunchResult {
  gameId: string;
  pin: string;
  hostToken: string;
}

export class GameManager {
  private readonly io: IO;
  // v1: a single active game. (Map keeps the door open but we enforce size 1.)
  private active: Game | null = null;

  private readonly maxPlayers: number;
  private readonly hostGraceSeconds: number;
  private readonly idleTimeoutSeconds: number;
  private readonly revealSeconds: number;

  constructor(
    io: IO,
    opts: {
      maxPlayers: number;
      hostGraceSeconds: number;
      idleTimeoutSeconds: number;
      revealSeconds: number;
    }
  ) {
    this.io = io;
    this.maxPlayers = opts.maxPlayers;
    this.hostGraceSeconds = opts.hostGraceSeconds;
    this.idleTimeoutSeconds = opts.idleTimeoutSeconds;
    this.revealSeconds = opts.revealSeconds;
  }

  hasActiveGame(): boolean {
    return this.active !== null;
  }

  getByPin(pin: string): Game | null {
    if (this.active && this.active.pin === pin) return this.active;
    return null;
  }

  getById(gameId: string): Game | null {
    if (this.active && this.active.gameId === gameId) return this.active;
    return null;
  }

  /**
   * Create a new game from an already-saved quiz. Refuses if a game is already
   * active (single-game enforcement). No PDF/text is involved here.
   */
  async launch(req: LaunchRequest): Promise<LaunchResult> {
    if (this.active) {
      throw new Error(
        "A game is already running on this deployment. End it before starting another."
      );
    }
    if (!req.questions || req.questions.length === 0) {
      throw new Error("This quiz has no valid questions to play.");
    }

    const gameId = cryptoRandomUuid();
    const pin = this.generatePin();
    const hostToken = cryptoRandomUuid() + cryptoRandomUuid();

    const cfg: GameConfig = {
      gameId,
      pin,
      quizId: req.quizId,
      hostId: req.hostId,
      hostToken,
      quizTitle: req.quizTitle,
      timeLimitSeconds: req.timeLimitSeconds,
      questions: req.questions,
      maxPlayers: this.maxPlayers,
      hostGraceSeconds: this.hostGraceSeconds,
      idleTimeoutSeconds: this.idleTimeoutSeconds,
      revealSeconds: this.revealSeconds,
    };

    const game = new Game(this.io, cfg);
    // When the game closes for any reason, free the single-game slot.
    game.onClosed = () => {
      if (this.active === game) this.active = null;
    };
    this.active = game;

    // Persist the games row (checkpoint at creation).
    await createGameRow({ id: gameId, quizId: req.quizId, hostId: req.hostId, pin });

    console.log(`[manager] launched game ${gameId} pin=${pin}`);
    return { gameId, pin, hostToken };
  }

  private generatePin(): string {
    // 6-digit numeric PIN, avoiding a collision with the (single) active game.
    for (let i = 0; i < 50; i++) {
      const pin = String(Math.floor(100000 + Math.random() * 900000));
      if (!this.active || this.active.pin !== pin) return pin;
    }
    // Fallback (practically unreachable with one active game).
    return String(Math.floor(100000 + Math.random() * 900000));
  }
}

// UUID without importing anything: prefer global crypto.randomUUID when present.
function cryptoRandomUuid(): string {
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  // Fallback v4-ish.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
