"use client";

import { useState, useTransition } from "react";
import {
  Share2,
  X,
  Loader2,
  Link2,
  Check,
  Trash2,
  UserPlus,
  Globe,
  Lock,
} from "lucide-react";
import {
  shareDocument,
  revokeShare,
  setDocumentVisibility,
} from "@/lib/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";

export interface Collaborator {
  id: string;
  name: string;
  email: string;
  role: "owner" | "editor" | "viewer";
}

export function ShareDialog({
  docId,
  isOwner,
  collaborators,
  visibility,
}: {
  docId: string;
  isOwner: boolean;
  collaborators: Collaborator[];
  visibility: "private" | "public";
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [confirmPublic, setConfirmPublic] = useState(false);

  function invite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const target = email.trim();
    if (!target) return;
    startTransition(async () => {
      try {
        const res = await shareDocument(docId, target, role);
        setNotice(`Shared with ${res.name}`);
        setEmail("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not share");
      }
    });
  }

  function remove(userId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await revokeShare(docId, userId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not remove");
      }
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy the link");
    }
  }

  function changeVisibility(next: "private" | "public") {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        await setDocumentVisibility(docId, next);
        setNotice(
          next === "public"
            ? "Anyone signed in to Synapse can now view this document."
            : "General access is restricted again."
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not update access");
      }
    });
  }

  function requestVisibility(next: "private" | "public") {
    if (next === visibility || !isOwner) return;
    if (next === "public") {
      // Sensitive: opening the doc to everyone needs confirmation.
      setConfirmPublic(true);
    } else {
      // Restricting is safe; no confirmation needed.
      changeVisibility("private");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-full bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
      >
        <Share2 className="h-4 w-4" />
        <span className="hidden sm:inline">Share</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-title"
        >
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm dark:bg-black/60"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-900/10 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-900/5 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>

            <h2
              id="share-title"
              className="text-base font-semibold text-foreground"
            >
              Share document
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {isOwner
                ? "Invite people by email. They'll see this doc in their dashboard."
                : "People with access to this document."}
            </p>

            {isOwner && (
              <form onSubmit={invite} className="mt-5 flex items-center gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teammate@example.com"
                  aria-label="Email address"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-slate-900/15 bg-transparent px-3 text-sm text-foreground outline-none transition focus:border-slate-900/40 dark:border-white/15 dark:focus:border-white/40"
                />
                <select
                  value={role}
                  onChange={(e) =>
                    setRole(e.target.value as "editor" | "viewer")
                  }
                  aria-label="Role"
                  className="h-9 rounded-lg border border-slate-900/15 bg-transparent px-2 text-sm text-foreground outline-none dark:border-white/15 dark:bg-slate-900"
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  type="submit"
                  disabled={isPending || !email.trim()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-slate-900 px-3.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <UserPlus className="h-3.5 w-3.5" />
                  )}
                  Invite
                </button>
              </form>
            )}

            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-400">
                {error}
              </p>
            )}
            {notice && (
              <p className="mt-3 rounded-lg bg-slate-900/5 px-3 py-2 text-xs text-slate-600 dark:bg-white/10 dark:text-slate-300">
                {notice}
              </p>
            )}

            {/* People with access */}
            <div className="mt-5">
              <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">
                People with access
              </h3>
              <ul className="mt-2 divide-y divide-slate-900/5 dark:divide-white/5">
                {collaborators.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900/[0.07] text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-200">
                      {(c.name || c.email).slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                        {c.name}
                      </span>
                      <span className="block truncate text-xs text-slate-400">
                        {c.email}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs capitalize text-slate-500 dark:text-slate-400">
                      {c.role}
                    </span>
                    {isOwner && c.role !== "owner" && (
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        disabled={isPending}
                        aria-label={`Remove ${c.name}`}
                        title="Remove access"
                        className="shrink-0 rounded-full p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* General access */}
            <div className="mt-5">
              <h3 className="text-xs font-medium uppercase tracking-wide text-slate-400">
                General access
              </h3>
              <div className="mt-2 space-y-1">
                <AccessOption
                  icon={<Lock className="h-4 w-4" />}
                  title="Restricted"
                  description="Only you and the people you invite."
                  active={visibility === "private"}
                  disabled={!isOwner || isPending}
                  onClick={() => requestVisibility("private")}
                />
                <AccessOption
                  icon={<Globe className="h-4 w-4" />}
                  title="Anyone can view"
                  description="Anyone signed in to Synapse can view this document."
                  active={visibility === "public"}
                  disabled={!isOwner || isPending}
                  onClick={() => requestVisibility("public")}
                />
              </div>
              {!isOwner && (
                <p className="mt-2 text-xs text-slate-400">
                  Only the document owner can change general access.
                </p>
              )}
            </div>

            {/* Copy link */}
            <button
              type="button"
              onClick={copyLink}
              className="mt-5 inline-flex h-9 w-full items-center justify-center gap-2 rounded-full border border-slate-900/15 text-sm font-medium text-slate-700 transition hover:bg-slate-900/5 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" /> Link copied
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4" /> Copy link
                </>
              )}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmPublic}
        title="Allow anyone to view?"
        message={
          <>
            Anyone signed in to Synapse will be able to{" "}
            <span className="font-medium text-foreground">view this document</span>{" "}
            using its link. They won't be able to edit it. You can restrict it
            again at any time.
          </>
        }
        confirmLabel="Make public"
        onConfirm={() => {
          setConfirmPublic(false);
          changeVisibility("public");
        }}
        onCancel={() => setConfirmPublic(false)}
      />
    </>
  );
}

function AccessOption({
  icon,
  title,
  description,
  active,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
        active
          ? "border-slate-900/30 bg-slate-900/[0.04] dark:border-white/30 dark:bg-white/10"
          : "border-slate-900/10 hover:bg-slate-900/[0.03] dark:border-white/10 dark:hover:bg-white/5"
      }`}
    >
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          active
            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
            : "bg-slate-900/[0.07] text-slate-500 dark:bg-white/10 dark:text-slate-300"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
          {title}
          {active && (
            <span className="ml-2 rounded-full bg-slate-900/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-white/15 dark:text-slate-300">
              Active
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">
          {description}
        </span>
      </span>
    </button>
  );
}
