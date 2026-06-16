"use client";

// The host's live game screen: lobby (PIN, join URL, player list, kick, Start)
// and the in-game view (question, countdown, answers-received, leaderboard) with
// Next / Skip / End controls. Projector-friendly. The realtime server is the
// authority — this screen reflects its events and sends host commands.

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
      setReveal({ correctOptionId: r.correctOptionId, leaderboard: r.leaderboard });
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

  // ---- Finished ----
  if (phase === "finished" && finished) {
    return (
      <div className="text-center">
        <h1 className="mb-2 text-3xl font-black">🏆 {finished.quizTitle}</h1>
        <p className="mb-8 text-slate-500">Final results</p>
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
        <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
          Connecting to the game server…
        </div>
      )}
      {paused && (
        <div className="mb-4 rounded-lg bg-amber-100 p-4 text-center font-semibold text-amber-900 ring-1 ring-amber-300">
          ⏸ {paused}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {/* ---------- Lobby ---------- */}
      {phase === "lobby" && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="card text-center">
            <p className="text-sm uppercase tracking-wide text-slate-500">
              Join at <span className="font-semibold">{joinUrl.replace(/^https?:\/\//, "")}</span>
            </p>
            <div className="my-4 text-6xl font-black tracking-[0.3em] text-brand">
              {pin}
            </div>
            <p className="text-sm text-slate-500">
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
              <p className="mt-2 text-sm text-amber-600">
                Waiting for players to join…
              </p>
            )}
          </div>

          <div className="card">
            <h2 className="mb-3 font-semibold">
              Players ({players.length})
            </h2>
            <ul className="space-y-2">
              {players.map((p) => (
                <li
                  key={p.playerId}
                  className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2"
                >
                  <span className={p.connected ? "" : "text-slate-400"}>
                    {p.nickname} {p.connected ? "" : "(reconnecting…)"}
                  </span>
                  <button
                    onClick={() => kick(p.playerId)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Kick
                  </button>
                </li>
              ))}
              {players.length === 0 && (
                <li className="text-sm text-slate-400">No players yet.</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* ---------- Live question ---------- */}
      {(phase === "question" || phase === "reveal") && question && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-500">
              Question {question.index + 1} of {question.total}
            </span>
            {phase === "question" ? (
              <Countdown
                seconds={question.timeLimitSeconds}
                roundId={question.roundId}
                size="md"
              />
            ) : (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
                Answer revealed
              </span>
            )}
          </div>

          <div className="card mb-4">
            <h1 className="text-2xl font-bold">{question.text}</h1>
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
              <p className="text-lg font-semibold">
                {answersCount.received} / {answersCount.total} answered
              </p>
            </div>
          )}

          {phase === "reveal" && reveal && (
            <div className="card mb-4">
              <h3 className="mb-3 font-semibold">Leaderboard</h3>
              <Leaderboard rows={reveal.leaderboard} />
            </div>
          )}

          <div className="sticky bottom-4 flex gap-3 rounded-xl bg-white p-4 shadow-lg ring-1 ring-slate-200">
            {phase === "question" && (
              <button onClick={() => emit("host:skip")} className="btn-secondary">
                Skip (no points)
              </button>
            )}
            {phase === "reveal" && (
              <button onClick={() => emit("host:next")} className="btn-primary">
                {question.index + 1 >= question.total ? "Show results" : "Next question"}
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
