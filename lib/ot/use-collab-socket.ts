"use client";

/**
 * useCollabSocket: manages the Socket.IO connection for one document and
 * exposes the client-side OT state machine (pending ops + rebase).
 *
 * The tricky part: the user's own edits apply locally instantly and are
 * queued. When a remote op (or an ack of our own) arrives, any queued op
 * that was based on an older version must be REBASED against the incoming
 * op so its positions stay correct.
 *
 * Offline editing: edits made while the socket is down are applied locally
 * as usual and reflected in the editor text. Internally they are counted
 * and the edited text is persisted in IndexedDB (see lib/offline-queue)
 * so a tab crash or reload doesn't lose them. On every (re)JOIN the server
 * sends SYNC with its current text; the editor then reconciles by diffing
 * server text against ITS OWN text and shipping the delta as one ordinary
 * op through the normal pipeline — so offline changes sync with the exact
 * same convergence machinery as live edits.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { transform, type Operation } from "@/lib/ot/engine";
import type { CrdtOp } from "@/lib/crdt/logoot";
import { EVENTS } from "@/lib/ot/protocol";
import {
  saveOfflineSnapshot,
  loadOfflineSnapshot,
} from "@/lib/offline-queue";

export interface CollabPeer {
  clientId: string;
  userId: string;
  /** Clerk id of the peer. Used to exclude your own presence entry. */
  clerkId?: string;
  name: string;
  cursor?: number | null;
  selection?: { from: number; to: number } | null;
}

export interface CollabState {
  /** Authoritative server text at sync time. */
  text: string;
  /** Last version we've seen from the server. */
  version: number;
  /** Ops we've sent but not yet confirmed, in send order. */
  pending: { id: string; baseVersion: number; op: Operation }[];
  /** Presence of other users. */
  peers: CollabPeer[];
}

/**
 * Handlers the editor provides.
 * onRemoteText: called with transformed remote text to apply to the editor.
 */
export function useCollabSocket({
  docId,
  userId,
  name,
  enabled,
  getToken,
  onRemote,
  onRemoteCrdt,
  onServerText,
}: {
  docId: string;
  userId: string;
  name: string;
  enabled: boolean;
  /** Returns a Clerk session token; the server verifies it on join. */
  getToken: () => Promise<string | null>;
  onRemote: (op: Operation, cursor?: number | null) => void;
  /** Called when relayed CRDT ops arrive (crdt-engine documents). */
  onRemoteCrdt?: (ops: CrdtOp[]) => void;
  /** Called on every SYNC with the authoritative server text, so the
   *  editor can reconcile offline edits by diff (OT mode). */
  onServerText?: (serverText: string, engine: "ot" | "crdt") => void;
}) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [denied, setDenied] = useState<string | null>(null);
  const [engine, setEngine] = useState<"ot" | "crdt">("ot");
  const [peers, setPeers] = useState<CollabPeer[]>([]);
  const [queuedCount, setQueuedCount] = useState(0);
  const [offlineSnapshot, setOfflineSnapshot] = useState<string | null>(null);
  const versionRef = useRef(0);
  const pendingRef = useRef<{ id: string; baseVersion: number; op: Operation }[]>([]);
  const opCounter = useRef(0);
  /** CRDT ops queued while disconnected (order-independent; flush on join). */
  const offlineCrdtRef = useRef<CrdtOp[]>([]);

  // Stable refs for the latest text/version so handlers don't go stale.
  const textRef = useRef("");
  const onServerTextRef = useRef(onServerText);
  onServerTextRef.current = onServerText;

  const syncCount = useCallback(() => {
    setQueuedCount(pendingRef.current.length + offlineCrdtRef.current.length);
  }, []);

  // Persisted-snapshot lookup: once per document mount.
  useEffect(() => {
    let alive = true;
    loadOfflineSnapshot(docId).then((snap) => {
      if (alive && snap && snap.text.length > 0) setOfflineSnapshot(snap.text);
    });
    return () => {
      alive = false;
    };
  }, [docId]);

  useEffect(() => {
    if (!enabled) return;
    if (!docId || !userId) return;

    const socket = io({
      path: "/api/socket",
      transports: ["websocket"],
    });
    socketRef.current = socket;

    socket.on("connect", async () => {
      setConnected(true);
      const token = await getToken();
      if (!token) return;
      socket.emit(EVENTS.JOIN, { docId, token });
    });

    socket.on(EVENTS.ERROR, (payload: { reason?: string }) => {
      // Server rejected us (bad session / not the owner).
      console.warn("[collab] denied:", payload?.reason);
      setDenied(payload?.reason ?? "access denied");
      setConnected(false);
      socket.disconnect();
    });

    socket.on(EVENTS.SYNC, (payload: any) => {
      textRef.current = payload.text;
      versionRef.current = payload.version;
      setEngine(payload.engine === "crdt" ? "crdt" : "ot");
      setPeers(
        (payload.presence ?? []).filter(
          (p: CollabPeer) => (p.clerkId ?? p.userId) !== userId
        )
      );
      // SYNC means (re)join. Any still-unacked pending ops are already
      // part of the editor text and will be re-shipped by the editor's
      // diff reconcile below, so their in-flight bookkeeping is stale.
      pendingRef.current = [];
      syncCount();

      // CRDT mode: replay any ops queued while we were offline. CRDT ops
      // are order-independent, so late delivery still converges.
      if (payload.engine === "crdt" && offlineCrdtRef.current.length > 0) {
        const batch = offlineCrdtRef.current;
        offlineCrdtRef.current = [];
        socket.emit(EVENTS.CRDT_OPS, { docId, ops: batch });
        syncCount();
      }

      // OT mode: the editor reconciles offline edits by diffing the server
      // text against its own (see editor.tsx onServerText).
      onServerTextRef.current?.(payload.text, payload.engine === "crdt" ? "crdt" : "ot");
    });

    socket.on(EVENTS.CRDT_APPLIED, (payload: { ops: CrdtOp[] }) => {
      onRemoteCrdt?.(payload.ops);
    });

    socket.on(
      EVENTS.APPLIED,
      (payload: {
        docId: string;
        op: Operation;
        version: number;
        clientId: string;
        originalOp?: Operation;
        originalOpId?: string;
        cursor?: number | null;
      }) => {
        const isMine =
          payload.originalOpId &&
          pendingRef.current.some((p) => p.id === payload.originalOpId);

        // If this is OUR op, remove it from pending and DON'T re-apply it
        // (we already applied it locally on submit).
        if (isMine) {
          pendingRef.current = pendingRef.current.filter(
            (p) => p.id !== payload.originalOpId
          );
          syncCount();
        }

        versionRef.current = payload.version;

        if (isMine) {
          // Our own op: server may have transformed it. We applied the local
          // version; rebase remaining pending over the CONFIRMED (server)
          // version of our op so positions stay right.
          const pending = pendingRef.current;
          for (const p of pending) {
            p.op = transform(p.op, payload.op, false);
          }
        } else {
          // Remote op (someone else): apply to the editor, then rebase pending.
          onRemote(payload.op, payload.cursor);
          const pending = pendingRef.current;
          for (const p of pending) {
            p.op = transform(p.op, payload.op, false);
          }
        }
      }
    );

    socket.on(EVENTS.PRESENCE_UPDATE, (payload: any) => {
      setPeers(
        (payload.presence ?? []).filter(
          (p: CollabPeer) => (p.clerkId ?? p.userId) !== userId
        )
      );
    });

    socket.on("disconnect", () => setConnected(false));

    return () => {
      socket.emit(EVENTS.LEAVE, { docId });
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, userId, enabled]);

  /** Submit a local op (already applied to the editor) to the server.
   *  `afterText` lets the offline queue persist the edited text when we
   *  are disconnected. */
  const submitOp = useCallback(
    (op: Operation, cursor?: number | null, afterText?: string) => {
      const socket = socketRef.current;
      if (!socket || !connected) {
        // Offline: apply-only (the editor already applied it); count the
        // change and persist the resulting text so a reload can restore.
        setQueuedCount((c) => c + 1);
        if (afterText && afterText.length <= 200_000) {
          void saveOfflineSnapshot(docId, afterText);
        }
        return;
      }
      const id = `op-${++opCounter.current}`;
      const baseVersion = versionRef.current;
      pendingRef.current.push({ id, baseVersion, op });
      syncCount();
      // Send over the version we *know* the server has (baseVersion).
      socket.emit(EVENTS.OPERATION, {
        docId,
        baseVersion,
        op,
        clientOpId: id,
        cursor,
      });
    },
    [docId, connected, syncCount]
  );

  /** Submit Logoot CRDT ops (crdt-engine documents). The server relays
   *  them without transformation; our own echo is ignored via idempotent
   *  applyRemote on the server replica. While offline the ops queue and
   *  replay on the next join. */
  const submitCrdt = useCallback(
    (ops: CrdtOp[], afterText?: string) => {
      const socket = socketRef.current;
      if (!socket || !connected || ops.length === 0) {
        if (ops.length > 0) {
          offlineCrdtRef.current.push(...ops);
          syncCount();
          if (afterText && afterText.length <= 200_000) {
            void saveOfflineSnapshot(docId, afterText);
          }
        }
        return;
      }
      socket.emit(EVENTS.CRDT_OPS, { docId, ops });
    },
    [docId, connected, syncCount]
  );

  const updatePresence = useCallback(
    (cursor?: number | null, selection?: { from: number; to: number } | null) => {
      socketRef.current?.emit(EVENTS.PRESENCE, { docId, cursor, selection });
    },
    [docId]
  );

  /** Called by the editor once a persisted snapshot has been reconciled. */
  const dismissOfflineSnapshot = useCallback(() => {
    setOfflineSnapshot(null);
  }, []);

  return {
    connected,
    denied,
    engine,
    peers,
    queuedCount,
    offlineSnapshot,
    dismissOfflineSnapshot,
    submitOp,
    submitCrdt,
    updatePresence,
  };
}
