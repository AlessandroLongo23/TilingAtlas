import { describe, it, expect } from "vitest";
import { fillNearestResolved } from "@/lib/render/hyperbolicReduce";

// The field bake fills every unresolved texel with the value of a nearest RESOLVED texel so the field
// is total (the shader can never sample a black hole). "Nearest" is Chebyshev distance (the old ring
// search scanned square rings). This is the load-bearing correctness invariant of the fill; the fast
// distance-transform implementation must satisfy it exactly.

const cheb = (i0: number, j0: number, i1: number, j1: number) => Math.max(Math.abs(i0 - i1), Math.abs(j0 - j1));

/** Build a res×res RGBA field where the given texel indices are RESOLVED, each carrying its own index as
 *  a payload in all four channels. Returns { data, resolved, unresolvedIdx }. */
function makeField(res: number, resolvedTexels: number[]) {
  const data = new Uint8Array(res * res * 4);
  const resolved = new Uint8Array(res * res);
  const set = new Set(resolvedTexels);
  const unresolvedIdx: number[] = [];
  for (let p = 0; p < res * res; p++) {
    const o = p * 4;
    if (set.has(p)) {
      resolved[p] = 1;
      data[o] = data[o + 1] = data[o + 2] = data[o + 3] = p; // payload = own index (res ≤ 16 keeps p < 256)
    } else {
      unresolvedIdx.push(o);
    }
  }
  return { data, resolved, unresolvedIdx };
}

describe("fillNearestResolved", () => {
  it("fills every unresolved texel from a Chebyshev-nearest resolved texel", () => {
    const res = 12;
    const resolvedTexels = [0, 5, 40, 71, 143, 100]; // scattered sources, distinct payloads
    const { data, resolved, unresolvedIdx } = makeField(res, resolvedTexels);

    fillNearestResolved(data, resolved, unresolvedIdx, res);

    for (const o of unresolvedIdx) {
      const p = o / 4;
      const i = p % res;
      const j = (p - i) / res;
      // brute-force the true minimum Chebyshev distance and the payloads sitting at it
      let best = Infinity;
      const atBest = new Set<number>();
      for (const rp of resolvedTexels) {
        const ri = rp % res;
        const rj = (rp - ri) / res;
        const d = cheb(i, j, ri, rj);
        if (d < best) {
          best = d;
          atBest.clear();
          atBest.add(rp);
        } else if (d === best) {
          atBest.add(rp);
        }
      }
      const filled = data[o];
      expect(atBest.has(filled), `texel ${p} filled with ${filled}; nearest are ${[...atBest]}`).toBe(true);
      // all four channels copied from the same source
      expect([data[o + 1], data[o + 2], data[o + 3]]).toEqual([filled, filled, filled]);
    }
  });

  it("leaves the field untouched when no texel is resolved (degenerate empty field)", () => {
    const res = 6;
    const { data, resolved, unresolvedIdx } = makeField(res, []);
    const before = Uint8Array.from(data);
    expect(() => fillNearestResolved(data, resolved, unresolvedIdx, res)).not.toThrow();
    expect(data).toEqual(before);
  });
});
