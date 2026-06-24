// =============================================================================
// docx.ts — server-side Word (.docx) text extraction via mammoth.
//
// SERVER ONLY. Mirrors the shape returned by extractPdfText so the generate
// route can treat PDF and DOCX uniformly. Truncates to the same character limit
// for cost safety.
// =============================================================================

import "server-only";
import { MAX_EXTRACT_CHARS, type ExtractResult } from "./pdf";

export async function extractDocxText(buffer: Buffer): Promise<ExtractResult> {
  const mammoth = (await import("mammoth")).default ?? (await import("mammoth"));
  const result = await (mammoth as any).extractRawText({ buffer });

  const cleaned = String(result?.value ?? "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // A .docx with essentially no text (e.g. only images) cannot be used.
  const looksImageOnly = cleaned.replace(/\s/g, "").length < 40;

  return {
    text: cleaned.slice(0, MAX_EXTRACT_CHARS),
    rawLength: cleaned.length,
    looksImageOnly,
  };
}
