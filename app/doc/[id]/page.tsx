import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/user";
import { getDocumentAccess, canEdit } from "@/lib/access";
import Editor from "@/components/editor/editor";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const doc = await prisma.document.findUnique({
    where: { id },
    select: { title: true },
  });
  return { title: doc?.title ?? "Document" };
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const user = await getOrCreateUser(clerkUser.id);

  // Owner OR collaborator (viewer/editor). Anyone else gets a 404.
  const access = await getDocumentAccess(id, user.id);
  if (!access) notFound();

  const { doc, role } = access;
  const editable = canEdit(role);

  let initialContent: object | null = null;
  if (doc.content) {
    try {
      initialContent = JSON.parse(doc.content);
    } catch {
      initialContent = null;
    }
  }

  // Who currently has access (owner + shares), for the share dialog.
  const shares = await prisma.documentShare.findMany({
    where: { documentId: doc.id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  const owner = await prisma.user.findUnique({
    where: { id: doc.ownerId },
    select: { id: true, name: true, email: true },
  });

  const collaborators = [
    ...(owner ? [{ ...owner, role: "owner" as const }] : []),
    ...shares.map((s) => ({
      id: s.user.id,
      name: s.user.name,
      email: s.user.email,
      role: s.role as "editor" | "viewer",
    })),
  ];

  return (
    <div className="flex min-h-full flex-1 flex-col bg-slate-100 dark:bg-slate-950">
      <Editor
        docId={doc.id}
        initialTitle={doc.title}
        initialContent={initialContent}
        initialText={doc.text}
        initialSummary={doc.summary}
        initialFlashcards={doc.flashcards}
        initialQuiz={doc.quiz}
        visibility={access.doc.visibility}
        role={role}
        editable={editable}
        isOwner={role === "owner"}
        collaborators={collaborators}
        ownerId={doc.ownerId}
        currentUserId={user.id}
      />
    </div>
  );
}
