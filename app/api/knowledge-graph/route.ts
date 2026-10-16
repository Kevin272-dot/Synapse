import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/user";

export const dynamic = "force-dynamic";

/**
 * Serves the knowledge graph for the authenticated user in the format
 * expected by react-force-graph.
 *
 * The graph is document-inclusive:
 *  - Document nodes (docs with extracted concepts)
 *  - Concept nodes (typed entities from LLM extraction)
 *  - Edges: doc→concept (mentions), concept→concept (typed relation),
 *    doc→doc folder co-membership (weak signal of relatedness)
 */
export async function GET() {
  const clerkUser = await currentUser();
  if (!clerkUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getOrCreateUser(clerkUser.id);

  const [docs, conceptEdges] = await Promise.all([
    prisma.document.findMany({
      where: {
        ownerId: user.id,
        concepts: { some: {} },
      },
      select: {
        id: true,
        title: true,
        folderId: true,
        concepts: {
          take: 8,
          select: { conceptId: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.conceptEdge.findMany({
      where: { ownerId: user.id },
      select: {
        fromId: true,
        toId: true,
        relation: true,
        strength: true,
      },
    }),
  ]);

  // Collect the concept IDs that appear in at least one document.
  const usedConceptIds = new Set<string>();
  for (const d of docs) {
    for (const dc of d.concepts) usedConceptIds.add(dc.conceptId);
  }

  const concepts = await prisma.concept.findMany({
    where: { ownerId: user.id, id: { in: [...usedConceptIds] } },
    select: { id: true, name: true, type: true },
  });

  // Nodes: documents + concepts.
  const nodes = [
    ...docs.map((d) => ({
      id: `doc-${d.id}`,
      label: d.title,
      type: "Document",
      isDoc: true,
      docId: d.id,
    })),
    ...concepts.map((c) => ({
      id: c.id,
      label: c.name,
      type: c.type,
      isDoc: false,
    })),
  ];

  // Links.
  const links: {
    source: string;
    target: string;
    relation: string;
    weight: number;
    kind: "topic" | "folder";
  }[] = [];

  // doc → concept (mentions).
  for (const d of docs) {
    for (const dc of d.concepts) {
      links.push({
        source: `doc-${d.id}`,
        target: dc.conceptId,
        relation: "mentions",
        weight: 2,
        kind: "topic",
      });
    }
  }

  // concept → concept (typed relations from extraction).
  for (const e of conceptEdges) {
    if (usedConceptIds.has(e.fromId) && usedConceptIds.has(e.toId)) {
      links.push({
        source: e.fromId,
        target: e.toId,
        relation: e.relation,
        weight: Math.min(4, 1 + e.strength),
        kind: "topic",
      });
    }
  }

  // doc → doc folder co-membership (weak, dashed).
  const byFolder = new Map<string, string[]>();
  for (const d of docs) {
    if (!d.folderId) continue;
    const list = byFolder.get(d.folderId) ?? [];
    list.push(`doc-${d.id}`);
    byFolder.set(d.folderId, list);
  }
  const folderEdges = new Set<string>();
  for (const [, docIds] of byFolder) {
    for (let i = 0; i < docIds.length; i++) {
      for (let j = i + 1; j < docIds.length; j++) {
        const key = [docIds[i], docIds[j]].sort().join("|");
        if (folderEdges.has(key)) continue;
        folderEdges.add(key);
        links.push({
          source: docIds[i],
          target: docIds[j],
          relation: "same folder",
          weight: 1,
          kind: "folder",
        });
      }
    }
  }

  return NextResponse.json({ nodes, links });
}
