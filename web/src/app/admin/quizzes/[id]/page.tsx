// Admin: a single quiz with all its questions, options, and correct answers.

import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface Opt {
  id: string;
  text: string;
}

export default async function AdminQuizDetail({
  params,
}: {
  params: { id: string };
}) {
  const admin = createAdminClient();
  const { data: quiz } = await admin.from("quizzes").select("*").eq("id", params.id).maybeSingle();
  if (!quiz) notFound();

  const [{ data: owner }, { data: questions }] = await Promise.all([
    admin.from("profiles").select("id, email").eq("id", quiz.host_id).maybeSingle(),
    admin.from("questions").select("*").eq("quiz_id", params.id).order("order_index", { ascending: true }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/quizzes" className="text-sm text-brand underline">
          ← All quizzes
        </Link>
        <h1 className="font-display mt-2 text-2xl font-bold">{quiz.title}</h1>
        <p className="text-sm text-muted">
          Owner:{" "}
          {owner ? (
            <Link href={`/admin/users/${owner.id}`} className="text-brand underline">
              {owner.email}
            </Link>
          ) : (
            "-"
          )}{" "}
          · {quiz.status} · {quiz.time_limit_seconds}s per question
          {quiz.source_pdf_path ? ` · PDF: ${quiz.source_pdf_path}` : ""}
        </p>
      </div>

      <div className="space-y-3">
        {(questions ?? []).map((q, i) => {
          const options = (q.options as Opt[]) ?? [];
          return (
            <div key={q.id} className="card">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-muted">Question {i + 1} · {q.type}</span>
              </div>
              <p className="mb-2 font-semibold">{q.text}</p>
              <ul className="space-y-1">
                {options.map((o) => {
                  const correct = o.id === q.correct_option_id;
                  return (
                    <li
                      key={o.id}
                      className={`rounded-lg px-3 py-1.5 text-sm ${
                        correct ? "bg-tile-green/15 font-semibold text-tile-green" : "bg-cream"
                      }`}
                    >
                      {o.text} {correct && "✓ correct"}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {(!questions || questions.length === 0) && (
          <div className="card text-sm text-muted">This quiz has no questions.</div>
        )}
      </div>
    </div>
  );
}
