// =============================================================================
// /api/quizzes/[quizId] — GET one quiz (with questions), PATCH metadata,
// DELETE the quiz. All under the host's session (RLS enforces ownership).
//
// Deleting a quiz cascades to its questions but NOT to game_results, which are
// decoupled and keep a title snapshot — so history survives.
// =============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: { quizId: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data: quiz, error } = await supabase
    .from("quizzes")
    .select("*")
    .eq("id", params.quizId)
    .single();
  if (error || !quiz)
    return NextResponse.json({ error: "Quiz not found." }, { status: 404 });

  const { data: questions } = await supabase
    .from("questions")
    .select("*")
    .eq("quiz_id", params.quizId)
    .order("order_index", { ascending: true });

  return NextResponse.json({ quiz, questions: questions ?? [] });
}

export async function PATCH(
  req: Request,
  { params }: { params: { quizId: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string") patch.title = body.title.trim();
  if (typeof body.status === "string" && ["draft", "ready"].includes(body.status))
    patch.status = body.status;
  if (typeof body.time_limit_seconds === "number") {
    const t = body.time_limit_seconds;
    if (t >= 5 && t <= 120) patch.time_limit_seconds = t;
  }

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });

  const { error } = await supabase
    .from("quizzes")
    .update(patch)
    .eq("id", params.quizId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { quizId: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { error } = await supabase.from("quizzes").delete().eq("id", params.quizId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
