// Admin overview: totals across ALL users plus recent activity.

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function count(table: string, filter?: [string, string]) {
  const admin = createAdminClient();
  let q = admin.from(table).select("id", { count: "exact", head: true });
  if (filter) q = q.eq(filter[0], filter[1]);
  const { count } = await q;
  return count ?? 0;
}

function Stat({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <div className="card">
      <div className="font-display text-3xl font-bold text-brand">{value}</div>
      <div className="text-sm text-muted">{label}</div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default async function AdminOverview() {
  const admin = createAdminClient();

  const [
    hosts,
    quizzes,
    quizzesReady,
    questions,
    games,
    gamesActive,
    players,
    answers,
    results,
  ] = await Promise.all([
    count("profiles"),
    count("quizzes"),
    count("quizzes", ["status", "ready"]),
    count("questions"),
    count("games"),
    count("games", ["status", "active"]),
    count("game_players"),
    count("answers"),
    count("game_results"),
  ]);

  const { data: recentResults } = await admin
    .from("game_results")
    .select("id, game_id, host_id, quiz_title_snapshot, finished_at, ranking")
    .order("finished_at", { ascending: false })
    .limit(8);

  const { data: recentGames } = await admin
    .from("games")
    .select("id, pin, status, host_id, created_at")
    .order("created_at", { ascending: false })
    .limit(8);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold">Everything, at a glance</h1>
        <p className="text-sm text-muted">Totals across all hosts and games.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Hosts" value={hosts} href="/admin/users" />
        <Stat label="Quizzes (total)" value={quizzes} href="/admin/quizzes" />
        <Stat label="Quizzes ready" value={quizzesReady} />
        <Stat label="Questions" value={questions} />
        <Stat label="Games (total)" value={games} href="/admin/games" />
        <Stat label="Games active now" value={gamesActive} />
        <Stat label="Players (all-time)" value={players} />
        <Stat label="Answers (all-time)" value={answers} />
        <Stat label="Results saved" value={results} href="/admin/results" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="font-display mb-2 font-bold">Recent results</h2>
          <div className="space-y-2">
            {(recentResults ?? []).map((r) => {
              const ranking = (r.ranking as { nickname: string }[]) ?? [];
              return (
                <Link
                  key={r.id}
                  href={`/admin/results/${r.id}`}
                  className="card flex items-center justify-between py-3"
                >
                  <span className="truncate font-semibold">{r.quiz_title_snapshot}</span>
                  <span className="text-sm text-muted">
                    {ranking.length} players · {new Date(r.finished_at).toLocaleDateString()}
                  </span>
                </Link>
              );
            })}
            {(!recentResults || recentResults.length === 0) && (
              <div className="card text-sm text-muted">No results yet.</div>
            )}
          </div>
        </div>

        <div>
          <h2 className="font-display mb-2 font-bold">Recent games</h2>
          <div className="space-y-2">
            {(recentGames ?? []).map((g) => (
              <Link
                key={g.id}
                href={`/admin/games/${g.id}`}
                className="card flex items-center justify-between py-3"
              >
                <span className="font-mono font-semibold">PIN {g.pin}</span>
                <span className="text-sm text-muted">
                  {g.status} · {new Date(g.created_at).toLocaleString()}
                </span>
              </Link>
            ))}
            {(!recentGames || recentGames.length === 0) && (
              <div className="card text-sm text-muted">No games yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
