// Admin: every saved result across all hosts.

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminResults() {
  const admin = createAdminClient();
  const [{ data: results }, { data: profiles }] = await Promise.all([
    admin.from("game_results").select("id, host_id, quiz_title_snapshot, finished_at, ranking").order("finished_at", { ascending: false }),
    admin.from("profiles").select("id, email"),
  ]);
  const emailById = new Map((profiles ?? []).map((p) => [p.id, p.email]));

  return (
    <div>
      <h1 className="font-display mb-1 text-2xl font-bold">Results</h1>
      <p className="mb-6 text-sm text-muted">{(results ?? []).length} total, across all hosts.</p>

      <div className="overflow-x-auto rounded-xl2 ring-1 ring-line">
        <table className="w-full text-sm">
          <thead className="bg-cream text-left">
            <tr>
              <th className="px-4 py-3">Quiz</th>
              <th className="px-4 py-3">Host</th>
              <th className="px-4 py-3">Players</th>
              <th className="px-4 py-3">Winner</th>
              <th className="px-4 py-3">Finished</th>
            </tr>
          </thead>
          <tbody>
            {(results ?? []).map((r) => {
              const ranking = (r.ranking as { rank: number; nickname: string }[]) ?? [];
              const winner = ranking.find((e) => e.rank === 1);
              return (
                <tr key={r.id} className="border-t border-line hover:bg-cream/50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/results/${r.id}`} className="font-semibold text-brand underline">
                      {r.quiz_title_snapshot}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{emailById.get(r.host_id) ?? "-"}</td>
                  <td className="px-4 py-3">{ranking.length}</td>
                  <td className="px-4 py-3">{winner ? `🥇 ${winner.nickname}` : "-"}</td>
                  <td className="px-4 py-3 text-muted">{new Date(r.finished_at).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
