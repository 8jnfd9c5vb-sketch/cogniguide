import { currentLevel } from "@/lib/currentLevel";
import { listSubjects } from "@/lib/storage";
import { QuickQuiz } from "../components/QuickQuiz";

export const dynamic = "force-dynamic";

export default async function QuickQuizPage() {
  const [subjects, level] = await Promise.all([listSubjects(), currentLevel()]);
  const subjectNames = Object.fromEntries(subjects.map((s) => [s.slug, s.name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Quick Quiz</h1>
        <p className="text-sm text-stone-500">
          Five questions drawn from all of your subjects. Enter a topic to focus the quiz, or leave it empty for a
          random mix.
        </p>
      </div>
      <QuickQuiz subjectNames={subjectNames} level={level} />
    </div>
  );
}
