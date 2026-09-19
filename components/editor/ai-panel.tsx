"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Sparkles,
  FileText,
  GraduationCap,
  ListChecks,
  Network,
  RefreshCw,
  X,
  Loader2,
  ChevronRight,
  History,
  Bot,
} from "lucide-react";
import {
  summarizeDocument,
  generateFlashcards,
  generateQuiz,
  extractConcepts,
} from "@/lib/ai-actions";
import {
  getDocumentActivity,
  getVersionText,
  type ActivityEntry,
} from "@/lib/actions";
import { cursorColor } from "@/lib/editor/remote-cursors";
import { ConfirmDialog } from "@/components/confirm-dialog";

type Flashcard = { front: string; back: string };
type QuizQ = { question: string; options: string[]; answerIndex: number };

export default function AiPanel({
  docId,
  editable = true,
  onRestore,
  initialSummary,
  initialFlashcards,
  initialQuiz,
}: {
  docId: string;
  editable?: boolean;
  /** Applies a target plain-text to the document as an OT op (restore). */
  onRestore?: (targetText: string) => void;
  initialSummary?: string | null;
  initialFlashcards?: Flashcard[] | null;
  initialQuiz?: QuizQ[] | null;
}) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<string | null>(initialSummary ?? null);
  const [flashcards, setFlashcards] = useState<Flashcard[] | null>(
    initialFlashcards ?? null
  );
  const [quiz, setQuiz] = useState<QuizQ[] | null>(initialQuiz ?? null);
  const [conceptsState, setConceptsState] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [tab, setTab] = useState<"ai" | "activity">("ai");
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [restoreVersion, setRestoreVersion] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  function viewVersion(version: number) {
    if (previewVersion === version) {
      setPreviewVersion(null);
      setPreviewText(null);
      return;
    }
    setPreviewVersion(version);
    setPreviewText(null);
    setPreviewLoading(true);
    startTransition(async () => {
      try {
        const res = await getVersionText(docId, version);
        setPreviewText(res.text);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load version");
        setPreviewVersion(null);
      } finally {
        setPreviewLoading(false);
      }
    });
  }

  // Lazy-load the activity feed the first time the tab is opened.
  useEffect(() => {
    if (open && tab === "activity" && activity === null && !activityLoading) {
      loadActivity();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, activity, activityLoading]);

  function loadActivity() {
    setActivityLoading(true);
    startTransition(async () => {
      try {
        setActivity(await getDocumentActivity(docId));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load activity");
      } finally {
        setActivityLoading(false);
      }
    });
  }

  // Let the editor's Tools menu open this panel.
  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    document.addEventListener("synapse:open-ai-panel", onOpen);
    return () =>
      document.removeEventListener("synapse:open-ai-panel", onOpen);
  }, []);

  async function run(
    key: "summary" | "flashcards" | "quiz" | "concepts",
    fn: () => Promise<unknown>
  ) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {/* Toggle button pinned to right edge of the page */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 items-center gap-2 rounded-l-xl border border-r-0 border-slate-900/10 bg-white px-2 py-4 text-sm font-medium text-slate-700 shadow-lg transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        title="Synapse AI"
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden lg:inline">AI</span>
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <aside className="fixed right-0 top-0 z-40 flex h-full w-80 flex-col border-l border-slate-900/10 bg-white shadow-xl dark:border-white/10 dark:bg-slate-900">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-900/10 px-4 py-3 dark:border-white/10">
            <div className="flex items-center gap-2">
              {tab === "ai" ? (
                <Sparkles className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              ) : (
                <History className="h-4 w-4 text-slate-500 dark:text-slate-400" />
              )}
              <h2 className="text-sm font-semibold">
                {tab === "ai" ? "Synapse AI" : "Activity"}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close AI panel"
              className="rounded-full p-1.5 text-slate-400 hover:bg-slate-900/5 hover:text-slate-600 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-slate-900/10 px-3 py-2 dark:border-white/10">
            <button
              type="button"
              onClick={() => setTab("ai")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                tab === "ai"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10"
              }`}
            >
              <Bot className="h-3.5 w-3.5" />
              AI
            </button>
            <button
              type="button"
              onClick={() => setTab("activity")}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                tab === "activity"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10"
              }`}
            >
              <History className="h-3.5 w-3.5" />
              Activity
            </button>
          </div>

          {/* Body */}
          {tab === "ai" && (
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-400">
                {error}
              </p>
            )}

            {/* Summarize */}
            <Section
              title="Summary"
              icon={<FileText className="h-4 w-4" />}
              busy={busy === "summary"}
              showRun={editable}
              onRun={() =>
                run("summary", async () => {
                  setSummary(await summarizeDocument(docId, !summary));
                })
              }
            >
              {summary && (
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {summary}
                </p>
              )}
            </Section>

            {/* Flashcards */}
            <Section
              title="Flashcards"
              icon={<GraduationCap className="h-4 w-4" />}
              busy={busy === "flashcards"}
              showRun={editable}
              onRun={() =>
                run("flashcards", async () => {
                  const result = (await generateFlashcards(
                    docId,
                    !flashcards
                  )) as unknown as Flashcard[];
                  setFlashcards(result);
                  setRevealed(new Set());
                })
              }
            >
              {flashcards && (
                <div className="space-y-2">
                  {flashcards.map((c, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-slate-900/10 p-2.5 dark:border-white/10"
                    >
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {c.front}
                      </p>
                      {revealed.has(i) ? (
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          {c.back}
                        </p>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setRevealed((s) => new Set(s).add(i))
                          }
                          className="mt-1 text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          Reveal answer
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Quiz */}
            <Section
              title="Quiz"
              icon={<ListChecks className="h-4 w-4" />}
              busy={busy === "quiz"}
              showRun={editable}
              onRun={() =>
                run("quiz", async () => {
                  const result = (await generateQuiz(
                    docId,
                    !quiz
                  )) as unknown as QuizQ[];
                  setQuiz(result);
                  setQuizAnswers({});
                })
              }
            >
              {quiz && (
                <div className="space-y-3">
                  {quiz.map((q, qi) => (
                    <div
                      key={qi}
                      className="rounded-lg border border-slate-900/10 p-2.5 dark:border-white/10"
                    >
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {qi + 1}. {q.question}
                      </p>
                      <div className="mt-2 space-y-1">
                        {q.options.map((opt, oi) => {
                          const chosen = quizAnswers[qi] === oi;
                          const correct = oi === q.answerIndex;
                          let cls =
                            "text-slate-600 hover:bg-slate-900/5 dark:text-slate-300 dark:hover:bg-white/10";
                          if (quizAnswers[qi] !== undefined) {
                            if (correct)
                              cls =
                                "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300";
                            else if (chosen)
                              cls =
                                "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400";
                            else cls = "text-slate-400";
                          }
                          return (
                            <button
                              key={oi}
                              type="button"
                              disabled={quizAnswers[qi] !== undefined}
                              onClick={() =>
                                setQuizAnswers((a) => ({ ...a, [qi]: oi }))
                              }
                              className={`block w-full rounded-md px-2 py-1 text-left text-sm ${cls}`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Concept extraction */}
            <Section
              title="Extract concepts"
              icon={<Network className="h-4 w-4" />}
              busy={busy === "concepts"}
              showRun={editable}
              onRun={() =>
                run("concepts", async () => {
                  const res = (await extractConcepts(docId, true)) as {
                    extracted: boolean;
                  };
                  setConceptsState(
                    res.extracted
                      ? "Concepts extracted — view them in the Knowledge graph."
                      : "Concepts already up to date."
                  );
                })
              }
            >
              {conceptsState && (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {conceptsState}
                </p>
              )}
            </Section>
          </div>
          )}

          {/* Activity tab */}
          {tab === "activity" && (
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Every operation applied to this document, newest first.
                </p>
                <button
                  type="button"
                  onClick={loadActivity}
                  disabled={activityLoading}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-900/10 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-900/5 disabled:opacity-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  {activityLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Refresh
                </button>
              </div>

              {activity && activity.length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-900/15 px-3 py-6 text-center text-sm text-slate-400 dark:border-white/10">
                  No operations logged yet. Start typing in the document.
                </p>
              )}

              {activity && activity.length > 0 && (
                <ol className="relative space-y-3 border-l border-slate-900/10 pl-4 dark:border-white/10">
                  {activity.map((entry) => (
                    <li key={entry.version} className="relative">
                      <span
                        className="absolute -left-[1.42rem] top-1.5 h-2 w-2 rounded-full ring-2 ring-white dark:ring-slate-900"
                        style={{
                          background: cursorColor(entry.authorName),
                        }}
                      />
                      <div className="rounded-lg border border-slate-900/10 p-2.5 dark:border-white/10">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                            {entry.authorName}
                          </span>
                          <span className="shrink-0 rounded-full bg-slate-900/5 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/10 dark:text-slate-300">
                            v{entry.version}
                          </span>
                        </div>
                        <p className="mt-1 text-[13px] leading-5 text-slate-600 dark:text-slate-300">
                          {entry.summary}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                          {relativeTime(entry.createdAt)}
                        </p>

                        {/* Version preview + restore */}
                        {previewVersion === entry.version ? (
                          <div className="mt-2">
                            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-[11px] leading-5 text-slate-600 dark:bg-slate-950/60 dark:text-slate-300">
                              {previewLoading
                                ? "Reconstructing…"
                                : previewText ?? ""}
                            </pre>
                            {editable && !previewLoading && previewText != null && (
                              <button
                                type="button"
                                onClick={() => setRestoreVersion(entry.version)}
                                className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900"
                              >
                                Restore this version
                              </button>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => viewVersion(entry.version)}
                            className="mt-1.5 text-[11px] font-medium text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
                          >
                            Preview version
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </aside>
      )}

      <ConfirmDialog
        open={restoreVersion !== null}
        title="Restore this version?"
        message="The document text will be reverted to this version. This change syncs to everyone viewing and appears in the activity log. You can undo it by restoring a newer version."
        confirmLabel="Restore"
        onConfirm={() => {
          if (restoreVersion !== null && previewText != null && onRestore) {
            onRestore(previewText);
          }
          setRestoreVersion(null);
          setPreviewVersion(null);
          setPreviewText(null);
        }}
        onCancel={() => setRestoreVersion(null)}
      />
    </>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function Section({
  title,
  icon,
  busy,
  onRun,
  showRun = true,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  busy: boolean;
  onRun: () => void;
  showRun?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
          {icon}
          {title}
        </div>
        {showRun ? (
          <button
            type="button"
            onClick={onRun}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-full border border-slate-900/10 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-900/5 disabled:opacity-50 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Run
          </button>
        ) : (
          <span className="text-[11px] text-slate-400">View only</span>
        )}
      </div>
      {children}
    </div>
  );
}
