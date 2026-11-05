"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LEVEL_LABELS, DEFAULT_LEVEL } from "@/lib/levels";
import { pointsAtTheSource } from "@/lib/originality";
import type { Mistake, PublicQuestion } from "@/lib/types";
import { api, postJson } from "./api";
import { MathText } from "./MathText";
import { QuizForm } from "./QuizForm";

interface Props {
  mistakes: Mistake[];
  subjects: { slug: string; name: string }[];
}

interface Review {
  quizId: string;
  questions: PublicQuestion[];
}

export function MistakesView({ mistakes, subjects }: Props) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [showMastered, setShowMastered] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const names = Object.fromEntries(subjects.map((s) => [s.slug, s.name]));
  const inSubject = mistakes.filter((m) => !subject || m.question.subject === subject);
  const open = inSubject.filter((m) => !m.masteredAt);
  const mastered = inSubject.filter((m) => m.masteredAt);
  // A review round can only re-ask what the server is willing to serve, so the count matches its filter.
  const reviewable = open.filter((m) => !pointsAtTheSource(m.question.question));

  async function startReview() {
    setLoading(true);
    setError("");
    try {
      setReview(await postJson<Review>("/api/mistakes/review", { subject }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/mistakes/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      alert((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            setReview(null);
          }}
          className="rounded-md border border-stone-300 bg-white px-2 py-2 text-sm"
        >
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          onClick={startReview}
          disabled={loading || reviewable.length === 0}
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Preparing…" : review ? "Next review round" : "Review mistakes"}
        </button>
        <span className="text-sm text-stone-500">
          {reviewable.length} to review · {mastered.length} mastered
        </span>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      {review && (
        <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-4">
          <h2 className="font-semibold">Review round</h2>
          <QuizForm
            key={review.quizId}
            target={{ mode: "quick", quizId: review.quizId }}
            questions={review.questions}
            subjectNames={names}
            onGraded={() => router.refresh()}
          />
        </section>
      )}

      {open.length === 0 ? (
        <p className="text-sm text-stone-500">
          {inSubject.length ? "Nothing left to review here." : "No mistakes recorded yet."}
        </p>
      ) : (
        <ul className="space-y-3">
          {open.map((m) => {
            const problem = pointsAtTheSource(m.question.question);
            return (
              <MistakeCard
                key={m.id}
                mistake={m}
                subjectName={names[m.question.subject]}
                note={problem ? "This one quotes your own notes, so a review round skips it." : ""}
                onDelete={remove}
              />
            );
          })}
        </ul>
      )}

      {mastered.length > 0 && (
        <div className="space-y-3">
          <button onClick={() => setShowMastered(!showMastered)} className="text-sm text-stone-600 underline">
            {showMastered ? "Hide" : "Show"} mastered ({mastered.length})
          </button>
          {showMastered && (
            <ul className="space-y-3 opacity-75">
              {mastered.map((m) => (
                <MistakeCard key={m.id} mistake={m} subjectName={names[m.question.subject]} onDelete={remove} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function MistakeCard({
  mistake: m,
  subjectName,
  note = "",
  onDelete,
}: {
  mistake: Mistake;
  subjectName?: string;
  note?: string;
  onDelete: (id: string) => void;
}) {
  return (
    <li className="rounded-lg border border-stone-200 bg-white p-4 text-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-stone-500">
        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">{subjectName ?? m.question.subject}</span>
        <span>{LEVEL_LABELS[m.question.level ?? DEFAULT_LEVEL]}</span>
        <span>
          Missed {m.wrongCount}× · last score {m.lastScore} · {new Date(m.lastWrongAt).toLocaleDateString()}
        </span>
        {m.masteredAt && <span className="text-emerald-700">Mastered</span>}
        <button onClick={() => onDelete(m.id)} className="ml-auto text-stone-400 hover:text-red-600">
          Remove
        </button>
      </div>
      <p className="font-medium">
        <MathText text={m.question.question} />
      </p>
      {note && <p className="mt-1 text-xs text-amber-700">{note}</p>}
      <div className="mt-2 space-y-1 text-stone-700">
        <p>
          <span className="text-stone-500">Your answer: </span>
          {m.lastAnswer.trim() ? <MathText text={m.lastAnswer} /> : <em>(blank)</em>}
        </p>
        {m.feedback && <MathText text={m.feedback} className="block text-stone-600" />}
        {m.missedPoints.length > 0 && (
          <ul className="ml-4 list-disc text-red-700">
            {m.missedPoints.map((p) => (
              <li key={p}>
                <MathText text={p} />
              </li>
            ))}
          </ul>
        )}
        <details>
          <summary className="cursor-pointer text-stone-600">Reference answer</summary>
          <p className="mt-1">
            <MathText text={m.question.referenceAnswer} />
          </p>
        </details>
      </div>
    </li>
  );
}
