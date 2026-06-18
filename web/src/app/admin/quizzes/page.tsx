// Admin: every quiz across all hosts.

import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminQuizzes() {
  const admin = createAdminClient();
  const [{ data: quizzes }, { data: profiles }, { data: questions }] = await Promise.all([
    admin.from("quizzes").select("id, host_id, title, status, time_limit_seconds, created_at").order("created_at", { ascending: false }),
    admin.from("profiles").select("id, email"),
    admin.from("questions").select("quiz_id"),
  ]);

  const emailById = new Map((profiles ?? []).map((p) => [p.id, p.email]));
  const qCount = new Map<string, number>();
  for (const q of questions ?? []) qCount.set(q.quiz_id, (qCount.get(q.quiz_id) ?? 0) + 1);

  return (
    <div>
      <h1 className="font-display mb-1 text-2xl font-bold">Quizzes</h1>
      <p className="mb-6 text-sm text-muted">{(quizzes ?? []).length} total, across all hosts.</p>

      <div className="overflow-x-auto rounded-xl2 ring-1 ring-line">
        <table className="w-full text-sm">
          <thead className="bg-cream text-left">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Questions</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {(quizzes ?? []).map((q) => (
              <tr key={q.id} className="border-t border-line hover:bg-cream/50">
                <td className="px-4 py-3">
                  <Link href={`/admin/quizzes/${q.id}`} className="font-semibold text-brand underline">
                    {q.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted">{emailById.get(q.host_id) ?? "-"}</td>
                <td className="px-4 py-3">{q.status}</td>
                <td className="px-4 py-3">{qCount.get(q.id) ?? 0}</td>
                <td className="px-4 py-3">{q.time_limit_seconds}s</td>
                <td className="px-4 py-3 text-muted">{new Date(q.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
