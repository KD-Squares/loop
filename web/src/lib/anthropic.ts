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

function buildPrompt(text: string, count: number): string {
  return [
    `Create exactly ${count} quiz questions from the SOURCE TEXT below.`,
    "",
    "Requirements:",
    `- Prefer 4-option multiple choice ("mcq"). Use "truefalse" only when natural.`,
    "- MCQ: exactly 4 options, all distinct, exactly one correct.",
    "- True/False: exactly 2 options (True, False), exactly one correct.",
    "- Questions must be answerable purely from the source text.",
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
