"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useEditor, EditorContent } from "@tiptap/react";
import { useUser, useAuth } from "@clerk/nextjs";
import { ArrowLeft, Check, FileText, Globe } from "lucide-react";
import EditorToolbar from "@/components/editor/toolbar";
import EditorMenuBar from "@/components/editor/menu-bar";
import AiPanel from "@/components/editor/ai-panel";
import { ShareDialog } from "@/components/editor/share-dialog";
import { saveDocument, renameDocument } from "@/lib/actions";
import { useCollabSocket } from "@/lib/ot/use-collab-socket";
import { docToText, diffToOp, applyRemoteOp, docPosToTextOffset, textOffsetToDocPos } from "@/lib/ot/editor-bridge";
import { EDITOR_EXTENSIONS } from "@/lib/editor/extensions";
import { RemoteCursors, remoteCursorsKey, cursorColor } from "@/lib/editor/remote-cursors";
import "./editor.css";

type EditorProps = {
  docId: string;
  initialTitle: string;
  initialContent: object | null;
  initialText?: string;
  initialSummary?: string | null;
  initialFlashcards?: unknown;
  initialQuiz?: unknown;
  role?: "owner" | "editor" | "viewer";
  editable?: boolean;
  isOwner?: boolean;
  visibility?: "private" | "public";
  collaborators?: {
    id: string;
    name: string;
    email: string;
    role: "owner" | "editor" | "viewer";
  }[];
  ownerId?: string;
  currentUserId?: string;
};

// Empty TipTap doc (one blank paragraph).
const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

export default function Editor({
  docId,
  initialTitle,
  initialContent,
  initialText,
  initialSummary,
  initialFlashcards,
  initialQuiz,
  role = "owner",
  editable = true,
  isOwner = true,
  visibility = "private",
  collaborators = [],
}: EditorProps) {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const clerkId = user?.id ?? "";
  const displayName =
    user?.firstName || user?.username || user?.primaryEmailAddress?.emailAddress || "You";

  const [title, setTitle] = useState(initialTitle);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle"
  );

  // Refs so the debounce/flush closures always see current values.
  const docIdRef = useRef(docId);
  docIdRef.current = docId;
  const contentRef = useRef<string>("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const lastTextRef = useRef<string>(initialText ?? "");

  function scheduleSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist();
    }, 1200);
  }

  async function persist() {
    const content = contentRef.current;
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    setSaveState("saving");
    try {
      const text = editor ? docToText(editor) : undefined;
      await saveDocument(docIdRef.current, content, text);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    } catch {
      dirtyRef.current = true; // retry next time
      setSaveState("idle");
    }
  }

  // Flush pending save on unmount / before page hide.
  useEffect(() => {
    function flush() {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void persist();
    }
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void persist();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const editor = useEditor({
    extensions: [...EDITOR_EXTENSIONS, RemoteCursors],
    content: initialContent ?? EMPTY_DOC,
    editable,
    // SSR-safe: the editor mounts after hydration (explicit = silences the
    // TipTap/Next warning).
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "focus:outline-none",
      },
    },
    onCreate: ({ editor }) => {
      // Prefer rich JSON content. Only fall back to plain text when the doc
      // has no rich content yet (e.g. a brand-new doc, or pre-text migration).
      if (!initialContent && initialText) {
        editor.commands.setContent(initialText);
        lastTextRef.current = initialText;
      } else {
        lastTextRef.current = docToText(editor);
      }
    },
    onUpdate: ({ editor }) => {
      // Viewers never write: no autosave, no OT ops.
      if (!editable) {
        lastTextRef.current = docToText(editor);
        return;
      }
      contentRef.current = JSON.stringify(editor.getJSON());
      dirtyRef.current = true;
      scheduleSave();

      // Extract a plain-text OT op for LOCAL edits (not remote-applied ones).
      if (!applyingRemoteRef.current) {
        const before = lastTextRef.current;
        const after = docToText(editor);
        const op = diffToOp(before, after);
        if (op.length > 0) {
          lastTextRef.current = after;
          submitOp(op);
        }
      }
    },
    onSelectionUpdate: ({ editor }) => {
      // Broadcast my caret as plain-text offsets for other collaborators.
      const { from, to } = editor.state.selection;
      updatePresence(docPosToTextOffset(editor, from), {
        from: docPosToTextOffset(editor, from),
        to: docPosToTextOffset(editor, to),
      });
    },
  });

  // Real-time collaboration socket.
  const { connected, denied, peers, submitOp, updatePresence } = useCollabSocket({
    docId,
    userId: clerkId,
    name: displayName,
    enabled: isLoaded && !!clerkId,
    getToken,
    onRemote: (op) => {
      if (!editor) return;
      applyingRemoteRef.current = true;
      try {
        applyRemoteOp(editor, op);
        lastTextRef.current = docToText(editor);
      } finally {
        applyingRemoteRef.current = false;
      }
    },
  });

  // Paint collaborators' carets/selection into the editor as decorations.
  useEffect(() => {
    if (!editor) return;
    const cursors = peers
      .filter((p) => p.cursor != null || p.selection)
      .map((p) => {
        const fromOffset = p.selection?.from ?? p.cursor ?? 0;
        const toOffset = p.selection?.to ?? p.cursor ?? 0;
        return {
          clientId: p.clientId,
          name: p.name,
          color: cursorColor(p.userId),
          from: textOffsetToDocPos(editor, fromOffset),
          to: textOffsetToDocPos(editor, toOffset),
        };
      });

    const tr = editor.state.tr.setMeta(remoteCursorsKey, cursors);
    editor.view.dispatch(tr);
  }, [editor, peers]);

  function commitTitle() {
    if (!editable) return;
    const trimmed = title.trim();
    if (!trimmed || trimmed === initialTitle) {
      setTitle(initialTitle);
      return;
    }
    setTitle(trimmed);
    void renameDocument(docId, trimmed);
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* ===== Top chrome (sticky) ===== */}
      <header className="sticky top-0 z-20 border-b border-slate-900/10 bg-white dark:border-white/10 dark:bg-slate-900">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
          <Link
            href="/dashboard"
            aria-label="Back to documents"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>

          <span className="hidden h-6 w-px bg-slate-900/10 dark:bg-white/10 sm:block" />

          <FileText className="hidden h-5 w-5 shrink-0 text-slate-400 sm:block" />

          {/* Title */}
          <div className="flex min-w-0 flex-1 items-center">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              readOnly={!editable}
              aria-label="Document title"
              className="w-full min-w-0 truncate bg-transparent text-lg font-medium tracking-tight text-foreground outline-none transition placeholder:text-slate-400 focus:text-xl disabled:opacity-100 dark:placeholder:text-slate-500"
              placeholder="Untitled Document"
            />
          </div>

          {/* Presence: who's currently in this document */}
          {connected && (
            <PresenceStack
              peers={peers}
              selfName={displayName}
              selfColor={cursorColor(clerkId || "self")}
            />
          )}

          {/* Read-only indicator */}
          {!editable && (
            <span className="shrink-0 rounded-full bg-slate-900/5 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-white/10 dark:text-slate-300">
              View only
            </span>
          )}

          {/* Public access indicator */}
          {visibility === "public" && (
            <span
              className="hidden shrink-0 items-center gap-1 rounded-full bg-slate-900/5 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-white/10 dark:text-slate-300 sm:inline-flex"
              title="Anyone signed in to Synapse can view this document"
            >
              <Globe className="h-3 w-3" />
              Anyone can view
            </span>
          )}

          {/* Share */}
          <ShareDialog
            docId={docId}
            isOwner={isOwner}
            collaborators={collaborators}
            visibility={visibility}
          />

          {/* Save status */}
          <span
            className="flex shrink-0 items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400"
            role="status"
            aria-live="polite"
          >
            {denied ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                View only
              </span>
            ) : saveState === "saving" ? (
              "Saving…"
            ) : saveState === "saved" ? (
              <>
                <Check className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <span className="hidden sm:inline">Saved to Synapse</span>
              </>
            ) : (
              <span className="hidden text-slate-300 dark:text-slate-600 sm:inline">
                {connected ? "Connected" : "All changes saved"}
              </span>
            )}
          </span>
        </div>
      </header>

      {/* ===== Menu bar ===== */}
      {editable && (
        <div className="sticky top-14 z-20">
          <EditorMenuBar editor={editor} />
        </div>
      )}

      {/* ===== Toolbar ===== */}
      {editable && (
        <div className="sticky top-[6.5rem] z-10 border-b border-slate-900/10 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-slate-900/95">
          <div className="mx-auto w-full max-w-6xl px-2 sm:px-6">
            <EditorToolbar editor={editor} />
          </div>
        </div>
      )}

      {/* ===== Gray canvas + white page ===== */}
      <main className="flex-1 overflow-x-auto">
        <div className="mx-auto my-8 w-full max-w-4xl px-4 sm:my-12 sm:px-8">
          {/* The "page" */}
          <div className="min-h-[90vh] rounded-sm bg-white px-8 py-12 shadow-[0_1px_3px_rgba(0,0,0,0.15),0_8px_24px_rgba(0,0,0,0.12)] sm:px-16 sm:py-16 dark:bg-white">
            <EditorContent editor={editor} />
          </div>
        </div>
      </main>

      {/* ===== AI panel ===== */}
      <AiPanel
        docId={docId}
        editable={editable}
        onRestore={(targetText) => {
          if (!editor || !editable) return;
          // Restore is just another OT op: diff current -> target and send
          // it through the normal pipeline, so it syncs live and is logged.
          const op = diffToOp(lastTextRef.current, targetText);
          if (op.length === 0) return;
          lastTextRef.current = targetText;
          submitOp(op);
          applyRemoteOp(editor, op);
        }}
        initialSummary={initialSummary ?? null}
        initialFlashcards={(initialFlashcards as never) ?? null}
        initialQuiz={(initialQuiz as never) ?? null}
      />
    </div>
  );
}

/** Initials from a display name ("Kevin Daniel" -> "KD"). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Docs-style avatar stack: who is currently in the document. */
function PresenceStack({
  peers,
  selfName,
  selfColor,
}: {
  peers: { clientId: string; userId: string; name: string }[];
  selfName: string;
  selfColor: string;
}) {
  const all = [
    { id: "self", name: `${selfName} (you)`, color: selfColor },
    ...peers.map((p) => ({
      id: p.clientId,
      name: p.name,
      color: cursorColor(p.userId),
    })),
  ];
  const shown = all.slice(0, 4);
  const overflow = all.length - shown.length;

  return (
    <div
      className="flex shrink-0 items-center -space-x-2"
      title={all.map((a) => a.name).join(", ")}
    >
      {shown.map((a) => (
        <span
          key={a.id}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-white dark:ring-slate-900"
          style={{ background: a.color }}
        >
          {initialsOf(a.name)}
        </span>
      ))}
      {overflow > 0 && (
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 ring-2 ring-white dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-900">
          +{overflow}
        </span>
      )}
    </div>
  );
}
