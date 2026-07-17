import { evaluateParamCell, type ParametricCellData } from '@/lib/utils/paramCell';
import type { FloatTiling, NodeState } from './types';
import { polyArea, tilingDefect, REGULAR_TOL } from './geometry';
import { vertexConfigs, configAngleSum } from './tilingSignature';

const EPS = 1e-3;

const toFloat = (cell: ReturnType<typeof evaluateParamCell>): FloatTiling => ({
  polys: (cell.cellPolygons as { n: number; star?: boolean; vertices: [number, number][] }[])
    .map((p) => ({ n: p.n, star: p.star, verts: p.vertices })),
  basis: cell.basis as [[number, number], [number, number]],
});
const cleaned = (t: FloatTiling): FloatTiling => ({ ...t, polys: t.polys.filter((p) => polyArea(p.verts) > 1e-4) });
const isEdgeToEdge = (t: FloatTiling): boolean => {
  const cfgs = vertexConfigs(t);
  return cfgs.length > 0 && cfgs.every((c) => Math.abs(configAngleSum(c) - 360) < 1);
};

/** Sweep a 1-parameter path `evalAt(a): FloatTiling` over [lo,hi]: two endpoint states plus interior
 *  regular edge-to-edge minima, ordered ascending by a. Mirrors nodeExtractor's logic along a slice. */
function sweepNodes(evalAt: (a: number) => FloatTiling, lo: number, hi: number): NodeState[] {
  const ends: NodeState[] = [];
  for (const a of [lo + EPS, hi - EPS]) {
    const t = cleaned(evalAt(a));
    ends.push({ alpha: a, tiling: t, kind: 'endpoint', regular: t.polys.length > 0 && tilingDefect(t.polys) < REGULAR_TOL });
  }
  const step = 0.5, xs: number[] = [], ys: number[] = [];
  for (let a = lo + step; a < hi; a += step) { xs.push(a); ys.push(tilingDefect(evalAt(a).polys)); }
  const mids: NodeState[] = [];
  for (let i = 1; i < xs.length - 1; i++) {
    if (ys[i] < ys[i - 1] && ys[i] <= ys[i + 1]) {
      let a0 = xs[i - 1], a1 = xs[i + 1];
      for (let it = 0; it < 50; it++) {
        const m0 = a0 + (a1 - a0) / 3, m1 = a1 - (a1 - a0) / 3;
        if (tilingDefect(evalAt(m0).polys) < tilingDefect(evalAt(m1).polys)) a1 = m1; else a0 = m0;
      }
      const a = (a0 + a1) / 2, t = evalAt(a);
      if (tilingDefect(t.polys) < REGULAR_TOL && isEdgeToEdge(t)) mids.push({ alpha: a, tiling: t, kind: 'interior', regular: true });
    }
  }
  return [ends[0], ...mids.sort((p, q) => p.alpha - q.alpha), ends[1]];
}

/** One boundary 1-cell: the two endpoint node-states plus the tiling MIDWAY between them along the side.
 *  The mid tiling is the edge's identity — two boundary segments are the same 1-cell iff their mid
 *  tilings are congruent (up to direct similarity), which distinguishes the four distinct sides of a face
 *  and glues a side shared by two faces. */
export interface BoundaryEdge { from: NodeState; to: NodeState; mid: FloatTiling; }
export interface TwoCell { corners: NodeState[]; boundary: BoundaryEdge[]; productOK: boolean; }

function sideEdges(evalAt: (a: number) => FloatTiling, nodes: NodeState[]): BoundaryEdge[] {
  const es: BoundaryEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i], b = nodes[i + 1];
    es.push({ from: a, to: b, mid: cleaned(evalAt((a.alpha + b.alpha) / 2)) });
  }
  return es;
}
const reverseSide = (es: BoundaryEdge[]): BoundaryEdge[] =>
  es.slice().reverse().map((e) => ({ from: e.to, to: e.from, mid: e.mid }));

/**
 * Develop a two-parameter family as a square 2-cell. The boundary is one closed CCW loop of 1-cells,
 * stitched from the four sides (α₂=lo, α₁:lo→hi) → (α₁=hi, α₂:lo→hi) → (α₂=hi, α₁:hi→lo) →
 * (α₁=lo, α₂:hi→lo); adjacent sides share a corner node, so the loop closes. Each side may subdivide at
 * an interior regular node.
 */
export function extractTwoCell(pc: ParametricCellData): TwoCell {
  const [lo1, hi1] = pc.params[0].alphaRangeDegOpen;
  const [lo2, hi2] = pc.params[1].alphaRangeDegOpen;
  const at = (a1: number, a2: number) => cleaned(toFloat(evaluateParamCell(pc, [a1, a2])));

  const e0 = (a1: number) => at(a1, lo2 + EPS);
  const e1 = (a2: number) => at(hi1 - EPS, a2);
  const e2 = (a1: number) => at(a1, hi2 - EPS);
  const e3 = (a2: number) => at(lo1 + EPS, a2);
  const s0 = sideEdges(e0, sweepNodes(e0, lo1, hi1));
  const s1 = sideEdges(e1, sweepNodes(e1, lo2, hi2));
  const s2 = reverseSide(sideEdges(e2, sweepNodes(e2, lo1, hi1)));
  const s3 = reverseSide(sideEdges(e3, sweepNodes(e3, lo2, hi2)));
  const boundary = [...s0, ...s1, ...s2, ...s3];
  const corners = [s0[0].from, s1[0].from, s2[0].from, s3[0].from];

  // Product-square grid check: is the interior a valid tiling throughout the (α₁,α₂) square? The proxy is
  // edge-to-edge closure (vertex angle-sums = 360°), NOT regularity — an isotoxal family tiles by
  // non-regular tiles everywhere except the α=90 point, so `tilingDefect` (deviation from a REGULAR
  // polygon) is large across a valid interior and is the wrong measure. A family whose validity genuinely
  // breaks in a sub-region fails `isEdgeToEdge` there and is flagged non-product.
  let productOK = true;
  const N = 5;
  for (let i = 1; i < N && productOK; i++) for (let j = 1; j < N && productOK; j++) {
    const a1 = lo1 + ((hi1 - lo1) * i) / N, a2 = lo2 + ((hi2 - lo2) * j) / N;
    const t = at(a1, a2);
    if (t.polys.length === 0 || !isEdgeToEdge(t)) productOK = false;
  }
  return { corners, boundary, productOK };
}
