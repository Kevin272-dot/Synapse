"use client";

import { useTransition } from "react";
import { Plus } from "lucide-react";
import { createDocument } from "@/lib/actions";

export function NewDocumentButton({
  folderId,
  compact = false,
}: {
  folderId?: string | null;
  compact?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => createDocument(folderId ?? null))}
      disabled={isPending}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 font-medium text-white transition hover:bg-slate-700 active:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 ${
        compact ? "h-9 px-4 text-sm" : "h-10 px-5 text-sm"
      }`}
    >
      <Plus className="h-4 w-4" />
      {isPending ? "Creating…" : "New document"}
    </button>
  );
}
