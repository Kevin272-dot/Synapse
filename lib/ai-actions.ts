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

/** Inline AI: continue writing from the text before the cursor. */
export async function continueWriting(docId: string, textBeforeCursor: string) {
  await requireEditableDoc(docId);

  const result = await generateJSON<{ continuation: string }>(
    '{ "continuation": "string — 1-3 sentences that naturally continue the text" }',
    truncateForAI(textBeforeCursor.slice(-3000)),
    "Continue writing this document. Write 1-3 sentences that flow naturally from where the text leaves off. Do not repeat existing content."
  );

  return result.continuation;
}

/** Inline AI: explain the selected text in simpler terms. */
export async function explainSelection(docId: string, selection: string) {
  await requireEditableDoc(docId);

  const result = await generateJSON<{ explanation: string }>(
    '{ "explanation": "string — a clear 2-3 sentence explanation" }',
    truncateForAI(selection),
    "Explain this text passage in simple, clear terms."
  );

  return result.explanation;
}

export async function extractConcepts(docId: string, regenerate = false) {
  const { user, doc } = await requireEditableDoc(docId);

  // If we already extracted concepts for this doc, skip unless regenerating.
  const existing = await prisma.documentConcept.count({
    where: { documentId: docId },
  });
  if (existing > 0 && !regenerate) return { extracted: false };

  const result = await generateJSON<{
    nodes: { id: string; label: string; type: string }[];
    edges: { source: string; target: string; relation: string }[];
  }>(
    JSON.stringify({
      nodes: [{ id: "unique_string_id", label: "Entity Name", type: "Concept|Project|Person|Document|Methodology" }],
      edges: [{ source: "node_id_1", target: "node_id_2", relation: "short_verb_phrase" }],
    }),
    truncateForAI(doc.text),
    "Extract key entities (concepts, technologies, people, projects, methodologies) " +
      "and their directed relationships from this document. " +
      "Keep entity labels concise (1-4 words). " +
      "Relations must be action-oriented verbs (1-3 words, e.g. 'depends on', 'uses', 'authored by'). " +
      "Standardize names (e.g. merge 'ReactJS' and 'React' into 'React'). " +
      "Limit to 8 nodes and 12 edges maximum."
  );

  // Cap and sanitize.
  const nodes = (result.nodes ?? [])
    .map((n) => ({ id: n.id?.trim(), label: n.label?.trim(), type: n.type?.trim() || "Concept" }))
    .filter((n) => n.id && n.label && n.label.length <= 40)
    .slice(0, 8);

  const idSet = new Set(nodes.map((n) => n.id));
  const edges = (result.edges ?? [])
    .map((e) => ({ source: e.source?.trim(), target: e.target?.trim(), relation: e.relation?.trim() || "relates to" }))
    .filter((e) => e.source && e.target && e.source !== e.target && idSet.has(e.source) && idSet.has(e.target) && e.relation.length <= 30)
    .slice(0, 12);

  if (nodes.length === 0) return { extracted: false };

  // Upsert concepts (with type), doc links, and typed edges.
  await prisma.$transaction(async (tx) => {
    for (const n of nodes) {
      let concept = await tx.concept.findUnique({
        where: { ownerId_name: { ownerId: user.id, name: n.label } },
      });
      if (!concept) {
        concept = await tx.concept.create({
          data: { name: n.label, type: n.type, ownerId: user.id },
        });
      } else if (concept.type !== n.type) {
        await tx.concept.update({ where: { id: concept.id }, data: { type: n.type } });
      }
      await tx.documentConcept.upsert({
        where: {
          documentId_conceptId: { documentId: docId, conceptId: concept.id },
        },
        create: { documentId: docId, conceptId: concept.id, count: 1 },
        update: {},
      });
    }

    for (const e of edges) {
      const fromNode = nodes.find((n) => n.id === e.source);
      const toNode = nodes.find((n) => n.id === e.target);
      if (!fromNode || !toNode) continue;
      const fromConcept = await tx.concept.findUnique({
        where: { ownerId_name: { ownerId: user.id, name: fromNode.label } },
      });
      const toConcept = await tx.concept.findUnique({
        where: { ownerId_name: { ownerId: user.id, name: toNode.label } },
      });
      if (!fromConcept || !toConcept) continue;
      await tx.conceptEdge.upsert({
        where: { fromId_toId: { fromId: fromConcept.id, toId: toConcept.id } },
        create: {
          fromId: fromConcept.id,
          toId: toConcept.id,
          ownerId: user.id,
          relation: e.relation,
          strength: 1,
        },
        update: { relation: e.relation, strength: { increment: 1 } },
      });
    }
  });

  revalidatePath("/graph");
  return { extracted: true };
}
