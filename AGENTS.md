# Synapse — Project Memory

## What this is

A real-time collaborative document editor (Google-Docs-like), built as a personal/resume project. Real-time editing is powered by a **custom Operational Transformation (OT) engine written from scratch** (plain-text OT; rich-text formatting is single-user for now).

## Stack

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4
- Prisma + PostgreSQL
- Clerk (Google OAuth) for auth — **no custom password auth**
- TipTap editor (rich text)
- Socket.IO on a **custom Node server** (`server.ts`) — OT coordinator
- AI features via **Groq** — `@ai-sdk/groq`, key `GROQ_API_KEY` (models like `llama-3.3-70b-versatile`), with **Google Gemini** (`@ai-sdk/google`, `GOOGLE_GENERATIVE_AI_API_KEY`) as automatic fallback
- Plain-text OT engine in `lib/ot/` (op types, apply, transform); Vitest property tests prove convergence
- Every applied OT op is durably logged (`DocumentOperation` table: doc + version + op + author) — the foundation for version history, the audit feed, and offline replay. Server cold-starts by replaying the log tail. `Document.logBaseText` snapshots the version-0 text so any version is reconstructible by replay (logBaseText ⊕ ops 1..K). Restore is expressed as an ordinary OT op diffed client-side.

## Deployment target: AWS

- Runs a **custom long-lived Node server** (`tsx server.ts`) → deploy to **ECS / EC2 / App Runner**. NOT serverless Lambda (Socket.IO needs a persistent process).
- Postgres on **RDS** (or similar managed Postgres). `DATABASE_URL` points there.
- Secrets (`GROQ_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, Clerk keys, DB url) live in **AWS Secrets Manager / ECS env**, never committed. `.env` is gitignored for local dev.
- Dev command is `npm run dev` = `tsx server.ts` (Next + Socket.IO on one port).

## Ground rules for this project

- Teach before code: explain concepts (OT, WebSockets, JWT, Prisma) in plain language before implementing; walk through code after.
- One feature at a time, per agreed build order; ask on genuine design forks.
- UI: **near-monochrome slate/charcoal + white**, no emojis anywhere, lucide-react icons only. Google-Docs-like structure for the editor (gray canvas + white page).
- Ownership checks on every DB mutation (scope by `ownerId`).
- `NODE_ENV=production` is set in dev shells here — unset it (`env -u NODE_ENV`) before `npm install` or devDeps get stripped. npm may need `--legacy-peer-deps` on this machine.
