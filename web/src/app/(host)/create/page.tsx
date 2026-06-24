"use client";

// Quiz creation — the ONLY place a PDF is uploaded. Steps, all with loading and
// human-readable errors:
//   1. Validate inputs + the PDF (type/size) BEFORE uploading.
//   2. Create a draft quiz (so a refresh never loses the work).
//   3. Upload the PDF to the private bucket.
//   4. Generate/parse questions (server decides reuse vs generate).
//   5. Go to review.
// If generation fails, the upload is kept and the host can retry from review.

import { useState } from "react";
import { useRouter } from "next/navigation";

const MAX_BYTES = 10 * 1024 * 1024;

export default function CreateQuizPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [count, setCount] = useState(10);
  const [timeLimit, setTimeLimit] = useState(20);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setFile(null);
      return;
    }
    const name = f.name.toLowerCase();
    const isPdf = f.type === "application/pdf" || name.endsWith(".pdf");
    const isDocx =
      f.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      name.endsWith(".docx");
    if (!isPdf && !isDocx) {
      setFileError("Please upload a PDF or a Word (.docx) file.");
      setFile(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setFileError("That file is larger than 10 MB. Please split or compress it.");
      setFile(null);
      return;
    }
    setFile(f);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) return setError("Please enter a title.");
    if (!file) return setError("Please choose a PDF or Word file to build from.");
    if (timeLimit < 5 || timeLimit > 120)
      return setError("Time limit must be between 5 and 120 seconds.");

    setBusy(true);
    try {
      // 2. Create the draft quiz.
      setStatus("Creating quiz…");
      const createRes = await fetch("/api/quizzes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, time_limit_seconds: timeLimit }),
      });
      const created = await createRes.json();
      if (!createRes.ok) throw new Error(created.error ?? "Could not create the quiz.");
      const quizId = created.id as string;

      // 3. Upload the PDF.
      setStatus("Uploading file…");
      const form = new FormData();
      form.set("quizId", quizId);
      form.set("file", file);
      const upRes = await fetch("/api/upload", { method: "POST", body: form });
      const up = await upRes.json();
      if (!upRes.ok) throw new Error(up.error ?? "Upload failed.");

      // 4. Generate / parse.
      setStatus("Reading your file and preparing questions… this can take a moment.");
      const genRes = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quizId, count }),
      });
      const gen = await genRes.json();
      if (!genRes.ok) {
        // Even on failure the quiz + upload exist — send the host to review to retry.
        if (gen.code === "GENERATOR_ERROR" || gen.code === "IMAGE_ONLY") {
          router.push(`/quiz/${quizId}/review?notice=${encodeURIComponent(gen.error)}`);
          return;
        }
        throw new Error(gen.error ?? "Could not prepare questions.");
      }

      // 5. Review.
      router.push(`/quiz/${quizId}/review`);
    } catch (err) {
      setError((err as Error).message);
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display mb-1 text-2xl font-bold">Create a quiz</h1>
      <p className="mb-6 text-sm text-muted">
        Upload a PDF or Word (.docx) file once. Loop will reuse questions it finds,
        or generate new ones (up to 100). You&apos;ll review everything before
        it&apos;s saved.
      </p>

      <form onSubmit={onSubmit} className="card space-y-5">
        <div>
          <label className="label" htmlFor="title">
            Quiz title
          </label>
          <input
            id="title"
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Chapter 4 Review"
            disabled={busy}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="count">
              Number of questions (1–100)
            </label>
            <input
              id="count"
              type="number"
              min={1}
              max={100}
              className="input"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              disabled={busy}
            />
          </div>
          <div>
            <label className="label" htmlFor="time">
              Seconds per question (5–120)
            </label>
            <input
              id="time"
              type="number"
              min={5}
              max={120}
              className="input"
              value={timeLimit}
              onChange={(e) => setTimeLimit(Number(e.target.value))}
              disabled={busy}
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="file">
            Source file: PDF or Word .docx (max 10 MB)
          </label>
          <input
            id="file"
            type="file"
            accept="application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={onPickFile}
            disabled={busy}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-2 file:text-white"
          />
          {file && <p className="mt-1 text-xs text-slate-500">{file.name}</p>}
          {fileError && <p className="mt-1 text-xs text-red-600">{fileError}</p>}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </div>
        )}
        {busy && status && (
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-200">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            {status}
          </div>
        )}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? "Working…" : "Build quiz"}
        </button>
      </form>
    </div>
  );
}
