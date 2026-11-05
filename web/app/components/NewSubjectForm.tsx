"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "./api";

export function NewSubjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [quizLanguage, setQuizLanguage] = useState<"en" | "zh">("en");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await postJson("/api/subjects", { name, quizLanguage });
      setName("");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="New subject name"
        maxLength={60}
        className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500"
      />
      <select
        value={quizLanguage}
        onChange={(e) => setQuizLanguage(e.target.value as "en" | "zh")}
        className="rounded-md border border-stone-300 bg-white px-2 py-2 text-sm"
        title="Language of questions and feedback"
      >
        <option value="en">Questions in English</option>
        <option value="zh">Questions in Chinese</option>
      </select>
      <button
        disabled={saving || !name.trim()}
        className="rounded-md border border-stone-900 px-4 py-2 text-sm font-medium disabled:opacity-40"
      >
        Add subject
      </button>
      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
