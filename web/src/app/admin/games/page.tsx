// Admin: every game across all hosts.

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminGames() {
  const admin = createAdminClient();
  const [{ data: games }, { data: profiles }, { data: players }] = await Promise.all([
    admin.from("games").select("id, host_id, pin, status, current_round, created_at, ended_at").order("created_at", { ascending: false }),
    admin.from("profiles").select("id, email"),
    admin.from("game_players").select("game_id"),
  ]);

  const emailById = new Map((profiles ?? []).map((p) => [p.id, p.email]));
  const playerCount = new Map<string, number>();
  for (const p of players ?? []) playerCount.set(p.game_id, (playerCount.get(p.game_id) ?? 0) + 1);

  return (
    <div>
      <h1 className="font-display mb-1 text-2xl font-bold">Games</h1>
      <p className="mb-6 text-sm text-muted">{(games ?? []).length} total, across all hosts.</p>

      <div className="overflow-x-auto rounded-xl2 ring-1 ring-line">
        <table className="w-full text-sm">
          <thead className="bg-cream text-left">
            <tr>
              <th className="px-4 py-3">PIN</th>
              <th className="px-4 py-3">Host</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Players</th>
              <th className="px-4 py-3">Round</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {(games ?? []).map((g) => (
              <tr key={g.id} className="border-t border-line hover:bg-cream/50">
                <td className="px-4 py-3">
                  <Link href={`/admin/games/${g.id}`} className="font-mono font-semibold text-brand underline">
                    {g.pin}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted">{emailById.get(g.host_id) ?? "-"}</td>
                <td className="px-4 py-3">{g.status}</td>
                <td className="px-4 py-3">{playerCount.get(g.id) ?? 0}</td>
                <td className="px-4 py-3">{g.current_round}</td>
                <td className="px-4 py-3 text-muted">{new Date(g.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
