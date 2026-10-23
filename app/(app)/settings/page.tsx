import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";
import { Check } from "lucide-react";
import { getOrCreateUser } from "@/lib/user";
import { getSettings } from "@/lib/settings";
import { saveSettingsAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Settings" };

const section =
  "rounded-xl border border-[#dadce0] bg-white p-5 dark:border-white/10 dark:bg-slate-900";
const sectionTitle =
  "text-sm font-semibold text-[#202124] dark:text-slate-100";
const sectionHint =
  "mt-1 text-xs leading-relaxed text-[#5f6368] dark:text-slate-400";
const row = "mt-4 flex items-start gap-3";
const label = "text-sm font-medium text-[#3c4043] dark:text-slate-200";
const hint = "mt-0.5 text-xs text-[#5f6368] dark:text-slate-400";
const select =
  "mt-1 h-9 w-full rounded-md border border-[#dadce0] bg-white px-2 text-sm text-[#202124] outline-none focus:border-slate-400 dark:border-white/15 dark:bg-slate-800 dark:text-slate-100";
const checkbox =
  "mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-slate-900 dark:border-white/20";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { saved } = await searchParams;
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const user = await getOrCreateUser(clerkUser.id);
  const settings = await getSettings(user.id);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[#202124] dark:text-slate-100">
          Settings
        </h1>
        <p className="mt-1 text-sm text-[#5f6368] dark:text-slate-400">
          Defaults for new documents, imports, knowledge-graph extraction and
          folder quizzes. Individual documents can still override their engine
          and knowledge-graph switch.
        </p>
      </header>

      {saved === "1" && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
          <Check className="h-4 w-4" />
          Settings saved.
        </div>
      )}

      <form action={saveSettingsAction} className="space-y-5">
        <section className={section}>
          <h2 className={sectionTitle}>Documents and imports</h2>
          <p className={sectionHint}>
            Which sync engine new documents use. Presentations are slide-shaped
            and large, so they have their own default.
          </p>

          <div className={row}>
            <div className="min-w-0 flex-1">
              <label htmlFor="defaultEngine" className={label}>
                Default sync engine
              </label>
              <p className={hint}>
                Applies to blank documents, templates and imported files.
              </p>
              <select
                id="defaultEngine"
                name="defaultEngine"
                defaultValue={settings.defaultEngine}
                className={select}
              >
                <option value="ot">Operational Transformation (OT)</option>
                <option value="crdt">CRDT (Logoot)</option>
              </select>
            </div>
          </div>

          <div className={row}>
            <div className="min-w-0 flex-1">
              <label htmlFor="pptxEngine" className={label}>
                Presentation (.pptx) engine
              </label>
              <p className={hint}>
                Used when importing PowerPoint files.
              </p>
              <select
                id="pptxEngine"
                name="pptxEngine"
                defaultValue={settings.pptxEngine}
                className={select}
              >
                <option value="ot">Operational Transformation (OT)</option>
                <option value="crdt">CRDT (Logoot)</option>
              </select>
            </div>
          </div>
        </section>

        <section className={section}>
          <h2 className={sectionTitle}>Knowledge graph</h2>
          <p className={sectionHint}>
            Extraction runs when a document is closed, never while typing.
          </p>

          <label className={`${row} cursor-pointer`}>
            <input
              type="checkbox"
              name="kgDefault"
              defaultChecked={settings.kgDefault}
              className={checkbox}
            />
            <span className="min-w-0">
              <span className={`block ${label}`}>
                Enable for new documents
              </span>
              <span className={`block ${hint}`}>
                Concepts are extracted for a new document once it is closed.
                You can still turn it off per document in the Share dialog.
              </span>
            </span>
          </label>
        </section>

        <section className={section}>
          <h2 className={sectionTitle}>Folder quizzes</h2>
          <p className={sectionHint}>
            A quiz generated across every document in a folder, optionally
            including nested folders and questions that combine documents.
          </p>

          <div className={row}>
            <div className="min-w-0 flex-1">
              <label htmlFor="quizQuestions" className={label}>
                Questions per quiz
              </label>
              <p className={hint}>Between 3 and 20.</p>
              <input
                id="quizQuestions"
                name="quizQuestions"
                type="number"
                min={3}
                max={20}
                defaultValue={settings.quizQuestions}
                className={select}
              />
            </div>
          </div>

          <label className={`${row} cursor-pointer`}>
            <input
              type="checkbox"
              name="quizIncludeSubfolders"
              defaultChecked={settings.quizIncludeSubfolders}
              className={checkbox}
            />
            <span className="min-w-0">
              <span className={`block ${label}`}>Include subfolders</span>
              <span className={`block ${hint}`}>
                Pull documents from nested folders into the same quiz.
              </span>
            </span>
          </label>

          <label className={`${row} cursor-pointer`}>
            <input
              type="checkbox"
              name="quizCrossDoc"
              defaultChecked={settings.quizCrossDoc}
              className={checkbox}
            />
            <span className="min-w-0">
              <span className={`block ${label}`}>
                Include questions that combine documents
              </span>
              <span className={`block ${hint}`}>
                At least a third of the questions will connect ideas from more
                than one document.
              </span>
            </span>
          </label>
        </section>

        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-full bg-slate-900 px-5 text-sm font-medium text-white transition hover:bg-slate-700 active:scale-[0.98] dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
        >
          Save settings
        </button>
      </form>
    </div>
  );
}
