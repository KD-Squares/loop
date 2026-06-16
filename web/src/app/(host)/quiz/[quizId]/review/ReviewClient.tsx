"use client";

// The review editor. Every question shows its options + marked correct answer,
// with inline validation flags. The host can edit text/options, change the
// correct option, delete, add manually, regenerate, save a draft, or mark ready.
// Validation mirrors the server: nothing invalid can be saved as "ready".

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { validateQuestion } from "@/lib/validation";
import type { Question, QuestionOption, QuestionType } from "@/lib/types";

// Local editable shape (carries a client id for list stability).
interface EditQ {
  cid: string;
  text: string;
  type: QuestionType;
  options: QuestionOption[];
  correct_option_id: string;
}

const LETTERS = ["a", "b", "c", "d"];
let cidCounter = 0;
const nextCid = () => `q${cidCounter++}`;

function fromDb(q: Question): EditQ {
  return {
    cid: nextCid(),
    text: q.text,
    type: q.type,
    options: q.options,
    correct_option_id: q.correct_option_id,
  };
}

function blankMcq(): EditQ {
  return {
    cid: nextCid(),
    text: "",
    type: "mcq",
    options: LETTERS.map((id) => ({ id, text: "" })),
    correct_option_id: "a",
  };
}

function blankTf(): EditQ {
  return {
    cid: nextCid(),
    text: "",
    type: "truefalse",
    options: [
      { id: "a", text: "True" },
      { id: "b", text: "False" },
    ],
    correct_option_id: "a",
  };
}

export default function ReviewClient({
  quizId,
  quizTitle,
  status,
  hasPdf,
  initialQuestions,
}: {
  quizId: string;
  quizTitle: string;
  status: "draft" | "ready";
  hasPdf: boolean;
  initialQuestions: Question[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const initialNotice = params.get("notice");

  const [title, setTitle] = useState(quizTitle);
  const [questions, setQuestions] = useState<EditQ[]>(
    initialQuestions.map(fromDb)
  );
  const [notice, setNotice] = useState<string | null>(initialNotice);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [regenCount, setRegenCount] = useState(
    Math.max(initialQuestions.length || 10, 1)
  );

  const validations = useMemo(
    () => questions.map((q) => validateQuestion(q)),
    [questions]
  );
  const validCount = validations.filter((v) => v.valid).length;
  const allValid = validations.every((v) => v.valid);

  function update(cid: string, patch: Partial<EditQ>) {
    setQuestions((qs) => qs.map((q) => (q.cid === cid ? { ...q, ...patch } : q)));
  }

  function setOptionText(cid: string, optId: string, text: string) {
    setQuestions((qs) =>
      qs.map((q) =>
        q.cid === cid
          ? { ...q, options: q.options.map((o) => (o.id === optId ? { ...o, text } : o)) }
          : q
      )
    );
  }

  function changeType(cid: string, type: QuestionType) {
    setQuestions((qs) =>
      qs.map((q) => {
        if (q.cid !== cid) return q;
        if (type === "truefalse") {
          return {
            ...q,
            type,
            options: [
              { id: "a", text: "True" },
              { id: "b", text: "False" },
            ],
            correct_option_id: "a",
          };
        }
        // to mcq: ensure 4 options
        const opts = [...q.options];
        while (opts.length < 4) opts.push({ id: LETTERS[opts.length], text: "" });
        return {
          ...q,
          type,
          options: opts.slice(0, 4).map((o, i) => ({ id: LETTERS[i], text: o.text })),
          correct_option_id: LETTERS.includes(q.correct_option_id)
            ? q.correct_option_id
            : "a",
        };
      })
    );
  }

  function remove(cid: string) {
    setQuestions((qs) => qs.filter((q) => q.cid !== cid));
  }

  function add(type: QuestionType) {
    setQuestions((qs) => [...qs, type === "mcq" ? blankMcq() : blankTf()]);
  }

  async function save(markReady: boolean) {
    setError(null);
    setBusy(true);
    try {
      // Persist the title alongside the questions.
      await fetch(`/api/quizzes/${quizId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });

      const payload = {
        markReady,
        questions: questions.map((q) => ({
          text: q.text,
          type: q.type,
          options: q.options,
          correct_option_id: q.correct_option_id,
        })),
      };
      const res = await fetch(`/api/questions/${quizId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save.");
        return;
      }
      if (markReady) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setNotice("Draft saved.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    if (!hasPdf) {
      setError("There's no PDF to regenerate from. Add questions manually instead.");
      return;
    }
    setError(null);
    setBusy(true);
    setNotice("Regenerating from your PDF…");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quizId, count: regenCount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Regeneration failed.");
        setNotice(null);
        return;
      }
      // Reload to pull the freshly persisted questions.
      router.refresh();
      setNotice(data.note ?? "Regenerated.");
      // Re-fetch questions for the editor.
      const q = await fetch(`/api/quizzes/${quizId}`).then((r) => r.json());
      setQuestions((q.questions ?? []).map(fromDb));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-brand underline">
          ← Back to library
        </Link>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            status === "ready"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {status === "ready" ? "Ready" : "Draft"}
        </span>
      </div>

      <input
        className="input mb-4 text-lg font-semibold"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Quiz title"
      />

      {notice && (
        <div className="mb-4 rounded-lg bg-sky-50 p-3 text-sm text-sky-800 ring-1 ring-sky-200">
          {notice}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 ring-1 ring-slate-200">
        <p className="text-sm text-slate-600">
          <strong>{validCount}</strong> of {questions.length} valid
        </p>
        {hasPdf && (
          <div className="ml-auto flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={50}
              value={regenCount}
              onChange={(e) => setRegenCount(Number(e.target.value))}
              className="input w-20 py-1"
            />
            <button onClick={regenerate} disabled={busy} className="btn-secondary py-1.5">
              Regenerate
            </button>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {questions.map((q, i) => {
          const v = validations[i];
          return (
            <div
              key={q.cid}
              className={`card ${v.valid ? "" : "ring-2 ring-red-300"}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-500">
                  Question {i + 1}
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={q.type}
                    onChange={(e) => changeType(q.cid, e.target.value as QuestionType)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                  >
                    <option value="mcq">Multiple choice</option>
                    <option value="truefalse">True / False</option>
                  </select>
                  <button
                    onClick={() => remove(q.cid)}
                    className="text-sm text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <textarea
                className="input mb-3"
                rows={2}
                value={q.text}
                placeholder="Question text"
                onChange={(e) => update(q.cid, { text: e.target.value })}
              />

              <div className="space-y-2">
                {q.options.map((o) => (
                  <div key={o.id} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`correct-${q.cid}`}
                      checked={q.correct_option_id === o.id}
                      onChange={() => update(q.cid, { correct_option_id: o.id })}
                      title="Mark correct"
                    />
                    <input
                      className="input"
                      value={o.text}
                      disabled={q.type === "truefalse"}
                      placeholder={`Option ${o.id.toUpperCase()}`}
                      onChange={(e) => setOptionText(q.cid, o.id, e.target.value)}
                    />
                  </div>
                ))}
              </div>

              {!v.valid && (
                <ul className="mt-2 list-inside list-disc text-xs text-red-600">
                  {v.errors.map((err, k) => (
                    <li key={k}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => add("mcq")} className="btn-secondary">
          + Add MCQ
        </button>
        <button onClick={() => add("truefalse")} className="btn-secondary">
          + Add True/False
        </button>
      </div>

      <div className="sticky bottom-4 mt-8 flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-lg ring-1 ring-slate-200">
        <button onClick={() => save(false)} disabled={busy} className="btn-secondary">
          Save draft
        </button>
        <button
          onClick={() => save(true)}
          disabled={busy || !allValid || questions.length === 0}
          className="btn-primary"
          title={
            !allValid
              ? "Fix all flagged questions first"
              : questions.length === 0
              ? "Add at least one question"
              : "Save and mark ready to host"
          }
        >
          {busy ? "Saving…" : "Save & mark ready"}
        </button>
        {!allValid && (
          <span className="text-sm text-amber-700">
            Fix flagged questions to mark this quiz ready.
          </span>
        )}
      </div>
    </div>
  );
}
