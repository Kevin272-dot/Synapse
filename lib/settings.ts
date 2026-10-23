import { prisma } from "@/lib/prisma";

/**
 * Per-user defaults. A missing UserSettings row means "use DEFAULT_SETTINGS",
 * so existing accounts behave exactly as before until they change something.
 */
export interface AppSettings {
  /** Sync engine for new documents and imports. */
  defaultEngine: "ot" | "crdt";
  /** Sync engine for presentation (.pptx) imports. */
  pptxEngine: "ot" | "crdt";
  /** Whether new documents start with knowledge-graph extraction enabled. */
  kgDefault: boolean;
  /** Number of questions generated for a folder quiz. */
  quizQuestions: number;
  /** Include documents from subfolders when quizzing a folder. */
  quizIncludeSubfolders: boolean;
  /** Include questions that combine ideas across documents. */
  quizCrossDoc: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultEngine: "ot",
  pptxEngine: "crdt",
  kgDefault: true,
  quizQuestions: 5,
  quizIncludeSubfolders: true,
  quizCrossDoc: true,
};

export interface FolderQuizQuestion {
  question: string;
  options: string[];
  answerIndex: number;
  /** Document titles the question came from (provenance). */
  source?: string;
}

function normalize(row: {
  defaultEngine: string;
  pptxEngine: string;
  kgDefault: boolean;
  quizQuestions: number;
  quizIncludeSubfolders: boolean;
  quizCrossDoc: boolean;
}): AppSettings {
  return {
    defaultEngine: row.defaultEngine === "crdt" ? "crdt" : "ot",
    pptxEngine: row.pptxEngine === "crdt" ? "crdt" : "ot",
    kgDefault: row.kgDefault,
    quizQuestions: Math.min(20, Math.max(3, row.quizQuestions)),
    quizIncludeSubfolders: row.quizIncludeSubfolders,
    quizCrossDoc: row.quizCrossDoc,
  };
}

export async function getSettings(userId: string): Promise<AppSettings> {
  const row = await prisma.userSettings.findUnique({ where: { userId } });
  if (!row) return { ...DEFAULT_SETTINGS };
  return normalize(row);
}

export async function applySettings(
  userId: string,
  values: Partial<AppSettings>
): Promise<AppSettings> {
  const current = await getSettings(userId);
  const next = normalize({
    defaultEngine: values.defaultEngine ?? current.defaultEngine,
    pptxEngine: values.pptxEngine ?? current.pptxEngine,
    kgDefault: values.kgDefault ?? current.kgDefault,
    quizQuestions: values.quizQuestions ?? current.quizQuestions,
    quizIncludeSubfolders:
      values.quizIncludeSubfolders ?? current.quizIncludeSubfolders,
    quizCrossDoc: values.quizCrossDoc ?? current.quizCrossDoc,
  });

  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, ...next },
    update: next,
  });

  return next;
}
