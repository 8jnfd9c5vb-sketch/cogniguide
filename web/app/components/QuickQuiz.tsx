"use client";

import { useState } from "react";
import { LEVEL_LABELS, type Level } from "@/lib/levels";
import type { PublicQuestion } from "@/lib/types";
import { postJson } from "./api";
import { QuizForm } from "./QuizForm";

interface Session {
  quizId: string;
  topic: string | null;
  level: Level;
  questions: PublicQuestion[];
}

export function QuickQuiz({ subjectNames, level }: { subjectNames: Record<string, string>; level: Level }) {
  const [topic, setTopic] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function start(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError("");
    try {
      setSession(await postJson<Session>("/api/quick-quiz", { topic, level }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={start} className="flex flex-wrap gap-2">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Optional topic, e.g. eigenvalues (leave empty for random)"
          className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500"
        />
        <button
          disabled={loading}
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Preparing…" : `${session ? "New" : "Start"} ${LEVEL_LABELS[level]} quiz`}
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {session && (
        <div className="space-y-3">
          <p className="text-sm text-stone-500">
            {LEVEL_LABELS[session.level]} ·{" "}
            {session.topic ? `Questions about "${session.topic}"` : "Random questions from all subjects"}
          </p>
          <QuizForm
            key={session.quizId}
            target={{ mode: "quick", quizId: session.quizId }}
            questions={session.questions}
            subjectNames={subjectNames}
          />
        </div>
      )}
    </div>
  );
}
