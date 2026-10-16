/**
 * Pre-seed concepts + edges for the Synapse documentation folder.
 * Run: npx tsx scripts/seed-concepts.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const OWNER_EMAIL = "lrkevindaniel@gmail.com";

// Concept definitions per document title.
const DOC_CONCEPTS: Record<string, { name: string; type: string }[]> = {
  "What is Synapse?": [
    { name: "synapse", type: "Project" },
    { name: "collaborative editing", type: "Concept" },
    { name: "knowledge graph", type: "Concept" },
    { name: "operational transformation", type: "Concept" },
    { name: "crdt", type: "Concept" },
  ],
  "Real-Time Collaboration — The OT Engine": [
    { name: "operational transformation", type: "Concept" },
    { name: "convergence", type: "Concept" },
    { name: "operation log", type: "Concept" },
    { name: "transform function", type: "Methodology" },
    { name: "real-time collaboration", type: "Concept" },
  ],
  "The CRDT Engine — Logoot": [
    { name: "crdt", type: "Concept" },
    { name: "logoot", type: "Methodology" },
    { name: "positional identifiers", type: "Concept" },
    { name: "tombstones", type: "Concept" },
    { name: "convergence", type: "Concept" },
  ],
  "The Live Knowledge Graph": [
    { name: "knowledge graph", type: "Concept" },
    { name: "quiescence", type: "Concept" },
    { name: "llm extraction", type: "Methodology" },
    { name: "real-time", type: "Concept" },
  ],
  "AI Study Tools": [
    { name: "flashcards", type: "Concept" },
    { name: "quizzes", type: "Concept" },
    { name: "semantic search", type: "Concept" },
    { name: "gemini embeddings", type: "Methodology" },
    { name: "groq", type: "Project" },
  ],
  "Sharing and Permissions": [
    { name: "document sharing", type: "Concept" },
    { name: "role-based permissions", type: "Concept" },
    { name: "editor", type: "Concept" },
    { name: "viewer", type: "Concept" },
    { name: "public visibility", type: "Concept" },
  ],
  "Architecture Overview": [
    { name: "next.js", type: "Project" },
    { name: "socket.io", type: "Project" },
    { name: "prisma", type: "Project" },
    { name: "postgresql", type: "Project" },
    { name: "custom server", type: "Methodology" },
  ],
  "Importing from Google Docs": [
    { name: "google docs", type: "Project" },
    { name: "docx import", type: "Methodology" },
    { name: "dompurify", type: "Project" },
    { name: "xss prevention", type: "Concept" },
  ],
};

// Concept-concept edges (typed relations).
const EDGES: { from: string; to: string; relation: string }[] = [
  { from: "operational transformation", to: "convergence", relation: "guarantees" },
  { from: "operational transformation", to: "operation log", relation: "uses" },
  { from: "crdt", to: "convergence", relation: "guarantees" },
  { from: "crdt", to: "logoot", relation: "implemented as" },
  { from: "logoot", to: "positional identifiers", relation: "uses" },
  { from: "knowledge graph", to: "quiescence", relation: "triggered by" },
  { from: "knowledge graph", to: "llm extraction", relation: "uses" },
  { from: "real-time collaboration", to: "operational transformation", relation: "depends on" },
  { from: "real-time collaboration", to: "crdt", relation: "depends on" },
  { from: "synapse", to: "collaborative editing", relation: "provides" },
  { from: "synapse", to: "knowledge graph", relation: "provides" },
  { from: "semantic search", to: "gemini embeddings", relation: "uses" },
  { from: "next.js", to: "socket.io", relation: "integrates with" },
  { from: "custom server", to: "socket.io", relation: "hosts" },
  { from: "prisma", to: "postgresql", relation: "connects to" },
  { from: "document sharing", to: "role-based permissions", relation: "uses" },
  { from: "docx import", to: "xss prevention", relation: "requires" },
  { from: "docx import", to: "google docs", relation: "imports from" },
];

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: OWNER_EMAIL },
    select: { id: true },
  });
  if (!user) {
    console.error("User not found");
    process.exit(1);
  }

  // Find the Synapse folder.
  const folder = await prisma.folder.findFirst({
    where: { ownerId: user.id, name: "Synapse", parentId: null },
  });
  if (!folder) {
    console.error("Synapse folder not found");
    process.exit(1);
  }

  // Find all docs in the Synapse folder.
  const docs = await prisma.document.findMany({
    where: { ownerId: user.id, folderId: folder.id },
    select: { id: true, title: true },
  });
  console.log(`Found ${docs.length} docs in Synapse folder`);

  let conceptCount = 0;
  let edgeCount = 0;

  // Upsert concepts + document links.
  for (const [docTitle, concepts] of Object.entries(DOC_CONCEPTS)) {
    const doc = docs.find((d) => d.title === docTitle);
    if (!doc) {
      console.log(`  skip concepts for "${docTitle}" (doc not found)`);
      continue;
    }

    for (const c of concepts) {
      let concept = await prisma.concept.findUnique({
        where: { ownerId_name: { ownerId: user.id, name: c.name } },
      });
      if (!concept) {
        concept = await prisma.concept.create({
          data: { name: c.name, type: c.type, ownerId: user.id },
        });
        conceptCount++;
        console.log(`  + concept: ${c.name} (${c.type})`);
      }
      await prisma.documentConcept.upsert({
        where: {
          documentId_conceptId: { documentId: doc.id, conceptId: concept.id },
        },
        create: { documentId: doc.id, conceptId: concept.id, count: 1 },
        update: {},
      });
    }
  }

  // Upsert edges.
  const allConcepts = await prisma.concept.findMany({
    where: { ownerId: user.id },
    select: { id: true, name: true },
  });
  const nameToId = new Map(allConcepts.map((c) => [c.name, c.id]));

  for (const e of EDGES) {
    const fromId = nameToId.get(e.from);
    const toId = nameToId.get(e.to);
    if (!fromId || !toId || fromId === toId) continue;
    await prisma.conceptEdge.upsert({
      where: { fromId_toId: { fromId, toId } },
      create: {
        fromId,
        toId,
        ownerId: user.id,
        relation: e.relation,
        strength: 1,
      },
      update: {},
    });
    edgeCount++;
  }

  console.log(`Done. ${conceptCount} new concepts, ${edgeCount} edges.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
