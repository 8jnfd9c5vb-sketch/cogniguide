import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  createMaterial,
  createSubject,
  deleteMaterialFiles,
  deleteMistake,
  deleteSubjectFiles,
  getMaterial,
  getMistake,
  getQuestions,
  getQuiz,
  getSubject,
  listMaterials,
  listMistakes,
  listSubjects,
  originalPath,
  saveMistake,
  saveQuestions,
  saveQuiz,
  updateMaterial,
} from "@/lib/storage";
import type { Mistake, Question, QuickQuizSession } from "@/lib/types";
import { makeQuestion } from "./helpers";

describe("subjects", () => {
  it("seeds the four default subjects once, in a stable order", async () => {
    const first = await listSubjects();
    expect(first.map((s) => s.slug)).toEqual(["chinese", "english", "math", "geography"]);
    expect((await getSubject("chinese"))?.quizLanguage).toBe("zh");
    expect((await getSubject("math"))?.quizLanguage).toBe("en");
    const second = await listSubjects();
    expect(second.map((s) => s.createdAt)).toEqual(first.map((s) => s.createdAt));
  });

  it("rejects empty, duplicate and path-like names", async () => {
    await expect(createSubject("   ")).rejects.toThrow(/required/);
    await expect(createSubject("math")).rejects.toThrow(/already exists/);
    expect(await getSubject("../math")).toBeNull();
    expect(await getSubject("MATH")).toBeNull();
  });

  it("slugifies names and falls back when the name has no ASCII", async () => {
    const physics = await createSubject("Étude Notes");
    expect(physics.slug).toBe("e-tude-notes");
    const chinese = await createSubject("物理", "zh");
    expect(chinese.slug).toMatch(/^subject-[a-z0-9]+$/);
    expect(chinese.quizLanguage).toBe("zh");
    expect(await getSubject(chinese.slug)).toEqual(chinese);
  });

  it("disambiguates a slug that is already taken", async () => {
    const created = await createSubject("Math!");
    expect(created.slug).toMatch(/^math-[a-z0-9]+$/);
    expect(created.slug).not.toBe("math");
  });

  it("deletes a subject directory and ignores unsafe slugs", async () => {
    const subject = await createSubject("Temporary");
    await deleteSubjectFiles(subject.slug);
    expect(await getSubject(subject.slug)).toBeNull();
    await deleteSubjectFiles("../math");
    expect(await getSubject("math")).not.toBeNull();
  });
});

describe("materials", () => {
  it("stores the original bytes and starts out queued", async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const meta = await createMaterial({
      subject: "math",
      fileName: "notes.png",
      kind: "image",
      ext: ".png",
      data,
      pages: 1,
    });
    expect(meta.status).toBe("processing");
    expect(meta.step).toBe("Queued");
    expect(new Uint8Array(await readFile(originalPath(meta)))).toEqual(data);
    expect(await getMaterial("math", meta.id)).toMatchObject({ fileName: "notes.png", sizeBytes: 4 });
  });

  it("patches metadata and returns null once the material is gone", async () => {
    const meta = await createMaterial({
      subject: "math",
      fileName: "a.png",
      kind: "image",
      ext: ".png",
      data: new Uint8Array([1]),
      pages: 1,
    });
    const updated = await updateMaterial("math", meta.id, { status: "ready", chunkCount: 3 });
    expect(updated).toMatchObject({ status: "ready", chunkCount: 3 });
    await deleteMaterialFiles("math", meta.id);
    expect(await updateMaterial("math", meta.id, { status: "failed" })).toBeNull();
    expect(await getMaterial("math", "nope")).toBeNull();
    expect(await getMaterial("../math", meta.id)).toBeNull();
  });

  it("lists one subject's materials newest first", async () => {
    const older = await createMaterial({
      subject: "english",
      fileName: "old.png",
      kind: "image",
      ext: ".png",
      data: new Uint8Array([1]),
      pages: 1,
    });
    const newer = await createMaterial({
      subject: "english",
      fileName: "new.png",
      kind: "image",
      ext: ".png",
      data: new Uint8Array([1]),
      pages: 1,
    });
    await updateMaterial("english", older.id, { createdAt: "2020-01-01T00:00:00.000Z" });
    await updateMaterial("english", newer.id, { createdAt: "2024-01-01T00:00:00.000Z" });
    expect((await listMaterials("english")).map((m) => m.id)).toEqual([newer.id, older.id]);
    expect(await listMaterials("not a slug")).toEqual([]);
  });
});

describe("questions", () => {
  async function material() {
    return createMaterial({
      subject: "math",
      fileName: "q.png",
      kind: "image",
      ext: ".png",
      data: new Uint8Array([1]),
      pages: 1,
    });
  }

  it("keeps a separate cache per level", async () => {
    const meta = await material();
    const s3 = [makeQuestion({ id: "s3ques01", level: "s3" })];
    const s6 = [makeQuestion({ id: "s6ques01", level: "s6", question: "Harder" })];
    await saveQuestions("math", meta.id, "s3", s3);
    await saveQuestions("math", meta.id, "s6", s6);
    expect(await getQuestions("math", meta.id, "s3")).toEqual(s3);
    expect(await getQuestions("math", meta.id, "s6")).toEqual(s6);
    expect(await getQuestions("math", meta.id, "s1")).toEqual([]);
  });

  it("reads the pre-level questions.json as the default level", async () => {
    const meta = await material();
    const legacy = [makeQuestion({ id: "legacy01" })];
    delete legacy[0].level;
    const { writeFile } = await import("node:fs/promises");
    const { paths } = await import("@/lib/config");
    const path = await import("node:path");
    await writeFile(
      path.join(paths.material("math", meta.id), "questions.json"),
      JSON.stringify(legacy),
    );
    expect(await getQuestions("math", meta.id)).toEqual([{ ...legacy[0], level: "s3" }]);
    expect(await getQuestions("math", meta.id, "s4")).toEqual([]);
  });

  it("rejects unsafe ids", async () => {
    expect(await getQuestions("../math", "abcdefgh", "s3")).toEqual([]);
    expect(await getQuestions("math", "../abcd", "s3")).toEqual([]);
  });
});

describe("quizzes and mistakes", () => {
  it("round-trips a quiz session and rejects unsafe ids", async () => {
    const session: QuickQuizSession = {
      id: "quiz1234",
      kind: "subject",
      subject: "math",
      level: "s2",
      createdAt: "2024-01-01T00:00:00.000Z",
      questions: [makeQuestion()],
    };
    await saveQuiz(session);
    expect(await getQuiz(session.id)).toEqual(session);
    expect(await getQuiz("../quiz")).toBeNull();
  });

  it("lists mistakes newest first and deletes only safe ids", async () => {
    const older = mistake("olderr01", "2024-01-01T00:00:00.000Z");
    const newer = mistake("newerr01", "2024-06-01T00:00:00.000Z");
    await saveMistake(older);
    await saveMistake(newer);
    expect((await listMistakes()).map((m) => m.id)).toEqual(["newerr01", "olderr01"]);
    await deleteMistake("newerr01");
    expect(await getMistake("newerr01")).toBeNull();
    await deleteMistake("../secrets");
    expect(await getMistake("olderr01")).not.toBeNull();
  });
});

function mistake(id: string, lastWrongAt: string): Mistake {
  const question: Question = makeQuestion({ id });
  return {
    id,
    question,
    lastAnswer: "no",
    lastScore: 10,
    feedback: "Review it.",
    missedPoints: ["closure"],
    wrongCount: 1,
    firstWrongAt: lastWrongAt,
    lastWrongAt,
  };
}
