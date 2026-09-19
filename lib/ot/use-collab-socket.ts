"use client";

/**
 * useCollabSocket: manages the Socket.IO connection for one document and
 * exposes the client-side OT state machine (pending ops + rebase).
 *
 * The tricky part: the user's own edits apply locally instantly and are
 * queued. When a remote op (or an ack of our own) arrives, any queued op
 * that was based on an older version must be REBASED against the incoming
 * op so its positions stay correct.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { transform, type Operation } from "@/lib/ot/engine";
import { EVENTS } from "@/lib/ot/protocol";

export interface CollabPeer {
  clientId: string;
  userId: string;
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
}: {
  docId: string;
  userId: string;
  name: string;
  enabled: boolean;
  /** Returns a Clerk session token; the server verifies it on join. */
  getToken: () => Promise<string | null>;
  onRemote: (op: Operation, cursor?: number | null) => void;
}) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [denied, setDenied] = useState<string | null>(null);
  const [peers, setPeers] = useState<CollabPeer[]>([]);
  const versionRef = useRef(0);
  const pendingRef = useRef<{ id: string; baseVersion: number; op: Operation }[]>([]);
  const opCounter = useRef(0);

  // Stable refs for the latest text/version so handlers don't go stale.
  const textRef = useRef("");

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
      // Clear pending; server is authoritative and we just joined.
      pendingRef.current = [];
      setPeers(
        (payload.presence ?? []).filter(
          (p: CollabPeer) => p.userId !== userId
        )
      );
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
          (p: CollabPeer) => p.userId !== userId
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

  /** Submit a local op (already applied to the editor) to the server. */
  const submitOp = useCallback(
    (op: Operation, cursor?: number | null) => {
      const socket = socketRef.current;
      if (!socket || !connected) return;
      const id = `op-${++opCounter.current}`;
      const baseVersion = versionRef.current;
      pendingRef.current.push({ id, baseVersion, op });
      // Send over the version we *know* the server has (baseVersion).
      socket.emit(EVENTS.OPERATION, {
        docId,
        baseVersion,
        op,
        clientOpId: id,
        cursor,
      });
    },
    [docId, connected]
  );

  const updatePresence = useCallback(
    (cursor?: number | null, selection?: { from: number; to: number } | null) => {
      socketRef.current?.emit(EVENTS.PRESENCE, { docId, cursor, selection });
    },
    [docId]
  );

  return { connected, denied, peers, submitOp, updatePresence };
}
