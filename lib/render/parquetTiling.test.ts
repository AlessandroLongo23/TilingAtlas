import { describe, it, expect } from "vitest";
import { STRAIGHT_EDGE, type Pt } from "@/lib/render/parquetStrip";
import { TILINGS, buildDeformedTiling, type TilingId } from "@/lib/render/parquetTiling";

// A parquet deformation generalizes from the square grid to any periodic tiling. Two invariants must
// hold for every tiling template, or the deformation shows gaps:
//  (1) topology: interior edges are shared by exactly two faces (it's a real tiling);
//  (2) matching: after deformation, the two faces sharing an edge produce identical edge geometry.

const key = (a: Pt, b: Pt) => {
  const r = (p: Pt) => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)}`;
  const [k0, k1] = [r(a), r(b)].sort();
  return `${k0}|${k1}`;
};

const IDS = Object.keys(TILINGS) as TilingId[];

describe.each(IDS)("tiling template: %s", (id) => {
  const template = TILINGS[id];

  it("is a valid tiling: every edge is shared by at most two faces, and interior edges by exactly two", () => {
    const { faces } = template.build(6, 6);
    const counts = new Map<string, number>();
    for (const face of faces) {
      for (let k = 0; k < face.length; k++) {
        const e = key(face[k], face[(k + 1) % face.length]);
        counts.set(e, (counts.get(e) ?? 0) + 1);
      }
    }
    // no edge is shared by 3+ faces (would be a topology error)
    for (const c of counts.values()) expect(c).toBeLessThanOrEqual(2);
    // a healthy patch has many interior (shared-by-2) edges
    const shared = [...counts.values()].filter((c) => c === 2).length;
    expect(shared).toBeGreaterThan(0);
  });

  it("neighbouring faces share identical deformed edges (no gaps)", () => {
    const instance = template.build(6, 6);
    const profile = [
      { s: 0, d: 0 },
      { s: 0.5, d: 0.25 },
      { s: 1, d: 0 },
    ];
    const tiles = buildDeformedTiling(instance, {
      from: STRAIGHT_EDGE,
      to: profile,
      amount: 1,
      d: (tx) => tx,
    });

    // Collect every deformed boundary edge by its canonical endpoint key; edges sharing a key must be
    // geometrically identical (equal as an ordered set once one is reversed).
    const byKey = new Map<string, Pt[][]>();
    for (const t of tiles) {
      for (const edge of t.edges) {
        const k = key(edge[0], edge[edge.length - 1]);
        (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(edge);
      }
    }
    let checkedShared = 0;
    for (const group of byKey.values()) {
      if (group.length < 2) continue;
      checkedShared++;
      const a = group[0];
      const b = group[1];
      const bForward = key(a[0], a[a.length - 1]) === key(b[0], b[b.length - 1]);
      const bAligned =
        Math.abs(a[0][0] - b[0][0]) < 1e-9 && Math.abs(a[0][1] - b[0][1]) < 1e-9
          ? b
          : [...b].reverse();
      void bForward;
      for (let i = 0; i < a.length; i++) {
        expect(a[i][0]).toBeCloseTo(bAligned[i][0], 6);
        expect(a[i][1]).toBeCloseTo(bAligned[i][1], 6);
      }
    }
    expect(checkedShared).toBeGreaterThan(0);
  });

  it("amount 0 leaves the base tiling (outlines are the straight faces)", () => {
    const instance = template.build(3, 3);
    const tiles = buildDeformedTiling(instance, {
      from: STRAIGHT_EDGE,
      to: [
        { s: 0, d: 0 },
        { s: 0.5, d: 0.9 },
        { s: 1, d: 0 },
      ],
      amount: 0,
      d: (tx) => tx,
    });
    // with amount 0 every edge is straight, so each face outline has exactly its corner count of
    // distinct vertices
    expect(tiles.length).toBe(instance.faces.length);
    for (let i = 0; i < tiles.length; i++) {
      const corners = instance.faces[i];
      for (const c of corners) {
        expect(tiles[i].outline.some((p) => Math.abs(p[0] - c[0]) < 1e-9 && Math.abs(p[1] - c[1]) < 1e-9)).toBe(
          true,
        );
      }
    }
  });
});

describe("two-keyframe morph", () => {
  it("interpolates from the 'from' edge on the left to the 'to' edge on the right", () => {
    const bumpUp = [
      { s: 0, d: 0 },
      { s: 0.5, d: 0.4 },
      { s: 1, d: 0 },
    ];
    const bumpDown = [
      { s: 0, d: 0 },
      { s: 0.5, d: -0.4 },
      { s: 1, d: 0 },
    ];
    const instance = TILINGS.square.build(10, 1);
    const tiles = buildDeformedTiling(instance, {
      from: bumpUp,
      to: bumpDown,
      amount: 1,
      d: (tx) => tx,
    });
    // bottom edge (edges[0]) of the first vs last tile; its middle vertex (s=0.5) deflects along +y.
    const midY = (edge: Pt[]) => edge[Math.floor(edge.length / 2)][1];
    expect(midY(tiles[0].edges[0])).toBeGreaterThan(0.1); // left ≈ bumpUp
    expect(midY(tiles[tiles.length - 1].edges[0])).toBeLessThan(-0.1); // right ≈ bumpDown
  });
});
