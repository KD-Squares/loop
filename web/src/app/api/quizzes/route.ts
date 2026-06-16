// =============================================================================
// /api/quizzes — list the host's quizzes (GET) and create a draft quiz (POST).
//
// Runs under the host's session (RLS enforces ownership). No PDF here — POST
// just creates the draft shell so creation work is never lost on refresh.
// =============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data, error } = await supabase
    .from("quizzes")
    .select("id, title, status, time_limit_seconds, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach question counts.
  const withCounts = await Promise.all(
    (data ?? []).map(async (q) => {
      const { count } = await supabase
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("quiz_id", q.id);
      return { ...q, question_count: count ?? 0 };
    })
  );

  return NextResponse.json({ quizzes: withCounts });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  const timeLimit = Number(body.time_limit_seconds ?? 20);

  if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });
  if (!(timeLimit >= 5 && timeLimit <= 120)) {
    return NextResponse.json(
      { error: "Time limit must be between 5 and 120 seconds." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("quizzes")
    .insert({
      host_id: user.id,
      title,
      status: "draft",
      time_limit_seconds: timeLimit,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
