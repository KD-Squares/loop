// Admin: a single result's full final ranking.

import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface RankRow {
  rank: number;
  nickname: string;
  total_score: number;
  total_time_ms: number;
}

export default async function AdminResultDetail({
  params,
}: {
  params: { id: string };
}) {
  const admin = createAdminClient();
  const { data: result } = await admin
    .from("game_results")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!result) notFound();

  const { data: owner } = await admin
    .from("profiles")
    .select("id, email")
    .eq("id", result.host_id)
    .maybeSingle();

  const ranking = (result.ranking as RankRow[]) ?? [];

  return (
    <div>
      <Link href="/admin/results" className="text-sm text-brand underline">
        ← All results
      </Link>
      <h1 className="font-display mt-2 text-2xl font-bold">{result.quiz_title_snapshot}</h1>
      <p className="mb-6 text-sm text-muted">
        Host:{" "}
        {owner ? (
          <Link href={`/admin/users/${owner.id}`} className="text-brand underline">
            {owner.email}
          </Link>
        ) : (
          "-"
        )}{" "}
        · {ranking.length} players · finished {new Date(result.finished_at).toLocaleString()}
      </p>

      <div className="overflow-x-auto rounded-xl2 ring-1 ring-line">
        <table className="w-full text-sm">
          <thead className="bg-cream text-left">
            <tr>
              <th className="px-4 py-2">Rank</th>
              <th className="px-4 py-2">Nickname</th>
              <th className="px-4 py-2">Score</th>
              <th className="px-4 py-2">Total time (ms)</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((e) => (
              <tr key={`${e.rank}-${e.nickname}`} className="border-t border-line">
                <td className="px-4 py-2 font-bold">{e.rank}</td>
                <td className="px-4 py-2 font-semibold">{e.nickname}</td>
                <td className="px-4 py-2">{Number(e.total_score).toFixed(1)}</td>
                <td className="px-4 py-2 text-muted">{e.total_time_ms}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
