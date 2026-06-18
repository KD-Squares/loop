// Past results list. Reads game_results (decoupled from quizzes, so entries
// survive quiz deletion via the title snapshot) and hands them to a client
// component that supports viewing and deleting each result.

import { createClient } from "@/lib/supabase/server";
import ResultsClient, { ResultItem } from "./ResultsClient";

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

  const items: ResultItem[] = (results ?? []).map((r) => {
    const ranking = (r.ranking as RankingEntry[]) ?? [];
    const winner = ranking.find((e) => e.rank === 1);
    return {
      id: r.id,
      game_id: r.game_id,
      quiz_title_snapshot: r.quiz_title_snapshot,
      finished_at: r.finished_at,
      playersCount: ranking.length,
      winner: winner?.nickname ?? null,
    };
  });

  return (
    <div>
      <h1 className="font-display mb-1 text-2xl font-bold">Past results</h1>
      <p className="mb-6 text-sm text-muted">
        Every game you&apos;ve hosted, kept even if the quiz is later deleted.
      </p>
      <ResultsClient initialResults={items} />
    </div>
  );
}
