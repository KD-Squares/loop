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
import { extractDocxText } from "@/lib/docx";
import { detectQuestionBank } from "@/lib/question-detect";
import { generateQuestions, extractQuestions } from "@/lib/anthropic";
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
  const count = Math.max(1, Math.min(100, Number(body.count ?? 10)));
  if (!quizId) return NextResponse.json({ error: "Missing quizId." }, { status: 400 });

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, source_pdf_path")
    .eq("id", quizId)
    .single();
  if (!quiz) return NextResponse.json({ error: "Quiz not found." }, { status: 404 });
  if (!quiz.source_pdf_path)
    return NextResponse.json(
      { error: "No file has been uploaded for this quiz yet." },
      { status: 400 }
    );

  // 1. Download the source file (PDF or DOCX) from private storage.
  const { data: file, error: dlErr } = await supabase.storage
    .from("pdfs")
    .download(quiz.source_pdf_path);
  if (dlErr || !file)
    return NextResponse.json(
      { error: "Could not read the uploaded file. Try uploading it again." },
      { status: 500 }
    );

  // 2. Extract text (server-side, truncated for cost safety). Pick the reader
  //    by file extension: .docx via mammoth, otherwise the PDF reader.
  const isDocx = quiz.source_pdf_path.toLowerCase().endsWith(".docx");
  const buffer = Buffer.from(await file.arrayBuffer());
  let extracted;
  try {
    extracted = isDocx
      ? await extractDocxText(buffer)
      : await extractPdfText(buffer);
  } catch {
    return NextResponse.json(
      { error: "We couldn't read text from that file. Try a different file." },
      { status: 500 }
    );
  }

  // Image-only / empty document: stop and explain. Do NOT fail silently.
  if (extracted.looksImageOnly) {
    return NextResponse.json(
      {
        error: isDocx
          ? "We couldn't find selectable text in that Word file. Add questions manually, or try a PDF."
          : "This PDF looks like a scanned image (no selectable text was found). Upload a text-based PDF, or add questions manually.",
        code: "IMAGE_ONLY",
      },
      { status: 422 }
    );
  }

  // 3. Decide reuse vs generate.
  //    If the document already contains a question bank, let the AI read its
  //    structure and extract the questions faithfully (it understands answers
  //    shown on a separate line below the options, answer keys, etc.). Otherwise
  //    generate fresh, standalone questions.
  const detect = detectQuestionBank(extracted.text);
  let path: "parsed" | "generated" = "generated";
  let drafts: DraftQuestion[] = [];
  let note = "";

  const generatorError = (e: unknown) =>
    NextResponse.json(
      {
        error:
          "The question AI is unavailable right now. Your file is saved — press " +
          "Generate again to retry.",
        detail: (e as Error).message,
        code: "GENERATOR_ERROR",
      },
      { status: 502 }
    );

  if (detect.isBank) {
    try {
      const ex = await extractQuestions({ text: extracted.text });
      if (ex.questions.length > 0) {
        path = "parsed";
        drafts = ex.questions;
        note =
          "We found existing questions in your document and reused them. Please " +
          "double-check the marked correct answers.";
      }
    } catch (e) {
      return generatorError(e);
    }
  }

  if (drafts.length === 0) {
    path = "generated";
    try {
      const gen = await generateQuestions({ text: extracted.text, count });
      drafts = gen.questions;
      note = "We generated these questions from your document with AI.";
    } catch (e) {
      return generatorError(e);
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

  return {
    text: stripMetaPrefix((q.text ?? "").trim()),
    type,
    options: reIded,
    correct_option_id,
  };
}

/**
 * Remove source-referencing lead-ins so questions read directly. Safety net in
 * case the model still starts a question with "According to the document," etc.
 * Only strips the meta prefix; it never removes real question content.
 */
function stripMetaPrefix(text: string): string {
  const cleaned = text.replace(
    /^\s*(according to|based on|as (?:stated|mentioned|described|noted|shown|explained)(?: in)?|per|from|in)\s+(?:the\s+)?(text|passage|document|handbook|hand-?book|article|author|material|content|book|notes?|excerpt|manual|chapter|section|reading)\b[\s,:;.\-]*/i,
    ""
  );
  if (!cleaned) return text;
  // Re-capitalise the first letter after stripping a prefix.
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
