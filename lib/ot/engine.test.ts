import { describe, it, expect } from "vitest";
import {
  apply,
  transform,
  normalize,
  baseLength,
  targetLength,
  type Operation,
} from "./engine";

/** Build a random operation valid on `doc`, consuming it exactly.
 *  The cursor walks 0 -> doc.length, and inserts never move the cursor,
 *  so an insert can land at any position (start, middle, end) legally. */
function randomOp(doc: string, rng: () => number): Operation {
  const op: Operation = [];
  let i = 0;
  while (i < doc.length) {
    const roll = rng();
    const remaining = doc.length - i;
    if (roll < 0.3) {
      // retain some
      const n = 1 + Math.floor(rng() * remaining);
      op.push({ retain: n });
      i += n;
    } else if (roll < 0.6) {
      // delete some
      const n = 1 + Math.floor(rng() * remaining);
      op.push({ delete: n });
      i += n;
    } else if (roll < 0.85) {
      // insert some text at the cursor (cursor stays)
      const len = 1 + Math.floor(rng() * 4);
      const chars = "abcdefg";
      let s = "";
      for (let k = 0; k < len; k++) s += chars[Math.floor(rng() * chars.length)];
      op.push({ insert: s });
    } else {
      // retain a single char (to guarantee progress when rng is unlucky)
      op.push({ retain: 1 });
      i += 1;
    }
  }
  // Optionally insert at the very end.
  if (rng() < 0.4) {
    op.push({ insert: "Z" });
  }
  return normalize(op);
}

/** Deterministic PRNG so failures are reproducible. */
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

/** Apply op, validating it consumed the whole doc. */
function applyChecked(op: Operation, doc: string): string {
  const len = baseLength(op);
  if (len !== doc.length) {
    throw new Error(`op baseLength ${len} != doc length ${doc.length}`);
  }
  return apply(op, doc);
}

describe("apply", () => {
  it("inserts mid-document", () => {
    expect(applyChecked([{ retain: 1 }, { insert: "X" }, { retain: 2 }], "abc")).toBe("aXbc");
  });
  it("deletes a range", () => {
    expect(applyChecked([{ retain: 1 }, { delete: 2 }, { retain: 1 }], "abcd")).toBe("ad");
  });
  it("handles trailing insert", () => {
    expect(applyChecked([{ retain: 3 }, { insert: "!" }], "abc")).toBe("abc!");
  });
});

describe("transform convergence (classic cases)", () => {
  function bothOrders(
    doc: string,
    a: Operation,
    b: Operation
  ): [string, string] {
    // a-first tie-break must be mirrored: transform(b, a) with b NOT first.
    const a2 = transform(a, b, true);
    const b2 = transform(b, a, false);
    const left = applyChecked(b, doc);
    const right = applyChecked(a, doc);
    return [applyChecked(a2, left), applyChecked(b2, right)];
  }

  it("two inserts at the same position converge", () => {
    const [l, r] = bothOrders("abc", [{ retain: 1 }, { insert: "X" }, { retain: 2 }], [
      { retain: 1 },
      { insert: "Y" },
      { retain: 2 },
    ]);
    expect(l).toBe(r);
  });

  it("insert vs delete at same spot converge", () => {
    const [l, r] = bothOrders("abcd", [{ retain: 1 }, { insert: "X" }, { retain: 3 }], [
      { retain: 1 },
      { delete: 2 },
      { retain: 1 },
    ]);
    expect(l).toBe(r);
  });

  it("overlapping deletes converge", () => {
    // Full-doc ops: delete 3 then retain 3, vs delete 4 then retain 2.
    const [l, r] = bothOrders("abcdef", [{ delete: 3 }, { retain: 3 }], [
      { delete: 4 },
      { retain: 2 },
    ]);
    expect(l).toBe(r);
  });

  it("delete vs retain converge", () => {
    // Ops must consume the WHOLE doc.
    const [l, r] = bothOrders("abcdef", [{ retain: 2 }, { delete: 2 }, { retain: 2 }], [
      { retain: 1 },
      { delete: 1 },
      { retain: 4 },
    ]);
    expect(l).toBe(r);
  });
});

describe("randomized convergence property", () => {
  for (const seed of [1, 2, 3, 42, 99, 123, 7, 2024]) {
    it(`converges for seed ${seed}`, () => {
      const rng = mulberry32(seed);
      for (let trial = 0; trial < 50; trial++) {
        const baseLen = 1 + Math.floor(rng() * 20);
        const chars = "abcdefgh";
        let doc = "";
        for (let k = 0; k < baseLen; k++) {
          doc += chars[Math.floor(rng() * chars.length)];
        }

        const a = randomOp(doc, rng);
        const b = randomOp(doc, rng);

        const a2 = transform(a, b, true);
        const b2 = transform(b, a, false);

        const docAfterB = applyChecked(b, doc);
        const docAfterA = applyChecked(a, doc);

        const left = applyChecked(a2, docAfterB);
        const right = applyChecked(b2, docAfterA);

        // target lengths must be consistent
        expect(targetLength(a2)).toBe(targetLength(b2));
        // CONVERGENCE: both clients end identical
        expect(left).toBe(right);
      }
    });
  }
});
