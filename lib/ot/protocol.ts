import type { Operation } from "@/lib/ot/engine";

/** Socket.IO event names and payload shapes shared client <-> server. */

export const EVENTS = {
  /** client -> server: join a document room (carries a Clerk session token) */
  JOIN: "doc:join",
  /** server -> client: current doc text + version after joining */
  SYNC: "doc:sync",
  /** client -> server: submit an OT operation */
  OPERATION: "doc:operation",
  /** server -> client: a (transformed) op applied by someone */
  APPLIED: "doc:applied",
  /** server -> client: acknowledgement of a client's own op (with transform) */
  ACK: "doc:ack",
  /** client -> server + broadcast: presence (cursor) */
  PRESENCE: "doc:presence",
  /** server -> client: all current presence in the room */
  PRESENCE_UPDATE: "doc:presence-update",
  /** client -> server: leave document room */
  LEAVE: "doc:leave",
  /** server -> client: this socket is not allowed to access the document */
  ERROR: "doc:error",
} as const;

export interface JoinPayload {
  docId: string;
  /** Clerk session token; the server verifies it and derives identity. */
  token: string;
}

export interface SyncPayload {
  docId: string;
  text: string;
  version: number;
  /** Current presence snapshot so a joiner sees who's here. */
  presence: PresenceEntry[];
}

export interface OperationPayload {
  docId: string;
  baseVersion: number;
  op: Operation;
}

export interface AppliedPayload {
  docId: string;
  /** The op exactly as applied to the server doc (may differ from sender's). */
  op: Operation;
  /** New version after applying. */
  version: number;
  /** Original sender, for presence attribution. */
  clientId: string;
  /** The op the sender submitted (so clients can match acks). */
  originalOp?: Operation;
  /** Sender's cursor/selection, if provided. */
  cursor?: number | null;
  selection?: { from: number; to: number } | null;
}

export interface PresenceEntry {
  clientId: string;
  userId: string;
  name: string;
  cursor?: number | null;
  selection?: { from: number; to: number } | null;
  lastSeen: number;
}

export interface PresencePayload {
  docId: string;
  cursor?: number | null;
  selection?: { from: number; to: number } | null;
}
