// =============================================================================
// events.ts — the typed Socket.IO event contract.
//
// This is the single source of truth for the shape of every realtime message.
// The web client mirrors these types in web/src/lib/types.ts. Keep them in sync.
//
// Naming convention:
//   host:*   events the host emits / receives
//   player:* events a player emits / receives
//   game:*   broadcast game-state events
// =============================================================================

// ---- Public data shapes shared with clients ---------------------------------

export interface PublicOption {
  id: string;
  text: string;
  // shape/colour are assigned by the client from the option's position in the
  // (already shuffled) array; we only send identity + text here.
}

export interface PublicQuestion {
  questionId: string;
  index: number; // 0-based position in this game's shuffled order
  total: number; // total questions in the quiz
  text: string;
  type: "mcq" | "truefalse";
  options: PublicOption[]; // already shuffled for this game
  timeLimitSeconds: number;
}

export interface LobbyPlayer {
  playerId: string;
  nickname: string;
  connected: boolean;
}

export interface LeaderboardRow {
  rank: number;
  playerId: string;
  nickname: string;
  totalScore: number; // rounded to 1dp
  totalTimeMs: number;
}

export interface PlayerRoundResult {
  correct: boolean;
  correctOptionId: string;
  selectedOptionId: string | null;
  pointsThisRound: number; // rounded to 1dp
  totalScore: number; // rounded to 1dp
  rank: number;
  playersCount: number;
}

export type GamePhase =
  | "lobby"
  | "question" // a question is live, timer running
  | "reveal" // answer revealed, waiting for host to advance
  | "paused" // host disconnected
  | "finished";

// ---- Client -> Server events ------------------------------------------------

export interface ClientToServerEvents {
  // Host creates/attaches to a game it already created via the web API.
  "host:join": (
    payload: { gameId: string; hostToken: string },
    ack: (res: HostJoinAck) => void
  ) => void;

  "host:start": (ack: (res: SimpleAck) => void) => void;
  "host:next": (ack: (res: SimpleAck) => void) => void;
  "host:skip": (ack: (res: SimpleAck) => void) => void;
  "host:end": (ack: (res: SimpleAck) => void) => void;
  "host:kick": (
    payload: { playerId: string },
    ack: (res: SimpleAck) => void
  ) => void;

  // Player joins a lobby with a PIN + nickname.
  "player:join": (
    payload: { pin: string; nickname: string; resumeToken?: string },
    ack: (res: PlayerJoinAck) => void
  ) => void;

  // Player submits an answer for the current round.
  "player:answer": (
    payload: {
      questionId: string;
      roundId: string;
      selectedOptionId: string;
      clientSentAt?: number; // hint only — NEVER trusted for scoring
    },
    ack: (res: SimpleAck) => void
  ) => void;
}

// ---- Server -> Client events ------------------------------------------------

export interface ServerToClientEvents {
  // Lobby roster updates (host + players).
  "game:lobby": (payload: {
    pin: string;
    players: LobbyPlayer[];
    phase: GamePhase;
  }) => void;

  // A new question begins. roundId lets clients drop stale events.
  "game:question": (payload: PublicQuestion & { roundId: string }) => void;

  // Live tick of how many answers received (host display).
  "game:answers_count": (payload: {
    roundId: string;
    received: number;
    total: number;
  }) => void;

  // Answer revealed. Host gets full leaderboard; players get their own result.
  // nextInSeconds tells clients how long until the game auto-advances.
  "game:reveal_host": (payload: {
    roundId: string;
    questionId: string;
    correctOptionId: string;
    leaderboard: LeaderboardRow[];
    nextInSeconds: number;
    isLast: boolean;
  }) => void;

  "game:reveal_player": (
    payload: PlayerRoundResult & { roundId: string; nextInSeconds: number }
  ) => void;

  // Game finished — host ONLY gets the full podium + ranking (the big screen).
  "game:finished": (payload: {
    podium: LeaderboardRow[]; // top 3
    leaderboard: LeaderboardRow[]; // full
    quizTitle: string;
  }) => void;

  // Players get ONLY their own final placement — never the full leaderboard.
  "game:finished_player": (payload: {
    rank: number;
    totalScore: number;
    playersCount: number;
    quizTitle: string;
  }) => void;

  // Host disconnected -> everyone is paused.
  "game:paused": (payload: { reason: string; graceSeconds: number }) => void;
  "game:resumed": (payload: { phase: GamePhase }) => void;

  // Player-specific: you were kicked / the game ended under you.
  "player:kicked": (payload: { reason: string }) => void;
  "game:closed": (payload: { reason: string }) => void;

  // Generic error channel.
  "game:error": (payload: { message: string }) => void;
}

// ---- Acknowledgement payloads ----------------------------------------------

export interface SimpleAck {
  ok: boolean;
  error?: string;
}

export interface HostJoinAck extends SimpleAck {
  pin?: string;
  phase?: GamePhase;
  players?: LobbyPlayer[];
}

export interface PlayerJoinAck extends SimpleAck {
  playerId?: string;
  resumeToken?: string; // store client-side; reconnect with same nickname+token
  nickname?: string; // possibly disambiguated (e.g. "Sam2")
  phase?: GamePhase;
}
