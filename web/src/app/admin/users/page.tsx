// Admin: all hosts, with their quiz/game/result counts and auth details.

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminUsers() {
  const admin = createAdminClient();

  const [{ data: profiles }, quizzesRes, gamesRes, resultsRes, authRes] =
    await Promise.all([
      admin.from("profiles").select("id, email, display_name, created_at").order("created_at", { ascending: false }),
      admin.from("quizzes").select("host_id"),
      admin.from("games").select("host_id"),
      admin.from("game_results").select("host_id"),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

  const tally = (rows: { host_id: string }[] | null) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.host_id, (m.get(r.host_id) ?? 0) + 1);
    return m;
  };
  const quizCounts = tally(quizzesRes.data);
  const gameCounts = tally(gamesRes.data);
  const resultCounts = tally(resultsRes.data);
  const authById = new Map(
    (authRes.data?.users ?? []).map((u) => [u.id, u])
  );

  return (
    <div>
      <h1 className="font-display mb-1 text-2xl font-bold">Users (hosts)</h1>
      <p className="mb-6 text-sm text-muted">
        {(profiles ?? []).length} host{(profiles ?? []).length === 1 ? "" : "s"}.
      </p>

      <div className="overflow-x-auto rounded-xl2 ring-1 ring-line">
        <table className="w-full text-sm">
          <thead className="bg-cream text-left">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Quizzes</th>
              <th className="px-4 py-3">Games</th>
              <th className="px-4 py-3">Results</th>
              <th className="px-4 py-3">Last sign in</th>
              <th className="px-4 py-3">Joined</th>
            </tr>
          </thead>
          <tbody>
            {(profiles ?? []).map((p) => {
              const a = authById.get(p.id);
              return (
                <tr key={p.id} className="border-t border-line hover:bg-cream/50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${p.id}`} className="font-semibold text-brand underline">
                      {p.email}
                    </Link>
                    {a && !a.email_confirmed_at && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
                        unconfirmed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{quizCounts.get(p.id) ?? 0}</td>
                  <td className="px-4 py-3">{gameCounts.get(p.id) ?? 0}</td>
                  <td className="px-4 py-3">{resultCounts.get(p.id) ?? 0}</td>
                  <td className="px-4 py-3 text-muted">
                    {a?.last_sign_in_at ? new Date(a.last_sign_in_at).toLocaleString() : "-"}
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
