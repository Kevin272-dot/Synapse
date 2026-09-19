import Link from "next/link";
import { Network, Sparkles } from "lucide-react";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/user";
import GraphExplorer, {
  type GraphExplorerData,
} from "@/components/graph/graph-explorer";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Knowledge graph",
};

export default async function GraphPage() {
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const user = await getOrCreateUser(clerkUser.id);

  // Documents that have extracted concepts, with their strongest topics.
  const docs = await prisma.document.findMany({
    where: {
      ownerId: user.id,
      concepts: { some: {} },
    },
    select: {
      id: true,
      title: true,
      concepts: {
        orderBy: { count: "desc" },
        take: 8,
        select: { count: true, concept: { select: { name: true } } },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Project the document-concept bipartite relation down to a
  // document-document graph: two docs are connected when they share a topic,
  // weighted by how many topics they share.
  const graphDocs = docs.map((d) => ({
    id: d.id,
    title: d.title,
    topics: d.concepts.map((dc) => dc.concept.name),
  }));

  const edges: GraphExplorerData["edges"] = [];
  for (let i = 0; i < graphDocs.length; i++) {
    for (let j = i + 1; j < graphDocs.length; j++) {
      const a = new Set(graphDocs[i].topics);
      const shared = graphDocs[j].topics.filter((t) => a.has(t));
      if (shared.length > 0) {
        edges.push({
          from: graphDocs[i].id,
          to: graphDocs[j].id,
          weight: shared.length,
        });
      }
    }
  }

  // Topics sorted by how many documents mention them.
  const topicCount = new Map<string, number>();
  for (const d of graphDocs) {
    for (const t of d.topics) {
      topicCount.set(t, (topicCount.get(t) ?? 0) + 1);
    }
  }
  const topics = [...topicCount.entries()]
    .map(([name, docCount]) => ({ name, docCount }))
    .sort((a, b) => b.docCount - a.docCount)
    .slice(0, 16);

  const data: GraphExplorerData = { docs: graphDocs, edges, topics };
  const hasGraph = graphDocs.length > 0;
  const recentDocs = await prisma.document.findMany({
    where: { ownerId: user.id },
    select: { id: true, title: true },
    orderBy: { updatedAt: "desc" },
    take: 5,
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Knowledge graph
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {hasGraph
            ? `${graphDocs.length} documents · ${edges.length} connections · ${topics.length} topics. Documents are connected when they share topics.`
            : "A visual map of your documents, connected by the topics they share."}
        </p>
      </div>

      {hasGraph ? (
        <GraphExplorer data={data} />
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-900/15 py-20 text-center dark:border-white/10">
          <Network className="h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-300">
            No concepts yet
          </p>
          <p className="mt-1 max-w-sm text-sm text-slate-400 dark:text-slate-500">
            Open a document and run{" "}
            <span className="inline-flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">
              <Sparkles className="h-3 w-3" /> Extract concepts
            </span>{" "}
            in the AI panel. Documents that share topics will connect here
            automatically.
          </p>
          {recentDocs.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {recentDocs.map((d) => (
                <Link
                  key={d.id}
                  href={`/doc/${d.id}`}
                  className="rounded-full border border-slate-900/10 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-900/5 dark:border-white/15 dark:text-slate-300 dark:hover:bg-white/5"
                >
                  {d.title}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
