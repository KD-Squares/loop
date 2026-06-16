// Ambient declaration for the pdf-parse implementation subpath we import in
// web/src/lib/pdf.ts (it ships no types for the deep path).
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info: unknown;
  }
  const pdfParse: (data: Buffer) => Promise<PdfParseResult>;
  export default pdfParse;
}
