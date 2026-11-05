"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LEVEL_COOKIE, LEVEL_LABELS, LEVELS, type Level } from "@/lib/levels";

const ONE_YEAR = 60 * 60 * 24 * 365;

export function LevelPicker({ initial }: { initial: Level }) {
  const router = useRouter();
  const [level, setLevel] = useState(initial);

  function change(next: Level) {
    setLevel(next);
    document.cookie = `${LEVEL_COOKIE}=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
    router.refresh();
  }

  return (
    <label className="ml-auto flex items-center gap-2 text-sm text-stone-600">
      Level
      <select
        value={level}
        onChange={(e) => change(e.target.value as Level)}
        className="rounded-md border border-stone-300 bg-white px-2 py-1 text-sm text-stone-900"
        title="Difficulty of new questions and grading (Hong Kong secondary year)"
      >
        {LEVELS.map((l) => (
          <option key={l} value={l}>
            {LEVEL_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
