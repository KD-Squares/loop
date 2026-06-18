// Admin: a single game with its players and raw answers.

import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const ANSWER_LIMIT = 1000;

export default async function AdminGameDetail({
  params,
}: {
  params: { id: string };
}) {
  const admin = createAdminClient();
  const { data: game } = await admin.from("games").select("*").eq("id", params.id).maybeSingle();
  if (!game) notFound();

  const [{ data: owner }, { data: players }, { data: answers, count: answerCount }] =
    await Promise.all([
      admin.from("profiles").select("id, email").eq("id", game.host_id).maybeSingle(),
      admin.from("game_players").select("*").eq("game_id", params.id).order("total_score", { ascending: false }),
      admin
        .from("answers")
        .select("id, question_id, player_id, selected_option_id, time_taken_ms, points_awarded, created_at", { count: "exact" })
        .eq("game_id", params.id)
        .order("created_at", { ascending: true })
        .limit(ANSWER_LIMIT),
    ]);

  const nameByPlayer = new Map((players ?? []).map((p) => [p.id, p.nickname]));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/games" className="text-sm text-brand underline">
          ← All games
        </Link>
        <h1 className="font-display mt-2 text-2xl font-bold">Game PIN {game.pin}</h1>
        <p className="text-sm text-muted">
          Owner:{" "}
          {owner ? (
            <Link href={`/admin/users/${owner.id}`} className="text-brand underline">
              {owner.email}
            </Link>
          ) : (
            "-"
          )}{" "}
          · {game.status} · round {game.current_round} · created{" "}
          {new Date(game.created_at).toLocaleString()}
          {game.ended_at ? ` · ended ${new Date(game.ended_at).toLocaleString()}` : ""}
        </p>
      </div>

      <section>
        <h2 className="font-display mb-2 font-bold">Players ({(players ?? []).length})</h2>
        <div className="overflow-x-auto rounded-xl2 ring-1 ring-line">
          <table className="w-full text-sm">
            <thead className="bg-cream text-left">
              <tr>
                <th className="px-4 py-2">Nickname</th>
                <th className="px-4 py-2">Score</th>
                <th className="px-4 py-2">Total time (ms)</th>
                <th className="px-4 py-2">Joined</th>
              </tr>
            </thead>
            <tbody>
              {(players ?? []).map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-4 py-2 font-semibold">{p.nickname}</td>
                  <td className="px-4 py-2">{Number(p.total_score).toFixed(1)}</td>
                  <td className="px-4 py-2 text-muted">{p.total_time_ms}</td>
                  <td className="px-4 py-2 text-muted">{new Date(p.joined_at).toLocaleTimeString()}</td>
                </tr>
              ))}
              {(!players || players.length === 0) && (
                <tr><td className="px-4 py-3 text-muted" colSpan={4}>No players.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="font-display mb-2 font-bold">
          Answers ({answerCount ?? 0}{(answerCount ?? 0) > ANSWER_LIMIT ? `, showing first ${ANSWER_LIMIT}` : ""})
        </h2>
        <div className="overflow-x-auto rounded-xl2 ring-1 ring-line">
          <table className="w-full text-sm">
            <thead className="bg-cream text-left">
              <tr>
                <th className="px-4 py-2">Player</th>
                <th className="px-4 py-2">Question</th>
                <th className="px-4 py-2">Chose</th>
                <th className="px-4 py-2">Time (ms)</th>
                <th className="px-4 py-2">Points</th>
              </tr>
            </thead>
            <tbody>
              {(answers ?? []).map((a) => (
                <tr key={a.id} className="border-t border-line">
                  <td className="px-4 py-2">{nameByPlayer.get(a.player_id) ?? a.player_id}</td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">{a.question_id}</td>
                  <td className="px-4 py-2">{a.selected_option_id ?? "(none)"}</td>
                  <td className="px-4 py-2 text-muted">{a.time_taken_ms ?? "-"}</td>
                  <td className="px-4 py-2">{Number(a.points_awarded).toFixed(1)}</td>
                </tr>
              ))}
              {(!answers || answers.length === 0) && (
                <tr><td className="px-4 py-3 text-muted" colSpan={5}>No answers recorded.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
