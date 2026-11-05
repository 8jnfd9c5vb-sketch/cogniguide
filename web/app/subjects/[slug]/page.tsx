import Link from "next/link";
import { notFound } from "next/navigation";
import { config } from "@/lib/config";
import { currentLevel } from "@/lib/currentLevel";
import { chunkCountsBySubject } from "@/lib/rag";
import { getSubject, listMaterials } from "@/lib/storage";
import { DeleteSubjectButton } from "../../components/DeleteSubjectButton";
import { MaterialsPanel } from "../../components/MaterialsPanel";
import { SearchBox } from "../../components/SearchBox";
import { SubjectQuiz } from "../../components/SubjectQuiz";

export const dynamic = "force-dynamic";

export default async function SubjectPage(props: PageProps<"/subjects/[slug]">) {
  const { slug } = await props.params;
  const subject = await getSubject(slug);
  if (!subject) notFound();
  const [materials, counts, level] = await Promise.all([
    listMaterials(slug),
    chunkCountsBySubject(),
    currentLevel(),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/" className="text-sm text-stone-500 hover:underline">
            ← Subjects
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{subject.name}</h1>
          <p className="text-sm text-stone-500">
            Questions and feedback in {subject.quizLanguage === "zh" ? "Chinese" : "English"}
          </p>
        </div>
        <DeleteSubjectButton slug={subject.slug} name={subject.name} />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{subject.name} Quiz</h2>
        <SubjectQuiz
          key={level}
          slug={subject.slug}
          name={subject.name}
          level={level}
          hasNotes={(counts[subject.slug] ?? 0) > 0}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Materials</h2>
        <MaterialsPanel
          subject={subject.slug}
          initial={materials}
          maxUploadMb={config.maxUploadMb}
          maxPdfPages={config.maxPdfPages}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Search {subject.name}</h2>
        <SearchBox subjects={[{ slug: subject.slug, name: subject.name }]} fixedSubject={subject.slug} />
      </section>
    </div>
  );
}
