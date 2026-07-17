// scripts/moduli-graph/twoCellExtractor.ts
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
 *  regular edge-to-edge minima, ordered by a. Mirrors nodeExtractor's logic along an arbitrary slice. */
function sweep(evalAt: (a: number) => FloatTiling, lo: number, hi: number): NodeState[] {
  const out: NodeState[] = [];
  for (const a of [lo + EPS, hi - EPS]) {
    const t = cleaned(evalAt(a));
    out.push({ alpha: a, tiling: t, kind: 'endpoint', regular: t.polys.length > 0 && tilingDefect(t.polys) < REGULAR_TOL });
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
  // endpoints first two entries; splice interior nodes in ascending-a order between them
  const [start, end] = out;
  return [start, ...mids.sort((p, q) => p.alpha - q.alpha), end];
}

export interface TwoCell { corners: NodeState[]; boundary: NodeState[]; productOK: boolean; }

/** Develop a two-parameter family as a square 2-cell. Sides in CCW order:
 *  (α₂=lo, α₁: lo→hi), (α₁=hi, α₂: lo→hi), (α₂=hi, α₁: hi→lo), (α₁=lo, α₂: hi→lo). */
export function extractTwoCell(pc: ParametricCellData): TwoCell {
  const [lo1, hi1] = pc.params[0].alphaRangeDegOpen;
  const [lo2, hi2] = pc.params[1].alphaRangeDegOpen;
  const at = (a1: number, a2: number) => cleaned(toFloat(evaluateParamCell(pc, [a1, a2])));

  const sides: NodeState[][] = [
    sweep((a1) => at(a1, lo2 + EPS), lo1, hi1),
    sweep((a2) => at(hi1 - EPS, a2), lo2, hi2),
    sweep((a1) => at(a1, hi2 - EPS), lo1, hi1).reverse(),
    sweep((a2) => at(lo1 + EPS, a2), lo2, hi2).reverse(),
  ];
  const corners = sides.map((s) => s[0]);
  // Stitch: drop each side's first state (it repeats the previous side's last), leaving one closed loop.
  const boundary: NodeState[] = [];
  for (const s of sides) boundary.push(...s.slice(1));

  // Product-square grid check: interior tiles validly throughout.
  let productOK = true;
  const N = 5;
  for (let i = 1; i < N && productOK; i++) for (let j = 1; j < N && productOK; j++) {
    const a1 = lo1 + ((hi1 - lo1) * i) / N, a2 = lo2 + ((hi2 - lo2) * j) / N;
    const t = at(a1, a2);
    if (t.polys.length === 0 || tilingDefect(t.polys) > REGULAR_TOL) productOK = false;
  }
  return { corners, boundary, productOK };
}
