/**
 * Logoot-style positional CRDT for plain text.
 *
 * Every visible (and tombstoned) character carries a positional identifier:
 * an array of base-16 digits plus the originating site id, totally ordered.
 * An insertion between neighbors generates an identifier strictly between
 * theirs, so concurrent edits at the same gap converge on every replica
 * WITHOUT a central sequencer. Deletes are tombstones (never removed), so
 * concurrent insert/delete conflicts resolve deterministically.
 *
 * This is the counterpart to the OT engine: no server transformation, no
 * versioning — ops are commutative and applied as they arrive.
 */

export interface CrdtId {
  /** Base-16 digits, lexicographic order (prefix < longer). */
  d: number[];
  /** Origin site — guarantees uniqueness + deterministic tie-break. */
  s: string;
}

export type CrdtOp =
  | { t: "ins"; id: CrdtId; c: string }
  | { t: "del"; id: CrdtId };

export interface CrdtEntry {
  id: CrdtId;
  char: string;
  del: boolean;
}

/** Compare identifiers: digits lexicographically (shorter prefix < longer),
 *  then site id. */
export function compareId(a: CrdtId, b: CrdtId): number {
  const n = Math.min(a.d.length, b.d.length);
  for (let i = 0; i < n; i++) {
    if (a.d[i] !== b.d[i]) return a.d[i] - b.d[i];
  }
  if (a.d.length !== b.d.length) return a.d.length - b.d.length;
  return a.s < b.s ? -1 : a.s > b.s ? 1 : 0;
}

const BASE = 16;

/**
 * Generate an identifier strictly between a and b (a < b).
 *
 * Invariants that make this safe:
 *  - Normal generation never emits digit 0 — it is reserved for the
 *    "consecutive digits" escape, which always has unbounded room beneath
 *    (append more 0s) and always lands strictly between the neighbors.
 *  - Extension of a is always > a (prefix < longer).
 *  - When a and b first differ at digit i with A[i] < B[i], any id sharing
 *    the prefix A[0..i-1] and a digit strictly between stays < b.
 */
export function idBetween(
  a: CrdtId | null,
  b: CrdtId | null,
  site: string,
  counter: number
): CrdtId {
  const A = a?.d ?? [];
  const B = b?.d ?? [];
  const tailDigit = 2 + (counter % 14); // 2..15 — 0 is reserved

  // No left neighbor: escape below any possible right neighbor. The
  // reserved 0 guarantees unbounded room beneath ([1,0,…] < [1,…]).
  if (a === null) {
    return { d: [1, 0, 1 + (counter % 14)], s: site + counter };
  }
  // No right neighbor: extend a (always > a, unbounded above).
  if (b === null) {
    return { d: [...A, 8], s: site + counter };
  }

  // Find first differing digit.
  let i = 0;
  while (i < A.length && i < B.length && A[i] === B[i]) i++;

  if (i === A.length) {
    // a is a prefix of b: extend a with a digit strictly below B[i].
    // Generated B[i] >= 2, so there is always room (1..B[i]-1).
    const d = B[i] >= 2 ? 1 + (counter % (B[i] - 1)) : 0;
    return { d: [...A, d], s: site + counter };
  }
  // (b a prefix of a cannot occur: we assume a < b.)

  // Diverging digits: pick strictly between when there is room.
  if (B[i] - A[i] >= 2) {
    const d = A[i] + 1 + Math.floor((B[i] - A[i] - 1) * ((counter % 8) / 8));
    return { d: [...A.slice(0, i), d], s: site + counter };
  }

  // Consecutive digits (B[i] = A[i]+1): descend past i into a's tail and
  // increment the first non-max digit, truncating after it. The result is
  // > a (incremented + truncated) and < b (digit at i is still A[i] < B[i]
  // when j > i). If a's tail is all max digits, escape below B[i] with the
  // reserved 0 — [A[i], 0, …] is > a and < b, with unbounded room beneath.
  const digits = [...A];
  for (let j = i + 1; j < digits.length; j++) {
    if (digits[j] < BASE - 1) {
      digits[j] += 1;
      return { d: digits.slice(0, j + 1), s: site + counter };
    }
  }
  return {
    d: [...A.slice(0, i + 1), 0, 1 + (counter % 14)],
    s: site + counter,
  };
}

/**
 * A text CRDT replica. Entries (visible + tombstones) are kept sorted by
 * identifier — that order IS the document.
 */
export class Logoot {
  private entries: CrdtEntry[] = [];
  private byId = new Map<string, CrdtEntry>();
  private siteId: string;
  private counter = 0;

  constructor(siteId: string) {
    this.siteId = siteId;
  }

  private key(id: CrdtId): string {
    return id.d.join(".") + "|" + id.s;
  }

  private newId(
    leftId: CrdtId | null,
    rightId: CrdtId | null
  ): CrdtId {
    return idBetween(leftId, rightId, this.siteId, ++this.counter);
  }

  /** Insert `text` starting at visible index `index`. Returns the ops. */
  localInsert(index: number, text: string): CrdtOp[] {
    const ops: CrdtOp[] = [];
    for (let k = 0; k < text.length; k++) {
      const at = index + k;
      const left = at > 0 ? this.visibleEntry(at - 1) : null;
      const right = left ? this.nextEntry(left.id) : this.firstEntry();
      const id = this.newId(left?.id ?? null, right?.id ?? null);
      const entry: CrdtEntry = { id, char: text[k], del: false };
      this.insertEntry(entry);
      ops.push({ t: "ins", id, c: entry.char });
    }
    return ops;
  }

  /** Tombstone the visible chars in [index, index + count). */
  localDelete(index: number, count: number): CrdtOp[] {
    const ops: CrdtOp[] = [];
    for (let k = count - 1; k >= 0; k--) {
      const entry = this.visibleEntry(index + k);
      if (!entry) continue;
      entry.del = true;
      ops.push({ t: "del", id: entry.id });
    }
    return ops;
  }

  /** Apply a remote op. Idempotent for duplicate ids. */
  applyRemote(op: CrdtOp): boolean {
    if (op.t === "ins") {
      const key = this.key(op.id);
      if (this.byId.has(key)) return false;
      const entry: CrdtEntry = { id: op.id, char: op.c, del: false };
      this.insertEntry(entry);
      return true;
    }
    const entry = this.byId.get(this.key(op.id));
    if (!entry || entry.del) return false;
    entry.del = true;
    return true;
  }

  toText(): string {
    let out = "";
    for (const e of this.entries) {
      if (!e.del) out += e.char;
    }
    return out;
  }

  /** Debug/test accessor: entries in stored (sorted) order. */
  debugEntries(): CrdtEntry[] {
    return this.entries.map((e) => ({ ...e }));
  }

  /** Load a pre-existing state (e.g. server rebuilt from current text). */
  loadText(text: string) {
    this.entries = [];
    this.byId.clear();
    // Sequential ids from a synthetic site — fine, this replica generated them.
    for (let i = 0; i < text.length; i++) {
      const id: CrdtId = { d: [8, i % BASE, Math.floor(i / BASE)], s: "init" + i };
      const entry: CrdtEntry = { id, char: text[i], del: false };
      this.insertEntry(entry);
    }
  }

  private insertEntry(entry: CrdtEntry) {
    // Binary search by comparator.
    let lo = 0;
    let hi = this.entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (compareId(this.entries[mid].id, entry.id) < 0) lo = mid + 1;
      else hi = mid;
    }
    this.entries.splice(lo, 0, entry);
    this.byId.set(this.key(entry.id), entry);
  }

  /** The index-th visible (non-deleted) entry. */
  private visibleEntry(visibleIndex: number): CrdtEntry | null {
    let seen = -1;
    for (const e of this.entries) {
      if (!e.del) {
        seen++;
        if (seen === visibleIndex) return e;
      }
    }
    return null;
  }

  /** The entry immediately AFTER a visible entry (next neighbor incl. tombstones). */
  private nextEntry(id: CrdtId): CrdtEntry | null {
    const idx = this.entries.findIndex((e) => this.key(e.id) === this.key(id));
    if (idx === -1 || idx === this.entries.length - 1) return null;
    return this.entries[idx + 1];
  }

  private firstEntry(): CrdtEntry | null {
    return this.entries[0] ?? null;
  }
}
