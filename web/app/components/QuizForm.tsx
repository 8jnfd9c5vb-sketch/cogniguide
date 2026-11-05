"use client";

import Link from "next/link";
import { useState } from "react";
import type { Level } from "@/lib/levels";
import { PASS_SCORE } from "@/lib/scoring";
import type { Attempt, PublicQuestion } from "@/lib/types";
import { postJson } from "./api";
import { MathText } from "./MathText";

type Target =
  | { mode: "practice"; subject: string; materialId: string; level: Level }
  | { mode: "quick"; quizId: string };

interface Props {
  target: Target;
  questions: PublicQuestion[];
  subjectNames?: Record<string, string>;
  onGraded?: (attempt: Attempt) => void;
}
export function QuizForm({ target, questions, subjectNames, onGraded }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [error, setError] = useState("");
  const [grading, setGrading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setGrading(true);
    setError("");
    try {
      const res = await postJson<{ attempt: Attempt }>("/api/grade", { ...target, answers });
      setAttempt(res.attempt);
      onGraded?.(res.attempt);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGrading(false);
    }
  }

  const graded = new Map(attempt?.items.map((i) => [i.questionId, i]));

  return (
    <form onSubmit={submit} className="space-y-5">
      {attempt && (
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <p className="text-sm text-stone-500">Overall score</p>
          <p className="text-3xl font-semibold">{attempt.totalScore} / 100</p>
          {attempt.items.some((i) => i.score < PASS_SCORE) && (
            <p className="mt-2 text-sm text-stone-600">
              Answers below {PASS_SCORE} were saved to{" "}
              <Link href="/mistakes" className="underline">
                Mistakes
              </Link>{" "}
              for later review.
            </p>
          )}
        </div>
      )}

      <ol className="space-y-4">
        {questions.map((q, index) => {
          const result = graded.get(q.id);
          return (
            <li key={q.id} className="rounded-lg border border-stone-200 bg-white p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <p className="font-medium">
                  {index + 1}. <MathText text={q.question} />
                </p>
                <span className="flex shrink-0 gap-1">
                  {q.origin === "knowledge" && (
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700">General knowledge</span>
                  )}
                  {subjectNames && (
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                      {subjectNames[q.subject] ?? q.subject}
                    </span>
                  )}
                </span>
              </div>
              <textarea
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                disabled={Boolean(attempt)}
                rows={4}
                placeholder={q.language === "zh" ? "在这里作答…" : "Type your answer…"}
                className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-500 disabled:bg-stone-50"
              />
              {result && (
                <div className="mt-3 space-y-2 border-t border-stone-100 pt-3 text-sm">
                  <p>
                    <span className={scoreColor(result.score)}>{result.score} / 100</span>
                    {result.feedback && <MathText text={result.feedback} className="ml-2 text-stone-700" />}
                  </p>
                  {result.correctPoints.length > 0 && (
                    <PointList title="Correct" items={result.correctPoints} className="text-emerald-700" />
                  )}
                  {result.missedPoints.length > 0 && (
                    <PointList title="Missing or wrong" items={result.missedPoints} className="text-red-700" />
                  )}
                  <details className="text-stone-600">
                    <summary className="cursor-pointer">Reference answer</summary>
                    <p className="mt-1">
                      <MathText text={result.referenceAnswer} />
                    </p>
                  </details>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!attempt ? (
        <button
          disabled={grading}
          className="rounded-md bg-stone-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {grading ? "Grading…" : "Submit answers"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => {
            setAttempt(null);
            setAnswers({});
          }}
          className="rounded-md border border-stone-900 px-5 py-2.5 text-sm font-medium"
        >
          Try again
        </button>
      )}
    </form>
  );
}

function scoreColor(score: number) {
  if (score >= 80) return "font-semibold text-emerald-700";
  if (score >= 50) return "font-semibold text-amber-700";
  return "font-semibold text-red-700";
}

function PointList({ title, items, className }: { title: string; items: string[]; className: string }) {
  return (
    <div>
      <p className={`text-xs font-medium uppercase tracking-wide ${className}`}>{title}</p>
      <ul className="ml-4 list-disc text-stone-700">
        {items.map((item) => (
          <li key={item}>
            <MathText text={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}
