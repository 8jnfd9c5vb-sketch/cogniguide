import Link from "next/link";
import { hasApiKey } from "@/lib/bailian";
import { config } from "@/lib/config";
import { subjectSummaries } from "@/lib/library";
import { getIndexState } from "@/lib/rag";
import { NewSubjectForm } from "./components/NewSubjectForm";
import { RebuildIndexButton } from "./components/RebuildIndexButton";
import { SearchBox } from "./components/SearchBox";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [subjects, index] = await Promise.all([subjectSummaries(), getIndexState()]);
  const totalChunks = subjects.reduce((sum, s) => sum + s.chunkCount, 0);

  return (
    <div className="space-y-10">
      {!hasApiKey() && (
        <Banner>
          <strong>DASHSCOPE_API_KEY is not set.</strong> Copy <code>web/.env.example</code> to{" "}
          <code>web/.env.local</code>, add your Bailian API key, and restart the server. Uploads, search and
          quizzes need it.
        </Banner>
      )}
      {index.mismatch && (
        <Banner>
          <p className="mb-2">
            The search index was built with <code>{index.indexedModel}</code>, but the configured embedding
            model is <code>{index.configuredModel}</code>. Search and indexing are paused until you rebuild.
          </p>
          <RebuildIndexButton />
        </Banner>
      )}

      <p className="rounded-lg border border-stone-200 bg-white px-4 py-2 text-xs text-stone-500">
        Model profile: <code>{config.profile || "none (from .env.local)"}</code> · endpoint{" "}
        <code>{config.baseUrl}</code> · vision <code>{config.visionModel}</code> · chat{" "}
        <code>{config.chatModel}</code> · embedding <code>{config.embeddingModel}</code>
      </p>

      <section className="flex flex-col gap-4 rounded-xl bg-stone-900 p-6 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Quick Quiz</h1>
          <p className="mt-1 text-sm text-stone-300">
            {totalChunks > 0
              ? "Five fresh questions drawn at random from everything you have uploaded."
              : "Upload notes to any subject first, then test yourself here."}
          </p>
        </div>
        <Link
          href="/quick-quiz"
          className="rounded-md bg-white px-5 py-2.5 text-center text-sm font-semibold text-stone-900"
        >
          Start Quick Quiz
        </Link>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Search your notes</h2>
        <SearchBox subjects={subjects.map((s) => ({ slug: s.slug, name: s.name }))} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Subjects</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {subjects.map((s) => (
            <Link
              key={s.slug}
              href={`/subjects/${s.slug}`}
              className="rounded-lg border border-stone-200 bg-white p-4 transition hover:border-stone-400"
            >
              <p className="font-semibold">{s.name}</p>
              <p className="mt-2 text-sm text-stone-500">
                {s.materialCount} material{s.materialCount === 1 ? "" : "s"} · {s.chunkCount} indexed chunk
                {s.chunkCount === 1 ? "" : "s"}
              </p>
              {s.processingCount > 0 && (
                <p className="mt-1 text-xs text-amber-700">{s.processingCount} processing</p>
              )}
              <p className="mt-1 text-xs text-stone-400">
                Questions in {s.quizLanguage === "zh" ? "Chinese" : "English"}
              </p>
            </Link>
          ))}
        </div>
        <NewSubjectForm />
      </section>
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{children}</div>
  );
}
