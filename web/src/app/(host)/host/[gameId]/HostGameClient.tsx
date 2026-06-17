"use client";

// The host's live game screen: lobby (PIN, join URL, player list, kick, Start)
// and the in-game view (question, countdown, answers-received, leaderboard) with
// Next / Skip / End controls. Projector-friendly. The realtime server is the
// authority — this screen reflects its events and sends host commands.
//
// The host is the ONLY screen that shows the full leaderboard + final podium.
// Between rounds the game auto-advances after a few seconds; the host can press
// Next to go sooner.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { connectSocket, type LoopSocket } from "@/lib/socket";
import Countdown from "@/components/game/Countdown";
import Leaderboard from "@/components/game/Leaderboard";
import Podium from "@/components/game/Podium";
import AnswerTile from "@/components/game/AnswerTile";
import type {
  LobbyPlayer,
  LeaderboardRow,
  PublicQuestion,
  GamePhase,
} from "@/lib/types";

export default function HostGameClient({
  gameId,
  hostToken,
  pin,
}: {
  gameId: string;
  hostToken: string;
  pin: string;
}) {
  const router = useRouter();
  const socketRef = useRef<LoopSocket | null>(null);

  const [phase, setPhase] = useState<GamePhase>("lobby");
  const [players, setPlayers] = useState<LobbyPlayer[]>([]);
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [answersCount, setAnswersCount] = useState({ received: 0, total: 0 });
  const [reveal, setReveal] = useState<{
    correctOptionId: string;
    leaderboard: LeaderboardRow[];
    nextInSeconds: number;
    isLast: boolean;
  } | null>(null);
  const [finished, setFinished] = useState<{
    podium: LeaderboardRow[];
    leaderboard: LeaderboardRow[];
    quizTitle: string;
  } | null>(null);
  const [paused, setPaused] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const joinUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/play?pin=${pin}`;
  }, [pin]);

  useEffect(() => {
    const socket = connectSocket();
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("host:join", { gameId, hostToken }, (res: any) => {
        if (!res?.ok) {
          setError(res?.error ?? "Could not join as host.");
          return;
        }
        setPhase(res.phase ?? "lobby");
        setPlayers(res.players ?? []);
      });
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("game:lobby", (p) => {
      setPlayers(p.players);
      setPhase(p.phase);
    });
    socket.on("game:question", (q) => {
      setReveal(null);
      setQuestion(q);
      setPhase("question");
      setAnswersCount({ received: 0, total: 0 });
    });
    socket.on("game:answers_count", (c) =>
      setAnswersCount({ received: c.received, total: c.total })
    );
    socket.on("game:reveal_host", (r) => {
      setReveal({
        correctOptionId: r.correctOptionId,
        leaderboard: r.leaderboard,
        nextInSeconds: r.nextInSeconds,
        isLast: r.isLast,
      });
      setPhase("reveal");
    });
    socket.on("game:finished", (f) => {
      setFinished(f);
      setPhase("finished");
    });
    socket.on("game:paused", (p) => setPaused(p.reason));
    socket.on("game:resumed", () => setPaused(null));
    socket.on("game:closed", (p) => {
      setError(p.reason);
      setPhase("finished");
    });
    socket.on("game:error", (p) => setError(p.message));

    return () => {
      socket.disconnect();
    };
  }, [gameId, hostToken]);

  function emit(event: "host:start" | "host:next" | "host:skip" | "host:end") {
    setError(null);
    socketRef.current?.emit(event, (res: any) => {
      if (!res?.ok) setError(res?.error ?? "Action failed.");
    });
  }

  function kick(playerId: string) {
    socketRef.current?.emit("host:kick", { playerId }, () => {});
  }

  // ---- Finished (host sees the full podium) ----
  if (phase === "finished" && finished) {
    return (
      <div className="text-center">
        <h1 className="font-display mb-1 text-3xl font-bold">🏆 {finished.quizTitle}</h1>
        <p className="mb-8 text-muted">Final results</p>
        <Podium podium={finished.podium} leaderboard={finished.leaderboard} />
        <button
          className="btn-primary mt-8"
          onClick={() => {
            router.push("/dashboard");
            router.refresh();
          }}
        >
          Back to library
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      {!connected && (
        <div className="mb-4 rounded-xl bg-sun/50 p-3 text-sm font-medium text-ink ring-1 ring-line">
          Connecting to the game server…
        </div>
      )}
      {paused && (
        <div className="mb-4 rounded-xl bg-sun p-4 text-center font-bold text-ink ring-1 ring-line">
          ⏸ {paused}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {/* ---------- Lobby ---------- */}
      {phase === "lobby" && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="card text-center">
            <p className="text-sm uppercase tracking-wide text-muted">
              Join at{" "}
              <span className="font-semibold text-ink">
                {joinUrl.replace(/^https?:\/\//, "")}
              </span>
            </p>
            <div className="font-display my-4 text-6xl font-bold tracking-[0.3em] text-brand">
              {pin}
            </div>
            <p className="text-sm text-muted">
              Players enter this PIN on their device.
            </p>
            <button
              className="btn-primary mt-6 w-full py-4 text-xl"
              disabled={players.length === 0}
              onClick={() => emit("host:start")}
              title={players.length === 0 ? "Wait for at least one player" : "Start the game"}
            >
              Start game
            </button>
            {players.length === 0 && (
              <p className="mt-2 text-sm text-brand">Waiting for players to join…</p>
            )}
          </div>

          <div className="card">
            <h2 className="font-display mb-3 text-lg font-bold">
              Players ({players.length})
            </h2>
            <ul className="space-y-2">
              {players.map((p) => (
                <li
                  key={p.playerId}
                  className="flex items-center justify-between rounded-xl bg-cream px-3 py-2"
                >
                  <span className={p.connected ? "font-semibold" : "text-muted"}>
                    {p.nickname} {p.connected ? "" : "(reconnecting…)"}
                  </span>
                  <button
                    onClick={() => kick(p.playerId)}
                    className="text-sm font-semibold text-tile-red hover:underline"
                  >
                    Kick
                  </button>
                </li>
              ))}
              {players.length === 0 && (
                <li className="text-sm text-muted">No players yet.</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* ---------- Live question ---------- */}
      {(phase === "question" || phase === "reveal") && question && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <span className="pill bg-white text-muted ring-1 ring-line">
              Question {question.index + 1} of {question.total}
            </span>
            {phase === "question" ? (
              <Countdown
                seconds={question.timeLimitSeconds}
                roundId={question.roundId}
                size="md"
              />
            ) : (
              <span className="pill bg-tile-green/15 text-tile-green">
                Answer revealed
              </span>
            )}
          </div>

          <div className="card mb-4">
            <h1 className="font-display text-2xl font-bold">{question.text}</h1>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            {question.options.map((o, i) => (
              <AnswerTile
                key={o.id}
                index={i}
                text={o.text}
                disabled
                state={
                  phase === "reveal" && reveal
                    ? o.id === reveal.correctOptionId
                      ? "correct"
                      : "dim"
                    : "idle"
                }
              />
            ))}
          </div>

          {phase === "question" && (
            <div className="card mb-4 text-center">
              <p className="font-display text-lg font-bold">
                {answersCount.received} / {answersCount.total} answered
              </p>
            </div>
          )}

          {phase === "reveal" && reveal && (
            <div className="card mb-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display font-bold">Leaderboard</h3>
                <span className="text-sm text-muted">
                  {reveal.isLast ? "Showing results" : "Next question"} shortly…
                </span>
              </div>
              <Leaderboard rows={reveal.leaderboard} />
            </div>
          )}

          <div className="sticky bottom-4 flex gap-3 rounded-xl2 bg-white p-4 shadow-card ring-1 ring-line">
            {phase === "question" && (
              <button onClick={() => emit("host:skip")} className="btn-secondary">
                Skip (no points)
              </button>
            )}
            {phase === "reveal" && (
              <button onClick={() => emit("host:next")} className="btn-primary">
                {reveal?.isLast ? "Show results now" : "Next question now"}
              </button>
            )}
            <button onClick={() => emit("host:end")} className="btn-danger ml-auto">
              End game
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
