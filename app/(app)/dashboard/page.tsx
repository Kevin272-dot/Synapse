import Link from "next/link";
import {
  ChevronRight,
  FileText,
  Folder,
  Home,
} from "lucide-react";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/user";
import { DeleteDocumentButton } from "@/components/delete-document-button";
import { FolderRowActions } from "@/components/folder-row-actions";
import { ImportDocumentButton } from "@/components/import-document-button";
import { NewFolderButton } from "@/components/new-folder-button";
import { createDocument } from "@/lib/actions";
import { PagePreview } from "@/components/dashboard/page-preview";
import { DocumentCard } from "@/components/dashboard/document-card";
import { ViewToggle } from "@/components/dashboard/view-toggle";
import {
  OwnerFilter,
  type OwnerFilterValue,
} from "@/components/dashboard/owner-filter";

// Force dynamic so auth + the user's docs are always fresh.
export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

const TEMPLATES = [
  { name: "Meeting notes", accent: "#1a73e8" },
  { name: "Brainstorm", accent: "#e8710a" },
  { name: "Study guide", accent: "#188038" },
];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    folder?: string;
    view?: string;
    owner?: string;
  }>;
}) {
  const { q, folder, view: viewParam, owner: ownerParam } = await searchParams;
  const query = (q ?? "").trim();
  const view = viewParam === "list" ? "list" : "grid";
  const ownerFilter: OwnerFilterValue =
    ownerParam === "me" || ownerParam === "shared" ? ownerParam : "anyone";
  const sharedOnly = ownerFilter === "shared";

  const folderId = folder || null;

  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const user = await getOrCreateUser(clerkUser.id);

  // Folder context (hidden when filtering shared docs).
  let currentFolder: {
    id: string;
    name: string;
    parentId: string | null;
  } | null = null;
  let breadcrumbs: { id: string | null; name: string }[] = [];

  if (folderId && !sharedOnly) {
    currentFolder = await prisma.folder.findFirst({
      where: { id: folderId, ownerId: user.id },
      select: { id: true, name: true, parentId: true },
    });

    if (currentFolder) {
      const crumbs = [{ id: currentFolder.id, name: currentFolder.name }];
      let cursor = currentFolder.parentId;
      while (cursor) {
        const parent = await prisma.folder.findFirst({
          where: { id: cursor, ownerId: user.id },
          select: { id: true, name: true, parentId: true },
        });
        if (!parent) break;
        crumbs.unshift({ id: parent.id, name: parent.name });
        cursor = parent.parentId;
      }
      breadcrumbs = crumbs;
    }
  }

  const resolvedFolderId = currentFolder?.id ?? null;
  const isRoot = !currentFolder;

  const [folders, documents] = await Promise.all([
    sharedOnly
      ? Promise.resolve([])
      : prisma.folder.findMany({
          where: { ownerId: user.id, parentId: resolvedFolderId },
          orderBy: { name: "asc" },
        }),
    sharedOnly
      ? Promise.resolve([])
      : prisma.document.findMany({
          where: {
            ownerId: user.id,
            folderId: resolvedFolderId,
            ...(query
              ? { title: { contains: query, mode: "insensitive" } }
              : {}),
          },
          orderBy: { updatedAt: "desc" },
          take: 100,
        }),
  ]);

  // Documents other people have shared with me.
  const sharedDocuments =
    isRoot && ownerFilter !== "me"
      ? await prisma.document.findMany({
          where: {
            shares: { some: { userId: user.id } },
            ...(query
              ? { title: { contains: query, mode: "insensitive" } }
              : {}),
          },
          include: {
            owner: { select: { name: true, email: true } },
            shares: { where: { userId: user.id }, select: { role: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: 50,
        })
      : [];

  const showFolders = !sharedOnly && folders.length > 0;
  const showOwned = !sharedOnly && documents.length > 0;
  const showShared = sharedDocuments.length > 0 && (sharedOnly || isRoot);

  return (
    <>
      {/* ===== Template gallery band (home only) ===== */}
      {isRoot && !sharedOnly && (
        <section className="border-b border-[#dadce0] bg-[#f8f9fa] px-4 py-8 dark:border-white/10 dark:bg-white/[0.02] sm:px-8">
          <div className="mx-auto w-full max-w-6xl">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-base font-medium text-[#202124] dark:text-slate-100">
                  Start a new document
                </h1>
                <p className="mt-0.5 text-sm text-[#5f6368] dark:text-slate-400">
                  A blank page, or a head start from a template.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ImportDocumentButton folderId={null} compact />
                <NewFolderButton parentId={null} compact />
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {/* Blank document -> creates */}
              <form action={createDocument.bind(null, null)}>
                <button
                  type="submit"
                  className="group flex w-full flex-col items-start gap-2 text-left"
                >
                  <PagePreview
                    variant="blank"
                    className="aspect-[3/4] transition group-hover:shadow-md"
                  />
                  <span className="text-sm font-medium text-[#3c4043] dark:text-slate-200">
                    Blank
                  </span>
                </button>
              </form>

              {TEMPLATES.map((t) => (
                <div
                  key={t.name}
                  className="group flex w-full flex-col items-start gap-2"
                >
                  <PagePreview
                    accent={t.accent}
                    className="aspect-[3/4] transition group-hover:shadow-md"
                  />
                  <span className="text-sm font-medium text-[#3c4043] dark:text-slate-200">
                    {t.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8">
        {/* Breadcrumb inside folders */}
        {!isRoot && !sharedOnly && (
          <nav className="mb-4 flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 transition hover:bg-black/[0.05] hover:text-slate-900 dark:hover:bg-white/5 dark:hover:text-slate-100"
            >
              <Home className="h-3.5 w-3.5" />
              My documents
            </Link>
            {breadcrumbs.map((crumb) => (
              <span
                key={crumb.id ?? "root"}
                className="inline-flex items-center gap-1"
              >
                <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
                <Link
                  href={
                    crumb.id ? `/dashboard?folder=${crumb.id}` : "/dashboard"
                  }
                  className={`rounded-full px-2 py-1 transition hover:bg-black/[0.05] hover:text-slate-900 dark:hover:bg-white/5 dark:hover:text-slate-100 ${
                    crumb.id === currentFolder?.id
                      ? "font-medium text-slate-900 dark:text-slate-100"
                      : ""
                  }`}
                >
                  {crumb.name}
                </Link>
              </span>
            ))}
          </nav>
        )}

        {/* Folder header + toolbar */}
        {!isRoot && !sharedOnly && (
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Folder className="h-5 w-5 shrink-0 text-slate-400" />
                <h2 className="truncate text-xl font-medium text-[#202124] dark:text-slate-100">
                  {currentFolder?.name}
                </h2>
              </div>
              <p className="mt-1 text-sm text-[#5f6368] dark:text-slate-400">
                {folders.length} folder{folders.length === 1 ? "" : "s"} ·{" "}
                {documents.length} document{documents.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ImportDocumentButton folderId={currentFolder?.id ?? null} compact />
              <NewFolderButton parentId={currentFolder?.id ?? null} compact />
            </div>
          </div>
        )}

        {/* Shared-only heading */}
        {sharedOnly && (
          <div className="mb-6">
            <h2 className="text-xl font-medium text-[#202124] dark:text-slate-100">
              Shared with me
            </h2>
            <p className="mt-1 text-sm text-[#5f6368] dark:text-slate-400">
              Documents other people have shared with your account.
            </p>
          </div>
        )}

        {/* Filter + view row (when there is content) */}
        {(showFolders || showOwned || showShared) && (
          <div className="mb-4 flex items-center justify-between gap-2">
            <OwnerFilter value={ownerFilter} />
            <ViewToggle view={view} />
          </div>
        )}

        {/* ===== Folders ===== */}
        {showFolders && (
          <section className="mb-8">
            {view === "grid" ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {folders.map((folder) => (
                  <div key={folder.id} className="group relative">
                    <Link
                      href={`/dashboard?folder=${folder.id}`}
                      className="block rounded-lg border border-transparent p-2 transition hover:bg-black/[0.03] dark:hover:bg-white/5"
                    >
                      <span className="flex h-20 items-center justify-center rounded-[3px] border border-[#dadce0] bg-[#f8f9fa] dark:border-white/10 dark:bg-white/5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e8f0fe] text-[#1967d2] dark:bg-[#1a73e8]/25 dark:text-[#a8c7fa]">
                          <Folder className="h-4.5 w-4.5" />
                        </span>
                      </span>
                      <span className="mt-2 block truncate text-sm font-medium text-[#202124] dark:text-slate-100">
                        {folder.name}
                      </span>
                    </Link>
                    <div className="absolute right-1 top-1 opacity-0 transition group-hover:opacity-100">
                      <FolderRowActions
                        folder={{ id: folder.id, name: folder.name }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="mb-2 divide-y divide-[#dadce0]/60 rounded-lg border border-[#dadce0] dark:divide-white/5 dark:border-white/10">
                {folders.map((folder) => (
                  <li
                    key={folder.id}
                    className="group flex items-center gap-3 px-4 py-2.5 transition hover:bg-[#f8f9fa] dark:hover:bg-white/[0.02]"
                  >
                    <Link
                      href={`/dashboard?folder=${folder.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 text-foreground"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#e8f0fe] text-[#1967d2] dark:bg-[#1a73e8]/25 dark:text-[#a8c7fa]">
                        <Folder className="h-4 w-4" />
                      </span>
                      <span className="truncate text-sm font-medium text-[#202124] hover:underline dark:text-slate-100">
                        {folder.name}
                      </span>
                    </Link>
                    <FolderRowActions
                      folder={{ id: folder.id, name: folder.name }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ===== Owned documents ===== */}
        {!sharedOnly && (
          <section>
            {isRoot && (documents.length > 0 || query) && (
              <div className="mb-4 flex items-center justify-between gap-2">
                <OwnerFilter value={ownerFilter} />
                <ViewToggle view={view} />
              </div>
            )}

            {!showOwned && !showFolders ? (
              isRoot && !query ? null : (
                <div className="rounded-xl border border-dashed border-[#dadce0] py-14 text-center dark:border-white/10">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    {query ? `No documents match “${query}”` : "Nothing here yet"}
                  </p>
                </div>
              )
            ) : view === "grid" && showOwned ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {documents.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    doc={{
                      id: doc.id,
                      title: doc.title,
                      updatedAt: formatDate(doc.updatedAt),
                    }}
                  />
                ))}
              </div>
            ) : view === "list" && showOwned ? (
              <div className="overflow-hidden rounded-lg border border-[#dadce0] dark:border-white/10">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[#dadce0] bg-[#f8f9fa] dark:border-white/10 dark:bg-white/[0.02]">
                    <tr>
                      <th className="px-4 py-2.5 font-medium text-[#5f6368] dark:text-slate-400">
                        Name
                      </th>
                      <th className="hidden px-4 py-2.5 font-medium text-[#5f6368] dark:text-slate-400 sm:table-cell">
                        Last opened
                      </th>
                      <th className="w-12 px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr
                        key={doc.id}
                        className="border-b border-[#dadce0]/60 last:border-0 hover:bg-[#f8f9fa] dark:border-white/5 dark:hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/doc/${doc.id}`}
                            className="group flex items-center gap-3 text-foreground"
                          >
                            <PagePreview className="h-8 w-6 shrink-0" />
                            <span className="font-medium text-[#202124] hover:underline dark:text-slate-100">
                              {doc.title}
                            </span>
                          </Link>
                        </td>
                        <td className="hidden px-4 py-2.5 text-[#5f6368] dark:text-slate-400 sm:table-cell">
                          {formatDate(doc.updatedAt)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <DeleteDocumentButton docId={doc.id} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        )}

        {/* ===== Shared with me ===== */}
        {showShared && !sharedOnly && (
          <section className={showOwned || showFolders ? "mt-10" : "mt-2"}>
            <h2 className="mb-3 text-base font-medium text-[#202124] dark:text-slate-100">
              Shared with me
            </h2>
            {view === "grid" ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {sharedDocuments.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    doc={{
                      id: doc.id,
                      title: doc.title,
                      updatedAt: formatDate(doc.updatedAt),
                    }}
                    ownerName={doc.owner.name || doc.owner.email}
                    canDelete={false}
                  />
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-[#dadce0] dark:border-white/10">
                <ul className="divide-y divide-[#dadce0]/60 dark:divide-white/5">
                  {sharedDocuments.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-[#f8f9fa] dark:hover:bg-white/[0.02]"
                    >
                      <Link
                        href={`/doc/${doc.id}`}
                        className="group flex min-w-0 flex-1 items-center gap-3 text-foreground"
                      >
                        <PagePreview className="h-8 w-6 shrink-0" />
                        <span className="min-w-0 truncate font-medium text-[#202124] hover:underline dark:text-slate-100">
                          {doc.title}
                        </span>
                      </Link>
                      <span className="hidden shrink-0 text-xs text-[#5f6368] sm:block dark:text-slate-400">
                        {doc.owner.name || doc.owner.email}
                      </span>
                      <span className="hidden shrink-0 text-xs text-[#5f6368] sm:block dark:text-slate-400">
                        {formatDate(doc.updatedAt)}
                      </span>
                      <span className="shrink-0 rounded-full bg-[#f1f3f4] px-2 py-0.5 text-[11px] capitalize text-[#5f6368] dark:bg-white/10 dark:text-slate-300">
                        {doc.shares[0]?.role ?? "editor"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* ===== Shared-only view ===== */}
        {sharedOnly &&
          (sharedDocuments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#dadce0] py-16 text-center dark:border-white/10">
              <FileText className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">
                Nothing has been shared with you yet
              </p>
              <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
                When someone shares a document with your email, it appears here.
              </p>
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {sharedDocuments.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={{
                    id: doc.id,
                    title: doc.title,
                    updatedAt: formatDate(doc.updatedAt),
                  }}
                  ownerName={doc.owner.name || doc.owner.email}
                  canDelete={false}
                />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-[#dadce0] dark:border-white/10">
              <ul className="divide-y divide-[#dadce0]/60 dark:divide-white/5">
                {sharedDocuments.map((doc) => (
                  <li
                    key={doc.id}
                    className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-[#f8f9fa] dark:hover:bg-white/[0.02]"
                  >
                    <Link
                      href={`/doc/${doc.id}`}
                      className="group flex min-w-0 flex-1 items-center gap-3 text-foreground"
                    >
                      <PagePreview className="h-8 w-6 shrink-0" />
                      <span className="min-w-0 truncate font-medium text-[#202124] hover:underline dark:text-slate-100">
                        {doc.title}
                      </span>
                    </Link>
                    <span className="hidden shrink-0 text-xs text-[#5f6368] sm:block dark:text-slate-400">
                      {doc.owner.name || doc.owner.email}
                    </span>
                    <span className="hidden shrink-0 text-xs text-[#5f6368] sm:block dark:text-slate-400">
                      {formatDate(doc.updatedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </>
  );
}
