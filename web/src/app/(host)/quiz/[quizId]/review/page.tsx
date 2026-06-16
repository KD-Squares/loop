// Question review & edit (mandatory before hosting). Loads the quiz + its draft
// questions and hands them to the editor client.

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ReviewClient from "./ReviewClient";
import type { Question } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ReviewPage({
  params,
}: {
  params: { quizId: string };
}) {
  const supabase = createClient();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, status, time_limit_seconds, source_pdf_path")
    .eq("id", params.quizId)
    .single();
  if (!quiz) notFound();

  const { data: questions } = await supabase
    .from("questions")
    .select("*")
    .eq("quiz_id", params.quizId)
    .order("order_index", { ascending: true });

  return (
    <ReviewClient
      quizId={quiz.id}
      quizTitle={quiz.title}
      status={quiz.status}
      hasPdf={!!quiz.source_pdf_path}
      initialQuestions={(questions ?? []) as Question[]}
    />
  );
}
