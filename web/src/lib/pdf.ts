// =============================================================================
// pdf.ts — server-side PDF text extraction (pdf-parse wrapper).
//
// SERVER ONLY. Truncates extracted text before it is ever sent to Claude, for
// cost safety. Detects the "image-only scan" case (little/no extractable text)
// so the caller can surface a clear message instead of failing silently.
// =============================================================================

import "server-only";

// Characters of extracted text we keep before sending to the model. Larger
// documents (and up to 100 questions) need more source material, so we keep a
// generous slice while still bounding token cost.
export const MAX_EXTRACT_CHARS = 32000;

export interface ExtractResult {
  text: string; // truncated, cleaned
  rawLength: number; // length before truncation
  looksImageOnly: boolean; // true if essentially no text could be extracted
}

export async function extractPdfText(buffer: Buffer): Promise<ExtractResult> {
  // pdf-parse is CommonJS; import the implementation file directly to avoid its
  // index.js debug-mode side effect that reads a test asset from disk.
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (
    b: Buffer
  ) => Promise<{ text: string }>;

  const parsed = await pdfParse(buffer);
  const cleaned = (parsed.text ?? "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Heuristic for image-only scans: almost no extractable text.
  const looksImageOnly = cleaned.replace(/\s/g, "").length < 40;

  return {
    text: cleaned.slice(0, MAX_EXTRACT_CHARS),
    rawLength: cleaned.length,
    looksImageOnly,
  };
}
