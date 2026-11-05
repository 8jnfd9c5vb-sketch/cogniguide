"use client";

import Link from "next/link";
import { useState } from "react";
import type { SearchHit } from "@/lib/types";
import { api } from "./api";
import { MathText } from "./MathText";

interface Props {
  subjects: Array<{ slug: string; name: string }>;
  /** When set, search only this subject and hide the subject picker. */
  fixedSubject?: string;
}

export function SearchBox({ subjects, fixedSubject }: Props) {
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState(fixedSubject ?? "");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const names = new Map(subjects.map((s) => [s.slug, s.name]));

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ q: query, subject });
      const res = await api<{ hits: SearchHit[] }>(`/api/search?${params}`);
      setHits(res.hits);
    } catch (err) {
      setError((err as Error).message);
      setHits(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={run} className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={fixedSubject ? "Search this subject's notes…" : "Search your notes, e.g. linear independence"}
          className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500"
        />
        {!fixedSubject && (
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="rounded-md border border-stone-300 bg-white px-2 py-2 text-sm"
          >
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <button
          disabled={loading}
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {hits && hits.length === 0 && (
        <p className="text-sm text-stone-500">No matching notes. Upload material or try other words.</p>
      )}
      {hits && hits.length > 0 && (
        <ul className="space-y-2">
          {hits.map((h) => (
            <li key={h.id} className="rounded-md border border-stone-200 bg-white p-3">
              <div className="mb-1 flex flex-wrap gap-x-3 text-xs text-stone-500">
                <span className="font-medium text-stone-700">{names.get(h.subject) ?? h.subject}</span>
                <Link href={`/subjects/${h.subject}/materials/${h.materialId}`} className="hover:underline">
                  {h.fileName}
                </Link>
                <span>Page {h.page}</span>
              </div>
              <p className="line-clamp-4 text-sm text-stone-800">
                <MathText text={h.text} />
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
