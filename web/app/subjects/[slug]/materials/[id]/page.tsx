import Link from "next/link";
import { notFound } from "next/navigation";
import { currentLevel } from "@/lib/currentLevel";
import { LEVEL_LABELS } from "@/lib/levels";
import { toPublicQuestion } from "@/lib/public";
import { getMaterial, getQuestions, getSubject, readExtract } from "@/lib/storage";
import { MathText } from "../../../../components/MathText";
import { PracticeQuiz } from "../../../../components/PracticeQuiz";

export const dynamic = "force-dynamic";

export default async function PracticePage(props: PageProps<"/subjects/[slug]/materials/[id]">) {
  const { slug, id } = await props.params;
  const [subject, material] = await Promise.all([getSubject(slug), getMaterial(slug, id)]);
  if (!subject || !material) notFound();
  const level = await currentLevel();
  const [questions, transcript] = await Promise.all([getQuestions(slug, id, level), readExtract(slug, id)]);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/subjects/${slug}`} className="text-sm text-stone-500 hover:underline">
          ← {subject.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{material.fileName}</h1>
        <p className="text-sm text-stone-500">
          {LEVEL_LABELS[level]} questions. Answer in your own words, then submit to get a score.
        </p>
      </div>

      {material.status !== "ready" ? (
        <p className="rounded-lg border border-stone-200 bg-white p-4 text-sm text-stone-600">
          {material.status === "processing"
            ? "This material is still being processed. Come back in a moment."
            : `Processing failed: ${material.error ?? "unknown error"}. Retry from the subject page.`}
        </p>
      ) : (
        <PracticeQuiz
          key={level}
          subject={slug}
          materialId={id}
          level={level}
          initial={questions.map(toPublicQuestion)}
        />
      )}

      {transcript && (
        <details className="rounded-lg border border-stone-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-medium">Transcript</summary>
          <div className="mt-3 max-h-[32rem] overflow-auto text-sm text-stone-700">
            <MathText text={transcript} />
          </div>
        </details>
      )}
    </div>
  );
}
