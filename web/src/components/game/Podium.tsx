"use client";

// Podium — final top-3 display with the full ranking beneath it.

import type { LeaderboardRow } from "@/lib/types";

export default function Podium({
  podium,
  leaderboard,
}: {
  podium: LeaderboardRow[];
  leaderboard: LeaderboardRow[];
}) {
  // Arrange as 2nd, 1st, 3rd for the classic podium look.
  const first = podium.find((p) => p.rank === 1);
  const second = podium.find((p) => p.rank === 2);
  const third = podium.find((p) => p.rank === 3);

  const Block = ({
    row,
    height,
    medal,
  }: {
    row?: LeaderboardRow;
    height: string;
    medal: string;
  }) =>
    row ? (
      <div className="flex flex-1 flex-col items-center justify-end">
        <div className="mb-2 text-center">
          <div className="text-3xl">{medal}</div>
          <div className="font-bold">{row.nickname}</div>
          <div className="font-mono text-brand">{row.totalScore.toFixed(1)}</div>
        </div>
        <div className={`w-full rounded-t-lg bg-brand ${height}`} />
      </div>
    ) : (
      <div className="flex-1" />
    );

  return (
    <div>
      <div className="mx-auto flex max-w-xl items-end gap-3">
        <Block row={second} height="h-24" medal="🥈" />
        <Block row={first} height="h-36" medal="🥇" />
        <Block row={third} height="h-16" medal="🥉" />
      </div>

      <div className="mx-auto mt-8 max-w-md">
        <h3 className="mb-2 text-sm font-semibold uppercase text-slate-500">
          Full ranking
        </h3>
        <ol className="space-y-1">
          {leaderboard.map((r) => (
            <li
              key={r.playerId}
              className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-sm ring-1 ring-slate-200"
            >
              <span>
                <strong className="mr-2">{r.rank}.</strong>
                {r.nickname}
              </span>
              <span className="font-mono font-bold">{r.totalScore.toFixed(1)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
