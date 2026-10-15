import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/user";

export const dynamic = "force-dynamic";

/**
 * Serves the knowledge graph for the authenticated user in the format
 * expected by react-force-graph: { nodes: [{id, label, type}], links: [{source, target, relation}] }.
 */
export async function GET() {
  const clerkUser = await currentUser();
  if (!clerkUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getOrCreateUser(clerkUser.id);

  const [concepts, edges] = await Promise.all([
    prisma.concept.findMany({
      where: { ownerId: user.id },
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" },
    }),
    prisma.conceptEdge.findMany({
      where: { ownerId: user.id },
      select: {
        fromId: true,
        toId: true,
        relation: true,
        strength: true,
        from: { select: { name: true } },
        to: { select: { name: true } },
      },
    }),
  ]);

  const nodes = concepts.map((c) => ({
    id: c.id,
    label: c.name,
    type: c.type,
  }));

  const links = edges.map((e) => ({
    source: e.fromId,
    target: e.toId,
    relation: e.relation,
    weight: e.strength,
  }));

  return NextResponse.json({ nodes, links });
}
