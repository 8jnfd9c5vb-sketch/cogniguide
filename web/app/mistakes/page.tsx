import { listMistakes, listSubjects } from "@/lib/storage";
import { MistakesView } from "../components/MistakesView";

export const dynamic = "force-dynamic";

export default async function MistakesPage() {
  const [mistakes, subjects] = await Promise.all([listMistakes(), listSubjects()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mistakes</h1>
        <p className="text-sm text-stone-500">
          Every answer that scored below 60 is kept here. Review them in rounds of five; a question counts as mastered
          once you answer it with 60 or more.
        </p>
      </div>
      <MistakesView mistakes={mistakes} subjects={subjects.map((s) => ({ slug: s.slug, name: s.name }))} />
    </div>
  );
}
