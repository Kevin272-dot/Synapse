"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser } from "@/lib/user";
import { getDocumentAccess, canEdit } from "@/lib/access";
import { generateJSON, truncateForAI } from "@/lib/ai";

/**
 * AI actions mutate the document (cached summary/cards/quiz, graph rows),
 * so they require owner OR editor access — the same gate as saving.
 * Viewers can see cached results but cannot regenerate.
 */
async function requireEditableDoc(docId: string) {
  const { userId } = await auth();
  if (!userId) throw new Error("Not authenticated");
  const user = await getOrCreateUser(userId);
  const access = await getDocumentAccess(docId, user.id);
  if (!access) throw new Error("Document not found");
  if (!canEdit(access.role)) {
    throw new Error(
      "You have view-only access to this document, so you can't run AI actions."
    );
  }
  return { user, doc: access.doc };
}

/* ------------------------------ Summarize ------------------------------ */

export async function summarizeDocument(docId: string, regenerate = false) {
  const { doc } = await requireEditableDoc(docId);
  if (doc.summary && !regenerate) return doc.summary;

  const summary = await generateJSON<{ summary: string }>(
    '{ "summary": "string — a concise multi-paragraph summary" }',
    truncateForAI(doc.text),
    "Summarize this document clearly and faithfully."
  );

  await prisma.document.update({
    where: { id: docId },
    data: { summary: summary.summary },
  });
  revalidatePath(`/doc/${docId}`);
  return summary.summary;
}

/* ------------------------------ Flashcards ----------------------------- */

export async function generateFlashcards(docId: string, regenerate = false) {
  const { doc } = await requireEditableDoc(docId);
  if (doc.flashcards && !regenerate) return doc.flashcards as unknown;

  const flashcards = await generateJSON<
    { front: string; back: string }[]
  >(
    '[ { "front": "question/prompt", "back": "answer" } ]',
    truncateForAI(doc.text),
    "Create 6-10 high-quality flashcards covering the key facts."
  );

  await prisma.document.update({
    where: { id: docId },
    data: { flashcards: flashcards as unknown as object },
  });
  revalidatePath(`/doc/${docId}`);
  return flashcards;
}

/* --------------------------------- Quiz -------------------------------- */

export async function generateQuiz(docId: string, regenerate = false) {
  const { doc } = await requireEditableDoc(docId);
  if (doc.quiz && !regenerate) return doc.quiz as unknown;

  const quiz = await generateJSON<
    { question: string; options: string[]; answerIndex: number }[]
  >(
    '[ { "question": "string", "options": ["a","b","c","d"], "answerIndex": 0 } ]',
    truncateForAI(doc.text),
    "Create a 5-question multiple choice quiz. answerIndex must be the index of the correct option."
  );

  await prisma.document.update({
    where: { id: docId },
    data: { quiz: quiz as unknown as object },
  });
  revalidatePath(`/doc/${docId}`);
  return quiz;
}

/* -------------------------- Concept extraction ------------------------- */

export async function extractConcepts(docId: string, regenerate = false) {
  const { user, doc } = await requireEditableDoc(docId);

  // If we already extracted concepts for this doc, skip unless regenerating.
  const existing = await prisma.documentConcept.count({
    where: { documentId: docId },
  });
  if (existing > 0 && !regenerate) return { extracted: false };

  const result = await generateJSON<{
    concepts: { name: string; count?: number }[];
  }>(
    '{ "concepts": [{ "name": "string", "count": 1 }] }',
    truncateForAI(doc.text),
    "Extract the 3 to 8 most important topics/concepts of this document. " +
      "Use short lowercase names (1-3 words). count = how many times the topic appears."
  );

  // Keep only the strongest 8 topics per document — the graph connects
  // DOCUMENTS through shared topics, so a small high-precision set per doc
  // is what keeps the map readable.
  const concepts = (result.concepts ?? [])
    .map((c) => ({ name: c.name.trim(), count: c.count ?? 1 }))
    .filter((c) => c.name.length > 0 && c.name.length <= 40)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Upsert concepts and their links to this doc.
  await prisma.$transaction(async (tx) => {
    for (const c of concepts) {
      let concept = await tx.concept.findUnique({
        where: { ownerId_name: { ownerId: user.id, name: c.name } },
      });
      if (!concept) {
        concept = await tx.concept.create({
          data: { name: c.name, ownerId: user.id },
        });
      }
      await tx.documentConcept.upsert({
        where: {
          documentId_conceptId: { documentId: docId, conceptId: concept.id },
        },
        create: {
          documentId: docId,
          conceptId: concept.id,
          count: c.count,
        },
        update: { count: c.count },
      });
    }
  });

  revalidatePath("/graph");
  return { extracted: true };
}
