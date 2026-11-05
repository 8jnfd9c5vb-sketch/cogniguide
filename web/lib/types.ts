import type { Level } from "./levels";

export type QuizLanguage = "en" | "zh";

export interface Subject {
  slug: string;
  name: string;
  quizLanguage: QuizLanguage;
  createdAt: string;
}

export type MaterialStatus = "processing" | "ready" | "failed";
export type MaterialKind = "pdf" | "image";

export interface MaterialMeta {
  id: string;
  subject: string;
  fileName: string;
  kind: MaterialKind;
  ext: string;
  sizeBytes: number;
  pages: number;
  status: MaterialStatus;
  /** Human-readable progress while processing. */
  step?: string;
  error?: string;
  failedPages?: number[];
  extracted: boolean;
  chunkCount: number;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Question {
  id: string;
  question: string;
  referenceAnswer: string;
  evidence: string;
  chunkIds: string[];
  subject: string;
  materialId: string;
  language: QuizLanguage;
  /** Missing on questions written before difficulty levels existed; treated as the default level. */
  level?: Level;
  /** "knowledge" questions come from the model's general subject knowledge, not uploaded notes. */
  origin?: "notes" | "knowledge";
}

/** What the browser sees before grading: no reference answer. */
export type PublicQuestion = Pick<
  Question,
  "id" | "question" | "subject" | "materialId" | "language" | "level" | "origin"
>;

export type QuizKind = "quick" | "subject" | "review";

export interface QuickQuizSession {
  id: string;
  /** Missing on sessions saved before subject quizzes and reviews existed; those are "quick". */
  kind?: QuizKind;
  topic?: string;
  /** Set for subject quizzes. */
  subject?: string;
  level: Level;
  createdAt: string;
  questions: Question[];
}

export interface Mistake {
  /** Same as the question id, so answering the same question wrong again updates one record. */
  id: string;
  question: Question;
  lastAnswer: string;
  lastScore: number;
  feedback: string;
  missedPoints: string[];
  wrongCount: number;
  firstWrongAt: string;
  lastWrongAt: string;
  /** Set once the question is later answered with a passing score. */
  masteredAt?: string;
}

export interface GradedItem {
  questionId: string;
  subject: string;
  materialId: string;
  chunkIds: string[];
  question: string;
  answer: string;
  referenceAnswer: string;
  score: number;
  correctPoints: string[];
  missedPoints: string[];
  feedback: string;
}

export interface Attempt {
  id: string;
  mode: "practice" | QuizKind;
  source: { subject: string; materialId: string } | { quizId: string };
  createdAt: string;
  totalScore: number;
  items: GradedItem[];
}

export interface Chunk {
  id: string;
  text: string;
  subject: string;
  materialId: string;
  fileName: string;
  chunkIndex: number;
  page: number;
}

export interface SearchHit extends Chunk {
  distance: number;
}
