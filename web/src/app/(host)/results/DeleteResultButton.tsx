"use client";

// Delete control for a single result's detail page. On success it returns to the
// results list.

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteResultButton({ resultId }: { resultId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/results/${resultId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/results");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not delete this result.");
        setBusy(false);
      }
    } catch {
      setError("Network error deleting this result.");
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="btn-secondary text-sm text-red-600"
        onClick={() => setConfirming(true)}
      >
        Delete result
      </button>
    );
  }

  return (
    <div className="rounded-xl bg-cream p-3 ring-1 ring-line">
      <p className="text-sm text-ink">Delete this result? This cannot be undone.</p>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          className="btn-danger px-3 py-1.5 text-sm"
          disabled={busy}
          onClick={remove}
        >
          {busy ? "Deleting…" : "Yes, delete"}
        </button>
        <button
          className="btn-secondary px-3 py-1.5 text-sm"
          disabled={busy}
          onClick={() => setConfirming(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
