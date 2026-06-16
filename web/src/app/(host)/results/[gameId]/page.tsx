// A single past game's full ranking.

import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

interface RankingEntry {
  rank: number;
  nickname: string;
  total_score: number;
  total_time_ms: number;
}

export const dynamic = "force-dynamic";

export default async function ResultDetailPage({
  params,
}: {
  params: { gameId: string };
}) {
  const supabase = createClient();

  // The list links by game_id when present, falling back to the result id.
  const { data: result } =
    (await supabase
      .from("game_results")
      .select("id, game_id, quiz_title_snapshot, finished_at, ranking")
      .or(`game_id.eq.${params.gameId},id.eq.${params.gameId}`)
      .maybeSingle()) ?? {};

  if (!result) notFound();

  const ranking = (result.ranking as RankingEntry[]) ?? [];

  return (
    <div>
      <Link href="/results" className="text-sm text-brand underline">
        ← All results
      </Link>
      <h1 className="mt-3 text-2xl font-bold">{result.quiz_title_snapshot}</h1>
      <p className="mb-6 text-sm text-slate-500">
        {new Date(result.finished_at).toLocaleString()} · {ranking.length} players
      </p>

      <ol className="space-y-2">
        {ranking.map((e) => (
          <li
            key={`${e.rank}-${e.nickname}`}
            className="flex items-center justify-between rounded-lg bg-white px-4 py-3 ring-1 ring-slate-200"
          >
            <span className="flex items-center gap-3">
              <span className="w-8 font-bold text-slate-500">{e.rank}.</span>
              <span className="font-semibold">{e.nickname}</span>
            </span>
            <span className="font-mono font-bold text-brand">
              {Number(e.total_score).toFixed(1)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
