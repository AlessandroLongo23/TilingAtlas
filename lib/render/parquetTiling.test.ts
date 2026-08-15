import { describe, it, expect } from "vitest";
import { STRAIGHT_EDGE, type EdgeProfile, type Pt } from "@/lib/render/parquetStrip";
import {
  DRIFT_MARGIN,
  TILINGS,
  buildDeformedTiling,
  keyframeExtremes,
  translateInstance,
  wrapOffset,
  type TilingId,
} from "@/lib/render/parquetTiling";

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

// ── The K-keyframe generalization ──────────────────────────────────────────────────────────────
// A scalar t only ever blends two shapes; a 2-D corner patch (and later a scattered-keyframe field)
// needs a weight VECTOR. What must survive the generalization is the gap-free invariant — and it
// does, because it comes from sampling the field at the shared edge midpoint, which is the same
// point for both incident faces whatever the field returns.

const BUMP: EdgeProfile = [
  { s: 0, d: 0 },
  { s: 0.5, d: 0.3 },
  { s: 1, d: 0 },
];
const ZIGZAG: EdgeProfile = [
  { s: 0, d: 0 },
  { s: 0.25, d: -0.2 },
  { s: 0.75, d: 0.2 },
  { s: 1, d: 0 },
];
const PINWHEEL_LIKE: EdgeProfile = [
  { s: 0, d: 0 },
  { s: 0.3, d: 0.25 },
  { s: 0.5, d: 0 },
  { s: 0.7, d: -0.25 },
  { s: 1, d: 0 },
];

const centroidOf = (f: Pt[]): Pt => [
  f.reduce((s, p) => s + p[0], 0) / f.length,
  f.reduce((s, p) => s + p[1], 0) / f.length,
];

describe.each(IDS)("K-keyframe blend: %s", (id) => {
  it("stays gap-free under a four-keyframe field that varies in both directions", () => {
    const instance = TILINGS[id].build(6, 6);
    const keyframes = [STRAIGHT_EDGE, BUMP, ZIGZAG, PINWHEEL_LIKE];
    const tiles = buildDeformedTiling(instance, {
      keyframes,
      amount: 1,
      weights: (x, y) => {
        const u = Math.min(1, Math.max(0, x / instance.width));
        const v = Math.min(1, Math.max(0, y / instance.height));
        return [(1 - u) * (1 - v), u * (1 - v), (1 - u) * v, u * v];
      },
    });

    const byKey = new Map<string, Pt[][]>();
    for (const t of tiles) {
      for (const edge of t.edges) {
        const k = key(edge[0], edge[edge.length - 1]);
        (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(edge);
      }
    }
    let checked = 0;
    for (const group of byKey.values()) {
      if (group.length < 2) continue;
      checked++;
      const a = group[0];
      const b =
        Math.abs(a[0][0] - group[1][0][0]) < 1e-9 && Math.abs(a[0][1] - group[1][0][1]) < 1e-9
          ? group[1]
          : [...group[1]].reverse();
      for (let i = 0; i < a.length; i++) {
        expect(a[i][0]).toBeCloseTo(b[i][0], 6);
        expect(a[i][1]).toBeCloseTo(b[i][1], 6);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("agrees with the two-keyframe form when handed the equivalent weights", () => {
    const instance = TILINGS[id].build(4, 4);
    const legacy = buildDeformedTiling(instance, {
      from: STRAIGHT_EDGE,
      to: BUMP,
      amount: 0.7,
      d: (tx) => tx,
    });
    const general = buildDeformedTiling(instance, {
      keyframes: [STRAIGHT_EDGE, BUMP],
      amount: 0.7,
      weights: (x) => {
        const t = x / instance.width;
        return [1 - t, t];
      },
    });
    expect(general.length).toBe(legacy.length);
    for (let i = 0; i < legacy.length; i++) {
      for (let j = 0; j < legacy[i].outline.length; j++) {
        expect(general[i].outline[j][0]).toBeCloseTo(legacy[i].outline[j][0], 9);
        expect(general[i].outline[j][1]).toBeCloseTo(legacy[i].outline[j][1], 9);
      }
    }
  });
});

// ── Margin ring and lattice periods (the drifting grid) ────────────────────────────────────────

describe.each(IDS)("margin ring: %s", (id) => {
  it("leaves the core patch untouched — the margin only adds faces around it", () => {
    const plain = TILINGS[id].build(5, 5);
    const ringed = TILINGS[id].build(5, 5, 2);
    expect(ringed.coreCount).toBe(plain.faces.length);
    expect(ringed.faces.length).toBeGreaterThan(ringed.coreCount);
    expect(ringed.width).toBeCloseTo(plain.width, 9);
    expect(ringed.height).toBeCloseTo(plain.height, 9);
    // Same faces, same order, same placement: width/height and the viewBox must not shift when the
    // ring appears, or starting a drift would visibly rescale the drawing.
    for (let i = 0; i < plain.faces.length; i++) {
      for (let j = 0; j < plain.faces[i].length; j++) {
        expect(ringed.faces[i][j][0]).toBeCloseTo(plain.faces[i][j][0], 9);
        expect(ringed.faces[i][j][1]).toBeCloseTo(plain.faces[i][j][1], 9);
      }
    }
  });

  it("the ring covers a full period beyond the core, so a wrapped drift always has tiles to stream in", () => {
    // A drift is reduced into [0, period), so the ring must reach exactly that far past the core in
    // each direction — otherwise the far edge of the frame empties out mid-loop. `margin` is one
    // ring wider than strictly needed, to carry the deformation bulge too.
    const ringed = TILINGS[id].build(5, 5, DRIFT_MARGIN);
    const ring = ringed.faces.slice(ringed.coreCount).flat();
    expect(Math.min(...ring.map((p) => p[0]))).toBeLessThanOrEqual(-ringed.period.x);
    expect(Math.min(...ring.map((p) => p[1]))).toBeLessThanOrEqual(-ringed.period.y);
    expect(Math.max(...ring.map((p) => p[0]))).toBeGreaterThanOrEqual(ringed.width + ringed.period.x);
    expect(Math.max(...ring.map((p) => p[1]))).toBeGreaterThanOrEqual(ringed.height + ringed.period.y);
  });

  it("translating by a full period maps the tiling onto itself — the drift loop has no seam", () => {
    const inst = TILINGS[id].build(6, 6, DRIFT_MARGIN);
    for (const [dx, dy] of [
      [inst.period.x, 0],
      [0, inst.period.y],
      [inst.period.x, inst.period.y],
    ]) {
      const shifted = translateInstance(inst, dx, dy);
      const originals = inst.faces.map(centroidOf);
      // Every shifted face landing well inside the core must coincide with one of the originals.
      let matched = 0;
      for (const f of shifted.faces) {
        const [cx, cy] = centroidOf(f);
        if (cx < 0.5 || cx > inst.width - 0.5 || cy < 0.5 || cy > inst.height - 0.5) continue;
        const hit = originals.some((o) => Math.hypot(o[0] - cx, o[1] - cy) < 1e-6);
        expect(hit, `face at ${cx},${cy} after shift ${dx},${dy}`).toBe(true);
        matched++;
      }
      expect(matched).toBeGreaterThan(0);
    }
  });
});

describe("wrapOffset", () => {
  it("reduces into [0, period) for positive and negative drifts alike", () => {
    expect(wrapOffset(2.5, 1)).toBeCloseTo(0.5, 12);
    expect(wrapOffset(-0.25, 1)).toBeCloseTo(0.75, 12);
    expect(wrapOffset(0, 1)).toBe(0);
    expect(wrapOffset(5, 0)).toBe(0); // degenerate period: no wrap rather than a divide by zero
  });
});

describe("keyframeExtremes", () => {
  it("bounds every blend: no convex mixture escapes the pure-keyframe geometries", () => {
    const instance = TILINGS.square.build(6, 4);
    const keyframes = [STRAIGHT_EDGE, BUMP, ZIGZAG, PINWHEEL_LIKE];
    const extremes = keyframeExtremes(instance, keyframes).flat().flat();
    const lo = [Math.min(...extremes.map((p) => p[0])), Math.min(...extremes.map((p) => p[1]))];
    const hi = [Math.max(...extremes.map((p) => p[0])), Math.max(...extremes.map((p) => p[1]))];

    // Random convex weight vectors, at full amount: every vertex must land inside the envelope.
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let trial = 0; trial < 40; trial++) {
      const raw = keyframes.map(() => rnd());
      const total = raw.reduce((a, b) => a + b, 0);
      const w = raw.map((v) => v / total);
      const tiles = buildDeformedTiling(instance, { keyframes, amount: 1, weights: () => w });
      for (const t of tiles) {
        for (const p of t.outline) {
          expect(p[0]).toBeGreaterThanOrEqual(lo[0] - 1e-9);
          expect(p[0]).toBeLessThanOrEqual(hi[0] + 1e-9);
          expect(p[1]).toBeGreaterThanOrEqual(lo[1] - 1e-9);
          expect(p[1]).toBeLessThanOrEqual(hi[1] + 1e-9);
        }
      }
    }
  });

  it("is computed on the core patch only, so the margin ring cannot inflate the viewBox", () => {
    const plain = keyframeExtremes(TILINGS.square.build(6, 4), [STRAIGHT_EDGE, BUMP]);
    const ringed = keyframeExtremes(TILINGS.square.build(6, 4, 2), [STRAIGHT_EDGE, BUMP]);
    expect(JSON.stringify(ringed)).toBe(JSON.stringify(plain));
  });
});
