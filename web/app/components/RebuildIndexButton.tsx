"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "./api";

export function RebuildIndexButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function rebuild() {
    if (!confirm("Rebuild the search index with the current embedding model? Transcripts and questions are kept.")) {
      return;
    }
    setBusy(true);
    try {
      const res = await postJson<{ queued: number }>("/api/index/rebuild", {});
      setMessage(`Re-indexing ${res.queued} material(s) in the background.`);
      router.refresh();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-3">
      <button
        onClick={rebuild}
        disabled={busy}
        className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        Rebuild index
      </button>
      {message && <span className="text-sm">{message}</span>}
    </span>
  );
}
