// =============================================================================
// /api/games — launch a live game from an ALREADY-SAVED quiz. No PDF/text here.
//
// Flow:
//   1. Authenticate the host (session) and verify they own the quiz.
//   2. Verify the quiz is 'ready' and has at least one valid question.
//   3. Load the quiz's questions and POST them to the realtime server's internal
//      launch endpoint (authenticated server-to-server with the service-role key).
//   4. The realtime server enforces single-game and mints the PIN + hostToken.
//
// Returns { gameId, pin, hostToken } for the host page to open its socket.
// =============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { isValidQuestion } from "@/lib/validation";
import type { Question } from "@/lib/types";

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const quizId = String(body.quizId ?? "");
  if (!quizId) return NextResponse.json({ error: "Missing quizId." }, { status: 400 });

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, status, time_limit_seconds")
    .eq("id", quizId)
    .single();
  if (!quiz) return NextResponse.json({ error: "Quiz not found." }, { status: 404 });
  if (quiz.status !== "ready")
    return NextResponse.json(
      { error: "This quiz isn't ready yet. Review it before hosting." },
      { status: 400 }
    );

  const { data: questions } = await supabase
    .from("questions")
    .select("*")
    .eq("quiz_id", quizId)
    .order("order_index", { ascending: true });

  const valid = (questions ?? []).filter((q) =>
    isValidQuestion(q as unknown as Question)
  ) as unknown as Question[];

  if (valid.length === 0)
    return NextResponse.json(
      { error: "This quiz has no valid questions to play." },
      { status: 400 }
    );

  // Shape questions for the realtime server (identity-based correct option).
  const payloadQuestions = valid.map((q) => ({
    questionId: q.id,
    text: q.text,
    type: q.type,
    options: q.options,
    correctOptionId: q.correct_option_id,
  }));

  const { serviceRoleKey, socketInternalUrl } = serverEnv();

  let res: Response;
  try {
    res = await fetch(`${socketInternalUrl}/internal/games`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        quizId: quiz.id,
        hostId: user.id,
        quizTitle: quiz.title,
        timeLimitSeconds: quiz.time_limit_seconds,
        questions: payloadQuestions,
      }),
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Couldn't reach the game server. Make sure the realtime server is running.",
      },
      { status: 503 }
    );
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 409 == single-game enforcement (a game is already active).
    return NextResponse.json(
      { error: data.error ?? "Could not start the game." },
      { status: res.status }
    );
  }

  return NextResponse.json(data); // { gameId, pin, hostToken }
}
