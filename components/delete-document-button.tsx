"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteDocument } from "@/lib/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function DeleteDocumentButton({ docId }: { docId: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    setConfirmOpen(false);
    startTransition(() => deleteDocument(docId));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={isPending}
        aria-label="Delete document"
        title="Delete document"
        className="rounded-full p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete document?"
        message="This document will be permanently deleted. This can't be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
