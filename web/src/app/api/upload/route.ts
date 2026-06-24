// =============================================================================
// /api/upload — store an uploaded PDF in the private `pdfs` bucket.
//
// This is the ONLY place a PDF enters the system, during quiz creation.
// Server-side guards re-check type and size (defence in depth; the client also
// checks before uploading). Path convention: <host_id>/<quiz_id>/source.pdf,
// matching the storage RLS policies.
// =============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const quizId = String(form.get("quizId") ?? "");
  const file = form.get("file");

  if (!quizId) return NextResponse.json({ error: "Missing quizId." }, { status: 400 });
  if (!(file instanceof File))
    return NextResponse.json({ error: "No file provided." }, { status: 400 });

  // Type + size guards. Accept PDF or Word (.docx).
  const name = file.name.toLowerCase();
  const DOCX_MIME =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
  const isDocx = file.type === DOCX_MIME || name.endsWith(".docx");
  if (!isPdf && !isDocx)
    return NextResponse.json(
      { error: "Only PDF or Word (.docx) files are accepted." },
      { status: 400 }
    );
  if (file.size > MAX_BYTES)
    return NextResponse.json(
      { error: "That file is larger than 10 MB. Please split or compress it." },
      { status: 400 }
    );

  // Confirm the host owns the quiz (RLS also enforces this on the update below).
  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id")
    .eq("id", quizId)
    .single();
  if (!quiz) return NextResponse.json({ error: "Quiz not found." }, { status: 404 });

  const ext = isPdf ? "pdf" : "docx";
  const contentType = isPdf ? "application/pdf" : DOCX_MIME;
  const path = `${user.id}/${quizId}/source.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from("pdfs")
    .upload(path, bytes, { contentType, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  await supabase.from("quizzes").update({ source_pdf_path: path }).eq("id", quizId);

  return NextResponse.json({ ok: true, path });
}
