/**
 * Seeds a "Synapse" folder with documentation documents for the app owner.
 * Run: npx tsx scripts/seed-synapse-docs.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const USER_EMAIL = "lrkevindaniel@gmail.com";
const FOLDER_NAME = "Synapse";

// Helper: build a TipTap JSON doc from simple structured blocks.
function buildDoc(blocks: Array<
  { h1: string } | { h2: string } | { h3: string } | { p: string } | { bullet: string[] } | { numbered: string[] } | { quote: string }
>): object {
  const children = blocks.map((b) => {
    if ("h1" in b) return { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: b.h1 }] };
    if ("h2" in b) return { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: b.h2 }] };
    if ("h3" in b) return { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: b.h3 }] };
    if ("bullet" in b) return {
      type: "bulletList",
      content: b.bullet.map((t) => ({
        type: "listItem",
        content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
      })),
    };
    if ("numbered" in b) return {
      type: "orderedList",
      content: b.numbered.map((t) => ({
        type: "listItem",
        content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
      })),
    };
    if ("quote" in b) return {
      type: "blockquote",
      content: [{ type: "paragraph", content: [{ type: "text", text: b.quote }] }],
    };
    return { type: "paragraph", content: [{ type: "text", text: (b as { p: string }).p }] };
  });
  return { type: "doc", content: children };
}

function text(blocks: Array<Record<string, unknown>>): string {
  return blocks.map((b: Record<string, unknown>) => {
    if (typeof b.p === "string") return b.p;
    if (typeof b.h1 === "string") return "# " + b.h1;
    if (typeof b.h2 === "string") return "## " + b.h2;
    if (typeof b.h3 === "string") return "### " + b.h3;
    if (typeof b.quote === "string") return "> " + b.quote;
    if (Array.isArray(b.bullet)) return (b.bullet as string[]).map((t: string) => "- " + t).join("\n");
    if (Array.isArray(b.numbered)) return (b.numbered as string[]).map((t: string, i: number) => `${i + 1}. ${t}`).join("\n");
    return "";
  }).join("\n\n");
}

interface DocSeed {
  title: string;
  blocks: Parameters<typeof buildDoc>[0];
}

const DOCS: DocSeed[] = [
  {
    title: "What is Synapse?",
    blocks: [
      { h1: "What is Synapse?" },
      { p: "Synapse is a real-time collaborative document editor with a live AI knowledge graph. It lets you and your team write together in the same document simultaneously, then uses AI to extract concepts and map how your ideas connect across documents." },
      { h2: "Why Synapse exists" },
      { p: "Real-time collaborative editing is one of the hardest problems in distributed systems. Google Docs solved it with Operational Transformation (OT); Figma and Notion use Conflict-free Replicated Data Types (CRDTs). Synapse implements both approaches from first principles — a hand-written OT engine and a hand-written Logoot CRDT — selectable per document at runtime." },
      { h2: "What makes it different" },
      { bullet: [
        "Two sync engines built from scratch: OT and Logoot CRDT, switchable per document",
        "A live knowledge graph that updates as you type (no batch job)",
        "AI study tools: summaries, flashcards, quizzes generated from your notes",
        "Semantic search powered by Gemini embeddings",
        "An operation log that records every edit durably for audit and version history",
        "File-system organization with nested folders and breadcrumbs",
        "Document import from Google Docs (.docx), HTML, and plain text",
      ]},
      { h2: "The tech stack" },
      { p: "Built with Next.js 16 (App Router), React 19, TypeScript (strict mode), Tailwind CSS v4, TipTap 3 (ProseMirror), Socket.IO on a custom Node server, PostgreSQL via Prisma ORM, Clerk (Google OAuth) for authentication, and Groq (Llama 3.3 70B) with Google Gemini as AI providers." },
    ],
  },
  {
    title: "Real-Time Collaboration — The OT Engine",
    blocks: [
      { h1: "The OT Engine" },
      { p: "Synapse's Operational Transformation engine is written from scratch in TypeScript (lib/ot/engine.ts). It implements the classic text OT model where operations are lists of retain/insert/delete components applied left-to-right across the document." },
      { h2: "How it works" },
      { p: "When two users type at the same time, each edit is an operation (a recipe: skip some chars, insert text, delete chars). The server sequences operations and the transform function rewrites incoming operations so they apply cleanly on top of concurrent ones." },
      { p: "The transform function handles four key interactions: a-inserts, b-inserts at the same position (ordered deterministically by a tie-break flag), deletes overlapping retains, and overlapping deletes. The insertFirst flag ensures both replicas converge to the same result." },
      { h2: "Convergence proof" },
      { p: "The convergence property is tested with 400+ randomized concurrent-operation pairs. For each pair, two random ops are generated on the same document, transformed in both directions, applied, and the results are asserted equal. This invariant is the mathematical guarantee that no keystroke is ever lost." },
      { h2: "Durable operation log" },
      { p: "Every applied operation is written to the DocumentOperation table in the same transaction that persists the text. This means the server can restart and resume collaboration from the exact version it left off — the log is the record." },
      { quote: "State = snapshot ⊕ suffix of operations. The document text is a materialized view; the log is the truth." },
    ],
  },
  {
    title: "The CRDT Engine — Logoot",
    blocks: [
      { h1: "The Logoot CRDT Engine" },
      { p: "Synapse also implements a Logoot-style positional CRDT (lib/crdt/logoot.ts). Unlike OT, a CRDT requires no central sequencer — operations are commutative, so replicas converge regardless of delivery order." },
      { h2: "How it works" },
      { p: "Every character carries a unique positional identifier: an array of base-16 digits plus an originating site ID. When you insert at position i, the system generates an identifier strictly between the identifiers at positions i-1 and i. Since identifiers are totally ordered, all replicas sort them identically and converge." },
      { h2: "Concurrent inserts at the same gap" },
      { p: "When two users insert at the same position simultaneously, both generate identifiers in the same gap. The identifiers are totally ordered by (digits, site), so the final text is deterministic across all replicas. The order may not match either user's local intent, but it converges." },
      { h2: "Tombstones" },
      { p: "Deletes are tombstones (the character is marked deleted, not removed). This is essential for correctness: if a concurrent insert references a deleted neighbor, the tombstone preserves the ordering context. Tombstones are never removed from the CRDT state." },
      { h2: "Switching engines" },
      { p: "The document owner can switch between OT and CRDT modes from the Share dialog. Switching drops the cached state and re-initializes with the selected engine. The engine badge in the editor header shows the active mode." },
    ],
  },
  {
    title: "The Live Knowledge Graph",
    blocks: [
      { h1: "The Live Knowledge Graph" },
      { p: "As you type in any document, Synapse watches the operation stream. After 4 seconds of inactivity (quiescence), the server triggers an incremental LLM extraction that identifies the key concepts and their relationships, then upserts them into a document-concept bipartite graph." },
      { h2: "How it works" },
      { numbered: [
        "You type an edit in any document",
        "The server applies the op and resets the quiescence timer",
        "After 4 seconds of no ops, the server extracts concepts via Groq (Llama 3.3 70B)",
        "The prompt carries the previous concept list so the LLM only reports new/changed topics",
        "Concepts are upserted into the Concept and DocumentConcept tables",
        "The server broadcasts a graph:update event to all connected clients",
        "The knowledge graph page re-renders with the updated graph — live",
      ]},
      { h2: "The graph structure" },
      { p: "The knowledge graph is a document-concept bipartite relation projected onto a document-document graph. Two documents are connected when they share topics; the edge weight equals the number of shared topics. This projection keeps the graph readable as your corpus grows — concepts act as implicit bridges between documents rather than individual nodes in a hairball." },
      { h2: "Visualization" },
      { p: "The graph is rendered with react-force-graph (WebGL) in the Knowledge graph tab. Nodes are colored by entity type, sized by connection count, and clicking a node shows its relations. Topic chips filter the view to highlight related documents." },
    ],
  },
  {
    title: "AI Study Tools",
    blocks: [
      { h1: "AI Study Tools" },
      { p: "Synapse's AI features are powered by Groq (Llama 3.3 70B) with Google Gemini as an automatic fallback. The same quiescence window that drives the knowledge graph also generates embeddings for semantic search." },
      { h2: "Summaries" },
      { p: "Generate a multi-paragraph summary of any document. Results are cached per document and can be regenerated on demand." },
      { h2: "Flashcards" },
      { p: "Turn any document into 6-10 flashcards with front/back pairs. Reveal answers one by one to test your knowledge." },
      { h2: "Quizzes" },
      { p: "Generate a 5-question multiple-choice quiz from your notes. Answers are graded instantly with correct/incorrect highlighting." },
      { h2: "Inline AI" },
      { p: "Type / in the editor to open the slash menu. It offers Continue writing (the LLM generates 1-3 sentences that flow from your text), formatting shortcuts (headings, lists, blockquote), and structural insertions (horizontal rule)." },
      { h2: "Semantic search" },
      { p: "Every document is embedded using Gemini text-embedding-004 (768 dimensions) after a quiescence window. Search queries are embedded and compared using cosine similarity, so you can find documents by meaning rather than just keywords." },
    ],
  },
  {
    title: "Sharing and Permissions",
    blocks: [
      { h1: "Sharing and Permissions" },
      { p: "Documents support three access tiers: private (owner only), shared (owner + invited collaborators), and public (any signed-in user can view)." },
      { h2: "Sharing with specific people" },
      { p: "From the editor, click Share and invite people by email. You can grant editor access (they can type, use AI, and see live cursors) or viewer access (they can read but not edit). The server enforces these roles on both the HTTP and WebSocket layers." },
      { h2: "Making a document public" },
      { p: "In the Share dialog, you can switch general access to 'Anyone can view'. This requires a confirmation modal because it's a sensitive visibility change. Public documents can be viewed by anyone signed in to Synapse." },
      { h2: "Revoking access" },
      { p: "The owner can remove anyone's access at any time from the same dialog. Collaborators immediately lose access to the document." },
    ],
  },
  {
    title: "Architecture Overview",
    blocks: [
      { h1: "Architecture Overview" },
      { h2: "The custom server" },
      { p: "Synapse runs on a custom Node.js server (server.ts) that hosts both the Next.js application and the Socket.IO server on the same port. This co-location simplifies deployment (one container, one port) and lets the OT coordinator share in-memory state with the web server." },
      { h2: "The operation stream" },
      { p: "Every edit produces an operation that flows through: client applies locally → submits to server → server transforms against unseen ops → applies to authoritative text → logs durably → broadcasts to room → other clients apply → quiescence timer triggers KG extraction → graph update broadcast." },
      { h2: "The access gate" },
      { p: "A single function (getDocumentAccess in lib/access.ts) resolves a user's role for any document: owner > share role > public viewer. This one function is used by the page loader, the socket join handler, and every server action, so the permission model can never drift between layers." },
      { h2: "Durable logging" },
      { p: "Every applied operation is written to the DocumentOperation table with its resulting text. This means: (1) the server can restart and resume from the exact version, (2) any version can be reconstructed by replay, and (3) the audit feed shows who changed what." },
      { h2: "Tech stack" },
      { bullet: [
        "Next.js 16 (App Router), React 19, TypeScript strict",
        "Tailwind CSS v4 for styling",
        "TipTap 3 (ProseMirror) for rich text",
        "Socket.IO for real-time transport",
        "PostgreSQL via Prisma ORM",
        "Clerk for Google OAuth authentication",
        "Groq (Llama 3.3 70B) + Google Gemini for AI",
        "react-force-graph for knowledge graph visualization",
      ]},
    ],
  },
  {
    title: "Importing from Google Docs",
    blocks: [
      { h1: "Importing from Google Docs" },
      { p: "Synapse can import documents exported from Google Docs. The supported formats are .docx (recommended — preserves headings, bold, lists), .html, and .txt." },
      { h2: "How to export from Google Docs" },
      { numbered: [
        "Open your document in Google Docs",
        "Click File > Download",
        "Choose 'Microsoft Word (.docx)' for the best formatting preservation",
        "Or choose 'Web Page (.html)' for a lighter file",
      ]},
      { h2: "How to import into Synapse" },
      { numbered: [
        "Go to your Synapse dashboard",
        "Click the Import button in the toolbar",
        "Select the .docx or .html file you downloaded",
        "The document is created and opened in the editor",
      ]},
      { h2: "What gets preserved" },
      { bullet: [
        "Headings (H1, H2, H3) and paragraph structure",
        "Bold, italic, and strikethrough text",
        "Bullet and numbered lists",
        "Hyperlinks",
        "Document title (from the filename)",
      ]},
      { p: "Images are not imported (TipTap schema does not include image storage yet). All imported content passes through DOMPurify sanitization to prevent XSS from untrusted document content." },
    ],
  },
];

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: USER_EMAIL },
    select: { id: true, name: true },
  });
  if (!user) {
    console.error(`User not found: ${USER_EMAIL}`);
    process.exit(1);
  }
  console.log(`Seeding for: ${user.name} (${user.id})`);

  // Create or find the Synapse folder at root.
  let folder = await prisma.folder.findFirst({
    where: { ownerId: user.id, name: FOLDER_NAME, parentId: null },
  });
  if (!folder) {
    folder = await prisma.folder.create({
      data: { name: FOLDER_NAME, ownerId: user.id, parentId: null },
    });
    console.log(`Created folder: ${FOLDER_NAME} (${folder.id})`);
  } else {
    console.log(`Folder exists: ${FOLDER_NAME} (${folder.id})`);
  }

  // Create documents inside the folder.
  for (const seed of DOCS) {
    const existing = await prisma.document.findFirst({
      where: { ownerId: user.id, title: seed.title, folderId: folder.id },
    });
    if (existing) {
      console.log(`  skip: "${seed.title}" (already exists)`);
      continue;
    }
    const content = JSON.stringify(buildDoc(seed.blocks));
    const plainText = text(seed.blocks);
    const created = await prisma.document.create({
      data: {
        title: seed.title,
        content,
        text: plainText,
        ownerId: user.id,
        folderId: folder.id,
      },
    });
      console.log(`  created: "${seed.title}" (${created.id})`);
  }

  console.log("Done.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
