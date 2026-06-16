// =============================================================================
// validation.ts — question validation rules, shared by the review UI and the
// persistence API so the same rules apply everywhere.
//
// Rules (from the PRD):
//   MCQ        = exactly 4 distinct non-empty options, exactly one correct.
//   truefalse  = exactly 2 options, exactly one correct.
//   text       = non-empty.
// Any question failing these is FLAGGED, never silently included.
// =============================================================================

import type { DraftQuestion, Question, QuestionOption } from "./types";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

type Validatable = Pick<
  Question | DraftQuestion,
  "text" | "type" | "options" | "correct_option_id"
>;

export function validateQuestion(q: Validatable): ValidationResult {
  const errors: string[] = [];

  if (!q.text || q.text.trim().length === 0) {
    errors.push("Question text is empty.");
  }

  const options: QuestionOption[] = Array.isArray(q.options) ? q.options : [];
  const nonEmpty = options.filter((o) => o.text && o.text.trim().length > 0);

  if (q.type === "mcq") {
    if (options.length !== 4) errors.push("MCQ must have exactly 4 options.");
    if (nonEmpty.length !== options.length)
      errors.push("All options must be non-empty.");
    // distinct option texts
    const seen = new Set(nonEmpty.map((o) => o.text.trim().toLowerCase()));
    if (seen.size !== options.length)
      errors.push("Options must be distinct.");
  } else if (q.type === "truefalse") {
    if (options.length !== 2) errors.push("True/False must have exactly 2 options.");
    if (nonEmpty.length !== options.length)
      errors.push("Both options must be non-empty.");
  } else {
    errors.push("Unknown question type.");
  }

  // Exactly one correct option, identified by identity.
  const correct = options.filter((o) => o.id === q.correct_option_id);
  if (correct.length !== 1) {
    errors.push("Exactly one option must be marked correct.");
  }

  return { valid: errors.length === 0, errors };
}

export function isValidQuestion(q: Validatable): boolean {
  return validateQuestion(q).valid;
}
