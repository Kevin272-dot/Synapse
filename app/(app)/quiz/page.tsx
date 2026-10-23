import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { ListChecks } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/user";
import { FolderQuizRunner } from "@/components/dashboard/folder-quiz-runner";
import type { FolderQuizQuestion } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Folder quiz" };

export default async function QuizPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string }>;
}) {
  const { folder } = await searchParams;
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const user = await getOrCreateUser(clerkUser.id);

  if (!folder) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-8">
        <div className="rounded-xl border border-[#dadce0] bg-white p-8 text-center dark:border-white/10 dark:bg-slate-900">
          <ListChecks className="mx-auto h-8 w-8 text-slate-400" />
          <h1 className="mt-3 text-lg font-medium text-[#202124] dark:text-slate-100">
            No folder selected
          </h1>
          <p className="mt-1 text-sm text-[#5f6368] dark:text-slate-400">
            Open a folder in your documents and choose &quot;Quiz folder&quot;.
          </p>
          <Link
            href="/dashboard"
            className="mt-4 inline-flex h-9 items-center rounded-full bg-slate-900 px-5 text-sm font-medium text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Go to documents
          </Link>
        </div>
      </div>
    );
  }

  const folderRow = await prisma.folder.findFirst({
    where: { id: folder, ownerId: user.id },
    select: { id: true, name: true },
  });
  if (!folderRow) notFound();

  // Same scope rule as the generator: subfolders are included when the
  // user's settings say so.
  const settings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
    select: { quizIncludeSubfolders: true },
  });
  const includeSubfolders = settings?.quizIncludeSubfolders ?? true;

  const folderIds = [folderRow.id];
  if (includeSubfolders) {
    let frontier = [folderRow.id];
    const seen = new Set([folderRow.id]);
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

  const [cached, documentCount] = await Promise.all([
    prisma.folderQuiz.findUnique({
      where: { folderId: folderRow.id },
      select: { payload: true },
    }),
    prisma.document.count({
      where: { ownerId: user.id, folderId: { in: folderIds } },
    }),
  ]);

  const initialQuiz =
    (cached?.payload as unknown as FolderQuizQuestion[] | undefined) ?? null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-[#202124] dark:text-slate-100">
          {folderRow.name}
        </h1>
        <p className="mt-1 text-sm text-[#5f6368] dark:text-slate-400">
          Quiz generated across {documentCount} document
          {documentCount === 1 ? "" : "s"}
          {includeSubfolders ? " (including subfolders)" : ""}. Questions can
          combine several documents; each one lists its sources.
        </p>
      </header>

      <FolderQuizRunner
        folderId={folderRow.id}
        documentCount={documentCount}
        initialQuiz={initialQuiz}
      />
    </div>
  );
}
