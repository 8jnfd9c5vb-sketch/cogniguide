import type { Metadata } from "next";
import Link from "next/link";
import "katex/dist/katex.min.css";
import { currentLevel } from "@/lib/currentLevel";
import { LevelPicker } from "./components/LevelPicker";
import "./globals.css";

export const metadata: Metadata = {
  title: "CogniGuide",
  description: "Turn your study notes into questions and self-test.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const level = await currentLevel();
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        <header className="border-b border-stone-200 bg-white">
          <nav className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              CogniGuide
            </Link>
            <Link href="/" className="text-sm text-stone-600 hover:text-stone-900">
              Subjects
            </Link>
            <Link
              href="/quick-quiz"
              className="text-sm text-stone-600 hover:text-stone-900"
            >
              Quick Quiz
            </Link>
            <Link href="/mistakes" className="text-sm text-stone-600 hover:text-stone-900">
              Mistakes
            </Link>
            <LevelPicker initial={level} />
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
