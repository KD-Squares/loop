"use client";

// Interactive quiz library: Host game, Edit, Duplicate, Delete (with confirm).
// Hosting launches a live game from a saved quiz with NO upload step.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export interface QuizListItem {
  id: string;
  title: string;
  status: "draft" | "ready";
  time_limit_seconds: number;
  created_at: string;
  updated_at: string;
  question_count: number;
}

export default function DashboardClient({
  initialQuizzes,
}: {
  initialQuizzes: QuizListItem[];
}) {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState(initialQuizzes);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function hostGame(quiz: QuizListItem) {
    setError(null);
    setBusyId(quiz.id);
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quizId: quiz.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not start the game.");
        return;
      }
      // Pass the host token + pin to the host screen (host-only navigation).
      const params = new URLSearchParams({ token: data.hostToken, pin: data.pin });
      router.push(`/host/${data.gameId}?${params.toString()}`);
    } catch {
      setError("Network error starting the game.");
    } finally {
      setBusyId(null);
    }
  }

  async function duplicate(quiz: QuizListItem) {
    setBusyId(quiz.id);
    try {
      const res = await fetch(`/api/quizzes/${quiz.id}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (res.ok) router.push(`/quiz/${data.id}/review`);
      else setError(data.error ?? "Could not duplicate.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(quiz: QuizListItem) {
    setBusyId(quiz.id);
    try {
      const res = await fetch(`/api/quizzes/${quiz.id}`, { method: "DELETE" });
      if (res.ok) {
        setQuizzes((qs) => qs.filter((q) => q.id !== quiz.id));
        setConfirmDelete(null);
      } else {
        const data = await res.json();
        setError(data.error ?? "Could not delete.");
      }
    } finally {
      setBusyId(null);
    }
  }

  if (quizzes.length === 0) {
    return (
      <div className="card text-center">
        <p className="text-slate-600">You don&apos;t have any quizzes yet.</p>
        <Link href="/create" className="btn-primary mt-4 inline-flex">
          Create your first quiz
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {quizzes.map((quiz) => (
        <div key={quiz.id} className="card flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold">{quiz.title}</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                  quiz.status === "ready"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {quiz.status === "ready" ? "Ready" : "Draft"}
              </span>
            </div>
            <p className="text-sm text-slate-500">
              {quiz.question_count} question{quiz.question_count === 1 ? "" : "s"} ·{" "}
              {quiz.time_limit_seconds}s each ·{" "}
              {new Date(quiz.created_at).toLocaleDateString()}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn-primary"
              disabled={busyId === quiz.id || quiz.status !== "ready"}
              title={
                quiz.status !== "ready"
                  ? "Mark the quiz ready in review before hosting"
                  : "Launch a live game"
              }
              onClick={() => hostGame(quiz)}
            >
              {busyId === quiz.id ? "Starting…" : "Host game"}
            </button>
            <Link href={`/quiz/${quiz.id}/review`} className="btn-secondary">
              Edit
            </Link>
            <button
              className="btn-secondary"
              disabled={busyId === quiz.id}
              onClick={() => duplicate(quiz)}
            >
              Duplicate
            </button>
            <button
              className="btn-secondary text-red-600"
              disabled={busyId === quiz.id}
              onClick={() => setConfirmDelete(quiz.id)}
            >
              Delete
            </button>
          </div>

          {confirmDelete === quiz.id && (
            <div className="w-full rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
              <p className="text-sm text-slate-700">
                Delete <strong>{quiz.title}</strong>? Past game results are kept.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  className="btn-danger px-3 py-1.5 text-sm"
                  disabled={busyId === quiz.id}
                  onClick={() => remove(quiz)}
                >
                  {busyId === quiz.id ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  className="btn-secondary px-3 py-1.5 text-sm"
                  onClick={() => setConfirmDelete(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
