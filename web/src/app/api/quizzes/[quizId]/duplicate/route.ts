// =============================================================================
// /api/quizzes/[quizId]/duplicate — deep-copy a quiz and its questions into a
// new draft owned by the same host. The copy never references a game/result.
// =============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  _req: Request,
  { params }: { params: { quizId: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data: src, error: e1 } = await supabase
    .from("quizzes")
    .select("title, time_limit_seconds")
    .eq("id", params.quizId)
    .single();
  if (e1 || !src)
    return NextResponse.json({ error: "Quiz not found." }, { status: 404 });

  const { data: questions } = await supabase
    .from("questions")
    .select("text, type, options, correct_option_id, order_index")
    .eq("quiz_id", params.quizId)
    .order("order_index", { ascending: true });

  // Create the new draft (copies start as drafts so the host can re-review).
  const { data: copy, error: e2 } = await supabase
    .from("quizzes")
    .insert({
      host_id: user.id,
      title: `${src.title} (copy)`,
      status: "draft",
      time_limit_seconds: src.time_limit_seconds,
    })
    .select("id")
    .single();
  if (e2 || !copy)
    return NextResponse.json({ error: e2?.message ?? "Copy failed." }, { status: 500 });

  if (questions && questions.length > 0) {
    const rows = questions.map((q) => ({ ...q, quiz_id: copy.id }));
    const { error: e3 } = await supabase.from("questions").insert(rows);
    if (e3) return NextResponse.json({ error: e3.message }, { status: 500 });
  }

  return NextResponse.json({ id: copy.id });
}
