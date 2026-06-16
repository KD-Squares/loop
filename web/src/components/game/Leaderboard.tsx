"use client";

// Leaderboard — host-facing full ranking between rounds. Scores show to 1dp.

import type { LeaderboardRow } from "@/lib/types";

export default function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length === 0)
    return <p className="text-slate-500">No players yet.</p>;

  return (
    <ol className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.playerId}
          className="flex items-center justify-between rounded-lg bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200"
        >
          <div className="flex items-center gap-3">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                r.rank === 1
                  ? "bg-yellow-400 text-white"
                  : r.rank === 2
                  ? "bg-slate-300 text-white"
                  : r.rank === 3
                  ? "bg-amber-700 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {r.rank}
            </span>
            <span className="font-semibold">{r.nickname}</span>
          </div>
          <span className="font-mono text-lg font-bold text-brand">
            {r.totalScore.toFixed(1)}
          </span>
        </li>
      ))}
    </ol>
  );
}
