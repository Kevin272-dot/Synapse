"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { renameFolder, deleteFolder } from "@/lib/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function FolderRowActions({
  folder,
}: {
  folder: { id: string; name: string };
}) {
  const [renaming, setRenaming] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [name, setName] = useState(folder.name);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) inputRef.current?.focus();
  }, [renaming]);

  function submitRename(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isPending) return;
    startTransition(() => {
      renameFolder(folder.id, trimmed);
      setRenaming(false);
    });
  }

  function handleDelete() {
    setConfirmOpen(false);
    startTransition(() => deleteFolder(folder.id));
  }

  if (renaming) {
    return (
      <form
        onSubmit={submitRename}
        className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
        onClick={(e) => e.preventDefault()}
      >
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-36 rounded-md border border-slate-900/20 bg-white px-2 py-1 text-sm text-foreground outline-none dark:border-white/20 dark:bg-slate-800"
          onBlur={() => {
            if (!name.trim()) setRenaming(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setRenaming(false);
          }}
        />
        <button
          type="submit"
          disabled={!name.trim() || isPending}
          aria-label="Save name"
          className="rounded-full p-1.5 text-slate-500 hover:text-slate-900 disabled:opacity-40 dark:hover:text-slate-100"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setRenaming(false)}
          aria-label="Cancel rename"
          className="rounded-full p-1.5 text-slate-400 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </form>
    );
  }

  return (
    <>
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={() => setRenaming(true)}
          aria-label="Rename folder"
          title="Rename"
          className="rounded-full p-2 text-slate-400 transition hover:bg-slate-900/5 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={isPending}
          aria-label="Delete folder"
          title="Delete folder"
          className="rounded-full p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete folder?"
        message={
          <>
            <span className="font-medium text-foreground">{folder.name}</span>{" "}
            and everything inside it will be permanently deleted. This can't be
            undone.
          </>
        }
        confirmLabel="Delete folder"
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
