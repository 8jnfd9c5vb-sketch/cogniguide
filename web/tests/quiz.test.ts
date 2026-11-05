import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/bailian", () => ({
  chatJson: vi.fn(),
}));
vi.mock("@/lib/rag", () => ({
  getChunks: vi.fn(async () => []),
}));

import { chatJson } from "@/lib/bailian";
import { getChunks } from "@/lib/rag";
import { generateKnowledgeQuestions, generateQuestions, gradeAll, gradeAnswer, spreadChunks, usableChunks } from "@/lib/quiz";
import { makeChunk, makeGeneratedItem, makeQuestion } from "./helpers";

const chat = vi.mocked(chatJson);
const chunks = vi.mocked(getChunks);

beforeEach(() => {
  chat.mockReset();
  chunks.mockReset();
  chunks.mockResolvedValue([]);
});

describe("spreadChunks", () => {
  const all = Array.from({ length: 10 }, (_, i) => makeChunk({ id: `c${i}`, chunkIndex: i }));

  it("returns the input when it already fits", () => {
    expect(spreadChunks(all.slice(0, 3), 8)).toHaveLength(3);
    expect(spreadChunks([], 8)).toEqual([]);
  });

  it("picks evenly spaced chunks", () => {
    expect(spreadChunks(all, 4).map((c) => c.chunkIndex)).toEqual([0, 2, 5, 7]);
  });
});

describe("generateQuestions", () => {
  const source = [
    makeChunk({ id: "m-0" }),
    makeChunk({ id: "m-1", text: "Second chunk.", chunkIndex: 1 }),
    makeChunk({ id: "m-2", text: "Third chunk.", chunkIndex: 2 }),
  ];

  it("returns nothing without sources", async () => {
    expect(await generateQuestions([], 5, "en", "s3")).toEqual([]);
    expect(chat).not.toHaveBeenCalled();
  });

  it("asks for the level and language, and keeps only known source ids", async () => {
    chat.mockImplementation(async (system, _user, validate) => {
      expect(system).toContain("Secondary 1");
      expect(system).toContain("简体中文");
      expect(system).toContain("The numbers you set are yours to choose");
      expect(system).toContain("A reference answer always looks like this");
      expect(system).toContain("答案： the final value");
      return validate(
        {
          questions: [
            makeGeneratedItem({
              question: `  ${makeGeneratedItem().question}  `,
              chunkIds: ["m-1", "nope"],
            }),
            { question: "", referenceAnswer: "A" },
            makeGeneratedItem({
              question: "A ladder 13 cm long leans with its foot 5 cm from a wall. Find how far up the wall it reaches.",
              chunkIds: ["missing"],
            }),
          ],
        },
        0,
      );
    });
    const questions = await generateQuestions(source, 5, "zh", "s1");
    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({
      question: makeGeneratedItem().question,
      chunkIds: ["m-1"],
      subject: "math",
      materialId: "mat1",
      language: "zh",
      level: "s1",
      origin: "notes",
    });
    expect(questions[0].checks).toEqual(["5^2 + 12^2 = 169", "sqrt(169) = 13"]);
    expect(questions[1].chunkIds).toEqual(["m-0", "m-1", "m-2"]);
    expect(questions[0].id).toMatch(/^[a-z0-9]{8}$/);
  });

  it("keeps workbook junk out of the sources it sends", async () => {
    chat.mockImplementation(async (_system, _user, validate) =>
      validate({ questions: [makeGeneratedItem()] }, 0),
    );
    await generateQuestions(
      [
        makeChunk({
          id: "m-0",
          text: [
            "S5 Math CP Chapter 9 Applications of Trigonometry Name ______________ Class ____",
            "P.3",
            "13.",
            "14. By the sine formula, the ratio of two sides equals the ratio of the sines of the opposite angles.",
          ].join("\n"),
        }),
      ],
      1,
      "en",
      "s5",
    );
    const user = chat.mock.calls[0][1];
    expect(user).not.toContain("S5 Math CP Chapter 9");
    expect(user).not.toContain("P.3");
    expect(user).toContain("By the sine formula");
  });

  it("rejects a question that points at the notes, then falls back to a prose key", async () => {
    const copied = makeGeneratedItem({
      question:
        "In question 16, $\\sin C \\approx 1.04 > 1$. Explain why triangle $ABC$ cannot be formed.",
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    chat
      .mockImplementationOnce(async (_s, _u, validate) => validate({ questions: [copied] }, 0))
      .mockImplementationOnce(async (system, _u, validate) => {
        expect(system).toContain("instead of a rounded number");
        return validate({ questions: [makeGeneratedItem({ checks: [] })] }, 0);
      });
    const questions = await generateQuestions(source, 1, "en", "s3");
    expect(questions).toHaveLength(1);
    expect(chat).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("refers to the notes");
    warn.mockRestore();
  });

  it("rejects arithmetic that does not work out on the strict attempt", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    chat
      .mockImplementationOnce(async (_s, _u, validate) =>
        validate({ questions: [makeGeneratedItem({ checks: ["5^2 + 12^2 = 200"] })] }, 0),
      )
      .mockImplementationOnce(async (_s, _u, validate) =>
        validate({ questions: [makeGeneratedItem({ checks: [] })] }, 0),
      );
    expect(await generateQuestions(source, 1, "en", "s3")).toHaveLength(1);
    expect(warn.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("the two sides differ");
    warn.mockRestore();
  });

  it("demands a checkable equation behind a numerical key on the strict attempt", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    chat
      .mockImplementationOnce(async (_s, _u, validate) =>
        validate({ questions: [makeGeneratedItem({ checks: [] })] }, 0),
      )
      .mockImplementationOnce(async (_s, _u, validate) =>
        validate({ questions: [makeGeneratedItem({ checks: [] })] }, 0),
      );
    expect(await generateQuestions(source, 1, "en", "s3")).toHaveLength(1);
    expect(warn.mock.calls.map((c) => c.join(" ")).join("\n")).toContain('lists nothing in "checks"');
    warn.mockRestore();
  });

  it("rejects a one-sentence reference answer", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    chat.mockImplementation(async (_s, _u, validate) =>
      validate(
        {
          questions: [
            makeGeneratedItem({ referenceAnswer: "Because the hypotenuse is 13 cm." }),
          ],
        },
        0,
      ),
    );
    await expect(generateQuestions(source, 1, "en", "s3")).rejects.toThrow(
      /did not produce any usable questions/,
    );
    expect(chat).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("numbered step");
    warn.mockRestore();
  });

  it("keeps the spare questions so one bad key does not shorten the set", async () => {
    chat.mockImplementation(async (_s, _u, validate) =>
      validate(
        {
          questions: [
            makeGeneratedItem({ question: "A ladder 13 cm long leans 5 cm from a wall. Find the height reached." }),
            makeGeneratedItem({
              question: "A cone has radius 4 cm and slant height 10 cm. Find its curved surface area.",
              checks: ["sqrt(16) = 5"],
            }),
            makeGeneratedItem({ question: "Two angles of a triangle are 30 and 60 degrees. Find the third angle." }),
          ],
        },
        0,
      ),
    );
    const questions = await generateQuestions(source, 2, "en", "s3");
    expect(questions).toHaveLength(2);
  });

  it("drops near-duplicate questions from the same reply", async () => {
    chat.mockImplementation(async (_s, _u, validate) =>
      validate({ questions: [makeGeneratedItem(), makeGeneratedItem()] }, 0),
    );
    const questions = await generateQuestions(source, 3, "en", "s3");
    expect(questions).toHaveLength(1);
  });
});

describe("generateKnowledgeQuestions", () => {
  it("writes subject questions with no note sources", async () => {
    chat.mockImplementation(async (system, user, validate) => {
      expect(system).toContain("Geography");
      expect(system).toContain("Secondary 2");
      expect(user).toContain("Write exactly 7");
      return validate(
        {
          questions: [
            makeGeneratedItem({
              question: "Explain why Hong Kong is humid in summer, using the monsoon.",
              referenceAnswer: [
                "1. In summer the winds come from the south-west.",
                "2. They cross warm sea before reaching the coast.",
                "3. The air therefore arrives holding much water vapour.",
                "Answer: The summer monsoon brings moist maritime air.",
              ].join("\n"),
              evidence: "south-west monsoon crossing warm sea",
              checks: [],
            }),
          ],
        },
        0,
      );
    });
    const questions = await generateKnowledgeQuestions({ slug: "geography", name: "Geography" }, 5, "en", "s2");
    expect(questions[0]).toMatchObject({
      subject: "geography",
      materialId: "",
      chunkIds: [],
      origin: "knowledge",
      level: "s2",
    });
  });

  it("demands checks for a numerical maths key only on the first attempt", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    chat.mockImplementation(async (_system, _user, validate) => {
      expect(() => validate({ questions: [makeGeneratedItem({ checks: [] })] }, 0)).toThrow(/cannot be verified/);
      return validate({ questions: [makeGeneratedItem({ checks: [] })] }, 1);
    });
    expect(await generateKnowledgeQuestions({ slug: "math", name: "Math" }, 1, "en", "s3")).toHaveLength(1);
    expect(chat).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("cannot be verified");
    warn.mockRestore();
  });

  it("rejects a wrong arithmetic claim on the lenient attempt too", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const wrong = { questions: [makeGeneratedItem({ checks: ["sqrt(169) = 12"] })] };
    chat.mockImplementation(async (_system, _user, validate) => {
      expect(() => validate(wrong, 1)).toThrow(/the two sides differ/);
      return validate({ questions: [makeGeneratedItem()] }, 1);
    });
    expect(await generateKnowledgeQuestions({ slug: "geography", name: "Geography" }, 1, "en", "s3")).toHaveLength(1);
    expect(warn.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("the two sides differ");
    warn.mockRestore();
  });
});

describe("usableChunks", () => {
  it("drops chunks that are nothing but workbook furniture", () => {
    const junk = makeChunk({
      id: "junk",
      text: "S5 Math CP Chapter 9 Applications of Trigonometry Name ________________ Class ____\nP.3\n13.\n14.",
    });
    const real = makeChunk({
      id: "real",
      text: "13. By the sine formula, the ratio of two sides equals the ratio of the sines of the angles opposite them.",
    });
    expect(usableChunks([junk, real], 8).map((c) => c.id)).toEqual(["real"]);
    expect(usableChunks([junk], 8)).toEqual([]);
  });

  it("cleans the chunks it keeps, so the prompt sees the maths", () => {
    const [only] = usableChunks(
      [
        makeChunk({
          id: "keep",
          text: "In each of the following, determine whether $\\triangle ABC$ can be formed. If yes, find $C$. [Nos. 16-19]",
        }),
      ],
      8,
    );
    expect(only.text).not.toContain("[Nos.");
    expect(only.id).toBe("keep");
  });
});

describe("grading", () => {
  it("scores a blank answer without calling the model", async () => {
    const item = await gradeAnswer(makeQuestion({ language: "zh" }), "   ");
    expect(item).toMatchObject({ score: 0, feedback: "未作答。", correctPoints: [], missedPoints: [] });
    expect(chat).not.toHaveBeenCalled();
  });

  it("clamps the score and grades knowledge questions against the reference answer", async () => {
    chunks.mockResolvedValue([makeChunk()]);
    chat.mockImplementation(async (system, user, validate) => {
      expect(system).toContain("general subject");
      expect(user).toContain("key-points");
      expect(chunks).not.toHaveBeenCalled();
      return validate({ score: 140, correctPoints: ["right"], missedPoints: "nope", feedback: "Good." }, 0);
    });
    const item = await gradeAnswer(makeQuestion({ origin: "knowledge", chunkIds: [], level: "s6" }), "Because.");
    expect(item.score).toBe(100);
    expect(item.missedPoints).toEqual([]);
    expect(item.correctPoints).toEqual(["right"]);
  });

  it("quotes the original chunks when the question came from notes", async () => {
    chunks.mockResolvedValue([makeChunk({ id: "mat1-0", text: "Closed under addition." })]);
    chat.mockImplementation(async (system, user, validate) => {
      expect(system).toContain("study notes");
      expect(system).toContain("Secondary 4");
      expect(user).toContain('id="mat1-0"');
      expect(user).toContain("Closed under addition.");
      return validate({ score: -5, correctPoints: [], missedPoints: ["closure"], feedback: "Review." }, 0);
    });
    const item = await gradeAnswer(makeQuestion({ level: "s4" }), "I think so");
    expect(item.score).toBe(0);
    expect(chunks).toHaveBeenCalledWith(["mat1-0"]);
  });

  it("grades a new problem by its own numbers and the key as a mark scheme", async () => {
    chunks.mockResolvedValue([makeChunk({ id: "mat1-0", text: "By the sine formula, $\\frac{a}{\\sin A} = \\frac{c}{\\sin C}$." })]);
    chat.mockImplementation(async (system, user, validate) => {
      expect(system).toContain("The sources show the method only");
      expect(system).toContain("never against the numbers in the sources");
      expect(system).toContain("mark scheme");
      expect(system).toContain("A different valid method earns full marks");
      expect(system).toContain("no method marks, so score at most 40");
      expect(system).toContain("cannot exist");
      expect(user).not.toContain("11*sin(22.609)");
      return validate({ score: 92, correctPoints: ["cosine rule"], missedPoints: [], feedback: "Good." }, 0);
    });
    const item = await gradeAnswer(
      makeQuestion({ checks: ["11*sin(22.609)/sin(117) = 4.7461"] }),
      "1. By the cosine rule.\n2. $c = 4.75$ cm.\nAnswer: 4.75 cm",
    );
    expect(item.score).toBe(92);
    expect(item.correctPoints).toEqual(["cosine rule"]);
  });

  it("grades every question and caps long answers", async () => {
    chat.mockImplementation(async (_s, user, validate) => {
      expect(user.length).toBeLessThan(6000);
      return validate({ score: 80, correctPoints: [], missedPoints: [], feedback: "Fine." }, 0);
    });
    const first = makeQuestion({ id: "blank001" });
    const second = makeQuestion({ id: "long0001" });
    const items = await gradeAll([first, second], { [second.id]: "x".repeat(9000) });
    expect(items.map((i) => i.score)).toEqual([0, 80]);
    expect(items[1].answer).toHaveLength(5000);
  });
});
