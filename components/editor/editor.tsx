"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useEditor, EditorContent } from "@tiptap/react";
import { useUser, useAuth } from "@clerk/nextjs";
import { ArrowLeft, Check, FileText, Globe, WifiOff } from "lucide-react";
import EditorToolbar from "@/components/editor/toolbar";
import EditorMenuBar from "@/components/editor/menu-bar";
import AiPanel from "@/components/editor/ai-panel";
import { ShareDialog } from "@/components/editor/share-dialog";
import SlashMenu from "@/components/editor/slash-menu";
import { saveDocument, renameDocument, createSuggestion, markSuggestionApplied } from "@/lib/actions";
import { useCollabSocket } from "@/lib/ot/use-collab-socket";
import { clearOfflineSnapshot } from "@/lib/offline-queue";
import { docToText, diffToOp, applyRemoteOp, docPosToTextOffset, textOffsetToDocPos } from "@/lib/ot/editor-bridge";
import { Logoot, type CrdtOp } from "@/lib/crdt/logoot";
import type { Operation, OpComponent } from "@/lib/ot/engine";
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
  role?: "owner" | "editor" | "commenter" | "viewer";
  editable?: boolean;
  isOwner?: boolean;
  visibility?: "private" | "public";
  syncEngine?: "ot" | "crdt";
  /** Whether knowledge-graph extraction is enabled for this document. */
  kgEnabled?: boolean;
  /** Folder this document lives in, so "back" returns to the folder, not home. */
  folderId?: string | null;
  collaborators?: {
    id: string;
    name: string;
    email: string;
    role: "owner" | "editor" | "commenter" | "viewer";
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
  kgEnabled = true,
  folderId = null,
  syncEngine = "ot",
  collaborators = [],
  currentUserId,
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
  const [slashOpen, setSlashOpen] = useState(false);

  // Refs so the debounce/flush closures always see current values.
  const docIdRef = useRef(docId);
  docIdRef.current = docId;
  const contentRef = useRef<string>("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const lastTextRef = useRef<string>(initialText ?? "");
  // Sync-engine state (OT is the default; CRDT mode uses a Logoot mirror).
  const engineRef = useRef<"ot" | "crdt">("ot");
  const crdtMirrorRef = useRef<Logoot | null>(null);
  const pendingCrdtRef = useRef<CrdtOp[]>([]);

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

      // Extract a plain-text op for LOCAL edits (not remote-applied ones).
      if (!applyingRemoteRef.current) {
        const before = lastTextRef.current;
        const after = docToText(editor);
        const op = diffToOp(before, after);
        if (op.length > 0) {
          lastTextRef.current = after;
          dispatchOp(op, after);
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
  const {
    connected,
    denied,
    engine,
    peers,
    queuedCount,
    offlineSnapshot,
    dismissOfflineSnapshot,
    submitOp,
    submitCrdt,
    updatePresence,
  } = useCollabSocket({
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
    onRemoteCrdt: (ops) => {
      if (!editor) return;
      const mirror = crdtMirrorRef.current;
      if (!mirror) return;
      applyingRemoteRef.current = true;
      try {
        for (const crdtOp of ops) mirror.applyRemote(crdtOp);
        const newText = mirror.toText();
        const editorText = docToText(editor);
        if (newText !== editorText) {
          applyRemoteOp(editor, diffToOp(editorText, newText));
        }
        lastTextRef.current = newText;
      } finally {
        applyingRemoteRef.current = false;
      }
    },
    onServerText: (serverText, syncEngine) => {
      // Offline reconcile: the server's authoritative text may be missing
      // edits we made (or restored from the IndexedDB snapshot) while the
      // socket was down. Diffing server -> editor and shipping that delta
      // as one ordinary op reuses the normal convergence pipeline; since a
      // diff op transforms server text into our text by construction,
      // both sides provably converge.
      serverTextRef.current = { text: serverText, engine: syncEngine };
      if (syncEngine === "crdt") return;
      if (!editor || !editable) return;
      reconcileFromServer(serverText);
      serverTextRef.current = null;
    },
  });

  /** Latest SYNC server text, kept for reconcile when the editor mounts late. */
  const serverTextRef = useRef<{ text: string; engine: "ot" | "crdt" } | null>(null);

  /**
   * Ship any delta between the server's current text and the editor's text
   * (which may contain offline edits) as one ordinary op. Editor text stays
   * unchanged — it is already what the user sees.
   */
  function reconcileFromServer(serverText: string) {
    const current = lastTextRef.current;
    if (serverText === current) return;
    const op = diffToOp(serverText, current);
    if (op.length === 0) return;
    dispatchOp(op, current);
  }

  /**
   * Route an OT op through the active engine's pipeline. `afterText` is the
   * editor text after the op — handed to the offline queue when the socket
   * is down so reloads can restore the edit.
   */
  function dispatchOp(op: Operation, afterText?: string) {
    if (engineRef.current === "crdt" && crdtMirrorRef.current) {
      submitCrdt(translateOpToCrdt(op, crdtMirrorRef.current), afterText);
    } else {
      submitOp(op, undefined, afterText);
    }
  }

  // Restore edits persisted while offline in a previous tab session: diff
  // what the server rendered against the snapshot, and ship the delta.
  useEffect(() => {
    if (!offlineSnapshot || !editor || !editable) return;
    let cancelled = false;
    void (async () => {
      const current = lastTextRef.current;
      if (offlineSnapshot !== current) {
        const op = diffToOp(current, offlineSnapshot);
        if (op.length > 0 && !cancelled) {
          applyingRemoteRef.current = true;
          try {
            applyRemoteOp(editor, op);
          } finally {
            applyingRemoteRef.current = false;
          }
          lastTextRef.current = offlineSnapshot;
          dirtyRef.current = true;
          scheduleSave();
          dispatchOp(op, offlineSnapshot);
        }
      }
      if (!cancelled) {
        dismissOfflineSnapshot();
        await clearOfflineSnapshot(docId);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offlineSnapshot, editor, editable, docId]);

  // Keep refs + CRDT mirror in sync with the engine the server reports.
  useEffect(() => {
    engineRef.current = engine;
    if (engine === "crdt" && crdtMirrorRef.current === null) {
      const mirror = new Logoot(clerkId || "client");
      mirror.loadText(lastTextRef.current);
      crdtMirrorRef.current = mirror;
    }
    if (engine === "ot") crdtMirrorRef.current = null;
  }, [engine, clerkId, editor]);

  // Paint collaborators' carets/selection into the editor as decorations.
  useEffect(() => {
    if (!editor) return;
    // SYNC may have arrived before the TipTap instance existed; reconcile now.
    const st = serverTextRef.current;
    if (st && st.engine !== "crdt" && editable) {
      serverTextRef.current = null;
      reconcileFromServer(st.text);
    }
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

  /* ===== Suggestion-mode plumbing ================================ */
  // Anchors live in plain-text OT coordinates (docPosToTextOffset), so a
  // suggestion keeps meaning the same text even after other ops arrive.
  function getSuggestionAnchor(): { position: number; originalText: string } | null {
    if (!editor) return null;
    const { from, to, empty } = editor.state.selection;
    const originalText = empty
      ? ""
      : editor.state.doc.textBetween(from, to, "\n", "\n");
    const position = docPosToTextOffset(editor, from);
    return { position, originalText };
  }

  async function handleSuggest(suggestedText: string): Promise<string | null> {
    const anchor = getSuggestionAnchor();
    if (!anchor) return "No anchor";
    try {
      await createSuggestion(docId, anchor.position, anchor.originalText, suggestedText);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Could not create suggestion";
    }
  }

  /**
   * Accept a suggestion: locate `originalText` near its stored position in
   * the CURRENT text (content anchoring), then produce an ordinary OT op
   * (retain/delete/insert) and push it through the active engine pipeline.
   * Convergence + audit trail stay intact because the change is just a rule.
   */
  async function handleAccept(s: {
    id: string;
    position: number;
    originalText: string;
    suggestedText: string;
  }): Promise<string | null> {
    if (!editor || !editable) return "Cannot edit this document";
    const text = docToText(editor);
    let target = -1;
    if (s.originalText) {
      if (text.startsWith(s.originalText, s.position)) {
        target = s.position;
      } else {
        for (let off = 1; off <= 500 && target === -1; off++) {
          if (s.position - off >= 0 && text.startsWith(s.originalText, s.position - off)) {
            target = s.position - off;
          } else if (text.startsWith(s.originalText, s.position + off)) {
            target = s.position + off;
          }
        }
      }
      if (target === -1) return "The anchored text has moved too much; locate it manually.";
    } else {
      target = Math.max(0, Math.min(s.position, text.length));
    }

    // Already applied? (A collaborator may have applied it live.)
    if (s.originalText && s.suggestedText && text.startsWith(s.suggestedText, target)) {
      await markSuggestionApplied(docId, s.id).catch(() => {});
      return null;
    }

    const op: OpComponent[] = [];
    if (target > 0) op.push({ retain: target });
    if (s.originalText) op.push({ delete: s.originalText.length });
    if (s.suggestedText) op.push({ insert: s.suggestedText });
    if (op.length === 0) return null;

    applyRemoteOp(editor, op);
    const after = docToText(editor);
    lastTextRef.current = after;
    dispatchOp(op, after);

    try {
      await markSuggestionApplied(docId, s.id);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Applied but not marked";
    }
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* ===== Top chrome (sticky) ===== */}
      <header className="sticky top-0 z-20 border-b border-slate-900/10 bg-white dark:border-white/10 dark:bg-slate-900">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
          <Link
            href={folderId ? `/dashboard?folder=${folderId}` : "/dashboard"}
            aria-label={folderId ? "Back to folder" : "Back to documents"}
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

          {/* Sync engine badge */}
          <span
            className="hidden shrink-0 rounded-full bg-slate-900/5 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-white/10 dark:text-slate-300 sm:inline-block"
            title={
              syncEngine === "crdt"
                ? "CRDT: decentralized Logoot merge (server relays, no transformation)"
                : "OT: server-authoritative operational transform"
            }
          >
            {syncEngine === "crdt" ? "CRDT" : "OT"}
          </span>

          {/* Share */}
          <ShareDialog
            docId={docId}
            isOwner={isOwner}
            collaborators={collaborators}
            visibility={visibility}
            syncEngine={syncEngine}
            kgEnabled={kgEnabled}
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
            ) : !connected && editable ? (
              <span
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400"
                title="You're offline. Edits are kept locally and will sync when the connection returns."
              >
                <WifiOff className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {queuedCount > 0
                    ? `Offline · ${queuedCount} unsynced`
                    : "Offline — edits will sync"}
                </span>
              </span>
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

      {/* ===== The "page" ===== */}
      <main className="flex-1 overflow-x-auto">
        <div className="mx-auto my-8 w-full max-w-4xl px-4 sm:my-12 sm:px-8">
          <div className="min-h-[90vh] rounded-md bg-white shadow-[0_1px_3px_rgba(60,64,67,0.15),0_8px_28px_rgba(60,64,67,0.12)] transition-shadow duration-200 sm:px-16 sm:py-16 dark:bg-white">
            <EditorContent editor={editor} />
          </div>
        </div>
      </main>

      {/* ===== Slash menu ===== */}
      {editable && editor && (
        <SlashMenu editor={editor} docId={docId} onDismiss={() => setSlashOpen(false)} />
      )}
      {/* ===== AI panel ===== */}
      <AiPanel
        docId={docId}
        editable={editable}
        onRestore={(targetText) => {
          if (!editor || !editable) return;
          // Restore is just another sync op: diff current -> target and send
          // it through the active engine's pipeline, so it syncs live,
          // converges, and is logged.
          const op = diffToOp(lastTextRef.current, targetText);
          if (op.length === 0) return;
          lastTextRef.current = targetText;
          dispatchOp(op, targetText);
          applyRemoteOp(editor, op);
        }}
        initialSummary={initialSummary ?? null}
        initialFlashcards={(initialFlashcards as never) ?? null}
        initialQuiz={(initialQuiz as never) ?? null}
        canSuggest={role !== "viewer"}
        canApply={role === "owner" || role === "editor"}
        currentUserId={currentUserId}
        onSuggest={handleSuggest}
        onAccept={handleAccept}
      />
    </div>
  );
}

/**
 * Translate a plain-text OT op into Logoot CRDT ops against the mirror,
 * updating the mirror locally. The mirror's visible indexing matches the
 * OT op's retain/delete coordinates.
 */
function translateOpToCrdt(op: Operation, mirror: Logoot): CrdtOp[] {
  const out: CrdtOp[] = [];
  let idx = 0;
  for (const c of op) {
    if ("retain" in c) {
      idx += c.retain;
    } else if ("delete" in c) {
      out.push(...mirror.localDelete(idx, c.delete));
    } else {
      out.push(...mirror.localInsert(idx, c.insert));
      idx += c.insert.length;
    }
  }
  return out;
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
