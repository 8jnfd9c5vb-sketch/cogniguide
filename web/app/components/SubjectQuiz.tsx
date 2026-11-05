"use client";

import { useState } from "react";
import { LEVEL_LABELS, type Level } from "@/lib/levels";
import type { PublicQuestion } from "@/lib/types";
import { postJson } from "./api";
import { QuizForm } from "./QuizForm";

interface Session {
  quizId: string;
  level: Level;
  fromNotes: boolean;
  questions: PublicQuestion[];
}

interface Props {
  slug: string;
  name: string;
  level: Level;
  hasNotes: boolean;
}

export function SubjectQuiz({ slug, name, level, hasNotes }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    setError("");
    try {
      setSession(await postJson<Session>(`/api/subjects/${slug}/quiz`, { level }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={start}
          disabled={loading}
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Preparing…" : `${session ? "New" : "Start"} ${LEVEL_LABELS[level]} quiz`}
        </button>
        <p className="text-sm text-stone-500">
          {hasNotes
            ? `Five random questions from your ${name} notes.`
            : `No notes yet, so the five questions come from general ${name} knowledge for this level.`}
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {session && (
        <div className="space-y-3">
          <p className="text-sm text-stone-500">
            {LEVEL_LABELS[session.level]} · {session.fromNotes ? "From your notes" : "From general knowledge"}
          </p>
          <QuizForm key={session.quizId} target={{ mode: "quick", quizId: session.quizId }} questions={session.questions} />
        </div>
      )}
    </div>
  );
}
