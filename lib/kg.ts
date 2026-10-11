import { prisma } from "@/lib/prisma";
import { generateJSON, truncateForAI } from "@/lib/ai";

/**
 * Live knowledge-graph extraction: called by the socket server when a
 * document goes quiescent (no ops for 4s after typing). Incremental —
 * the prompt carries the previous concept list so the LLM only reports
 * NEW or CHANGED topics. Results are upserted in a transaction.
 */
export async function runKgExtraction(
  docId: string,
  text: string,
  ownerId: string
): Promise<boolean> {
  const existing = await prisma.documentConcept.findMany({
    where: { documentId: docId },
    include: { concept: { select: { name: true } } },
  });

  const existingNames = existing.map((dc) => dc.concept.name);
  const existingList =
    existingNames.length > 0
      ? `Existing topics: ${existingNames.join(", ")}.`
      : "No existing topics.";

  const result = await generateJSON<{
    concepts: { name: string; count?: number }[];
  }>(
    '{ "concepts": [{ "name": "string", "count": 1 }] }',
    truncateForAI(text),
    "Extract the 3 to 8 most important topics of this document. " +
      "Use short lowercase names (1-3 words). " +
      existingList +
      " Keep existing topics that are still relevant; add new ones; drop topics no longer present. count = approximate occurrences."
  );

  const concepts = (result.concepts ?? [])
    .map((c) => ({ name: c.name.trim().toLowerCase(), count: c.count ?? 1 }))
    .filter((c) => c.name.length > 0 && c.name.length <= 40)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  await prisma.$transaction(async (tx) => {
    for (const c of concepts) {
      let concept = await tx.concept.findUnique({
        where: { ownerId_name: { ownerId, name: c.name } },
      });
      if (!concept) {
        concept = await tx.concept.create({
          data: { name: c.name, ownerId },
        });
      }
      await tx.documentConcept.upsert({
        where: {
          documentId_conceptId: { documentId: docId, conceptId: concept.id },
        },
        create: { documentId: docId, conceptId: concept.id, count: c.count },
        update: { count: c.count },
      });
    }
  });

  return true;
}
