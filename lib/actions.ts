"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/user";
import { getDocumentAccess, canEdit } from "@/lib/access";
import { fromJSON, apply } from "@/lib/ot/engine";
import { summarizeOperation } from "@/lib/ot/op-summary";

async function requireUser() {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");
  return getOrCreateUser(userId);
}

/* ------------------------------- Documents ------------------------------- */

export async function createDocument(folderId?: string | null) {
  const user = await requireUser();

  const doc = await prisma.document.create({
    data: {
      title: "Untitled Document",
      content: "",
      ownerId: user.id,
      folderId: folderId ?? null,
    },
  });

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
}) {
  const user = await requireUser();

  const trimmedTitle = args.title.trim() || "Imported Document";

  const doc = await prisma.document.create({
    data: {
      title: trimmedTitle,
      content: args.content,
      text: args.text,
      ownerId: user.id,
      folderId: args.folderId ?? null,
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

/** Share a document with another Synapse user by email. Owner only. */
export async function shareDocument(
  docId: string,
  email: string,
  role: "editor" | "viewer" = "editor"
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
