"use client";

import { useEffect, useState } from "react";
import { LEVEL_LABELS, type Level } from "@/lib/levels";
import type { PublicQuestion } from "@/lib/types";
import { postJson } from "./api";
import { QuizForm } from "./QuizForm";

interface Props {
  subject: string;
  materialId: string;
  level: Level;
  /** Cached questions for this level; empty means they still have to be written. */
  initial: PublicQuestion[];
}

export function PracticeQuiz({ subject, materialId, level, initial }: Props) {
  const [questions, setQuestions] = useState(initial);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initial.length) return;
    let cancelled = false;
    postJson<{ questions: PublicQuestion[] }>(`/api/subjects/${subject}/materials/${materialId}/questions`, {
      level,
    })
      .then((res) => !cancelled && setQuestions(res.questions))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [subject, materialId, level, initial.length]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!questions.length) {
    return (
      <p className="rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-600">
        Writing {LEVEL_LABELS[level]} questions for this material…
      </p>
    );
  }
  return <QuizForm target={{ mode: "practice", subject, materialId, level }} questions={questions} />;
}
