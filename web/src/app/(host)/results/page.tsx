// Past results list. Reads game_results (decoupled from quizzes, so entries
// survive quiz deletion via the title snapshot).

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RankingEntry {
  rank: number;
  nickname: string;
  total_score: number;
}

export default async function ResultsPage() {
  const supabase = createClient();
  const { data: results } = await supabase
    .from("game_results")
    .select("id, game_id, quiz_title_snapshot, finished_at, ranking")
    .order("finished_at", { ascending: false });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Past results</h1>
      <p className="mb-6 text-sm text-slate-500">
        Every game you&apos;ve hosted, kept even if the quiz is later deleted.
      </p>

      {(!results || results.length === 0) && (
        <div className="card text-slate-600">No games have finished yet.</div>
      )}

      <div className="space-y-3">
        {(results ?? []).map((r) => {
          const ranking = (r.ranking as RankingEntry[]) ?? [];
          const winner = ranking.find((e) => e.rank === 1);
          return (
            <Link
              key={r.id}
              href={`/results/${r.game_id ?? r.id}`}
              className="card flex items-center justify-between hover:ring-brand/40"
            >
              <div>
                <h2 className="font-semibold">{r.quiz_title_snapshot}</h2>
                <p className="text-sm text-slate-500">
                  {new Date(r.finished_at).toLocaleString()} · {ranking.length} players
                </p>
              </div>
              {winner && (
                <div className="text-right text-sm">
                  <div className="text-slate-400">Winner</div>
                  <div className="font-semibold">🥇 {winner.nickname}</div>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
