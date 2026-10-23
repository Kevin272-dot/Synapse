# Synapse - Project Guide

Everything about how this project works: the ideas, the code, the data, the deployment, and the traps. Written to be read top to bottom once, then used as a reference.

---

## 1. What Synapse is

A real-time collaborative document editor (Google-Docs-like) with a knowledge graph built from your writing. Two people can edit the same document at the same time and both converge to identical text, and when a document is closed an LLM extracts its concepts and relations into a typed entity-relation graph that feeds a live, browsable map.

Two things make it more than a CRUD app:

1. **Both consistency engines are written from scratch** - an Operational Transformation (OT) engine and a Logoot-style CRDT - with no Yjs/ShareDB/Automerge, selectable per document at runtime.
2. **The knowledge graph is fed by the collaboration itself.** There is no manual "generate" step and no per-keystroke model call: when the last person closes a document, the server incrementally extracts concepts (it passes the previous entity list so only changes come back), upserts them, and broadcasts the update. Extraction is per-document and owner-controlled - there is a switch in the Share dialog, on by default.

It also doubles as an IEEE systems/application paper (source lives in `paper/`, which is gitignored and kept private).

---

## 2. The stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript strict |
| Styling | Tailwind CSS v4 (near-monochrome slate/charcoal + white, lucide-react icons, no emojis) |
| Editor | TipTap 3 (ProseMirror-based) |
| Real-time | Socket.IO attached to a custom Node server (`server.ts`) on the same port |
| Sync engines | Hand-written OT engine (`lib/ot/`) + hand-written Logoot CRDT (`lib/crdt/`) |
| Database | PostgreSQL via Prisma ORM |
| Auth | Clerk (Google OAuth). No custom password auth |
| AI | Groq (`llama-3.3-70b-versatile`) with Google Gemini as automatic fallback |
| Embeddings | Gemini `text-embedding-004` (768 dimensions) |
| Graph view | `react-force-graph-2d` (the 2D-only package, dynamically imported) |

---

## 3. Repository map

| Path | What it does |
|---|---|
| `server.ts` | Custom Node server: Next.js + Socket.IO + OT/CRDT + KG pipeline |
| `proxy.ts` | Next 16 middleware: Clerk auth gate for `/dashboard` and `/doc` |
| `lib/ot/engine.ts` | OT core: apply, transform, normalize, baseLength, targetLength |
| `lib/ot/replay.ts` | Replay a logged op sequence from a base text |
| `lib/ot/protocol.ts` | Socket event names + payload types shared by client and server |
| `lib/ot/use-collab-socket.ts` | Client hook: socket lifecycle, pending ops, rebasing, offline queue |
| `lib/crdt/logoot.ts` | Logoot CRDT: positional identifiers, local ops, remote apply |
| `lib/kg.ts` | Quiescence-triggered LLM extraction + graph upsert |
| `lib/embeddings.ts` | Gemini text-embedding-004 wrapper + cosine similarity |
| `lib/ai.ts` | Provider plumbing (Groq primary, Gemini fallback), JSON generation |
| `lib/ai-actions.ts` | Server actions for summaries, flashcards, and quizzes |
| `lib/actions.ts` | Server actions: create, rename, delete, and move docs and folders, sharing |
| `lib/templates.ts` | Five curated note templates (TipTap JSON + plain-text projection) |
| `lib/access.ts` | Single access-resolution gate: owner, editor, or viewer |
| `lib/user.ts` | getOrCreateUser: Clerk session to Prisma user row |
| `lib/offline-queue.ts` | IndexedDB persistence for edits made while offline |
| `lib/prisma.ts` | Prisma client singleton |
| `app/(app)/dashboard/page.tsx` | Dashboard + folder view (folders, docs, search, filters) |
| `app/(app)/graph/page.tsx` | Knowledge-graph page |
| `app/doc/[id]/page.tsx` | The editor route (full screen, outside the (app) group) |
| `app/api/knowledge-graph/` | JSON endpoint serving the graph as nodes and links |
| `components/editor/` | Editor, toolbar, share dialog, AI panel, slash menu |
| `components/dashboard/` | Top nav, sidebar, document cards, page previews, filters |
| `components/loading-screen.tsx` | Shared loading state (brand mark or plain spinner) for route boundaries |
| `app/(app)/loading.tsx` | Loading boundary for `/dashboard` and `/graph` (nav stays painted) |
| `app/doc/[id]/loading.tsx` | Loading boundary for the editor route |
| `scripts/deploy.ps1` | One-command check + build + push + migrate + deploy + verify |
| `scripts/build-paper.sh` | Paper rebuild (LaTeX bib + docx exports + compliance checks) |
| `paper/` | Research paper pipeline (gitignored) |

---

## 4. Running it locally

Requirements: Node 20 or 22 (never 18), PostgreSQL running locally, a `.env` file.

```bash
env -u NODE_ENV npm install     # NODE_ENV=production would strip devDeps
npm run dev                     # tsx server.ts -> Next.js + Socket.IO on one port
npm test                        # 22 tests, 3 suites (vitest)
```

Environment variables (`.env`, gitignored, never committed):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk client key (test key for localhost, live key in prod) |
| `CLERK_SECRET_KEY` | Clerk backend key |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` / `..._SIGN_UP_...` | where Clerk sends users after auth (`/dashboard`) |
| `GROQ_API_KEY` | primary LLM provider |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini: LLM fallback + embeddings |
| `GROQ_MODEL` / `GEMINI_MODEL` | optional model overrides (never hardcode model IDs) |
| `PORT` | server port, defaults to 3000 |

`NEXT_PUBLIC_*` values are baked into the client bundle **at build time**. Changing one requires a rebuild, not just a restart.

---

## 5. Architecture

**One process, one port.** `server.ts` creates a single HTTP server that serves Next.js and hosts Socket.IO. That gives the real-time layer direct access to the same in-memory state as the web app (a document's live buffer, version, and history tail), and it keeps deployment to one container. It is why the app cannot run on serverless - it needs a long-lived process.

Request flow:
1. `proxy.ts` (Clerk middleware) gates `/dashboard` and `/doc/*`.
2. Server components call `currentUser()` then `getOrCreateUser(clerkId)` (a get-or-create sync against the DB, with a Clerk API round trip on first ever visit).
3. All data access is scoped through `lib/access.ts`, which resolves one of `owner`, `editor`, `viewer`.

Socket flow:
1. On connect the client presents its Clerk session token.
2. The server verifies it through the Clerk Backend API, resolves the internal user, and checks document access **before** admitting the socket to that document's room.
3. Events: join, operation submit, presence (cursor/selection), graph update, leave.

---

## 6. Data model

| Entity | What it holds |
|---|---|
| `User` | Clerk identity mirrored locally (clerkId, email, name). Created lazily |
| `Folder` | Self-referential tree (`parentId`) for arbitrary depth |
| `Document` | Owner, optional folder, TipTap JSON content, plain-text projection, visibility, `syncEngine` (`ot` or `crdt`), `kgEnabled` (knowledge-graph extraction on/off), `logBaseText` snapshot |
| `DocumentShare` | Grants a non-owner a role: `editor` or `viewer` |
| `DocumentOperation` | The durable operation log: docId + version + op JSON + author, unique per (document, version) |
| `Concept` | Knowledge-graph node: label + type (`Concept`, `Project`, `Person`, `Document`, `Methodology`) |
| `DocumentConcept` | Join row: which concepts a document mentions, with frequency |
| `ConceptEdge` | Directed relation between concepts (relation label + strength) |

`Document.logBaseText` plus `DocumentOperation` is the key durability idea: **any version K = logBaseText + ops 1..K**, so version history, the audit feed, and cold-start recovery all come from the same log.

---

## 7. Sync engine 1: Operational Transformation (`lib/ot/`)

**Operation model.** An operation is a list of components: `retain(n)`, `insert(s)`, `delete(n)`. An operation must consume exactly the document it is applied to (`baseLength(op) === doc.length`), otherwise it is rejected. That invariant is what makes randomized testing possible.

**Transform.** `transform(a, b, insertFirst)` returns `a'`, the operation equivalent to `a` when applied after `b`. Candidates (concurrent inserts at the same position) are ordered by the `insertFirst` flag, and the mirror call uses the opposite flag, so both application orders reach the same text:

```
apply(transform(a,b,true),  apply(b, D)) === apply(transform(b,a,false), apply(a, D))
```

**Server-authoritative sequencing.** The server keeps per document: current text, a monotonically increasing version, and a bounded history tail (500 ops; the full record is in Postgres). Arriving operations carry `baseVersion`; the server transforms them against everything newer, applies, increments the version, and broadcasts. Clients keep pending local ops and rebase them against incoming remote ops using the same transform.

**Durable log.** Every applied op is written in the same transaction that persists the text. Logging is fire-and-forget relative to the transform hot path, and a restarted server rebuilds document state by replaying the log tail.

---

## 8. Sync engine 2: Logoot CRDT (`lib/crdt/logoot.ts`)

**Identifiers.** Each character (and each tombstone) carries a positional identifier: an array of base-16 digits plus an originating site ID. Identifiers are totally ordered lexicographically, with the site ID breaking ties, so concurrent inserts at the same gap get a deterministic order.

**Allocation.** Inserting at position `i` generates an identifier strictly between the identifiers at `i-1` and `i`, handling four cases:
1. **Diverging digits** - the neighbours differ with a gap of at least 2: pick a digit between them.
2. **Consecutive digits** - the gap is exactly 1: descend into the left neighbour's tail and increment the first digit below 15 (never emitting 0).
3. **Left is a prefix of right** - extend the left identifier with a digit below the right neighbour's digit.
4. **No left neighbour** - use the reserved digit 0, which guarantees unbounded room below.

Generated digits are always 2..15 and 0 is reserved for case 4, so there is always room to allocate between any two identifiers.

**Relay, not transform.** In CRDT mode the server does not transform anything: it applies the operation locally (for validation and the audit log) and relays it. Convergence comes from the identifier total order, which is why this mode tolerates reordering and duplication without client-side rebasing.

**Switching engines.** The owner switches per document from the Share dialog. The server drops its cached state, clients re-join, and the editor shows the active engine as a badge.

---

## 9. The live knowledge graph (`lib/kg.ts`)

1. **Trigger: document close.** The 4-second idle timer after the last operation only refreshes the semantic-search embedding (no LLM). Extraction runs when the **last participant leaves the document room** - checked against the real socket.io room size, so having two tabs open does not fire it early. It is owner-controlled per document through `kgEnabled` (a switch in the Share dialog); when off, nothing is extracted.
2. **Incremental extraction.** The prompt carries the *previous* concept list plus the current text, so the model reports only new or changed entities. Output must be strict JSON matching a typed entity-relation schema: nodes with a label and a type, directed edges with a short relation verb.
3. **Bounded writes.** Capped at 8 nodes and 12 edges per document, validated before writing, then upserted in one Prisma transaction keyed by normalized entity name so re-extraction merges rather than duplicates. Folder co-membership adds weak dashed document-to-document edges.
4. **Broadcast.** After extraction the server emits `graph:update`; the graph page re-renders with an 800 ms debounce - no reload.
5. **Visualization.** `react-force-graph-2d` (2D-only package; the umbrella package drags in A-Frame/three and breaks SSR), node colour by entity type, node size by degree, labelled directed links, filter box, click-to-inspect. Data comes from `/api/knowledge-graph` as `{nodes, links}`.

---

## 10. Supporting systems

**Semantic search.** Documents are embedded with Gemini `text-embedding-004` (768 dims) in the 4-second idle window after the last operation, stored as JSON arrays, compared with cosine similarity computed in TypeScript. No pgvector dependency, linear scan, fine for corpora up to roughly 10k documents. It is used as a fallback when title search finds nothing.

**Offline editing.** While the socket is down, edits apply locally and are counted (an "unsynced" badge). The text is persisted in IndexedDB so a reload restores it. On every (re)join, the editor diffs the server's SYNC text against its own and ships the difference as one ordinary operation, so convergence reuses the normal transform path instead of a separate merge protocol. The offline snapshot is cleared only after the server accepts the delta. In CRDT mode, ops queue in memory and flush on join (order independent).

**Import.** `.docx` via mammoth, `.html` sanitized with DOMPurify, `.txt` read directly. Sanitization is a real defence: imported content is untrusted.

**Sharing and visibility.** Three tiers: private (owner only), shared (invited collaborators with editor/viewer roles), public (any signed-in user can view). Flipping a document to public requires a styled confirmation modal because it changes who can read it. `lib/access.ts` is the single gate enforced by pages, server actions, and the socket layer.

**AI study tools.** Summaries, flashcards, and quizzes generated from the document through the same provider stack (Groq, Gemini fallback), plus an inline "/" slash menu in the editor for AI continuation and structural insertions.

---

## 11. Tests and what they actually prove

`npm test` runs 22 tests across 3 suites. All randomized tests use a deterministic PRNG (mulberry32) so any failure is reproducible from its seed.

| Suite | What it proves |
|---|---|
| `lib/ot/engine.test.ts` (15) | `apply` correctness, classic transform cases (same-position inserts, insert vs delete, overlapping deletes), and the randomized convergence property: **8 seeds x 50 trials = 400 concurrent op pairs**, all converging under both transform orders |
| `lib/ot/replay.test.ts` (2) | A **200-op log replays** to exactly the final text, and any suffix replays onto its recorded starting length |
| `lib/crdt/logoot.test.ts` (5) | Two-site and three-site convergence **at every one of 200 rounds**, four-site same-gap contention with no character loss, and a 120-round delete-heavy scenario |

These are property tests over the real implementation, not benchmarks. There is no held-out comparison against Yjs/ShareDB and no user study - the paper states that limitation explicitly.

---

## 12. Deployment (AWS, live)

**Live URL:** https://synapse.kevin-daniel.tech (HTTP redirects to HTTPS)

| Piece | Value |
|---|---|
| Region / account | `us-east-1` / `761595200926` |
| Registry | `761595200926.dkr.ecr.us-east-1.amazonaws.com/synapse:latest` |
| ECS | cluster `synapse`, service `synapse-service` (Fargate, 0.5 vCPU / 1 GB, **desired count 1**), task definition `synapse-task` |
| Load balancer | `synapse-alb-614927843.us-east-1.elb.amazonaws.com`, target group `synapse-tg` (HTTP 3000, health check `/`), listeners: 80 -> 301 redirect, 443 -> forward |
| TLS | ACM certificate for `synapse.kevin-daniel.tech` (DNS validated) |
| Database | RDS `synapse-db.c81gec0ogvzs.us-east-1.rds.amazonaws.com`, Postgres 16, `db.t3.micro`, private, DB name `synapse` |
| Security groups | `synapse-alb-sg` (80/443 public) -> `synapse-app-sg` (3000 from ALB) -> `synapse-db-sg` (5432 from app) |
| Secrets | `synapse/DATABASE_URL`, `synapse/CLERK_SECRET_KEY`, `synapse/GROQ_API_KEY`, `synapse/GOOGLE_GENERATIVE_AI_API_KEY` |
| IAM | `synapseEcsTaskExecutionRole` (ECS task execution + Secrets Manager read) |
| Logs | CloudWatch `/ecs/synapse` |
| DNS | Cloudflare (zone `kevin-daniel.tech`): `synapse` -> ALB CNAME, plus Clerk's `clerk` / `accounts` / email records. Keep them **DNS-only (grey cloud)** - Cloudflare's proxy breaks the ALB certificate and WebSocket upgrade |
| Clerk | Production instance on the apex `kevin-daniel.tech`: frontend API `clerk.kevin-daniel.tech`, portal `accounts.kevin-daniel.tech`. Google sign-in uses your own OAuth client with redirect URI `https://clerk.kevin-daniel.tech/v1/oauth_callback` |

**One command to ship a change** (from Windows PowerShell, Docker Desktop running):

```powershell
Set-Location '\\wsl.localhost\Ubuntu\home\kevindaniel\resume\synapse'
Set-ExecutionPolicy -Scope Process Bypass     # once per session
.\scripts\deploy.ps1
```

It runs typecheck -> tests -> lint (advisory) -> docker build (baking the live Clerk publishable key) -> ECR push -> `prisma migrate deploy` as a one-off ECS task -> forced ECS rollout -> waits for stability -> verifies HTTPS returns 200. Flags: `-SkipChecks`, `-SkipMigrations`, `-PublishableKey pk_live_...`.

**Migrations** must come from inside the VPC (RDS is private), which is why they run as a one-off ECS task rather than from your machine.

---

## 13. Operations

**Logs:**
```powershell
aws logs tail /ecs/synapse --since 15m --region us-east-1     # may need get-log-events on Windows
```
Server boot logs `> Synapse ready on http://localhost:3000 (prod)`.

**Health:** the ALB health check hits `/` and expects 200; the deploy script polls the public URL for the same.

**Pause / resume cheaply:** `aws ecs update-service --cluster synapse --service synapse-service --desired-count 0` (keeps RDS and data, stops the compute bill). Set it back to 1 to resume.

**Full teardown:** delete the service (`--force`), delete the RDS instance (`--skip-final-snapshot` if you don't care), delete the ALB + target group, delete the ECR repo, delete the secrets, and remove the security groups. Also remember the Cloudflare records and the Clerk instance.

**Cost:** roughly $60/month running 24/7 (ALB ~$18, Fargate ~$32, RDS ~$16). Pausing the service drops most of it.

---

## 14. Traps already hit (read before debugging)

1. **Node 18 crashes the server** (`features.toSorted is not a function`). Use Node 20 or 22; the AI SDK packages require >= 22.
2. **`npm ci` fails after a dependency change** - the lock file must be regenerated with `env -u NODE_ENV npm install`. Setting `NODE_ENV=production` during install strips devDeps (`tsx`, `prisma`, `typescript`) and breaks the build and runtime.
3. **Prisma needs OpenSSL in slim images** (`libssl.so.1.1` missing) - install `openssl` in both Docker stages.
4. **`tsx server.ts` needs `tsconfig.json` in the runtime image**, otherwise the `@/...` path alias fails at startup with `Cannot find module '@/lib/prisma'`.
5. **`NEXT_PUBLIC_*` values are baked at build time.** Changing the Clerk key or an API URL means rebuild + push + forced redeploy, not a restart.
6. **Secrets are read when a container starts.** After updating a secret in Secrets Manager, force a new deployment or the running task keeps the old value.
7. **The dev server does not hot-reload itself** (`tsx server.ts`). After editing `server.ts`, running a migration, or restructuring routes, restart `npm run dev`. Symptoms of a stale server: Prisma "Unknown argument" errors for fields that exist, 500s, or a 404 on a route that clearly exists.
8. **Never scale beyond one task** without a Redis adapter - rooms, document buffers, and history tails live in memory on that one process.
9. **Windows/WSL friction:** Docker and the AWS CLI live on the Windows side (run docker from PowerShell, not WSL); PowerShell cannot hold a UNC working directory, so `Set-Location` into the repo; `;` is not a command separator in `cmd`; inline JSON passed to `aws` gets its quotes stripped by PowerShell 5.1 - pass `file://path.json` instead.
10. **Cloudflare:** the ALB CNAME and Clerk's records must be DNS-only. The orange-cloud proxy terminates TLS itself and breaks both the certificate and the WebSocket upgrade, and its bot challenge adds latency to sign-in.
11. **"Failed to find Server Action" after a deploy:** Next regenerates Server Action ids on every build, so a browser tab left open across a redeploy calls stale ids and the page shows the generic "An error occurred in the Server Components render" message. Hard-refresh (Ctrl+Shift+R) fixes it; real visitors always load fresh ids. This is expected during rapid redeploys, not an application bug.

---

## 15. Known limitations (honest list)

- **Rich-text formatting is single-user.** OT and the CRDT operate on plain text. Bold/colour/font changes are not transformed; concurrent formatting is out of scope.
- **Logoot positional intent.** Concurrent inserts in the same gap are deterministically ordered, but that order may not match either user's cursor intent. LSEQ/RGA-style allocation fixes this; it is future work.
- **Single-node coordinator.** In-memory rooms mean no horizontal scaling. Redis pub/sub is the documented path.
- **Embeddings are JSON arrays**, not pgvector, so search is a linear scan. Fine to ~10k documents.
- **LLM extraction quality is not benchmarked.** The pipeline is verified as a system property (schema compliance, upsert idempotence, broadcast), not on NLP metrics.
- **Graph extraction is close-time, not continuous.** Concepts appear after the last participant leaves a document, so a graph lags an editing session by design (and the owner can disable extraction per document). The IEEE paper's pipeline section still describes the earlier live-quiescence design and needs updating before submission.
- **No offline conflict stress tests** beyond the reconcile-on-join diff, and no multi-user load testing.
- **Lint debt:** `npm run lint` currently reports pre-existing errors (mostly `react-hooks/refs` in `lib/ot/use-collab-socket.ts` and `no-explicit-any` in `server.ts`). The deploy script treats lint as advisory.

---

## 16. Related artifacts

- `paper/` (gitignored, kept private) - the IEEE-format paper: LaTeX source, verified 50-reference bibliography (Crossref-fetched), Word exports, reference PDFs, and the compliance checker. Rebuild with `bash scripts/build-paper.sh`.
- `AGENTS.md` - the short project-memory file used by the coding assistant (stack, ground rules, deployment constraints).
- `README.md` - the public-facing pitch and quickstart.

---

## 17. Recent changes

**2026-10-23**

- Knowledge graph is per-document and opt-out (`Document.kgEnabled`, owner switch in the Share dialog under Document settings). Extraction moved from the 4-second idle timer to **document close** (last participant leaves); the idle window now only refreshes the search embedding.
- The editor's back arrow returns to the containing folder (`/dashboard?folder=...`) instead of the dashboard root.
- Presence no longer renders your own account twice: presence entries carry the Clerk id and the client filters self by it (the server tags entries with the internal user id, which never matched).
- "New document" wired into the folder toolbar (the component existed but was never mounted).
- Loading feedback: route boundaries for `/dashboard` and `/graph` and for the editor, a Clerk loader on sign-in/sign-up, and no duplicate logo on the Clerk card.
- Five note templates in the dashboard gallery (meeting notes, class notes, project plan, research notes, daily journal). Each tile creates a real document seeded with a structured TipTap skeleton and its plain-text projection (`lib/templates.ts`, `createDocumentFromTemplate`).

**In progress**

- Landing-page visual pass in a dark editorial direction (numbered sections, monospace meta labels, layer cards).
- Silent demo video on the landing page (recorded with the browser agent, wired as a muted autoplay loop).
