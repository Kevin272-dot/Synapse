import { prisma } from "@/lib/prisma";

export type DocRole = "owner" | "editor" | "viewer";
export type DocVisibility = "private" | "public";

export interface DocAccess {
  doc: {
    id: string;
    title: string;
    content: string;
    text: string;
    summary: string | null;
    flashcards: unknown;
    quiz: unknown;
    visibility: DocVisibility;
    ownerId: string;
  };
  role: DocRole;
}

/**
 * Resolves a user's access to a document:
 *   owner > share role > public (any signed-in user can view).
 * Returns null when the user has no access at all.
 * Every access path (page, socket, actions) goes through this so the rules
 * can never drift apart.
 */
export async function getDocumentAccess(
  docId: string,
  internalUserId: string
): Promise<DocAccess | null> {
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: {
      id: true,
      title: true,
      content: true,
      text: true,
      summary: true,
      flashcards: true,
      quiz: true,
      visibility: true,
      ownerId: true,
    },
  });
  if (!doc) return null;

  const visibility: DocVisibility =
    doc.visibility === "public" ? "public" : "private";

  if (doc.ownerId === internalUserId) {
    return { doc: { ...doc, visibility }, role: "owner" };
  }

  const share = await prisma.documentShare.findUnique({
    where: {
      documentId_userId: { documentId: docId, userId: internalUserId },
    },
    select: { role: true },
  });
  if (share) {
    return {
      doc: { ...doc, visibility },
      role: share.role === "viewer" ? "viewer" : "editor",
    };
  }

  // Public docs: any signed-in user can view.
  if (visibility === "public") {
    return { doc: { ...doc, visibility }, role: "viewer" };
  }

  return null;
}

/** True when the role may modify the document. */
export function canEdit(role: DocRole): boolean {
  return role === "owner" || role === "editor";
}
