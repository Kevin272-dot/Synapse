"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { MoreVertical, Trash2, ExternalLink } from "lucide-react";
import { deleteDocument } from "@/lib/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PagePreview } from "@/components/dashboard/page-preview";

export function DocumentCard({
  doc,
  ownerName,
  tags,
  canDelete = true,
}: {
  doc: { id: string; title: string; updatedAt: string };
  ownerName?: string;
  tags?: string[];
  canDelete?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    setConfirmOpen(false);
    startTransition(() => deleteDocument(doc.id));
  }

  return (
    <>
      <div className="group relative">
        <Link href={`/doc/${doc.id}`} className="block">
          <PagePreview className="aspect-[3/4] transition group-hover:border-[#1a73e8]" />
        </Link>

        {/* Hover three-dot menu */}
        <button
          type="button"
          aria-label="Document actions"
          onClick={() => setMenuOpen((o) => !o)}
          className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full text-[#5f6368] opacity-0 transition hover:bg-black/10 group-hover:opacity-100 focus:opacity-100 dark:text-slate-300 dark:hover:bg-white/20"
        >
          <MoreVertical className="h-4 w-4" />
        </button>

        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-20"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute right-1 top-9 z-30 w-40 rounded-lg border border-[#dadce0] bg-white p-1 shadow-lg dark:border-white/10 dark:bg-slate-800">
              <Link
                href={`/doc/${doc.id}`}
                className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-slate-700 hover:bg-black/[0.05] dark:text-slate-200 dark:hover:bg-white/10"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open
              </Link>
              {canDelete && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmOpen(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-black/[0.05] disabled:opacity-50 dark:text-slate-200 dark:hover:bg-white/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              )}
            </div>
          </>
        )}

        <div className="mt-2">
          <Link
            href={`/doc/${doc.id}`}
            className="block truncate text-sm font-medium text-slate-800 hover:underline dark:text-slate-100"
            title={doc.title}
          >
            {doc.title}
          </Link>
          <p className="mt-0.5 truncate text-xs text-[#5f6368] dark:text-slate-400">
            {ownerName ? `${ownerName} · ` : ""}
            {doc.updatedAt}
          </p>
          {tags && tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-[#e8f0fe] px-1.5 py-0.5 text-[10px] font-medium text-[#1967d2] dark:bg-[#1a73e8]/20 dark:text-[#a8c7fa]"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

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
