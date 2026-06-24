// =============================================================================
// anthropic.ts — question generation via Claude. SERVER ONLY.
//
// Reads ANTHROPIC_API_KEY from the environment. Uses model claude-sonnet-4-6.
// Never called from the browser. Text is already truncated upstream (pdf.ts) for
// cost safety before it reaches here.
// =============================================================================

import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { DraftQuestion, QuestionOption } from "./types";

const MODEL = "claude-sonnet-4-6";

export interface GenerateInput {
  text: string; // extracted, truncated source text
  count: number; // requested number of questions (N)
}

export interface GenerateOutput {
  questions: DraftQuestion[];
  rawCount: number;
}

/**
 * Generate up to `count` multiple-choice / true-false questions from source text.
 * Returns whatever valid-shaped questions the model produced; the caller then
 * runs full validation and reports the real count to the host.
 *
 * Throws on an unreachable / errored API so the caller can keep the upload and
 * offer a retry WITHOUT re-uploading.
 */
export async function generateQuestions(
  input: GenerateInput
): Promise<GenerateOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your environment to generate questions."
    );
  }

  const client = new Anthropic({ apiKey });

  const system =
    "You are a quiz author. From the supplied source text you create clear, " +
    "factually-grounded quiz questions. You ONLY use information present in the " +
    "source text. You return STRICT JSON and nothing else.";

  const userPrompt = buildPrompt(input.text, input.count);

  // Output budget must scale with the requested count, or the JSON gets cut off
  // (this is what capped results near ~30 before). Roughly ~140 tokens/question
  // plus headroom, clamped to a safe ceiling for the model.
  const maxTokens = Math.min(32000, 1500 + input.count * 160);

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    temperature: 0.4,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });

  // Concatenate text blocks.
  const raw = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const parsed = safeParseQuestions(raw);
  return { questions: parsed, rawCount: parsed.length };
}

/**
 * Extract questions that ALREADY exist in the document, understanding its
 * structure (including correct answers shown on a separate line below the
 * options, or in an answer key). Returns the faithfully-extracted questions.
 *
 * Throws on an unreachable / errored API so the caller can keep the upload and
 * offer a retry without re-uploading.
 */
export async function extractQuestions(input: {
  text: string;
}): Promise<GenerateOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your environment to read questions."
    );
  }

  const client = new Anthropic({ apiKey });
  const system =
    "You extract existing quiz questions from a document exactly as written, " +
    "identifying the correct answer from the document's structure. You return " +
    "STRICT JSON and nothing else.";

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 32000, // a document can hold many questions; give ample room
    temperature: 0,
    system,
    messages: [{ role: "user", content: buildExtractPrompt(input.text) }],
  });

  const raw = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const parsed = safeParseQuestions(raw);
  return { questions: parsed, rawCount: parsed.length };
}

// Shared instruction so questions read as direct, standalone questions.
const STANDALONE_RULE =
  '- Write each question directly and standalone. Do NOT reference the source: ' +
  'never use phrases like "according to the text", "according to the handbook", ' +
  '"based on the passage", "as mentioned in the document", "per the author", or ' +
  'similar. Ask about the fact itself (for example: "What is the capital of ' +
  'France?", not "According to the document, what is the capital of France?").';

function buildPrompt(text: string, count: number): string {
  return [
    `Create exactly ${count} quiz questions from the SOURCE TEXT below.`,
    "",
    "Requirements:",
    `- Prefer 4-option multiple choice ("mcq"). Use "truefalse" only when natural.`,
    "- MCQ: exactly 4 options, all distinct, exactly one correct.",
    "- True/False: exactly 2 options (True, False), exactly one correct.",
    "- Questions must be answerable from the facts in the source text.",
    STANDALONE_RULE,
    "- Keep each question and option concise.",
    "",
    "Return ONLY a JSON array, no prose, no markdown fences, of objects shaped:",
    `[{"text": "...", "type": "mcq" | "truefalse",`,
    ` "options": [{"id": "a", "text": "..."}, ...],`,
    ` "correct_option_id": "a"}]`,
    "",
    'Option ids must be lowercase letters ("a","b","c","d" for mcq; "a","b" for truefalse).',
    "correct_option_id MUST match one of the option ids.",
    "",
    "SOURCE TEXT:",
    '"""',
    text,
    '"""',
  ].join("\n");
}

function buildExtractPrompt(text: string): string {
  return [
    "The SOURCE TEXT below ALREADY contains quiz questions, each with answer",
    "options and an indicated correct answer. The correct answer may appear on a",
    'separate line below the options (for example "Answer: B", "Ans: C", or the',
    "full correct option repeated), or in an answer key elsewhere in the document,",
    "or marked with an asterisk. Read the document structure and extract the",
    "questions faithfully.",
    "",
    "Rules:",
    "- Extract EVERY question you find. Do not invent new ones and do not skip any.",
    "- Keep the original question wording and the original answer options.",
    "- Work out the correct option from the document (the answer line, answer key,",
    "  or marking) and set correct_option_id to that option.",
    "- Do not include the answer line itself as if it were an option.",
    '- Convert any true/false items to type "truefalse" with options True and False.',
    STANDALONE_RULE,
    "",
    "Return ONLY a JSON array, no prose, no markdown fences, of objects shaped:",
    `[{"text": "...", "type": "mcq" | "truefalse",`,
    ` "options": [{"id": "a", "text": "..."}, ...],`,
    ` "correct_option_id": "a"}]`,
    "",
    'Option ids must be lowercase letters ("a","b","c","d" for mcq; "a","b" for truefalse).',
    "correct_option_id MUST match one of the option ids.",
    "",
    "SOURCE TEXT:",
    '"""',
    text,
    '"""',
  ].join("\n");
}

/** Parse the model output defensively; drop anything malformed. */
function safeParseQuestions(raw: string): DraftQuestion[] {
  // Strip accidental markdown fences.
  let json = raw.trim();
  const fence = json.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) json = fence[1].trim();

  // Grab the outermost array if there's surrounding text.
  const start = json.indexOf("[");
  const end = json.lastIndexOf("]");
  if (start >= 0 && end > start) json = json.slice(start, end + 1);

  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const out: DraftQuestion[] = [];
  for (const item of data) {
    const q = item as Record<string, unknown>;
    const type = q.type === "truefalse" ? "truefalse" : "mcq";
    const text = typeof q.text === "string" ? q.text.trim() : "";
    const rawOpts = Array.isArray(q.options) ? q.options : [];
    const options: QuestionOption[] = rawOpts
      .map((o) => o as Record<string, unknown>)
      .filter((o) => typeof o.id === "string" && typeof o.text === "string")
      .map((o) => ({ id: String(o.id).toLowerCase(), text: String(o.text).trim() }));
    const correct =
      typeof q.correct_option_id === "string"
        ? q.correct_option_id.toLowerCase()
        : "";

    if (!text || options.length === 0) continue;
    out.push({ text, type, options, correct_option_id: correct });
  }
  return out;
}
