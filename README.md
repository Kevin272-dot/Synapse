# Synapse

A real-time collaborative document editor with a live AI knowledge graph. Write together in real time, then let AI extract the concepts and map how your ideas connect.

**Built for learning.** Every core system — the Operational Transformation engine, the Logoot CRDT, the operation log, the quiescence-triggered knowledge graph pipeline — is implemented from scratch, not wrapped around a library. The goal was to understand and build the algorithms, not just integrate them.

---

## Why this project exists

Real-time collaborative editing is one of the hardest problems in distributed systems. Google Docs solved it with Operational Transformation (OT); Figma and Notion use Conflict-free Replicated Data Types (CRDTs). Synapse implements **both approaches from first principles** — a hand-written OT engine with a server-authoritative sequencer, and a hand-written Logoot CRDT with commutative positional identifiers — selectable per document at runtime. The convergence of both engines is proven with randomized property tests.

On top of that foundation, Synapse adds a **live knowledge graph**: an LLM watches the operation stream, detects quiescence (4 seconds of no edits), incrementally extracts concepts, and broadcasts the updated graph to all connected clients — no batch job, no reload.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Next.js App Router                 │
│  ┌────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │ Dashboard  │  │  Editor      │  │ Knowledge     │ │
│  │ (folders,  │  │  (TipTap,    │  │ Graph (canvas │ │
│  │  import,   │  │  slash menu, │  │  force-directed)│
│  │  sharing)  │  │  AI panel)   │  │               │ │
│  └────────────┘  └──────┬───────┘  └───────┬───────┘ │
└─────────────────────────┼──────────────────┼─────────┘
                          │                  │
              ┌───────────▼──────────────────▼───────────┐
              │         Custom Node Server (server.ts)   │
              │  ┌─────────────────┐  ┌───────────────┐  │
              │  │ OT Coordinator  │  │ CRDT Relay    │  │
              │  │ (transform ops, │  │ (apply comm.  │  │
              │  │  version, log)  │  │  ops, relay)  │  │
              │  └────────┬────────┘  └───────┬───────┘  │
              │  ┌────────▼──────────────────▼───────┐  │
              │  │   Quiescence → LLM → Graph Update │  │
              │  └───────────────────────────────────┘  │
              └────────────────┬────────────────────────┘
                               │
                        ┌──────▼──────┐
                        │  PostgreSQL  │
                        │  (Prisma)    │
                        └─────────────┘
```

## Two sync engines, one editing surface

| | Operational Transformation | Logoot CRDT |
|---|---|---|
| **Model** | Server-authoritative: ops sequenced and transformed centrally | Decentralized: commutative character IDs, server just relays |
| **Correctness** | Convergence proven via randomized property tests (400+ cases) | Convergence via total order on positional identifiers |
| **Cursor positioning** | Exact | Approximate (known Logoot limitation) |
| **Best for** | Small teams, low latency | Tolerance to message reordering, no version dependencies |

Select per document from the Share dialog. Both engines share the same editing surface (TipTap), the same audit log, and the same operation pipeline.

## The live knowledge graph

The operation stream is the trigger: after every applied edit, a per-document quiescence timer resets. When no ops arrive for 4 seconds, the server incrementally extracts concepts via Groq (Llama 3.3 70B) and upserts them into a document–concept bipartite graph. The result is broadcast to all connected clients — so the knowledge graph page updates **in real time as you write**, not as a batch job.

```
Type → ops applied → 4s quiescence → LLM extraction → upsert → broadcast → graph updates
```

---

## Features

- **Real-time collaboration** — live cursors, selection highlighting, presence avatars
- **Two sync engines** — OT and Logoot CRDT, switchable per document
- **Rich text editor** — TipTap with Docs-style toolbar, slash menu, AI actions
- **Document sharing** — owner / editor / viewer roles, invite by email
- **Public visibility** — make a doc viewable by anyone (with confirmation)
- **Nested folders** — file-system organization with breadcrumbs
- **Import** — .docx (Google Docs export), .html, .txt
- **Version history** — reconstruct any version by replaying the operation log
- **AI study tools** — summaries, flashcards, quizzes from your notes
- **Knowledge graph** — force-directed map of how your documents connect
- **Semantic search** — Gemini embeddings, cosine similarity across all docs
- **Auto-tagging** — concepts extracted from your notes shown as chips
- **Operation log** — every edit durably recorded and browsable

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript strict, Tailwind CSS v4 |
| Editor | TipTap 3 (ProseMirror-based) |
| Real-time | Socket.IO on a custom Node server (`server.ts`) |
| Sync engines | Custom OT engine + custom Logoot CRDT (`lib/ot/`, `lib/crdt/`) |
| AI | Groq (Llama 3.3 70B) with Google Gemini fallback |
| Database | PostgreSQL via Prisma ORM |
| Auth | Clerk (Google OAuth) |
| Fonts | Inter + Geist Mono via `next/font/google` |

## Getting started

```bash
git clone https://github.com/Kevin272-dot/Synapse.git
cd Synapse
npm install

# Set up environment variables
cp .env.example .env
# Fill in: DATABASE_URL, CLERK keys, GROQ_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY

# Run migrations
npx prisma migrate deploy

# Start the custom server (Next.js + Socket.IO on one port)
npm run dev
```

Open `http://localhost:3000`. Sign in with Google. Create a document. Open the same URL in a second window to see real-time collaboration.

## The OT engine

The engine (`lib/ot/engine.ts`) implements the classic text OT model: operations are lists of `retain`/`insert`/`delete` components. The core function `transform(a, b, insertFirst)` produces the operation equivalent to `a` when applied after `b` — the mechanism that guarantees convergence.

Convergence is proven by randomized property testing: two ops from random documents are transformed in both directions, and the test asserts:

```
apply(transform(a,b,true), apply(b, doc)) === apply(transform(b,a,false), apply(a, doc))
```

This invariant is checked across 400+ randomized concurrent-op pairs in `lib/ot/engine.test.ts`.

## The CRDT engine

The Logoot CRDT (`lib/crdt/logoot.ts`) assigns each character a positional identifier — an array of base-16 digits plus an originating site ID. Insertions generate identifiers strictly between their neighbors; deletes are tombstones. Because identifiers are totally ordered, all replicas converge without a central sequencer.

Convergence is tested with 2- and 3-site simulations (200 rounds each) under randomized insert/delete/replace contention, plus a heavy same-gap test where every site inserts into the same gap simultaneously.

## Running tests

```bash
npm test
```

Runs all 22 tests across 3 suites: OT convergence, replay invariants, and CRDT convergence.

## Deployment

Designed for AWS ECS/EC2 (the custom server requires a long-lived process, not Lambda):
- **Compute**: ECS Fargate or EC2 with the Docker image
- **Database**: RDS PostgreSQL
- **Secrets**: AWS Secrets Manager (`GROQ_API_KEY`, Clerk keys, `DATABASE_URL`)
- **Scaling**: single instance (Socket.IO rooms are in-memory); Redis adapter for multi-instance is documented as future work

## License

MIT
