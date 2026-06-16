// =============================================================================
// /api/generate — turn an already-uploaded PDF into draft questions.
//
// Pipeline: download PDF -> extract text -> conservative reuse/generate decision
// -> parse OR call Claude -> normalise -> persist as DRAFT questions.
//
// Failure handling (every case from the PRD):
//   * No extractable text (image-only scan) -> 422, clear message, no silent fail.
//   * Generator unreachable/errors -> 502, upload kept, retry without re-upload.
//   * Generator returns < N valid -> save what we have, report the real count.
//   * Embedded bank partially parses -> save parsed, flag incomplete in review.
//   * Empty/duplicate questions -> normalised + flagged at review, never auto-used.
//
// Persisting here means a refresh never loses creation work (draft autosave).
// =============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractPdfText } from "@/lib/pdf";
import { detectQuestionBank, parseQuestionBank } from "@/lib/question-detect";
import { generateQuestions } from "@/lib/anthropic";
import { isValidQuestion } from "@/lib/validation";
import type { DraftQuestion, QuestionOption } from "@/lib/types";

const LETTERS = ["a", "b", "c", "d", "e", "f"];

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const quizId = String(body.quizId ?? "");
  const count = Math.max(1, Math.min(50, Number(body.count ?? 10)));
  if (!quizId) return NextResponse.json({ error: "Missing quizId." }, { status: 400 });

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, source_pdf_path")
    .eq("id", quizId)
    .single();
  if (!quiz) return NextResponse.json({ error: "Quiz not found." }, { status: 404 });
  if (!quiz.source_pdf_path)
    return NextResponse.json(
      { error: "No PDF has been uploaded for this quiz yet." },
      { status: 400 }
    );

  // 1. Download the PDF from private storage.
  const { data: file, error: dlErr } = await supabase.storage
    .from("pdfs")
    .download(quiz.source_pdf_path);
  if (dlErr || !file)
    return NextResponse.json(
      { error: "Could not read the uploaded PDF. Try uploading it again." },
      { status: 500 }
    );

  // 2. Extract text (server-side, truncated for cost safety).
  const buffer = Buffer.from(await file.arrayBuffer());
  let extracted;
  try {
    extracted = await extractPdfText(buffer);
  } catch {
    return NextResponse.json(
      { error: "We couldn't read text from that PDF. Try a different file." },
      { status: 500 }
    );
  }

  // Image-only scan: stop and explain. Do NOT fail silently.
  if (extracted.looksImageOnly) {
    return NextResponse.json(
      {
        error:
          "This PDF looks like a scanned image — no selectable text was found. " +
          "Upload a text-based PDF, or add questions manually.",
        code: "IMAGE_ONLY",
      },
      { status: 422 }
    );
  }

  // 3. Decide reuse vs generate.
  const detect = detectQuestionBank(extracted.text);
  let path: "parsed" | "generated" = "generated";
  let drafts: DraftQuestion[] = [];
  let note = "";

  if (detect.isBank) {
    path = "parsed";
    const parsed = parseQuestionBank(extracted.text);
    drafts = parsed.questions;
    note = parsed.incomplete
      ? "We reused questions found in your PDF. Some couldn't be fully read — please review the flagged ones."
      : "We reused the questions found in your PDF.";
    if (drafts.length === 0) {
      // Detection thought it was a bank but parsing produced nothing usable —
      // fall back to generation rather than returning empty.
      path = "generated";
    }
  }

  if (!detect.isBank || drafts!.length === 0) {
    path = "generated";
    try {
      const gen = await generateQuestions({ text: extracted.text, count });
      drafts = gen.questions;
      note = "We generated these questions from your PDF with AI.";
    } catch (e) {
      // Keep the upload; allow retry WITHOUT re-uploading.
      return NextResponse.json(
        {
          error:
            "The question generator is unavailable right now. Your PDF is saved — " +
            "press Generate again to retry.",
          detail: (e as Error).message,
          code: "GENERATOR_ERROR",
        },
        { status: 502 }
      );
    }
  }

  // 4. Normalise option ids/correctness, then persist ALL drafts (valid +
  //    flagged) so nothing is lost and the host can fix/delete in review.
  const normalised = drafts!.map(normaliseDraft);
  const validCount = normalised.filter((q) => isValidQuestion(q)).length;

  // Replace any existing draft questions (regeneration is idempotent).
  await supabase.from("questions").delete().eq("quiz_id", quizId);

  if (normalised.length > 0) {
    const rows = normalised.map((q, i) => ({
      quiz_id: quizId,
      text: q.text,
      type: q.type,
      options: q.options,
      correct_option_id: q.correct_option_id,
      order_index: i,
    }));
    const { error: insErr } = await supabase.from("questions").insert(rows);
    if (insErr)
      return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // Report the real outcome; the review screen handles the rest.
  if (path === "generated" && validCount < count) {
    note +=
      ` We produced ${validCount} valid question${validCount === 1 ? "" : "s"} ` +
      `out of ${count} requested — regenerate or add more manually.`;
  }

  return NextResponse.json({
    path,
    requested: count,
    validCount,
    totalCount: normalised.length,
    note,
    detectionReasons: detect.reasons,
  });
}

/**
 * Normalise a draft: re-id options to positional letters (a,b,c,d) while
 * preserving which one was marked correct, drop empty options, and keep the
 * type consistent. Invalid results are still returned (they get flagged later).
 */
function normaliseDraft(q: DraftQuestion): DraftQuestion {
  const cleanedOpts = (q.options ?? []).filter(
    (o) => o && typeof o.text === "string"
  );

  // Which original id was correct?
  const correctIdx = cleanedOpts.findIndex((o) => o.id === q.correct_option_id);

  const reIded: QuestionOption[] = cleanedOpts.map((o, i) => ({
    id: LETTERS[i] ?? `o${i}`,
    text: o.text.trim(),
  }));

  const correct_option_id =
    correctIdx >= 0 && reIded[correctIdx] ? reIded[correctIdx].id : reIded[0]?.id ?? "a";

  const type: DraftQuestion["type"] =
    q.type === "truefalse" || reIded.length === 2 ? "truefalse" : "mcq";

  return { text: (q.text ?? "").trim(), type, options: reIded, correct_option_id };
}
