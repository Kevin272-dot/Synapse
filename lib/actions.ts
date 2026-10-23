"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/user";
import { getDocumentAccess, canEdit } from "@/lib/access";
import { fromJSON, apply } from "@/lib/ot/engine";
import { summarizeOperation } from "@/lib/ot/op-summary";
import { cosineSimilarity } from "@/lib/embeddings";
import { getTemplate, docToPlainText } from "@/lib/templates";
import { generateJSON } from "@/lib/ai";
import {
  getSettings,
  applySettings,
  type AppSettings,
  type FolderQuizQuestion,
} from "@/lib/settings";

async function requireUser() {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");
  return getOrCreateUser(userId);
}

/* ------------------------------- Documents ------------------------------- */

export async function createDocument(folderId?: string | null) {
  const user = await requireUser();
  const settings = await getSettings(user.id);

  const doc = await prisma.document.create({
    data: {
      title: "Untitled Document",
      content: "",
      ownerId: user.id,
      folderId: folderId ?? null,
      // New documents inherit the user's defaults (Settings page).
      syncEngine: settings.defaultEngine,
      kgEnabled: settings.kgDefault,
    },
  });

  redirect(`/doc/${doc.id}`);
}

/**
 * Create a document from one of the curated note templates.
 * The template supplies the title, the TipTap JSON body and its plain-text
 * projection (so search and the knowledge graph see the real text).
 */
export async function createDocumentFromTemplate(
  templateId: string,
  folderId?: string | null
) {
  const user = await requireUser();
  const settings = await getSettings(user.id);

  const template = getTemplate(templateId);
  if (!template) throw new Error("Unknown template");

  const doc = await prisma.document.create({
    data: {
      title: template.title,
      content: JSON.stringify(template.content),
      text: docToPlainText(template.content),
      ownerId: user.id,
      folderId: folderId ?? null,
      syncEngine: settings.defaultEngine,
      kgEnabled: settings.kgDefault,
    },
  });

  revalidatePath("/dashboard");
  redirect(`/doc/${doc.id}`);
}

/**
 * Create a document from imported content.
 * `content` is the TipTap JSON string; `text` its plain projection.
 * (Sanitization of the original HTML happens client-side before this call.)
 */
export async function createDocumentFromImport(args: {
  title: string;
  content: string;
  text: string;
  folderId?: string | null;
  /** Source format, so presentation imports can use their own engine default. */
  sourceType?: "docx" | "html" | "txt" | "pptx";
}) {
  const user = await requireUser();
  const settings = await getSettings(user.id);

  const trimmedTitle = args.title.trim() || "Imported Document";
  const engine =
    args.sourceType === "pptx" ? settings.pptxEngine : settings.defaultEngine;

  const doc = await prisma.document.create({
    data: {
      title: trimmedTitle,
      content: args.content,
      text: args.text,
      ownerId: user.id,
      folderId: args.folderId ?? null,
      syncEngine: engine,
      kgEnabled: settings.kgDefault,
    },
  });

  revalidatePath("/dashboard");
  redirect(`/doc/${doc.id}`);
}

export async function deleteDocument(docId: string) {
  const user = await requireUser();

  // Ownership check: only the owner can delete their document.
  await prisma.document.deleteMany({
    where: { id: docId, ownerId: user.id },
  });

  revalidatePath("/dashboard");
}

export async function moveDocument(docId: string, folderId: string | null) {
  const user = await requireUser();

  await prisma.document.updateMany({
    where: { id: docId, ownerId: user.id },
    data: { folderId },
  });

  revalidatePath("/dashboard");
}

/* -------------------------------- Folders -------------------------------- */

export async function createFolder(name: string, parentId?: string | null) {
  const user = await requireUser();

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Folder name cannot be empty");

  await prisma.folder.create({
    data: {
      name: trimmed,
      ownerId: user.id,
      parentId: parentId ?? null,
    },
  });

  revalidatePath("/dashboard");
}

export async function renameFolder(folderId: string, name: string) {
  const user = await requireUser();

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Folder name cannot be empty");

  await prisma.folder.updateMany({
    where: { id: folderId, ownerId: user.id },
    data: { name: trimmed },
  });

  revalidatePath("/dashboard");
}

export async function deleteFolder(folderId: string) {
  const user = await requireUser();

  // Postgres cascade (Folder.parentId + Document.folderId ON DELETE CASCADE)
  // removes the whole subtree in one statement.
  await prisma.folder.deleteMany({
    where: { id: folderId, ownerId: user.id },
  });

  revalidatePath("/dashboard");
}

export async function moveFolder(folderId: string, newParentId: string | null) {
  const user = await requireUser();

  // Don't allow moving a folder into itself or its own descendant (cycle).
  // Walk up from newParentId and make sure we never hit folderId.
  let cursor = newParentId;
  while (cursor) {
    if (cursor === folderId) throw new Error("Cannot move a folder into itself");

    const parent = await prisma.folder.findFirst({
      where: { id: cursor, ownerId: user.id },
      select: { parentId: true },
    });
    if (!parent) break; // newParentId doesn't exist or isn't ours -> let FK fail
    cursor = parent.parentId;
  }

  await prisma.folder.updateMany({
    where: { id: folderId, ownerId: user.id },
    data: { parentId: newParentId },
  });

  revalidatePath("/dashboard");
}

/* ---------------------------- Document editing --------------------------- */

/** Autosave: persist the editor's TipTap JSON + plain text.
 *  Allowed for the owner AND anyone with edit access. */
export async function saveDocument(docId: string, content: string, text?: string) {
  const user = await requireUser();

  const access = await getDocumentAccess(docId, user.id);
  if (!access || !canEdit(access.role)) throw new Error("No edit access");

  await prisma.document.update({
    where: { id: docId },
    data: { content, ...(text !== undefined ? { text } : {}) },
  });

  revalidatePath("/dashboard");
}

export async function renameDocument(docId: string, title: string) {
  const user = await requireUser();

  const trimmed = title.trim();
  if (!trimmed) throw new Error("Title cannot be empty");

  const access = await getDocumentAccess(docId, user.id);
  if (!access || !canEdit(access.role)) throw new Error("No edit access");

  await prisma.document.update({
    where: { id: docId },
    data: { title: trimmed },
  });

  revalidatePath("/dashboard");
}

/* ------------------------------- Sharing --------------------------------- */

/**
 * Suggest an edit at an anchored range. Anchors are stored in plain-text OT
 * coordinates. Editors AND commenters can create suggestions; viewers can't.
 * Acceptance later reduces to an ordinary op via content anchoring — the
 * accepting client re-diffs the target text and submits through the normal
 * OT pipeline, so convergence and the audit trail are preserved.
 */
export async function createSuggestion(
  docId: string,
  position: number,
  originalText: string,
  suggestedText: string
) {
  const user = await requireUser();
  if (!suggestedText && !originalText) throw new Error("Empty suggestion");

  const access = await getDocumentAccess(docId, user.id);
  if (!access) throw new Error("No access");
  if (access.role === "viewer") throw new Error("Viewers cannot suggest edits");

  const suggestion = await prisma.suggestion.create({
    data: {
      documentId: docId,
      authorUserId: user.id,
      authorName: user.name || user.email,
      baseVersion: 0,
      position,
      originalText,
      suggestedText,
      status: "pending",
    },
  });

  revalidatePath(`/doc/${docId}`);
  return suggestion;
}

/** Listing for the Suggestions panel. Any role with access. */
export async function listSuggestions(docId: string) {
  const user = await requireUser();
  const access = await getDocumentAccess(docId, user.id);
  if (!access) throw new Error("No access");

  return prisma.suggestion.findMany({
    where: { documentId: docId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      authorUserId: true,
      authorName: true,
      position: true,
      originalText: true,
      suggestedText: true,
      status: true,
      createdAt: true,
    },
  });
}

/** Mark a suggestion applied. Called by the owner's client after the
 *  authoritative op was submitted through the socket pipeline. */
export async function markSuggestionApplied(docId: string, suggestionId: string) {
  const user = await requireUser();
  const access = await getDocumentAccess(docId, user.id);
  if (!access || !canEdit(access.role)) throw new Error("Only editors accept");

  await prisma.suggestion.update({
    where: { id: suggestionId, documentId: docId },
    data: { status: "accepted", decidedAt: new Date() },
  });
  revalidatePath(`/doc/${docId}`);
}

/** Reject a suggestion. Owner, or the author withdrawing their own. */
export async function rejectSuggestion(docId: string, suggestionId: string) {
  const user = await requireUser();
  const access = await getDocumentAccess(docId, user.id);
  if (!access) throw new Error("No access");

  const suggestion = await prisma.suggestion.findUnique({
    where: { id: suggestionId },
    select: { documentId: true, authorUserId: true },
  });
  if (!suggestion || suggestion.documentId !== docId) {
    throw new Error("Suggestion not found");
  }
  if (access.role !== "owner" && suggestion.authorUserId !== user.id) {
    throw new Error("Not allowed");
  }

  await prisma.suggestion.update({
    where: { id: suggestionId },
    data: { status: "rejected", decidedAt: new Date() },
  });
  revalidatePath(`/doc/${docId}`);
}

/** Share a document with another Synapse user by email. Owner only. */
export async function shareDocument(
  docId: string,
  email: string,
  role: "editor" | "commenter" | "viewer" = "editor"
) {
  const user = await requireUser();

  const doc = await prisma.document.findFirst({
    where: { id: docId, ownerId: user.id },
    select: { id: true, title: true },
  });
  if (!doc) throw new Error("Only the owner can share this document");

  const target = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true, name: true },
  });
  if (!target) {
    throw new Error(
      "No Synapse user with that email. They need to sign in once first."
    );
  }
  if (target.id === user.id) {
    throw new Error("That's you. You already have access.");
  }

  await prisma.documentShare.upsert({
    where: { documentId_userId: { documentId: docId, userId: target.id } },
    create: { documentId: docId, userId: target.id, role },
    update: { role },
  });

  revalidatePath(`/doc/${docId}`);
  revalidatePath("/dashboard");
  return { name: target.name, email: target.email };
}

/** Remove someone's access. Owner only. */
export async function revokeShare(docId: string, shareUserId: string) {
  const user = await requireUser();

  const doc = await prisma.document.findFirst({
    where: { id: docId, ownerId: user.id },
    select: { id: true },
  });
  if (!doc) throw new Error("Only the owner can change sharing");

  await prisma.documentShare.deleteMany({
    where: { documentId: docId, userId: shareUserId },
  });

  revalidatePath(`/doc/${docId}`);
  revalidatePath("/dashboard");
}

/** Change general access: "private" (owner + shares) or "public"
 *  (any signed-in user can view). Owner only — the UI confirms first. */
export async function setDocumentVisibility(
  docId: string,
  visibility: "private" | "public"
) {
  const user = await requireUser();

  const doc = await prisma.document.findFirst({
    where: { id: docId, ownerId: user.id },
    select: { id: true },
  });
  if (!doc) throw new Error("Only the owner can change visibility");

  await prisma.document.update({
    where: { id: docId },
    data: { visibility: visibility === "public" ? "public" : "private" },
  });

  revalidatePath(`/doc/${docId}`);
}

/** Switch the document's sync engine: "ot" (server-authoritative transform)
 *  or "crdt" (decentralized Logoot merge). Owner only. */
export async function setSyncEngine(
  docId: string,
  engine: "ot" | "crdt"
) {
  const user = await requireUser();

  const doc = await prisma.document.findFirst({
    where: { id: docId, ownerId: user.id },
    select: { id: true },
  });
  if (!doc) throw new Error("Only the owner can change the sync engine");

  await prisma.document.update({
    where: { id: docId },
    data: { syncEngine: engine === "crdt" ? "crdt" : "ot" },
  });

  // Drop the in-memory cached state so the next join re-initializes with
  // the correct engine (server.ts exposes the registry via globalThis).
  const store = globalThis as unknown as {
    __synapseResetEngine?: (docId: string) => void;
  };
  store.__synapseResetEngine?.(docId);

  revalidatePath(`/doc/${docId}`);
}

/** Turn knowledge-graph extraction on/off for a document. Owner only. */
export async function setDocumentKgEnabled(docId: string, enabled: boolean) {
  const user = await requireUser();

  const doc = await prisma.document.findFirst({
    where: { id: docId, ownerId: user.id },
    select: { id: true },
  });
  if (!doc) throw new Error("Only the owner can change knowledge-graph settings");

  await prisma.document.update({
    where: { id: docId },
    data: { kgEnabled: enabled },
  });

  // Keep any cached in-memory document state in sync so close-time extraction
  // honours the new value immediately (server.ts exposes this via globalThis).
  const store = globalThis as unknown as {
    __synapseSetKgEnabled?: (docId: string, enabled: boolean) => void;
  };
  store.__synapseSetKgEnabled?.(docId, enabled);

  revalidatePath(`/doc/${docId}`);
  revalidatePath("/graph");
}

/* --------------------------- Folder-wide quiz ---------------------------- */

/**
 * Generate a quiz across every document in a folder (optionally including its
 * subfolders). Questions can combine ideas from several documents; each one
 * carries its sources so the UI can show provenance.
 */
export async function generateFolderQuiz(folderId: string, regenerate = false) {
  const user = await requireUser();
  const settings = await getSettings(user.id);

  const folder = await prisma.folder.findFirst({
    where: { id: folderId, ownerId: user.id },
    select: { id: true },
  });
  if (!folder) throw new Error("Folder not found");

  if (!regenerate) {
    const cached = await prisma.folderQuiz.findUnique({ where: { folderId } });
    if (cached) return cached.payload as unknown as FolderQuizQuestion[];
  }

  // The folder itself plus, optionally, every descendant folder.
  const folderIds = [folder.id];
  if (settings.quizIncludeSubfolders) {
    let frontier = [folder.id];
    const seen = new Set([folder.id]);
    while (frontier.length > 0) {
      const children = await prisma.folder.findMany({
        where: { ownerId: user.id, parentId: { in: frontier } },
        select: { id: true },
      });
      frontier = [];
      for (const child of children) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        folderIds.push(child.id);
        frontier.push(child.id);
      }
    }
  }

  const docs = await prisma.document.findMany({
    where: { ownerId: user.id, folderId: { in: folderIds } },
    select: { title: true, text: true },
    orderBy: { updatedAt: "desc" },
  });
  if (docs.length === 0) throw new Error("No documents in this folder yet");

  // Bound the prompt: spread a total budget across the documents.
  const budget = 16000;
  const perDoc = Math.max(1200, Math.floor(budget / docs.length));
  const corpus = docs
    .map((d) => `## ${d.title}\n${(d.text || "").slice(0, perDoc)}`)
    .join("\n\n");

  const crossDocRule =
    settings.quizCrossDoc && docs.length > 1
      ? 'At least a third of the questions must combine ideas from more than one document; list every document used in "source" (titles separated by commas).'
      : 'Base each question on a single document and put its title in "source".';

  const quiz = await generateJSON<FolderQuizQuestion[]>(
    '[{ "question": "string", "options": ["a","b","c","d"], "answerIndex": 0, "source": "document titles" }]',
    corpus,
    `Create ${settings.quizQuestions} multiple-choice questions that test understanding of the documents below. ${crossDocRule} Only use facts stated in the documents. answerIndex is the zero-based index of the correct option. Keep every option short.`
  );

  await prisma.folderQuiz.upsert({
    where: { folderId },
    create: { folderId, ownerId: user.id, payload: quiz as unknown as object },
    update: { payload: quiz as unknown as object },
  });

  revalidatePath("/quiz");
  return quiz;
}

/* ------------------------------- Settings -------------------------------- */

/** Persist the Settings form (one row per user; defaults when absent). */
export async function saveSettingsAction(formData: FormData) {
  const user = await requireUser();

  const checked = (key: string) => formData.get(key) === "on";
  const engine = (key: string): "ot" | "crdt" =>
    formData.get(key) === "crdt" ? "crdt" : "ot";

  const values: AppSettings = {
    defaultEngine: engine("defaultEngine"),
    pptxEngine: engine("pptxEngine"),
    kgDefault: checked("kgDefault"),
    quizQuestions: Number(formData.get("quizQuestions") ?? 5),
    quizIncludeSubfolders: checked("quizIncludeSubfolders"),
    quizCrossDoc: checked("quizCrossDoc"),
  };

  await applySettings(user.id, values);
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

/* ---------------------------- Activity feed ------------------------------ */

export interface ActivityEntry {
  version: number;
  summary: string;
  insertedChars: number;
  deletedChars: number;
  position: number;
  authorName: string;
  createdAt: string;
}

/** The durable operation log, newest first. Any viewer/editor/owner
 *  with access to the document may read it. */
export async function getDocumentActivity(
  docId: string,
  limit = 80
): Promise<ActivityEntry[]> {
  const user = await requireUser();

  const access = await getDocumentAccess(docId, user.id);
  if (!access) throw new Error("No access to this document");

  const rows = await prisma.documentOperation.findMany({
    where: { documentId: docId },
    orderBy: { version: "desc" },
    take: limit,
    select: {
      version: true,
      op: true,
      authorName: true,
      createdAt: true,
    },
  });

  return rows.map((r) => {
    const s = summarizeOperation(fromJSON(r.op));
    return {
      version: r.version,
      summary: s.summary,
      insertedChars: s.insertedChars,
      deletedChars: s.deletedChars,
      position: s.position,
      authorName: r.authorName,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

/** Reconstruct the document's plain text at a specific version by replaying
 *  the operation log: logBaseText ⊕ ops 1..version. Any viewer may preview. */
export async function getVersionText(docId: string, version: number) {
  const user = await requireUser();

  const access = await getDocumentAccess(docId, user.id);
  if (!access) throw new Error("No access to this document");

  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: { logBaseText: true },
  });
  if (doc?.logBaseText == null) {
    throw new Error(
      "Version history for this document begins with its next edit."
    );
  }

  const rows = await prisma.documentOperation.findMany({
    where: { documentId: docId, version: { lte: version } },
    orderBy: { version: "asc" },
    select: { op: true },
  });

  let text = doc.logBaseText;
  for (const r of rows) {
    try {
      text = apply(fromJSON(r.op), text);
    } catch {
      throw new Error("Could not reconstruct that version");
    }
  }
  return { text, version };
}

/* ---------------------------- Semantic search ----------------------------- */

export interface SemanticSearchResult {
  id: string;
  title: string;
  score: number;
  snippet: string;
}

/** Semantic search across all accessible documents using Gemini embeddings. */
export async function semanticSearchDocs(
  query: string,
  limit = 10
): Promise<SemanticSearchResult[]> {
  const user = await requireUser();
  if (!query.trim()) return [];

  const { generateEmbedding, cosineSimilarity } = await import(
    "@/lib/embeddings"
  );
  const { embed } = await import("ai");
  const { createGoogleGenerativeAI } = await import("@ai-sdk/google");

  const googleClient = createGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "",
  });

  // Embed the query.
  const { embedding: queryVec } = await embed({
    model: googleClient.textEmbeddingModel("text-embedding-004"),
    value: query.trim(),
  });

  // Find all accessible docs that have embeddings.
  const docs = await prisma.document.findMany({
    where: {
      OR: [{ ownerId: user.id }, { shares: { some: { userId: user.id } } }],
    },
    select: {
      id: true,
      title: true,
      embedding: true,
      text: true,
    },
    take: 200,
  });

  const results = docs
    .map((doc) => {
      const emb = doc.embedding as unknown as number[];
      if (!Array.isArray(emb) || emb.length === 0) return null;
      const score = cosineSimilarity(queryVec, emb);
      // Derive a snippet from the doc text.
      const snippet = doc.text.slice(0, 120);
      return {
        id: doc.id,
        title: doc.title,
        score,
        snippet,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return results;
}
