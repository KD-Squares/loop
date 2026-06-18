"use client";

// The entire player experience in one client component (mobile-first). The
// socket connection persists across stages: join -> waiting -> question ->
// result -> finished. Reconnect is automatic and resumes the same entry (score
// intact) using a resume token kept in localStorage.
//
// Players only ever see THEIR OWN result and final placement — the full
// leaderboard/podium is shown on the host screen only.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { connectSocket, type LoopSocket } from "@/lib/socket";
import AnswerTile from "@/components/game/AnswerTile";
import Countdown from "@/components/game/Countdown";
import BrandMark from "@/components/brand/BrandMark";
import PoweredByNdi from "@/components/brand/PoweredByNdi";
import BlobBg from "@/components/brand/BlobBg";
import MuteButton from "@/components/game/MuteButton";
import { playSfx } from "@/lib/audio";
import type { PublicQuestion, PlayerRoundResult } from "@/lib/types";

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
  const [finalPlace, setFinalPlace] = useState<{
    rank: number;
    totalScore: number;
    playersCount: number;
    quizTitle: string;
  } | null>(null);

  const storageKey = (p: string) => `loop:resume:${p}`;
  const nicknameRef = useRef(nickname);
  useEffect(() => {
    nicknameRef.current = nickname;
  }, [nickname]);

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
      playSfx(r.correct ? "correct" : "wrong", 0.7);
    });
    // Players get ONLY their own final placement (no leaderboard/podium).
    socket.on("game:finished_player", (f) => {
      setFinalPlace(f);
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
          setNickname(res.nickname);
          if (typeof window !== "undefined")
            localStorage.setItem(storageKey(cleanPin), res.resumeToken);
          setStage("waiting");
        }
      );
    };

    socket.off("connect");
    socket.on("connect", doJoin);
    if (socket.connected) doJoin();
  }

  function answer(optionId: string) {
    if (!question || selected) return;
    playSfx("tap", 0.5);
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
        if (!res?.ok) setError(res?.error ?? null);
      }
    );
  }

  // ---------------- Renders ----------------

  if (stage === "join") {
    return (
      <Shell>
        <div className="mb-6 flex justify-center">
          <BrandMark size="md" />
        </div>
        <h1 className="font-display mb-1 text-center text-2xl font-bold">
          Join the game
        </h1>
        <p className="mb-6 text-center text-sm text-muted">
          Enter the PIN shown on the host&apos;s screen.
        </p>
        <form onSubmit={join} className="space-y-4">
          <input
            inputMode="numeric"
            maxLength={6}
            placeholder="Game PIN"
            className="input text-center font-display text-3xl tracking-[0.3em]"
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
            <p className="rounded-xl bg-red-50 p-2 text-center text-sm text-red-700">
              {error}
            </p>
          )}
          <button className="btn-primary w-full py-4 text-lg" disabled={busy}>
            {busy ? "Joining…" : "Enter →"}
          </button>
        </form>
      </Shell>
    );
  }

  if (stage === "kicked" || stage === "closed") {
    return (
      <Shell>
        <div className="text-center">
          <h1 className="font-display mb-2 text-2xl font-bold">
            {stage === "kicked" ? "You left the game" : "Game over"}
          </h1>
          <p className="text-muted">{closedReason}</p>
          <button className="btn-primary mt-6" onClick={() => router.push("/play")}>
            Join another game
          </button>
        </div>
      </Shell>
    );
  }

  if (stage === "finished" && finalPlace) {
    const medal =
      finalPlace.rank === 1 ? "🥇" : finalPlace.rank === 2 ? "🥈" : finalPlace.rank === 3 ? "🥉" : "🎉";
    return (
      <Shell>
        <div className="text-center">
          <div className="mb-2 animate-pop-in text-6xl">{medal}</div>
          <p className="text-sm uppercase tracking-wide text-muted">
            {finalPlace.quizTitle}
          </p>
          <h1 className="font-display my-2 text-6xl font-bold text-brand">
            #{finalPlace.rank}
          </h1>
          <p className="text-muted">
            out of {finalPlace.playersCount} · {finalPlace.totalScore.toFixed(1)} pts
          </p>
          <p className="mt-1 text-sm text-muted">
            Nice one, {nicknameRef.current}! Final standings are on the host screen.
          </p>
          <button className="btn-primary mt-6" onClick={() => router.push("/play")}>
            Play again
          </button>
        </div>
      </Shell>
    );
  }

  if (paused) {
    return (
      <Shell>
        <div className="text-center">
          <div className="mb-3 text-4xl">⏸</div>
          <p className="font-semibold text-ink">{paused}</p>
          <p className="mt-2 text-sm text-muted">Your score is safe.</p>
        </div>
      </Shell>
    );
  }

  if (stage === "waiting") {
    return (
      <Shell>
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
          <h1 className="font-display text-xl font-bold">You&apos;re in, {nickname}!</h1>
          <p className="mt-1 text-muted">Waiting for the host to start…</p>
        </div>
      </Shell>
    );
  }

  if ((stage === "question" || stage === "answered") && question) {
    return (
      <Shell wide>
        <div className="mb-3 flex items-center justify-between">
          <span className="pill bg-white text-muted ring-1 ring-line">
            Q{question.index + 1}/{question.total}
          </span>
          <Countdown seconds={question.timeLimitSeconds} roundId={question.roundId} size="sm" />
        </div>
        <div className="card mb-4">
          <h1 className="font-display text-xl font-bold">{question.text}</h1>
        </div>
        <div className="grid gap-3">
          {question.options.map((o, i) => (
            <AnswerTile
              key={o.id}
              index={i}
              text={o.text}
              disabled={stage === "answered"}
              state={
                stage === "answered" ? (selected === o.id ? "selected" : "dim") : "idle"
              }
              onClick={() => answer(o.id)}
            />
          ))}
        </div>
        {stage === "answered" && (
          <p className="mt-4 text-center font-semibold text-muted">
            Answer locked in — hang tight…
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
            className={`mb-4 rounded-xl2 p-6 text-white ${
              result.correct ? "bg-tile-green" : "bg-tile-red"
            }`}
          >
            <div className="animate-pop-in text-5xl">{result.correct ? "✓" : "✕"}</div>
            <h1 className="font-display mt-2 text-2xl font-bold">
              {result.correct ? "Correct!" : "Not this time"}
            </h1>
            <p className="mt-1 text-lg font-semibold">
              +{result.pointsThisRound.toFixed(1)} points
            </p>
          </div>
          <div className="flex justify-around">
            <div>
              <div className="text-sm text-muted">Score</div>
              <div className="font-display text-2xl font-bold">
                {result.totalScore.toFixed(1)}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted">Rank</div>
              <div className="font-display text-2xl font-bold">
                #{result.rank}
                <span className="text-base text-muted">/{result.playersCount}</span>
              </div>
            </div>
          </div>
          <p className="mt-6 text-sm text-muted">Next question coming up…</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="text-center text-muted">Loading…</p>
    </Shell>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  // min-h uses dvh (the real, chrome-aware viewport height on phones). There is
  // no overflow-hidden here, so a tall screen (a question plus four tiles)
  // scrolls instead of being clipped. The clipping is what made the bottom
  // answers unreachable and "unresponsive" on phones.
  return (
    <main className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-4 py-6 sm:px-5 sm:py-8">
      <BlobBg />
      <div className="absolute right-4 top-4 z-10">
        <MuteButton />
      </div>
      <div className={wide ? "" : "card"}>{children}</div>
      <div className="mt-6 flex justify-center">
        <PoweredByNdi />
      </div>
    </main>
  );
}
