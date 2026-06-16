"use client";

// The entire player experience in one client component (mobile-first). The
// socket connection persists across stages: join -> waiting -> question ->
// result -> finished. Reconnect is automatic and resumes the same entry (score
// intact) using a resume token kept in localStorage.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { connectSocket, type LoopSocket } from "@/lib/socket";
import AnswerTile from "@/components/game/AnswerTile";
import Countdown from "@/components/game/Countdown";
import type { PublicQuestion, PlayerRoundResult, LeaderboardRow } from "@/lib/types";

type Stage =
  | "join"
  | "waiting"
  | "question"
  | "answered"
  | "result"
  | "finished"
  | "kicked"
  | "closed";

export default function PlayerClient({ initialPin = "" }: { initialPin?: string }) {
  const router = useRouter();
  const socketRef = useRef<LoopSocket | null>(null);

  const [pin, setPin] = useState(initialPin);
  const [nickname, setNickname] = useState("");
  const [stage, setStage] = useState<Stage>("join");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState<string | null>(null);
  const [closedReason, setClosedReason] = useState<string | null>(null);

  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<PlayerRoundResult | null>(null);
  const [finalRank, setFinalRank] = useState<{
    rank: number;
    leaderboard: LeaderboardRow[];
    quizTitle: string;
  } | null>(null);

  const storageKey = (p: string) => `loop:resume:${p}`;

  // Wire up socket listeners once.
  useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  function attachListeners(socket: LoopSocket) {
    socket.on("game:question", (q) => {
      setQuestion(q);
      setSelected(null);
      setResult(null);
      setStage("question");
      setPaused(null);
    });
    socket.on("game:reveal_player", (r) => {
      setResult(r);
      setStage("result");
    });
    socket.on("game:finished", (f) => {
      // Find my rank from the full leaderboard via my nickname.
      const mine = f.leaderboard.find((row) => row.nickname === nicknameRef.current);
      setFinalRank({
        rank: mine?.rank ?? 0,
        leaderboard: f.leaderboard,
        quizTitle: f.quizTitle,
      });
      setStage("finished");
    });
    socket.on("game:paused", (p) => setPaused(p.reason));
    socket.on("game:resumed", () => setPaused(null));
    socket.on("player:kicked", (p) => {
      setClosedReason(p.reason);
      setStage("kicked");
      socket.disconnect();
    });
    socket.on("game:closed", (p) => {
      setClosedReason(p.reason);
      setStage("closed");
    });
    socket.on("game:error", (p) => setError(p.message));
  }

  // Keep nickname accessible inside socket callbacks.
  const nicknameRef = useRef(nickname);
  useEffect(() => {
    nicknameRef.current = nickname;
  }, [nickname]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanPin = pin.trim();
    const cleanNick = nickname.trim();
    if (!/^\d{6}$/.test(cleanPin)) return setError("Enter the 6-digit game PIN.");
    if (cleanNick.length < 1 || cleanNick.length > 20)
      return setError("Nickname must be 1–20 characters.");

    setBusy(true);

    const socket = socketRef.current ?? connectSocket();
    socketRef.current = socket;
    attachListeners(socket);

    const resumeToken =
      typeof window !== "undefined"
        ? localStorage.getItem(storageKey(cleanPin)) ?? undefined
        : undefined;

    const doJoin = () => {
      socket.emit(
        "player:join",
        { pin: cleanPin, nickname: cleanNick, resumeToken },
        (res: any) => {
          setBusy(false);
          if (!res?.ok) {
            setError(res?.error ?? "Could not join.");
            return;
          }
          setNickname(res.nickname); // may be disambiguated
          if (typeof window !== "undefined")
            localStorage.setItem(storageKey(cleanPin), res.resumeToken);
          setStage(res.phase === "lobby" ? "waiting" : "waiting");
        }
      );
    };

    // Auto-rejoin on every (re)connect so a dropped player resumes seamlessly.
    socket.off("connect");
    socket.on("connect", doJoin);
    if (socket.connected) doJoin();
  }

  function answer(optionId: string) {
    if (!question || selected) return;
    setSelected(optionId);
    setStage("answered");
    socketRef.current?.emit(
      "player:answer",
      {
        questionId: question.questionId,
        roundId: question.roundId,
        selectedOptionId: optionId,
        clientSentAt: Date.now(), // hint only; server uses its own clock
      },
      (res: any) => {
        if (!res?.ok) {
          // Round may have locked — leave the selection but show a gentle note.
          setError(res?.error ?? null);
        }
      }
    );
  }

  // ---------------- Renders ----------------

  if (stage === "join") {
    return (
      <Shell>
        <h1 className="mb-1 text-center text-2xl font-bold">Join a game</h1>
        <p className="mb-6 text-center text-sm text-slate-500">
          Enter the PIN shown on the host&apos;s screen.
        </p>
        <form onSubmit={join} className="space-y-4">
          <input
            inputMode="numeric"
            maxLength={6}
            placeholder="Game PIN"
            className="input text-center text-2xl tracking-[0.3em]"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
          <input
            maxLength={20}
            placeholder="Your nickname"
            className="input text-center text-lg"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
          {error && (
            <p className="rounded-lg bg-red-50 p-2 text-center text-sm text-red-700">
              {error}
            </p>
          )}
          <button className="btn-primary w-full py-4 text-lg" disabled={busy}>
            {busy ? "Joining…" : "Enter"}
          </button>
        </form>
      </Shell>
    );
  }

  if (stage === "kicked" || stage === "closed") {
    return (
      <Shell>
        <div className="text-center">
          <h1 className="mb-2 text-2xl font-bold">
            {stage === "kicked" ? "You left the game" : "Game over"}
          </h1>
          <p className="text-slate-600">{closedReason}</p>
          <button className="btn-primary mt-6" onClick={() => router.push("/play")}>
            Join another game
          </button>
        </div>
      </Shell>
    );
  }

  if (stage === "finished" && finalRank) {
    return (
      <Shell>
        <div className="text-center">
          <p className="text-sm uppercase tracking-wide text-slate-500">
            {finalRank.quizTitle}
          </p>
          <h1 className="my-3 text-5xl font-black text-brand">
            #{finalRank.rank}
          </h1>
          <p className="text-slate-600">
            You finished as {nicknameRef.current}. Thanks for playing!
          </p>
          <button className="btn-primary mt-6" onClick={() => router.push("/play")}>
            Play again
          </button>
        </div>
      </Shell>
    );
  }

  // Paused overlay takes priority during play.
  if (paused) {
    return (
      <Shell>
        <div className="text-center">
          <div className="mb-3 text-4xl">⏸</div>
          <p className="font-semibold text-slate-700">{paused}</p>
          <p className="mt-2 text-sm text-slate-500">Your score is safe.</p>
        </div>
      </Shell>
    );
  }

  if (stage === "waiting") {
    return (
      <Shell>
        <div className="text-center">
          <div className="mb-4 h-10 w-10 mx-auto animate-spin rounded-full border-4 border-brand border-t-transparent" />
          <h1 className="text-xl font-bold">You&apos;re in, {nickname}!</h1>
          <p className="mt-1 text-slate-500">Waiting for the host to start…</p>
        </div>
      </Shell>
    );
  }

  if ((stage === "question" || stage === "answered") && question) {
    return (
      <Shell wide>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-500">
            Q{question.index + 1}/{question.total}
          </span>
          <Countdown seconds={question.timeLimitSeconds} roundId={question.roundId} size="sm" />
        </div>
        <div className="card mb-4">
          <h1 className="text-xl font-bold">{question.text}</h1>
        </div>
        <div className="grid gap-3">
          {question.options.map((o, i) => (
            <AnswerTile
              key={o.id}
              index={i}
              text={o.text}
              disabled={stage === "answered"}
              state={
                stage === "answered"
                  ? selected === o.id
                    ? "selected"
                    : "dim"
                  : "idle"
              }
              onClick={() => answer(o.id)}
            />
          ))}
        </div>
        {stage === "answered" && (
          <p className="mt-4 text-center font-semibold text-slate-600">
            Answer locked in — waiting for others…
          </p>
        )}
      </Shell>
    );
  }

  if (stage === "result" && result) {
    return (
      <Shell>
        <div className="text-center">
          <div
            className={`mb-4 rounded-xl p-6 text-white ${
              result.correct ? "bg-tile-green" : "bg-tile-red"
            }`}
          >
            <div className="text-4xl">{result.correct ? "✓" : "✕"}</div>
            <h1 className="mt-2 text-2xl font-bold">
              {result.correct ? "Correct!" : "Not this time"}
            </h1>
            <p className="mt-1 text-lg">
              +{result.pointsThisRound.toFixed(1)} points
            </p>
          </div>
          <div className="flex justify-around">
            <div>
              <div className="text-sm text-slate-500">Score</div>
              <div className="text-2xl font-bold">{result.totalScore.toFixed(1)}</div>
            </div>
            <div>
              <div className="text-sm text-slate-500">Rank</div>
              <div className="text-2xl font-bold">
                #{result.rank}
                <span className="text-base text-slate-400">/{result.playersCount}</span>
              </div>
            </div>
          </div>
          <p className="mt-6 text-sm text-slate-500">Waiting for the next question…</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-center text-slate-500">Loading…</p>
    </Shell>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-8">
      <div className={wide ? "" : "card"}>{children}</div>
    </main>
  );
}
