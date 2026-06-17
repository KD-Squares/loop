"use client";

// Leaderboard — host-facing full ranking between rounds. Scores show to 1dp.

import type { LeaderboardRow } from "@/lib/types";

export default function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  if (rows.length === 0) return <p className="text-muted">No players yet.</p>;

  return (
    <ol className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.playerId}
          className="flex items-center justify-between rounded-xl bg-cream px-4 py-3 ring-1 ring-line"
        >
          <div className="flex items-center gap-3">
            <span
              className={`font-display flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                r.rank === 1
                  ? "bg-tile-yellow text-white"
                  : r.rank === 2
                  ? "bg-muted text-white"
                  : r.rank === 3
                  ? "bg-brand text-white"
                  : "bg-white text-muted ring-1 ring-line"
              }`}
            >
              {r.rank}
            </span>
            <span className="font-semibold">{r.nickname}</span>
          </div>
          <span className="font-display text-lg font-bold text-brand">
            {r.totalScore.toFixed(1)}
          </span>
        </li>
      ))}
    </ol>
  );
}
