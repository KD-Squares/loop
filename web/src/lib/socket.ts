// =============================================================================
// socket.ts — browser Socket.IO client wrapper (typed against the server's
// event contract). Used by the host game screen and the player screens.
// =============================================================================

"use client";

import { io, Socket } from "socket.io-client";
import { PUBLIC_ENV } from "@/lib/env";
import type {
  PublicQuestion,
  LobbyPlayer,
  LeaderboardRow,
  PlayerRoundResult,
  GamePhase,
} from "@/lib/types";

// Server -> client events the browser listens for.
export interface ServerToClientEvents {
  "game:lobby": (p: { pin: string; players: LobbyPlayer[]; phase: GamePhase }) => void;
  "game:question": (p: PublicQuestion) => void;
  "game:answers_count": (p: { roundId: string; received: number; total: number }) => void;
  "game:reveal_host": (p: {
    roundId: string;
    questionId: string;
    correctOptionId: string;
    leaderboard: LeaderboardRow[];
    nextInSeconds: number;
    isLast: boolean;
  }) => void;
  "game:reveal_player": (p: PlayerRoundResult & { nextInSeconds: number }) => void;
  "game:finished": (p: {
    podium: LeaderboardRow[];
    leaderboard: LeaderboardRow[];
    quizTitle: string;
  }) => void;
  "game:finished_player": (p: {
    rank: number;
    totalScore: number;
    playersCount: number;
    quizTitle: string;
  }) => void;
  "game:paused": (p: { reason: string; graceSeconds: number }) => void;
  "game:resumed": (p: { phase: GamePhase }) => void;
  "player:kicked": (p: { reason: string }) => void;
  "game:closed": (p: { reason: string }) => void;
  "game:error": (p: { message: string }) => void;
}

// Client -> server events the browser emits.
export interface ClientToServerEvents {
  "host:join": (p: { gameId: string; hostToken: string }, ack: (r: any) => void) => void;
  "host:start": (ack: (r: any) => void) => void;
  "host:next": (ack: (r: any) => void) => void;
  "host:skip": (ack: (r: any) => void) => void;
  "host:end": (ack: (r: any) => void) => void;
  "host:kick": (p: { playerId: string }, ack: (r: any) => void) => void;
  "player:join": (
    p: { pin: string; nickname: string; resumeToken?: string },
    ack: (r: any) => void
  ) => void;
  "player:answer": (
    p: {
      questionId: string;
      roundId: string;
      selectedOptionId: string;
      clientSentAt?: number;
    },
    ack: (r: any) => void
  ) => void;
}

export type LoopSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function connectSocket(): LoopSocket {
  return io(PUBLIC_ENV.socketUrl, {
    // Prefer WebSocket, but allow long-polling as a fallback. Mobile networks
    // and some proxies block or drop pure WebSocket connections; without a
    // fallback the player can appear connected yet fail to send answers.
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
  });
}
