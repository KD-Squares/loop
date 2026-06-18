// Dashboard = the host's quiz library. Server component loads the quizzes, then
// hands off to a client component for the interactive actions.

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DashboardClient, { QuizListItem } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();

  const { data: quizzes } = await supabase
    .from("quizzes")
    .select("id, title, status, time_limit_seconds, created_at, updated_at")
    .order("updated_at", { ascending: false });

  const items: QuizListItem[] = await Promise.all(
    (quizzes ?? []).map(async (q) => {
      const { count } = await supabase
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("quiz_id", q.id);
      return { ...q, question_count: count ?? 0 } as QuizListItem;
    })
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Your quiz library</h1>
          <p className="text-sm text-muted">
            Build a quiz once, then host it as many live games as you like.
          </p>
        </div>
        <Link href="/create" className="btn-primary">
          + Create quiz
        </Link>
      </div>

      <DashboardClient initialQuizzes={items} />
    </div>
  );
}
