// =============================================================================
// types.ts — shared TypeScript types for the web app.
//
// The realtime event shapes here mirror server/src/events.ts. Keep them in sync.
// =============================================================================

export type QuizStatus = "draft" | "ready";
export type QuestionType = "mcq" | "truefalse";

export interface QuestionOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  quiz_id: string;
  text: string;
  type: QuestionType;
  options: QuestionOption[];
  correct_option_id: string;
  order_index: number;
}

export interface Quiz {
  id: string;
  host_id: string;
  title: string;
  status: QuizStatus;
  source_pdf_path: string | null;
  time_limit_seconds: number; // stored on first question generation; see note below
  created_at: string;
  updated_at: string;
}

// A draft question as produced by parsing/generation, before it is persisted.
export interface DraftQuestion {
  text: string;
  type: QuestionType;
  options: QuestionOption[];
  correct_option_id: string;
}

// Result of the reuse-vs-generate decision.
export interface GenerationOutcome {
  path: "parsed" | "generated";
  questions: DraftQuestion[];
  requested: number;
  validCount: number;
  note?: string; // human-readable note for the review screen
}

// ---- Realtime payloads (mirror of server/src/events.ts) ---------------------

export interface PublicOption {
  id: string;
  text: string;
}

export interface PublicQuestion {
  roundId: string;
  questionId: string;
  index: number;
  total: number;
  text: string;
  type: QuestionType;
  options: PublicOption[];
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
  totalScore: number;
  totalTimeMs: number;
}

export interface PlayerRoundResult {
  roundId: string;
  correct: boolean;
  correctOptionId: string;
  selectedOptionId: string | null;
  pointsThisRound: number;
  totalScore: number;
  rank: number;
  playersCount: number;
}

export type GamePhase = "lobby" | "question" | "reveal" | "paused" | "finished";
