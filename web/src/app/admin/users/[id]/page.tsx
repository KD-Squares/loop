// Admin: a single host and everything they own.

import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminUserDetail({
  params,
}: {
  params: { id: string };
}) {
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!profile) notFound();

  const [{ data: quizzes }, { data: games }, { data: results }] = await Promise.all([
    admin.from("quizzes").select("id, title, status, time_limit_seconds, created_at").eq("host_id", params.id).order("created_at", { ascending: false }),
    admin.from("games").select("id, pin, status, current_round, created_at, ended_at").eq("host_id", params.id).order("created_at", { ascending: false }),
    admin.from("game_results").select("id, quiz_title_snapshot, finished_at, ranking").eq("host_id", params.id).order("finished_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/users" className="text-sm text-brand underline">
          ← All users
        </Link>
        <h1 className="font-display mt-2 text-2xl font-bold">{profile.email}</h1>
        <p className="text-sm text-muted">
          User id: <span className="font-mono">{profile.id}</span> · joined{" "}
          {new Date(profile.created_at).toLocaleString()}
        </p>
      </div>

      <section>
        <h2 className="font-display mb-2 font-bold">Quizzes ({(quizzes ?? []).length})</h2>
        <div className="space-y-2">
          {(quizzes ?? []).map((q) => (
            <Link key={q.id} href={`/admin/quizzes/${q.id}`} className="card flex items-center justify-between py-3">
              <span className="font-semibold">{q.title}</span>
              <span className="text-sm text-muted">{q.status} · {q.time_limit_seconds}s</span>
            </Link>
          ))}
          {(!quizzes || quizzes.length === 0) && <div className="card text-sm text-muted">None.</div>}
        </div>
      </section>

      <section>
        <h2 className="font-display mb-2 font-bold">Games ({(games ?? []).length})</h2>
        <div className="space-y-2">
          {(games ?? []).map((g) => (
            <Link key={g.id} href={`/admin/games/${g.id}`} className="card flex items-center justify-between py-3">
              <span className="font-mono font-semibold">PIN {g.pin}</span>
              <span className="text-sm text-muted">{g.status} · {new Date(g.created_at).toLocaleString()}</span>
            </Link>
          ))}
          {(!games || games.length === 0) && <div className="card text-sm text-muted">None.</div>}
        </div>
      </section>

      <section>
        <h2 className="font-display mb-2 font-bold">Results ({(results ?? []).length})</h2>
        <div className="space-y-2">
          {(results ?? []).map((r) => {
            const ranking = (r.ranking as { nickname: string }[]) ?? [];
            return (
              <Link key={r.id} href={`/admin/results/${r.id}`} className="card flex items-center justify-between py-3">
                <span className="font-semibold">{r.quiz_title_snapshot}</span>
                <span className="text-sm text-muted">{ranking.length} players · {new Date(r.finished_at).toLocaleDateString()}</span>
              </Link>
            );
          })}
          {(!results || results.length === 0) && <div className="card text-sm text-muted">None.</div>}
        </div>
      </section>
    </div>
  );
}
