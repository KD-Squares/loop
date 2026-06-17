// =============================================================================
// index.ts — bootstrap: Express (internal launch endpoint) + Socket.IO server.
//
// Two surfaces:
//  1. HTTP (server-to-server only): POST /internal/games lets the Next.js API
//     route launch a game from a saved quiz. Authenticated with the shared
//     service-role key, which only the (server-side) Next.js API knows. NO PDF
//     or text is ever sent here — only already-saved quiz data.
//  2. Socket.IO (browsers): host + player realtime gameplay.
// =============================================================================

import "dotenv/config";
import http from "node:http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { GameManager, LaunchRequest } from "./gameManager.js";
import type { ClientToServerEvents, ServerToClientEvents } from "./events.js";

// ---- Env --------------------------------------------------------------------
const PORT = Number(process.env.PORT ?? 4000);
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3000";
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS ?? 100);
const HOST_GRACE_SECONDS = Number(process.env.HOST_GRACE_SECONDS ?? 90);
const GAME_IDLE_TIMEOUT_SECONDS = Number(process.env.GAME_IDLE_TIMEOUT_SECONDS ?? 1800);
// How long the answer reveal/leaderboard shows before the game auto-advances.
const REVEAL_SECONDS = Number(process.env.REVEAL_SECONDS ?? 5);
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SERVICE_ROLE_KEY) {
  console.warn(
    "[boot] SUPABASE_SERVICE_ROLE_KEY is not set — the internal launch endpoint will reject all calls."
  );
}

// ---- HTTP + Socket.IO -------------------------------------------------------
const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: WEB_ORIGIN }));

const httpServer = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: WEB_ORIGIN, methods: ["GET", "POST"] },
  // Tuned for up to 100 players in a room with fast broadcasts.
  pingTimeout: 20000,
  pingInterval: 25000,
});

const manager = new GameManager(io, {
  maxPlayers: MAX_PLAYERS,
  hostGraceSeconds: HOST_GRACE_SECONDS,
  idleTimeoutSeconds: GAME_IDLE_TIMEOUT_SECONDS,
  revealSeconds: REVEAL_SECONDS,
});

// ---- Health -----------------------------------------------------------------
app.get("/health", (_req, res) => {
  res.json({ ok: true, activeGame: manager.hasActiveGame() });
});

// ---- Internal launch endpoint (server-to-server only) -----------------------
// The Next.js /api/games route calls this AFTER it has authenticated the host
// and verified quiz ownership + readiness. Auth is the shared service-role key.
app.post("/internal/games", async (req, res) => {
  const auth = req.header("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!SERVICE_ROLE_KEY || token !== SERVICE_ROLE_KEY) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  const body = req.body as Partial<LaunchRequest>;
  if (
    !body.quizId ||
    !body.hostId ||
    !body.quizTitle ||
    !body.timeLimitSeconds ||
    !Array.isArray(body.questions) ||
    body.questions.length === 0
  ) {
    return res.status(400).json({ error: "Invalid launch payload." });
  }

  try {
    const result = await manager.launch({
      quizId: body.quizId,
      hostId: body.hostId,
      quizTitle: body.quizTitle,
      timeLimitSeconds: body.timeLimitSeconds,
      questions: body.questions,
    });
    return res.json(result);
  } catch (e) {
    // Single-game enforcement and empty-quiz errors land here.
    return res.status(409).json({ error: (e as Error).message });
  }
});

// ---- Socket.IO wiring -------------------------------------------------------
io.on("connection", (socket) => {
  // ---------- Host ----------
  socket.on("host:join", ({ gameId, hostToken }, ack) => {
    const game = manager.getById(gameId);
    if (!game) return ack({ ok: false, error: "Game not found." });
    if (!game.isHostToken(hostToken))
      return ack({ ok: false, error: "Not authorised to host this game." });

    socket.join(game.pin);
    socket.data.role = "host";
    socket.data.gameId = gameId;
    game.attachHost(socket.id);

    ack({
      ok: true,
      pin: game.pin,
      phase: game.getPhase(),
      players: game.getLobbyPlayers(),
    });
  });

  socket.on("host:start", (ack) => {
    const game = hostGame(socket);
    if (!game) return ack({ ok: false, error: "Not hosting a game." });
    ack(game.start());
  });

  socket.on("host:next", (ack) => {
    const game = hostGame(socket);
    if (!game) return ack({ ok: false, error: "Not hosting a game." });
    ack(game.advance());
  });

  socket.on("host:skip", (ack) => {
    const game = hostGame(socket);
    if (!game) return ack({ ok: false, error: "Not hosting a game." });
    ack(game.skip());
  });

  socket.on("host:end", async (ack) => {
    const game = hostGame(socket);
    if (!game) return ack({ ok: false, error: "Not hosting a game." });
    await game.endGame("host-ended");
    ack({ ok: true });
  });

  socket.on("host:kick", ({ playerId }, ack) => {
    const game = hostGame(socket);
    if (!game) return ack({ ok: false, error: "Not hosting a game." });
    const ok = game.kickPlayer(playerId);
    ack(ok ? { ok: true } : { ok: false, error: "Player not found." });
  });

  // ---------- Player ----------
  socket.on("player:join", ({ pin, nickname, resumeToken }, ack) => {
    const game = manager.getByPin(pin);
    if (!game) return ack({ ok: false, error: "No game found with that PIN." });

    const result = game.joinPlayer(socket.id, nickname, resumeToken);
    if (!result.ok) return ack({ ok: false, error: result.error });

    socket.join(game.pin);
    socket.data.role = "player";
    socket.data.gameId = game.gameId;
    socket.data.playerId = result.playerId;

    ack({
      ok: true,
      playerId: result.playerId,
      nickname: result.nickname,
      resumeToken: result.resumeToken,
      phase: result.phase,
    });
  });

  socket.on("player:answer", (payload, ack) => {
    const gameId = socket.data.gameId as string | undefined;
    if (!gameId) return ack({ ok: false, error: "Not in a game." });
    const game = manager.getById(gameId);
    if (!game) return ack({ ok: false, error: "Game not found." });
    ack(game.submitAnswer(socket.id, payload));
  });

  // ---------- Disconnect ----------
  socket.on("disconnect", () => {
    const gameId = socket.data.gameId as string | undefined;
    if (!gameId) return;
    const game = manager.getById(gameId);
    if (!game) return;
    if (socket.data.role === "host") {
      game.handleHostDisconnect(socket.id);
    } else if (socket.data.role === "player") {
      game.markPlayerDisconnected(socket.id);
    }
  });
});

function hostGame(socket: {
  data: { role?: string; gameId?: string };
}) {
  if (socket.data.role !== "host" || !socket.data.gameId) return null;
  return manager.getById(socket.data.gameId);
}

httpServer.listen(PORT, () => {
  console.log(`[boot] Loop realtime server listening on :${PORT}`);
  console.log(`[boot] CORS origin: ${WEB_ORIGIN}`);
  console.log(
    `[boot] caps: MAX_PLAYERS=${MAX_PLAYERS} HOST_GRACE=${HOST_GRACE_SECONDS}s IDLE=${GAME_IDLE_TIMEOUT_SECONDS}s`
  );
});
