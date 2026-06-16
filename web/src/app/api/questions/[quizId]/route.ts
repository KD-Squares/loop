// =============================================================================
// /api/questions/[quizId] — persist the reviewed/edited question set.
//
// Replaces the quiz's questions wholesale with the edited set from the review
// screen. Validates every question with the shared rules. If markReady is true,
// ALL questions must be valid and there must be at least one — otherwise the
// quiz cannot move to 'ready'. A plain save (markReady false) keeps it a draft
// so work is never lost.
// =============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateQuestion } from "@/lib/validation";
import type { DraftQuestion } from "@/lib/types";

export async function PUT(
  req: Request,
  { params }: { params: { quizId: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const incoming = Array.isArray(body.questions) ? (body.questions as DraftQuestion[]) : [];
  const markReady = body.markReady === true;

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id")
    .eq("id", params.quizId)
    .single();
  if (!quiz) return NextResponse.json({ error: "Quiz not found." }, { status: 404 });

  // Validate everything up front.
  const results = incoming.map((q) => validateQuestion(q));
  const allValid = results.every((r) => r.valid);

  if (markReady) {
    if (incoming.length === 0)
      return NextResponse.json(
        { error: "A quiz needs at least one valid question to be ready." },
        { status: 400 }
      );
    if (!allValid) {
      const invalidIndexes = results
        .map((r, i) => (r.valid ? -1 : i))
        .filter((i) => i >= 0);
      return NextResponse.json(
        {
          error: "Some questions are still invalid. Fix or delete them first.",
          invalidIndexes,
        },
        { status: 400 }
      );
    }
  }

  // Replace the question set.
  const { error: delErr } = await supabase
    .from("questions")
    .delete()
    .eq("quiz_id", params.quizId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (incoming.length > 0) {
    const rows = incoming.map((q, i) => ({
      quiz_id: params.quizId,
      text: q.text.trim(),
      type: q.type,
      options: q.options,
      correct_option_id: q.correct_option_id,
      order_index: i,
    }));
    const { error: insErr } = await supabase.from("questions").insert(rows);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // Update status: ready only when explicitly marked AND everything valid.
  const status = markReady && allValid && incoming.length > 0 ? "ready" : "draft";
  await supabase.from("quizzes").update({ status }).eq("id", params.quizId);

  return NextResponse.json({ ok: true, status });
}
