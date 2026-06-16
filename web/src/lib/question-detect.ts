// =============================================================================
// question-detect.ts — conservative "reuse vs generate" detection + a parser
// for embedded question banks.
//
// Decision rule (deliberately conservative, to avoid mis-parsing prose):
//   PARSE the existing bank only when the text clearly contains ALL of:
//     1. repeated numbered/lettered stems (e.g. "1." "2." "3." ...),
//     2. option markers A/B/C/D, AND
//     3. an indicated correct answer (an answer key, or a marked option).
//   Otherwise, GENERATE with Claude.
//
// The parser is best-effort: questions it cannot fully resolve are returned and
// FLAGGED via `incomplete`, so the review screen can ask the host to fix them —
// nothing invalid is silently included.
// =============================================================================

import type { DraftQuestion, QuestionOption } from "./types";

const LETTERS = ["a", "b", "c", "d", "e", "f"];

export interface DetectResult {
  isBank: boolean;
  reasons: string[];
}

/** Conservative detector: requires stems + option markers + an answer signal. */
export function detectQuestionBank(text: string): DetectResult {
  const reasons: string[] = [];

  const numberedStems = (text.match(/^\s*\d+[\.\)]\s+/gm) ?? []).length;
  const optionMarkers = (text.match(/(^|\s)[A-D][\.\)]\s+/gm) ?? []).length;

  const hasAnswerKey =
    /answer\s*key/i.test(text) ||
    /answers?\s*[:\-]/i.test(text) ||
    /\banswer\s*[:\-]\s*[A-D]\b/i.test(text);
  const hasMarkedCorrect =
    /\*\s*[A-D][\.\)]/.test(text) || /\((?:correct|ans(?:wer)?)\)/i.test(text);

  const hasStems = numberedStems >= 3;
  const hasOptions = optionMarkers >= 6; // ~at least a couple of full questions
  const hasAnswer = hasAnswerKey || hasMarkedCorrect;

  if (hasStems) reasons.push(`${numberedStems} numbered stems`);
  if (hasOptions) reasons.push(`${optionMarkers} option markers`);
  if (hasAnswerKey) reasons.push("answer key detected");
  if (hasMarkedCorrect) reasons.push("marked correct options");

  return { isBank: hasStems && hasOptions && hasAnswer, reasons };
}

export interface ParseResult {
  questions: DraftQuestion[];
  incomplete: boolean; // true if some questions could not be fully resolved
  parsedCount: number;
}

/**
 * Parse an embedded question bank. Returns whatever it can resolve plus an
 * `incomplete` flag. Never throws on messy input — it just resolves fewer items.
 */
export function parseQuestionBank(text: string): ParseResult {
  const answerKey = extractAnswerKey(text);

  // Split into blocks starting at each "N." / "N)" stem.
  const blocks: { num: number; body: string }[] = [];
  const stemRe = /(^|\n)\s*(\d+)[\.\)]\s+/g;
  let match: RegExpExecArray | null;
  const indices: { num: number; start: number }[] = [];
  while ((match = stemRe.exec(text)) !== null) {
    indices.push({ num: Number(match[2]), start: match.index + match[0].length });
  }
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i].start;
    const end = i + 1 < indices.length ? indices[i + 1].start : text.length;
    blocks.push({ num: indices[i].num, body: text.slice(start, end).trim() });
  }

  const questions: DraftQuestion[] = [];
  let incomplete = false;

  for (const block of blocks) {
    const parsed = parseBlock(block.body, block.num, answerKey);
    if (!parsed) {
      incomplete = true;
      continue;
    }
    if (parsed.incomplete) incomplete = true;
    questions.push(parsed.question);
  }

  return { questions, incomplete, parsedCount: questions.length };
}

// ---- internals --------------------------------------------------------------

/** Build a map of question number -> correct letter from an answer-key section. */
function extractAnswerKey(text: string): Map<number, string> {
  const map = new Map<number, string>();
  // Pattern: "1. B", "1) C", "1 - A", possibly many per line.
  const re = /\b(\d+)\s*[\.\)\-:]\s*([A-D])\b/g;
  // Only trust matches that appear AFTER an "answer key"/"answers" marker, to
  // avoid mistaking question numbering for answers.
  const keyStart = text.search(/answer\s*key|answers?\s*[:\-]/i);
  const scope = keyStart >= 0 ? text.slice(keyStart) : "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(scope)) !== null) {
    map.set(Number(m[1]), m[2].toLowerCase());
  }
  return map;
}

function parseBlock(
  body: string,
  num: number,
  answerKey: Map<number, string>
): { question: DraftQuestion; incomplete: boolean } | null {
  // Find option markers A-D within the block.
  const optionRe = /(^|\n|\s)(\*?)\s*([A-D])[\.\)]\s*([^\n]+?)(?=(?:\s+[A-D][\.\)]\s)|\n|$)/g;
  const opts: { letter: string; text: string; marked: boolean }[] = [];
  let m: RegExpExecArray | null;
  let firstOptionAt = body.length;
  while ((m = optionRe.exec(body)) !== null) {
    if (m.index < firstOptionAt) firstOptionAt = m.index;
    opts.push({
      letter: m[3].toLowerCase(),
      text: m[4].trim().replace(/\s*\(correct\)\s*/i, "").trim(),
      marked: m[2] === "*" || /\(correct\)/i.test(m[0]),
    });
  }

  // Stem is everything before the first option.
  const stem = body.slice(0, firstOptionAt).trim().replace(/\s+/g, " ");
  if (!stem) return null;

  // True/False detection if the block looks like a T/F statement with no options.
  if (opts.length < 2) {
    const tf = /\b(true|false)\b/i.test(body);
    const keyLetter = answerKey.get(num);
    if (tf && keyLetter) {
      // map a/b -> true/false if the key uses A/B; otherwise we can't be sure.
    }
    return null; // not enough to resolve confidently
  }

  // Build options preserving order A,B,C,D.
  const ordered = [...opts].sort((a, b) =>
    LETTERS.indexOf(a.letter) - LETTERS.indexOf(b.letter)
  );
  const options: QuestionOption[] = ordered.map((o) => ({
    id: o.letter,
    text: o.text,
  }));

  // Decide correct option: prefer the answer key, fall back to a marked option.
  let correctId = answerKey.get(num) ?? "";
  if (!correctId) {
    const marked = ordered.find((o) => o.marked);
    if (marked) correctId = marked.letter;
  }

  // Type: 2 options -> truefalse, 4 -> mcq, otherwise leave as mcq and flag.
  const type: DraftQuestion["type"] = options.length === 2 ? "truefalse" : "mcq";

  const incomplete =
    !correctId ||
    !options.some((o) => o.id === correctId) ||
    (type === "mcq" && options.length !== 4);

  return {
    question: {
      text: stem,
      type,
      options,
      correct_option_id: correctId || options[0]?.id || "a",
    },
    incomplete,
  };
}
