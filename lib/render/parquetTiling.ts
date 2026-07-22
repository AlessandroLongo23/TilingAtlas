// General parquet-deformation geometry: any periodic tiling as faces that share canonical edges.
// Generalizes the square-only parquetStrip.ts so the same deformation machinery works on hexagons,
// triangles, etc. An edge's deformed curve is derived from its two endpoints in a CANONICAL order
// (sorted), so both faces that share the edge compute the identical curve — the tiling stays
// gap-free. This is also the substrate the tiling-to-tiling morph (option 4) will build on.

import type { DProfile, EdgeProfile, Pt } from "./parquetStrip";

export type TilingId = "square" | "hexagon" | "triangle";

export interface TilingInstance {
  faces: Pt[][]; // each face = corner positions, CCW, snapped, shifted so min corner is at origin
  width: number; // x-extent, used to normalize D(x)
  height: number;
}

export interface TilingTemplate {
  id: TilingId;
  label: string;
  build(cols: number, rows: number): TilingInstance;
}

export interface DeformedTile {
  faceIndex: number;
  edges: Pt[][]; // per-boundary-edge deformed polylines, in face-CCW order (each runs corner k → k+1)
  outline: Pt[]; // closed outline (concatenated edges)
}

const SNAP = 1e6;
const snap = (v: number) => Math.round(v * SNAP) / SNAP;
const sp = (x: number, y: number): Pt => [snap(x), snap(y)];

/** Shift faces so the min corner sits at the origin; report the extents (width used for D(x)). */
function normalize(faces: Pt[][]): TilingInstance {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of faces) {
    for (const p of f) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
  }
  const shifted = faces.map((f) => f.map((p): Pt => sp(p[0] - minX, p[1] - minY)));
  return { faces: shifted, width: snap(maxX - minX), height: snap(maxY - minY) };
}

const H = Math.sqrt(3) / 2;

const squareTemplate: TilingTemplate = {
  id: "square",
  label: "Square",
  build(cols, rows) {
    const faces: Pt[][] = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        faces.push([sp(i, j), sp(i + 1, j), sp(i + 1, j + 1), sp(i, j + 1)]);
      }
    }
    return normalize(faces);
  },
};

// Equilateral triangles via the rhombus decomposition of the triangular lattice. V(i,j) = (i+0.5j, j·H).
// Each (i,j) cell contributes a lower-left and an upper-right triangle. We over-generate in i and clip
// by centroid so the strip is roughly rectangular rather than a slanted parallelogram.
const triangleTemplate: TilingTemplate = {
  id: "triangle",
  label: "Triangle",
  build(cols, rows) {
    const V = (i: number, j: number): Pt => sp(i + 0.5 * j, j * H);
    const faces: Pt[][] = [];
    const iMin = -rows - 1;
    const iMax = cols + rows + 1;
    for (let j = 0; j < rows; j++) {
      for (let i = iMin; i <= iMax; i++) {
        const t1: Pt[] = [V(i, j), V(i + 1, j), V(i, j + 1)];
        const t2: Pt[] = [V(i + 1, j), V(i + 1, j + 1), V(i, j + 1)];
        for (const tri of [t1, t2]) {
          const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
          if (cx >= 0 && cx <= cols) faces.push(tri);
        }
      }
    }
    return normalize(faces);
  },
};

// Pointy-top regular hexagons in offset coordinates (odd rows shifted half a column).
const hexagonTemplate: TilingTemplate = {
  id: "hexagon",
  label: "Hexagon",
  build(cols, rows) {
    const R = 0.62; // circumradius
    const dx = R * Math.sqrt(3);
    const dy = R * 1.5;
    const faces: Pt[][] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cxc = dx * (col + 0.5 * (row & 1));
        const cyc = dy * row;
        const hex: Pt[] = [];
        for (let k = 0; k < 6; k++) {
          const a = (Math.PI / 180) * (30 + 60 * k);
          hex.push(sp(cxc + R * Math.cos(a), cyc + R * Math.sin(a)));
        }
        faces.push(hex);
      }
    }
    return normalize(faces);
  },
};

export const TILINGS: Record<TilingId, TilingTemplate> = {
  square: squareTemplate,
  hexagon: hexagonTemplate,
  triangle: triangleTemplate,
};

/** Sample an edge profile's perpendicular offset at parameter s∈[0,1] (piecewise-linear; the profile
 *  is sorted by s). Lets two profiles with different control points be interpolated on a shared grid. */
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

/** Sorted union of two profiles' s-values (always includes the endpoints 0 and 1). */
function commonGrid(a: EdgeProfile, b: EdgeProfile): number[] {
  const set = new Set<number>([0, 1]);
  for (const p of a) set.add(p.s);
  for (const p of b) set.add(p.s);
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

export interface DeformOptions {
  from: EdgeProfile; // edge shape at the left of the strip (t = 0)
  to: EdgeProfile; // edge shape at the right of the strip (t = 1)
  amount: number; // global scale on the deformation
  d: DProfile; // takes NORMALIZED x in [0,1]
}

export function buildDeformedTiling(instance: TilingInstance, opts: DeformOptions): DeformedTile[] {
  const { faces, width } = instance;
  const grid = commonGrid(opts.from, opts.to);
  const fromD = grid.map((s) => sampleAt(opts.from, s));
  const toD = grid.map((s) => sampleAt(opts.to, s));
  const dOfX: DProfile = (worldX) => opts.d(width > 0 ? worldX / width : 0);

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
      const t = dOfX((P0[0] + P1[0]) / 2);
      const d = grid.map((_, i) => opts.amount * (fromD[i] + (toD[i] - fromD[i]) * t));
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
