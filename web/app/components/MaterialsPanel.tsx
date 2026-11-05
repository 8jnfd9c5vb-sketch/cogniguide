"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MaterialMeta } from "@/lib/types";
import { api } from "./api";

interface Props {
  subject: string;
  initial: MaterialMeta[];
  maxUploadMb: number;
  maxPdfPages: number;
}

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp";
const POLL_MS = 3000;

export function MaterialsPanel({ subject, initial, maxUploadMb, maxPdfPages }: Props) {
  const router = useRouter();
  const [materials, setMaterials] = useState(initial);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ materials: MaterialMeta[] }>(`/api/subjects/${subject}/materials`);
      setMaterials(res.materials);
    } catch {
      // Keep the last list on a transient error; the next poll will retry.
    }
  }, [subject]);

  const busy = materials.some((m) => m.status === "processing");
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [busy, refresh]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    for (const file of Array.from(files)) {
      if (file.size > maxUploadMb * 1024 * 1024) {
        setError(`${file.name} is larger than ${maxUploadMb} MB.`);
        continue;
      }
      setUploading(file.name);
      try {
        const form = new FormData();
        form.append("file", file);
        await api(`/api/subjects/${subject}/materials`, { method: "POST", body: form });
      } catch (err) {
        setError(`${file.name}: ${(err as Error).message}`);
      }
    }
    setUploading("");
    if (inputRef.current) inputRef.current.value = "";
    await refresh();
    router.refresh();
  }

  async function remove(m: MaterialMeta) {
    if (!confirm(`Delete "${m.fileName}" with its transcript, questions and search entries?`)) return;
    try {
      await api(`/api/subjects/${subject}/materials/${m.id}`, { method: "DELETE" });
    } catch (err) {
      setError((err as Error).message);
    }
    await refresh();
    router.refresh();
  }

  async function retry(m: MaterialMeta) {
    try {
      await api(`/api/subjects/${subject}/materials/${m.id}/retry`, { method: "POST" });
    } catch (err) {
      setError((err as Error).message);
    }
    await refresh();
  }

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-stone-300 bg-white px-6 py-8 text-center hover:border-stone-500">
        <span className="text-sm font-medium">
          {uploading ? `Uploading ${uploading}…` : "Upload notes (PDF or image)"}
        </span>
        <span className="text-xs text-stone-500">
          PDF, PNG, JPG or WEBP · up to {maxUploadMb} MB · PDFs up to {maxPdfPages} pages
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          disabled={Boolean(uploading)}
          onChange={(e) => upload(e.target.files)}
          className="hidden"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {materials.length === 0 ? (
        <p className="text-sm text-stone-500">No materials yet.</p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200 bg-white">
          {materials.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.fileName}</p>
                <p className="text-xs text-stone-500">
                  {m.kind === "pdf" ? `${m.pages} page${m.pages === 1 ? "" : "s"}` : "Image"} ·{" "}
                  {new Date(m.createdAt).toLocaleString()}
                  {m.status === "ready" &&
                    ` · ${plural(m.chunkCount, "chunk")} · ${plural(m.questionCount, "question")}`}
                </p>
                {m.status === "failed" && m.error && (
                  <p className="mt-1 text-xs text-red-600">{m.error}</p>
                )}
              </div>
              <StatusBadge material={m} />
              {m.status === "ready" && (
                <Link
                  href={`/subjects/${subject}/materials/${m.id}`}
                  className="rounded-md bg-stone-900 px-3 py-1.5 text-xs font-medium text-white"
                >
                  Practice
                </Link>
              )}
              {m.status === "failed" && (
                <button onClick={() => retry(m)} className="rounded-md border border-stone-400 px-3 py-1.5 text-xs">
                  Retry
                </button>
              )}
              <button onClick={() => remove(m)} className="text-xs text-stone-500 hover:text-red-600">
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function StatusBadge({ material }: { material: MaterialMeta }) {
  if (material.status === "ready") {
    return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Ready</span>;
  }
  if (material.status === "failed") {
    return <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700">Failed</span>;
  }
  return (
    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
      {material.step ?? "Processing"}…
    </span>
  );
}
