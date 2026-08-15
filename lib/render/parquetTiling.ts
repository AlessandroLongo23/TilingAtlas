// General parquet-deformation geometry: any periodic tiling as faces that share canonical edges.
// Generalizes the square-only parquetStrip.ts so the same deformation machinery works on hexagons,
// triangles, etc. An edge's deformed curve is derived from its two endpoints in a CANONICAL order
// (sorted), so both faces that share the edge compute the identical curve — the tiling stays
// gap-free. This is also the substrate the tiling-to-tiling morph (option 4) will build on.
//
// The blend is over K KEYFRAMES, not two. A field returns a weight vector at each point and the
// edge is Σ wᵢ·profileᵢ. K = 2 with weights (1−t, t) is the classic 1-D strip; K = 4 with bilinear
// weights is the 2-D corner patch; K = n with Shepard/RBF weights is the scattered-keyframe case
// (vault: "Multi-dimensional scatter interpolation"). Only the weight function changes.
//
// The gap-free invariant is untouched by that generalization: it comes from evaluating the field at
// the SHARED edge midpoint, which is the same point for both incident faces whatever the field
// returns. What a steep field can still do is make an edge bulge far enough to cross a non-adjacent
// one — self-intersection, not a gap.

import type { DProfile, EdgeProfile, Pt } from "./parquetStrip";

export type TilingId = "square" | "hexagon" | "triangle";

/** A field over the plane returning convex blend weights (length K, ≥ 0, summing to 1) in WORLD
 *  coordinates. Convexity is what makes the viewBox envelope in `keyframeExtremes` exact. */
export type BlendField = (x: number, y: number) => number[];

export interface TilingInstance {
  /** Core faces first (`faces.slice(0, coreCount)`), then the margin ring. Each face is its corner
   *  positions, CCW, snapped, shifted so the CORE patch's min corner is at the origin. */
  faces: Pt[][];
  coreCount: number;
  width: number; // x-extent of the CORE patch, used to normalize the field
  height: number; // y-extent of the CORE patch
  /** Translation periods of the patch. All three templates have an axis-aligned period lattice, so
   *  two scalars suffice: translating by (period.x, 0) or (0, period.y) maps the tiling onto itself.
   *  A grid drift reduced modulo these leaves the picture seamless — tiles stream through a fixed
   *  frame instead of the patch sliding off its own edge. */
  period: { x: number; y: number };
}

export interface TilingTemplate {
  id: TilingId;
  label: string;
  /** `margin` adds that many tile rings around the core patch. Faces there are drawn but excluded
   *  from width/height and from the viewBox, so they can only ever fill in as the grid drifts. */
  build(cols: number, rows: number, margin?: number): TilingInstance;
}

export interface DeformedTile {
  faceIndex: number;
  edges: Pt[][]; // per-boundary-edge deformed polylines, in face-CCW order (each runs corner k → k+1)
  outline: Pt[]; // closed outline (concatenated edges)
}

const SNAP = 1e6;
const snap = (v: number) => Math.round(v * SNAP) / SNAP;
const sp = (x: number, y: number): Pt => [snap(x), snap(y)];

/** Shift core + margin faces so the CORE's min corner sits at the origin; report the core extents. */
function finalize(core: Pt[][], margin: Pt[][], period: { x: number; y: number }): TilingInstance {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of core) {
    for (const p of f) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
  }
  const shift = (f: Pt[]) => f.map((p): Pt => sp(p[0] - minX, p[1] - minY));
  return {
    faces: [...core.map(shift), ...margin.map(shift)],
    coreCount: core.length,
    width: snap(maxX - minX),
    height: snap(maxY - minY),
    period,
  };
}

const H = Math.sqrt(3) / 2;

const squareTemplate: TilingTemplate = {
  id: "square",
  label: "Square",
  build(cols, rows, margin = 0) {
    const core: Pt[][] = [];
    const ring: Pt[][] = [];
    for (let j = -margin; j < rows + margin; j++) {
      for (let i = -margin; i < cols + margin; i++) {
        const face: Pt[] = [sp(i, j), sp(i + 1, j), sp(i + 1, j + 1), sp(i, j + 1)];
        (i >= 0 && i < cols && j >= 0 && j < rows ? core : ring).push(face);
      }
    }
    return finalize(core, ring, { x: 1, y: 1 });
  },
};

// Equilateral triangles via the rhombus decomposition of the triangular lattice. V(i,j) = (i+0.5j, j·H).
// Each (i,j) cell contributes a lower-left and an upper-right triangle. We over-generate in i and clip
// by centroid so the strip is roughly rectangular, not a slanted parallelogram.
// Periods: (1,0) and (0, 2H) — j→j+2 shifts x by 1, which (1,0) cancels.
const triangleTemplate: TilingTemplate = {
  id: "triangle",
  label: "Triangle",
  build(cols, rows, margin = 0) {
    const V = (i: number, j: number): Pt => sp(i + 0.5 * j, j * H);
    const core: Pt[][] = [];
    const ring: Pt[][] = [];
    const jMin = -margin;
    const jMax = rows + margin;
    const iMin = -jMax - margin - 1;
    const iMax = cols + jMax + margin + 1;
    for (let j = jMin; j < jMax; j++) {
      for (let i = iMin; i <= iMax; i++) {
        const t1: Pt[] = [V(i, j), V(i + 1, j), V(i, j + 1)];
        const t2: Pt[] = [V(i + 1, j), V(i + 1, j + 1), V(i, j + 1)];
        for (const tri of [t1, t2]) {
          const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
          const isCore = j >= 0 && j < rows && cx >= 0 && cx <= cols;
          if (isCore) core.push(tri);
          else if (cx >= -margin && cx <= cols + margin) ring.push(tri);
        }
      }
    }
    return finalize(core, ring, { x: 1, y: 2 * H });
  },
};

// Pointy-top regular hexagons in offset coordinates (odd rows shifted half a column). Row parity
// survives negative rows (`-1 & 1 === 1`), so the margin ring lines up with the core.
// Periods: (dx, 0) and (0, 2·dy) — two rows restore the parity offset.
const hexagonTemplate: TilingTemplate = {
  id: "hexagon",
  label: "Hexagon",
  build(cols, rows, margin = 0) {
    const R = 0.62; // circumradius
    const dx = R * Math.sqrt(3);
    const dy = R * 1.5;
    const core: Pt[][] = [];
    const ring: Pt[][] = [];
    for (let row = -margin; row < rows + margin; row++) {
      for (let col = -margin; col < cols + margin; col++) {
        const cxc = dx * (col + 0.5 * (row & 1));
        const cyc = dy * row;
        const hex: Pt[] = [];
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 180) * (30 + 60 * k);
          hex.push(sp(cxc + R * Math.cos(a), cyc + R * Math.sin(a)));
        }
        (col >= 0 && col < cols && row >= 0 && row < rows ? core : ring).push(hex);
      }
    }
    return finalize(core, ring, { x: dx, y: 2 * dy });
  },
};

export const TILINGS: Record<TilingId, TilingTemplate> = {
  square: squareTemplate,
  hexagon: hexagonTemplate,
  triangle: triangleTemplate,
};

/**
 * Tile rings to generate outside the core patch when the grid drifts.
 *
 * A drift is reduced into [0, period), so ONE period of coverage past the core is what keeps the
 * frame full — for all three templates that is two rings. The third carries the deformation bulge:
 * a tile just outside the frame still reaches into it by up to `amount·max|d|`, and without the
 * extra ring that bulge is missing at the boundary while everything else streams past.
 */
export const DRIFT_MARGIN = 3;

/** Reduce a drift into [0, period): translating a periodic patch by this leaves it looking identical
 *  at the frame's edges, so tiles stream through instead of the patch sliding away from its box. */
export function wrapOffset(v: number, period: number): number {
  if (!(period > 0)) return 0;
  return ((v % period) + period) % period;
}

/** Translate every face. Width/height/period describe the patch, not its placement, so they ride
 *  along unchanged — and the field must then be read at the MOVED positions, which is exactly
 *  Kaplan's "moving tiles, static interpolation function". */
export function translateInstance(instance: TilingInstance, dx: number, dy: number): TilingInstance {
  if (dx === 0 && dy === 0) return instance;
  return {
    ...instance,
    faces: instance.faces.map((f) => f.map((p): Pt => sp(p[0] + dx, p[1] + dy))),
  };
}

/** Sample an edge profile's perpendicular offset at parameter s∈[0,1] (piecewise-linear; the profile
 *  is sorted by s). Lets profiles with different control points be interpolated on a shared grid. */
function sampleAt(profile: EdgeProfile, s: number): number {
  if (s <= profile[0].s) return profile[0].d;
  const last = profile[profile.length - 1];
  if (s >= last.s) return last.d;
  for (let i = 1; i < profile.length; i++) {
    if (s <= profile[i].s) {
      const a = profile[i - 1];
      const b = profile[i];
      const span = b.s - a.s;
      return span <= 1e-12 ? b.d : a.d + (b.d - a.d) * ((s - a.s) / span);
    }
  }
  return last.d;
}

/** Sorted union of every profile's s-values (always includes the endpoints 0 and 1). */
function commonGrid(profiles: readonly EdgeProfile[]): number[] {
  const set = new Set<number>([0, 1]);
  for (const p of profiles) for (const c of p) set.add(c.s);
  return [...set].sort((x, y) => x - y);
}

/** Place a resolved edge (grid of s with final perpendicular offsets d) as a world-space curve A→B.
 *  Perp = A→B rotated +90° (fixed per edge). */
function curveOf(P0: Pt, P1: Pt, grid: number[], d: number[]): Pt[] {
  const dx = P1[0] - P0[0];
  const dy = P1[1] - P0[1];
  const px = -dy;
  const py = dx;
  return grid.map((s, i): Pt => [P0[0] + s * dx + d[i] * px, P0[1] + s * dy + d[i] * py]);
}

/** Two-keyframe form, kept because it reads naturally for the 1-D strip and is what the landing-page
 *  miniature and the existing tests use. `d` takes NORMALIZED x ∈ [0,1]. */
export interface LegacyDeformOptions {
  from: EdgeProfile; // edge shape at the left of the strip (t = 0)
  to: EdgeProfile; // edge shape at the right of the strip (t = 1)
  amount: number; // global scale on the deformation
  d: DProfile;
}

/** General form: K keyframes blended by a weight field in WORLD coordinates. */
export interface BlendDeformOptions {
  keyframes: readonly EdgeProfile[];
  amount: number;
  weights: BlendField;
}

export type DeformOptions = LegacyDeformOptions | BlendDeformOptions;

function toBlend(opts: DeformOptions, width: number): BlendDeformOptions {
  if ("keyframes" in opts) return opts;
  const w = width > 0 ? width : 1;
  return {
    keyframes: [opts.from, opts.to],
    amount: opts.amount,
    weights: (x) => {
      const t = opts.d(x / w);
      return [1 - t, t];
    },
  };
}

export function buildDeformedTiling(instance: TilingInstance, options: DeformOptions): DeformedTile[] {
  const { faces, width } = instance;
  const { keyframes, amount, weights } = toBlend(options, width);
  const grid = commonGrid(keyframes);
  // Pre-resample every keyframe onto the shared s-grid once, so the per-edge work is a dot product.
  const resampled = keyframes.map((k) => grid.map((s) => sampleAt(k, s)));

  return faces.map((corners, faceIndex) => {
    const n = corners.length;
    const edges: Pt[][] = [];
    for (let k = 0; k < n; k++) {
      const A = corners[k];
      const B = corners[(k + 1) % n];
      // Canonical (sorted) endpoints so the neighbouring face that shares this edge agrees.
      const swap = A[0] > B[0] || (A[0] === B[0] && A[1] > B[1]);
      const P0 = swap ? B : A;
      const P1 = swap ? A : B;
      const w = weights((P0[0] + P1[0]) / 2, (P0[1] + P1[1]) / 2);
      const d = grid.map((_, i) => {
        let acc = 0;
        for (let j = 0; j < resampled.length; j++) acc += w[j] * resampled[j][i];
        return amount * acc;
      });
      const curve = curveOf(P0, P1, grid, d);
      edges.push(swap ? curve.reverse() : curve);
    }
    const outline: Pt[] = [];
    edges.forEach((e, idx) => {
      (idx === 0 ? e : e.slice(1)).forEach((p) => outline.push(p));
    });
    return { faceIndex, edges, outline };
  });
}

/**
 * The K geometries that bound every frame: the core patch with each keyframe applied purely.
 *
 * A vertex sits at P + s·(P1−P0) + d·perp with d = amount·Σwᵢ·profileᵢ, which is affine in `amount`
 * and affine in `w`. Over amount ∈ [0,1] × the weight simplex the extremes can therefore only be at
 * the corners: amount = 0 (the undeformed faces) and each pure keyframe at amount = 1. So a viewBox
 * fitted to these plus the base faces contains every setting of every slider — and every animation
 * frame, since motion only moves the field's argument, never its range.
 *
 * This is EXACT while the weights stay convex (bilinear, Shepard, the 2-keyframe blend). An RBF
 * scheme that overshoots the simplex would need a sampled bound instead.
 */
export function keyframeExtremes(
  instance: TilingInstance,
  keyframes: readonly EdgeProfile[],
): Pt[][][] {
  const core: TilingInstance = { ...instance, faces: instance.faces.slice(0, instance.coreCount) };
  return keyframes.map((_, index) =>
    buildDeformedTiling(core, {
      keyframes,
      amount: 1,
      weights: () => keyframes.map((__, j) => (j === index ? 1 : 0)),
    }).map((tile) => tile.outline),
  );
}
