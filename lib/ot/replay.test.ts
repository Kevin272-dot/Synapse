import { describe, it, expect } from "vitest";
import {
  apply,
  normalize,
  baseLength,
  targetLength,
  type Operation,
} from "./engine";

/** Mirrors the server contract: version V holds the op that moved the doc
 *  from V-1 to V. The log is replayed against the base text. */
interface LoggedOp {
  version: number;
  op: Operation;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomOp(doc: string, rng: () => number): Operation {
  const op: Operation = [];
  let i = 0;
  while (i < doc.length) {
    const roll = rng();
    const remaining = doc.length - i;
    if (roll < 0.3) {
      const n = 1 + Math.floor(rng() * remaining);
      op.push({ retain: n });
      i += n;
    } else if (roll < 0.6) {
      const n = 1 + Math.floor(rng() * remaining);
      op.push({ delete: n });
      i += n;
    } else if (roll < 0.85) {
      const len = 1 + Math.floor(rng() * 4);
      const chars = "abcdefg";
      let s = "";
      for (let k = 0; k < len; k++) s += chars[Math.floor(rng() * chars.length)];
      op.push({ insert: s });
    } else {
      op.push({ retain: 1 });
      i += 1;
    }
  }
  if (rng() < 0.4) op.push({ insert: "Z" });
  return normalize(op);
}

describe("operation log replay invariants", () => {
  it("replaying a logged sequence reproduces the final text exactly", () => {
    const rng = mulberry32(777);
    let text = "";
    const log: LoggedOp[] = [];

    for (let i = 0; i < 200; i++) {
      const op = randomOp(text, rng);
      // Server contract: base length must equal the current doc.
      expect(baseLength(op)).toBe(text.length);
      text = apply(op, text);
      log.push({ version: i + 1, op: normalize(op) });
    }

    // Replay the whole log from the base doc and assert the result.
    let replayed = "";
    for (const entry of log) {
      expect(entry.version).toBe(log.indexOf(entry) + 1); // contiguous
      expect(baseLength(entry.op)).toBe(replayed.length); // validity at each step
      replayed = apply(entry.op, replayed);
    }
    expect(replayed).toBe(text);
  });

  it("replays any suffix of the log onto its recorded starting length", () => {
    const rng = mulberry32(4242);
    let text = "seed document text";
    const log: LoggedOp[] = [];

    for (let i = 0; i < 60; i++) {
      const op = randomOp(text, rng);
      text = apply(op, text);
      log.push({ version: i + 1, op });
    }

    // Pick a random cut point: replaying log[k..] must carry the doc from
    // its length at version k to the final length.
    for (let k = 0; k < log.length; k += 7) {
      const lengthAtK = log
        .slice(0, k)
        .reduce((len, e) => targetLength(e.op), 18);
      let replayed = "x".repeat(lengthAtK);
      for (const entry of log.slice(k)) {
        expect(baseLength(entry.op)).toBe(replayed.length);
        replayed = apply(entry.op, replayed);
      }
      expect(replayed.length).toBe(text.length);
    }
  });
});
