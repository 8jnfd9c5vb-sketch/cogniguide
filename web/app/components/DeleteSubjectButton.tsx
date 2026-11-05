"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./api";

export function DeleteSubjectButton({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm(`Delete the subject "${name}" and all of its materials? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api(`/api/subjects/${slug}`, { method: "DELETE" });
      router.push("/");
      router.refresh();
    } catch (err) {
      alert((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <button onClick={remove} disabled={busy} className="text-sm text-stone-500 hover:text-red-600">
      Delete subject
    </button>
  );
}
