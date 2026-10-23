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
  Cpu,
  Sparkles,
} from "lucide-react";
import {
  shareDocument,
  revokeShare,
  setDocumentVisibility,
  setSyncEngine,
  setDocumentKgEnabled,
} from "@/lib/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";

export interface Collaborator {
  id: string;
  name: string;
  email: string;
  role: "owner" | "editor" | "commenter" | "viewer";
}

export function ShareDialog({
  docId,
  isOwner,
  collaborators,
  visibility,
  syncEngine,
  kgEnabled,
}: {
  docId: string;
  isOwner: boolean;
  collaborators: Collaborator[];
  visibility: "private" | "public";
  syncEngine: "ot" | "crdt";
  kgEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "commenter" | "viewer">("editor");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [confirmPublic, setConfirmPublic] = useState(false);
  const [kg, setKg] = useState(kgEnabled);

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
      setConfirmPublic(true);
    } else {
      changeVisibility("private");
    }
  }

  function changeEngine(next: "ot" | "crdt") {
    if (next === syncEngine || !isOwner) return;
    setError(null);
    startTransition(async () => {
      try {
        await setSyncEngine(docId, next);
        window.location.reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not switch engine");
      }
    });
  }

  function changeKg(next: boolean) {
    if (!isOwner) return;
    setError(null);
    setKg(next);
    startTransition(async () => {
      try {
        await setDocumentKgEnabled(docId, next);
      } catch (err) {
        setKg(!next);
        setError(
          err instanceof Error ? err.message : "Could not update knowledge graph"
        );
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-[#1a73e8] px-5 text-sm font-medium text-[#1a73e8] transition hover:bg-[#e8f0fe] dark:border-[#8ab4f8] dark:text-[#8ab4f8] dark:hover:bg-[#1a73e8]/15"
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
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex max-h-[85vh] w-full max-w-md flex-col rounded-lg bg-white shadow-2xl dark:bg-slate-900">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-[#e2e8f0] px-6 py-4 dark:border-white/10">
              <h2
                id="share-title"
                className="text-lg font-medium text-[#202124] dark:text-slate-100"
              >
                Share document
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {error && (
                <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
                  {error}
                </p>
              )}
              {notice && (
                <p className="mb-4 rounded-md bg-[#e8f0fe] px-3 py-2 text-sm text-[#1967d2] dark:bg-[#1a73e8]/15 dark:text-[#a8c7fa]">
                  {notice}
                </p>
              )}

              {isOwner && (
                <form onSubmit={invite} className="mb-6">
                  <label className="mb-1.5 block text-xs font-medium text-[#5f6368] dark:text-slate-400">
                    Add people
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter email address"
                      className="h-10 min-w-0 flex-1 rounded-md border border-[#dadce0] bg-white px-3 text-sm text-[#202124] outline-none transition placeholder:text-slate-400 focus:border-[#1a73e8] focus:ring-2 focus:ring-[#1a73e8]/20 dark:border-white/15 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-[#8ab4f8]"
                    />
                    <select
                      value={role}
                      onChange={(e) =>
                        setRole(e.target.value as "editor" | "commenter" | "viewer")
                      }
                      aria-label="Role"
                      className="h-10 rounded-md border border-[#dadce0] bg-white px-2 text-sm text-[#202124] outline-none dark:border-white/15 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="editor">Editor</option>
                      <option value="commenter">Commenter</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      type="submit"
                      disabled={isPending || !email.trim()}
                      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-[#1a73e8] px-4 text-sm font-medium text-white transition hover:bg-[#1765cc] disabled:opacity-50"
                    >
                      {isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <UserPlus className="h-3.5 w-3.5" />
                      )}
                      Send
                    </button>
                  </div>
                </form>
              )}

              {/* People with access */}
              <div>
                <h3 className="mb-2 text-xs font-medium text-[#5f6368] dark:text-slate-400">
                  People with access
                </h3>
                <ul className="space-y-1">
                  {collaborators.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-center gap-3 rounded-md px-1 py-1.5"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1a73e8] text-xs font-semibold text-white">
                        {(c.name || c.email).slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-[#202124] dark:text-slate-100">
                          {c.name}
                        </span>
                        <span className="block truncate text-xs text-[#5f6368] dark:text-slate-400">
                          {c.email}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs capitalize text-[#5f6368] dark:text-slate-400">
                        {c.role}
                      </span>
                      {isOwner && c.role !== "owner" && (
                        <button
                          type="button"
                          onClick={() => remove(c.id)}
                          disabled={isPending}
                          aria-label={`Remove ${c.name}`}
                          className="shrink-0 rounded-full p-1.5 text-[#5f6368] transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-red-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {/* General access */}
              <div className="mt-6">
                <h3 className="mb-2 text-xs font-medium text-[#5f6368] dark:text-slate-400">
                  General access
                </h3>
                <div className="space-y-1">
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
                    title="Anyone with the link"
                    description="Anyone signed in to Synapse can view this document."
                    active={visibility === "public"}
                    disabled={!isOwner || isPending}
                    onClick={() => requestVisibility("public")}
                  />
                </div>
                {!isOwner && (
                  <p className="mt-2 text-xs text-[#5f6368] dark:text-slate-500">
                    Only the document owner can change general access.
                  </p>
                )}
              </div>

              {/* Sync engine — Document settings, decoupled from sharing */}
              <div className="mt-6 border-t border-[#e2e8f0] pt-5 dark:border-white/10">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[#5f6368] dark:text-slate-400">
                  <Cpu className="h-3.5 w-3.5" />
                  Document settings
                </h3>
                <div className="space-y-1">
                  <EngineOption
                    label="OT (Operational Transform)"
                    description="Server-authoritative. Exact cursor positioning. Best for small teams."
                    active={syncEngine === "ot"}
                    disabled={!isOwner || isPending}
                    onClick={() => changeEngine("ot")}
                  />
                  <EngineOption
                    label="CRDT (Logoot)"
                    description="Decentralized merge. Server relays without transformation."
                    active={syncEngine === "crdt"}
                    disabled={!isOwner || isPending}
                    onClick={() => changeEngine("crdt")}
                  />
                </div>
                {!isOwner && (
                  <p className="mt-2 text-xs text-[#5f6368] dark:text-slate-500">
                    Only the document owner can change the sync engine.
                  </p>
                )}
              </div>

              {/* Knowledge graph - per-document extraction toggle */}
              <div className="mt-5 border-t border-[#e2e8f0] pt-4 dark:border-white/10">
                <button
                  type="button"
                  role="switch"
                  aria-checked={kg}
                  onClick={() => changeKg(!kg)}
                  disabled={!isOwner || isPending}
                  className="flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-[#f8f9fa] disabled:opacity-60 dark:hover:bg-white/5"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-[#202124] dark:text-slate-100">
                      <Sparkles className="h-3.5 w-3.5" />
                      Knowledge graph
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-[#5f6368] dark:text-slate-400">
                      {kg
                        ? "Concepts are extracted when the document is closed, then added to your graph."
                        : "No concepts are extracted for this document."}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${
                      kg
                        ? "bg-slate-900 dark:bg-white"
                        : "bg-slate-300 dark:bg-white/20"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all dark:bg-slate-900 ${
                        kg ? "left-[18px]" : "left-0.5"
                      }`}
                    />
                  </span>
                </button>
                {!isOwner && (
                  <p className="mt-1 px-3 text-xs text-[#5f6368] dark:text-slate-500">
                    Only the document owner can change knowledge-graph settings.
                  </p>
                )}
              </div>

              {/* Copy link */}
              <button
                type="button"
                onClick={copyLink}
                className="mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#dadce0] text-sm font-medium text-[#1a73e8] transition hover:bg-[#f8f9fa] dark:border-white/15 dark:text-[#8ab4f8] dark:hover:bg-white/5"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-[#188038]" /> Link copied to
                    clipboard
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4" /> Copy document link
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmPublic}
        title="Make this document public?"
        message="Anyone signed in to Synapse will be able to view this document using its link. They won't be able to edit it. You can restrict it again at any time."
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
      className={`flex w-full items-start gap-3 rounded-md border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
        active
          ? "border-[#1a73e8]/40 bg-[#e8f0fe]/60 dark:border-[#8ab4f8]/30 dark:bg-[#1a73e8]/10"
          : "border-[#dadce0] hover:bg-[#f8f9fa] dark:border-white/10 dark:hover:bg-white/5"
      }`}
    >
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          active
            ? "bg-[#1a73e8] text-white"
            : "bg-[#f1f3f4] text-[#5f6368] dark:bg-white/10 dark:text-slate-300"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[#202124] dark:text-slate-100">
          {title}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-[#5f6368] dark:text-slate-400">
          {description}
        </span>
      </span>
      {active && (
        <Check className="mt-1 h-4 w-4 shrink-0 text-[#1a73e8] dark:text-[#8ab4f8]" />
      )}
    </button>
  );
}

function EngineOption({
  label,
  description,
  active,
  disabled,
  onClick,
}: {
  label: string;
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
      className={`flex w-full items-start gap-3 rounded-md border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
        active
          ? "border-[#1a73e8]/40 bg-[#e8f0fe]/60 dark:border-[#8ab4f8]/30 dark:bg-[#1a73e8]/10"
          : "border-[#dadce0] hover:bg-[#f8f9fa] dark:border-white/10 dark:hover:bg-white/5"
      }`}
    >
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${
          active
            ? "bg-[#1a73e8] text-white"
            : "bg-[#f1f3f4] text-[#5f6368] dark:bg-white/10 dark:text-slate-300"
        }`}
      >
        {label === "OT (Operational Transform)" ? "OT" : "CR"}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[#202124] dark:text-slate-100">
          {label}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-[#5f6368] dark:text-slate-400">
          {description}
        </span>
      </span>
      {active && (
        <Check className="mt-1 h-4 w-4 shrink-0 text-[#1a73e8] dark:text-[#8ab4f8]" />
      )}
    </button>
  );
}
