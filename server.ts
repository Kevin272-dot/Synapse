/**
 * Synapse custom server: Next.js + Socket.IO on one HTTP server.
 *
 * The Socket.IO layer is the real-time OT coordinator. For each document it
 * keeps an authoritative plain-text buffer and a versioned history of ops.
 * Incoming ops are transformed against any ops the sender hasn't seen, then
 * applied, versioned, broadcast, and debounce-persisted to Postgres.
 */
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import { PrismaClient } from "@prisma/client";
import { verifyToken } from "@clerk/backend";
import {
  apply,
  transform,
  fromJSON,
  toJSON,
  type Operation,
} from "./lib/ot/engine";
import { EVENTS, type JoinPayload } from "./lib/ot/protocol";

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT || 3000);
const app = next({ dev });
const handle = app.getRequestHandler();

const prisma = new PrismaClient();

/** In-memory authoritative state for a live document. */
interface DocState {
  docId: string;
  text: string;
  version: number;
  /**
   * Tail cache of the durable op log. history[i] moves the doc from
   * version (historyStart + i) to (historyStart + i + 1).
   * The full record lives in the DocumentOperation table.
   */
  history: Operation[];
  historyStart: number;
  saveTimer: ReturnType<typeof setTimeout> | null;
}

const docs = new Map<string, DocState>();

/** Absolute-version lookup into the tail cache. */
function historyOp(state: DocState, v: number): Operation | undefined {
  const idx = v - state.historyStart;
  if (idx < 0 || idx >= state.history.length) return undefined;
  return state.history[idx];
}

const HISTORY_MEMORY_LIMIT = 500;

async function getDocState(docId: string): Promise<DocState> {
  let state = docs.get(docId);
  if (state) return state;

  // Cold start: recover text + version from the durable log so a server
  // restart never loses the collaboration position.
  const [doc, opRows] = await Promise.all([
    prisma.document.findUnique({
      where: { id: docId },
      select: { text: true },
    }),
    prisma.documentOperation.findMany({
      where: { documentId: docId },
      orderBy: { version: "desc" },
      take: HISTORY_MEMORY_LIMIT,
      select: { version: true, op: true },
    }),
  ]);

  const tail = opRows.slice().reverse(); // ascending by version
  const version = tail.length > 0 ? tail[tail.length - 1].version : 0;
  const historyStart = tail.length > 0 ? tail[0].version - 1 : 0;

  state = {
    docId,
    text: doc?.text ?? "",
    version,
    history: tail.map((r) => fromJSON(r.op)),
    historyStart,
    saveTimer: null,
  };
  docs.set(docId, state);
  return state;
}

/**
 * Durably log one applied operation together with the resulting text.
 * The very first logged op also snapshots the version-0 text (logBaseText),
 * which makes every later version reconstructible by replay.
 * Fire-and-forget: logging must never block the OT hot path.
 */
function persistOperation(
  state: DocState,
  op: Operation,
  author: { userId: string; name: string },
  textBefore: string
) {
  const isFirst = state.version === 1;
  void prisma
    .$transaction([
      prisma.documentOperation.create({
        data: {
          documentId: state.docId,
          version: state.version,
          op: toJSON(op) as unknown as object,
          authorUserId: author.userId,
          authorName: author.name,
        },
      }),
      prisma.document.update({
        where: { id: state.docId },
        data: {
          text: state.text,
          // Snapshot the version-0 text once, when the log begins.
          ...(isFirst ? { logBaseText: textBefore } : {}),
        },
      }),
    ])
    .catch((e) => console.error("[collab] operation log write failed", e));
}

/** Keep the tail cache bounded; the DB holds the full log. */
function boundHistory(state: DocState) {
  if (state.history.length > HISTORY_MEMORY_LIMIT) {
    const drop = state.history.length - HISTORY_MEMORY_LIMIT;
    state.history.splice(0, drop);
    state.historyStart += drop;
  }
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));
  const io = new Server(httpServer, {
    path: "/api/socket",
    addTrailingSlash: false,
    cors: { origin: "*" },
  });

  /** Track presence per room. */
  const presenceByRoom = new Map<string, Map<string, any>>();

  io.on("connection", (socket) => {
    let currentDoc: string | null = null;
    let myPresence: any = null;
    let myRole: string | null = null;

    socket.on(EVENTS.JOIN, async (payload: JoinPayload) => {
      const { docId, token } = payload;
      if (!docId || !token) {
        socket.emit(EVENTS.ERROR, { reason: "missing credentials" });
        return;
      }

      // 1) Verify the Clerk session token. Identity is derived server-side;
      //    the client cannot claim to be someone else.
      let clerkUserId: string;
      try {
        const claims = await verifyToken(token, {
          secretKey: process.env.CLERK_SECRET_KEY ?? "",
        });
        clerkUserId = claims.sub;
      } catch {
        socket.emit(EVENTS.ERROR, { reason: "invalid session" });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { clerkId: clerkUserId },
      });
      if (!user) {
        socket.emit(EVENTS.ERROR, { reason: "unknown user" });
        return;
      }

      // 2) Access check: owner > share role > public (any signed-in viewer).
      const doc = await prisma.document.findUnique({
        where: { id: docId },
        select: { ownerId: true, visibility: true },
      });
      if (!doc) {
        socket.emit(EVENTS.ERROR, { reason: "document not found" });
        return;
      }

      let role: string | null =
        doc.ownerId === user.id ? "owner" : null;
      if (!role) {
        const share = await prisma.documentShare.findUnique({
          where: {
            documentId_userId: { documentId: docId, userId: user.id },
          },
          select: { role: true },
        });
        role = share?.role ?? null;
      }
      if (!role && doc.visibility === "public") {
        // Public docs: any signed-in user may watch, not edit.
        role = "viewer";
      }
      if (!role) {
        socket.emit(EVENTS.ERROR, { reason: "access denied" });
        return;
      }
      myRole = role;

      // Leave any previous room.
      if (currentDoc) {
        socket.leave(`doc:${currentDoc}`);
        prunePresence(currentDoc);
      }
      currentDoc = docId;
      socket.join(`doc:${docId}`);

      const state = await getDocState(docId);
      const presence = presenceByRoom.get(docId) ?? new Map();
      presenceByRoom.set(docId, presence);

      // Keep a stable slot per user across reconnects.
      const existing = presence.get(user.id);
      myPresence = {
        clientId: existing?.clientId ?? socket.id,
        userId: user.id,
        name: user.name,
        cursor: existing?.cursor ?? null,
        selection: existing?.selection ?? null,
        lastSeen: Date.now(),
      };
      presence.set(user.id, myPresence);

      socket.emit(EVENTS.SYNC, {
        docId,
        text: state.text,
        version: state.version,
        presence: [...presence.values()],
      });

      // Tell others someone joined.
      io.to(`doc:${docId}`).emit(EVENTS.PRESENCE_UPDATE, {
        docId,
        presence: [...presence.values()],
      });
    });

    socket.on(
      EVENTS.OPERATION,
      async (payload: {
        docId: string;
        baseVersion: number;
        op: Operation;
        clientOpId?: string;
      }) => {
        if (!currentDoc || currentDoc !== payload.docId) return;
        // Viewers may watch but not edit.
        if (myRole === "viewer") return;
        const { docId, baseVersion, op } = payload;
        const state = await getDocState(docId);

        // Reject ops based on a version we no longer have in the tail cache.
        if (
          baseVersion < 0 ||
          baseVersion > state.version ||
          baseVersion < state.historyStart
        ) {
          socket.emit(EVENTS.ERROR, { reason: "version too old, reload the document" });
          return;
        }

        // Transform the incoming op against every op it hasn't seen yet.
        // rebase(op, seen) = transform(op, seen): how op changes when it's
        // applied AFTER seen. The "first" flag orders same-spot inserts;
        // false = the op we're rebasing goes after the already-applied one.
        let transformed: Operation = op;
        for (let v = baseVersion; v < state.version; v++) {
          const seen = historyOp(state, v);
          if (!seen) break;
          transformed = transform(transformed, seen, false);
        }

        // Apply to authoritative text (capture pre-image for logBaseText).
        const textBefore = state.text;
        state.text = apply(transformed, state.text);
        state.history.push(transformed);
        state.version += 1;
        boundHistory(state);

        // Durably log the op + resulting text (fire-and-forget).
        persistOperation(
          state,
          transformed,
          {
            userId: myPresence?.userId ?? "unknown",
            name: myPresence?.name ?? "Unknown",
          },
          textBefore
        );

        // Broadcast to everyone (including sender) with the transformed op.
        io.to(`doc:${docId}`).emit(EVENTS.APPLIED, {
          docId,
          op: transformed,
          version: state.version,
          clientId: myPresence?.clientId ?? socket.id,
          originalOpId: payload.clientOpId,
          cursor: myPresence?.cursor ?? null,
          selection: myPresence?.selection ?? null,
        });
      }
    );

    socket.on(
      EVENTS.PRESENCE,
      (payload: { docId: string; cursor?: number | null; selection?: any }) => {
        if (!currentDoc || currentDoc !== payload.docId) return;
        const room = presenceByRoom.get(payload.docId);
        if (!room) return;
        const entry = room.get(myPresence?.clientId);
        if (!entry) return;
        entry.cursor = payload.cursor ?? null;
        entry.selection = payload.selection ?? null;
        entry.lastSeen = Date.now();

        socket.to(`doc:${payload.docId}`).emit(EVENTS.PRESENCE_UPDATE, {
          docId: payload.docId,
          presence: [...room.values()],
        });
      }
    );

    socket.on(EVENTS.LEAVE, () => {
      if (currentDoc) {
        socket.leave(`doc:${currentDoc}`);
        prunePresence(currentDoc);
        currentDoc = null;
      }
    });

    socket.on("disconnect", () => {
      if (currentDoc) {
        prunePresence(currentDoc);
        currentDoc = null;
      }
    });

    function prunePresence(docId: string) {
      const room = presenceByRoom.get(docId);
      if (!room || !myPresence) return;
      room.delete(myPresence.userId);
      if (room.size === 0) presenceByRoom.delete(docId);
      else {
        io.to(`doc:${docId}`).emit(EVENTS.PRESENCE_UPDATE, {
          docId,
          presence: [...room.values()],
        });
      }
    }
  });

  httpServer.listen(port, () => {
    console.log(`> Synapse ready on http://localhost:${port} (${dev ? "dev" : "prod"})`);
  });
});
