/**
 * Operational Transformation engine (plain-text).
 *
 * An operation is a list of components:
 *   { retain: n }  skip n chars
 *   { insert: s }  insert string s
 *   { delete: n }  delete n chars
 *
 * apply(op, doc) walks the doc left to right consuming exactly its length.
 */

export type OpComponent =
  | { retain: number }
  | { insert: string }
  | { delete: number };

export type Operation = OpComponent[];

/** An operation a client sends, tagged with metadata. */
export interface ClientOperation {
  /** Revision of the doc this op was based on. */
  baseVersion: number;
  op: Operation;
  /** Sender id, deterministic tie-breaker in transform. */
  clientId: string;
  /** Optional selection after applying, for live cursors. */
  cursor?: number | null;
  selection?: { from: number; to: number } | null;
}

export const EMPTY: Operation = [];

export function isNoop(op: Operation): boolean {
  return op.length === 0;
}

export function toJSON(op: Operation) {
  return op.map((c) => {
    if ("retain" in c) return { retain: c.retain };
    if ("insert" in c) return { insert: c.insert };
    return { delete: c.delete };
  });
}

export function fromJSON(json: unknown): Operation {
  if (!Array.isArray(json)) return EMPTY;
  const out: Operation = [];
  for (const item of json) {
    if (typeof item === "object" && item !== null) {
      const c = item as Record<string, unknown>;
      if (typeof c.retain === "number") out.push({ retain: c.retain });
      else if (typeof c.insert === "string") out.push({ insert: c.insert });
      else if (typeof c.delete === "number") out.push({ delete: c.delete });
    }
  }
  return out;
}

/** Merges adjacent like components and drops zero-length ones. */
export function normalize(op: Operation): Operation {
  const out: Operation = [];
  for (const c of op) {
    const last = out[out.length - 1];
    if (!last) {
      out.push({ ...c });
      continue;
    }
    if ("retain" in c && "retain" in last) last.retain += c.retain;
    else if ("delete" in c && "delete" in last) last.delete += c.delete;
    else if ("insert" in c && "insert" in last) last.insert += c.insert;
    else out.push({ ...c });
  }
  return out.filter((c) =>
    "retain" in c
      ? c.retain > 0
      : "delete" in c
        ? c.delete > 0
        : c.insert.length > 0
  );
}

/** Chars this op consumes from the original doc. */
export function baseLength(op: Operation): number {
  return op.reduce(
    (sum, c) => sum + ("retain" in c ? c.retain : "delete" in c ? c.delete : 0),
    0
  );
}

/** Chars this op produces in the target doc. */
export function targetLength(op: Operation): number {
  return op.reduce(
    (sum, c) => sum + ("retain" in c ? c.retain : "insert" in c ? c.insert.length : 0),
    0
  );
}

/** Applies an operation to a plain-text doc, returning the new doc. */
export function apply(op: Operation, doc: string): string {
  let out = "";
  let i = 0;
  for (const c of op) {
    if ("retain" in c) {
      if (i + c.retain > doc.length) throw new Error("retain exceeds document");
      out += doc.slice(i, i + c.retain);
      i += c.retain;
    } else if ("insert" in c) {
      out += c.insert;
    } else {
      if (i + c.delete > doc.length) throw new Error("delete exceeds document");
      i += c.delete;
    }
  }
  if (i !== doc.length) throw new Error(`op consumed ${i} of ${doc.length} chars`);
  return out;
}

/**
 * Transforms op `a` against op `b` (both based on the same doc), returning
 * the op equivalent to `a` but valid to apply AFTER `b`.
 *
 * Rules (a' is the result, applied after b):
 *  - a inserts text           -> a' inserts it
 *  - b inserts text           -> a' RETAINS it (it exists once b is applied)
 *  - both insert at same spot -> deterministic order by `insertFirst`
 *  - a deletes, b retains     -> a' deletes that text
 *  - a retains, b deletes     -> a' drops it (b already removed it)
 *  - both delete              -> a' drops it
 */
export function transform(
  a: Operation,
  b: Operation,
  insertFirst: boolean = false
): Operation {
  const A = normalize(a);
  const B = normalize(b);
  const out: Operation = [];
  let ai = 0;
  let bi = 0;
  let aOff = 0; // consumed within A[ai]
  let bOff = 0; // consumed within B[bi]

  function restA(): number {
    const c = A[ai];
    if (!c) return 0;
    if ("insert" in c) return c.insert.length - aOff;
    return ("retain" in c ? c.retain : c.delete) - aOff;
  }
  function restB(): number {
    const c = B[bi];
    if (!c) return 0;
    if ("insert" in c) return c.insert.length - bOff;
    return ("retain" in c ? c.retain : c.delete) - bOff;
  }
  function advanceA() {
    ai++;
    aOff = 0;
  }
  function advanceB() {
    bi++;
    bOff = 0;
  }
  /** Returns the remaining text of A[ai], and advances past it. */
  function takeInsertA(): string {
    const c = A[ai] as { insert: string };
    const s = c.insert.slice(aOff);
    advanceA();
    return s;
  }
  function takeInsertB(): string {
    const c = B[bi] as { insert: string };
    const s = c.insert.slice(bOff);
    advanceB();
    return s;
  }

  while (ai < A.length || bi < B.length) {
    const ca = A[ai];
    const cb = B[bi];
    const aInserting = !!ca && "insert" in ca;
    const bInserting = !!cb && "insert" in cb;

    // -- one (or both) sides are inserting at the current position --
    if (aInserting && bInserting) {
      const sa = takeInsertA();
      const sb = takeInsertB();
      if (insertFirst) {
        out.push({ insert: sa });
        out.push({ retain: sb.length });
      } else {
        out.push({ retain: sb.length });
        out.push({ insert: sa });
      }
      continue;
    }
    if (aInserting) {
      const sa = takeInsertA();
      // Only legal if B has no more non-insert work (equal bases) — but B
      // might still have trailing inserts at this same position (it inserted
      // later in its list). Those must come BEFORE a's insert when !insertFirst.
      // They were already emitted by the loop above when we reached them, so
      // here B can only have retain/delete left — which would mean unequal
      // bases. To stay safe, emit a's insert and let the loop continue.
      out.push({ insert: sa });
      continue;
    }
    if (bInserting) {
      const sb = takeInsertB();
      out.push({ retain: sb.length });
      continue;
    }

    // -- both sides must have a component here. If one side is exhausted,
    // the other can only have trailing INSERTS (equal bases), which the
    // insert branches above already handled. A retain/delete on one side
    // with the other exhausted would mean unequal base lengths (invalid).
    if (!ca || !cb) {
      throw new Error(
        "transform: unequal base lengths (one op exhausted with retain/delete remaining)"
      );
    }
    const da = "delete" in ca;
    const db = "delete" in cb;
    const la = restA();
    const lb = restB();
    const n = Math.min(la, lb);

    if (!da && !db) {
      // retain / retain
      out.push({ retain: n });
    } else if (da && db) {
      // delete / delete: overlapping removal, nothing survives
    } else if (!da && db) {
      // a retains, b deletes -> a' skips the deleted text (nothing to keep)
    } else {
      // a deletes, b retains -> a' must still delete it
      out.push({ delete: n });
    }

    aOff += n;
    bOff += n;
    if (restA() === 0) advanceA();
    if (restB() === 0) advanceB();
  }

  return normalize(out);
}
