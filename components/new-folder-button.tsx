"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { FolderPlus } from "lucide-react";
import { createFolder } from "@/lib/actions";

export function NewFolderButton({
  parentId,
  compact = false,
}: {
  parentId?: string | null;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isPending) return;
    startTransition(() => {
      createFolder(trimmed, parentId ?? null);
      setName("");
      setOpen(false);
    });
  }

  if (open) {
    return (
      <form
        onSubmit={submit}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-900/15 bg-white px-3 dark:border-white/15 dark:bg-slate-800"
      >
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Folder name"
          className="w-36 bg-transparent text-sm text-foreground outline-none placeholder:text-slate-400"
          onBlur={() => {
            if (!name.trim()) setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        />
        <button
          type="submit"
          disabled={!name.trim() || isPending}
          className="text-sm font-medium text-slate-900 disabled:text-slate-400 dark:text-slate-100 dark:disabled:text-slate-600"
        >
          {isPending ? "…" : "Create"}
        </button>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-slate-900/15 font-medium text-slate-700 transition hover:bg-slate-900/5 active:scale-[0.98] dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5 ${
        compact ? "h-9 px-4 text-sm" : "h-10 px-4 text-sm"
      }`}
    >
      <FolderPlus className="h-4 w-4" />
      New folder
    </button>
  );
}
