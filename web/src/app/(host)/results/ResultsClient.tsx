"use client";

// Past results list with a Delete action (with confirm) per result. Clicking a
// card (anywhere but the buttons) opens that result's detail.

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface ResultItem {
  id: string;
  game_id: string | null;
  quiz_title_snapshot: string;
  finished_at: string;
  playersCount: number;
  winner: string | null;
}

export default function ResultsClient({
  initialResults,
}: {
  initialResults: ResultItem[];
}) {
  const router = useRouter();
  const [results, setResults] = useState(initialResults);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/results/${id}`, { method: "DELETE" });
      if (res.ok) {
        setResults((rs) => rs.filter((r) => r.id !== id));
        setConfirmId(null);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not delete this result.");
      }
    } catch {
      setError("Network error deleting this result.");
    } finally {
      setBusyId(null);
    }
  }

  if (results.length === 0) {
    return <div className="card text-muted">No games have finished yet.</div>;
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {results.map((r) => (
        <div key={r.id} className="card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => router.push(`/results/${r.game_id ?? r.id}`)}
              className="min-w-0 flex-1 text-left"
            >
              <h2 className="font-display truncate font-semibold">
                {r.quiz_title_snapshot}
              </h2>
              <p className="text-sm text-muted">
                {new Date(r.finished_at).toLocaleString()} · {r.playersCount} players
              </p>
            </button>

            <div className="flex items-center gap-3">
              {r.winner && (
                <div className="text-right text-sm">
                  <div className="text-muted">Winner</div>
                  <div className="font-semibold">🥇 {r.winner}</div>
                </div>
              )}
              <button
                type="button"
                className="btn-secondary px-3 py-1.5 text-sm text-red-600"
                disabled={busyId === r.id}
                onClick={() => setConfirmId(r.id)}
              >
                Delete
              </button>
            </div>
          </div>

          {confirmId === r.id && (
            <div className="mt-3 rounded-xl bg-cream p-3 ring-1 ring-line">
              <p className="text-sm text-ink">
                Delete the result for <strong>{r.quiz_title_snapshot}</strong>? This
                cannot be undone.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  className="btn-danger px-3 py-1.5 text-sm"
                  disabled={busyId === r.id}
                  onClick={() => remove(r.id)}
                >
                  {busyId === r.id ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  className="btn-secondary px-3 py-1.5 text-sm"
                  onClick={() => setConfirmId(null)}
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
