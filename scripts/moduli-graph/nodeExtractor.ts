import { evaluateParamCell, type ParametricCellData } from '@/lib/utils/paramCell';
import type { FloatTiling, NodeState } from './types';
import { polyArea, tilingDefect, REGULAR_TOL } from './geometry';

type EvalPoly = { n: number; star?: boolean; vertices: [number, number][] };

const toFloat = (cell: ReturnType<typeof evaluateParamCell>): FloatTiling => ({
  polys: (cell.cellPolygons as EvalPoly[]).map((p) => ({ n: p.n, star: p.star, verts: p.vertices })),
  basis: cell.basis as [[number, number], [number, number]],
});

export function extractNodes(pc: ParametricCellData): NodeState[] {
  const [lo, hi] = pc.params[0].alphaRangeDegOpen;
  const out: NodeState[] = [];

  // Endpoints: drop tiles collapsed to ~zero area; the residue is the limit tiling. A family whose
  // only tile collapses leaves nothing — not a real tiling limit, so it is not a node. The endpoint
  // is tagged `regular` iff every remaining tile is regular by its EFFECTIVE corners (tilingDefect
  // accounts for flattened tiles, e.g. a dodecagon whose 180° corners make it a hexagon). A
  // non-regular endpoint is still emitted, but the resolver will leave it unresolved rather than
  // mislabel it against the combinatorial catalogue.
  for (const a of [lo + 1e-3, hi - 1e-3]) {
    const t = toFloat(evaluateParamCell(pc, a));
    t.polys = t.polys.filter((p) => polyArea(p.verts) > 1e-4);
    if (t.polys.length === 0) continue;
    out.push({ alpha: a, tiling: t, kind: 'endpoint', regular: tilingDefect(t.polys) < REGULAR_TOL });
  }

  // Interior nodes: local minima of the whole-tiling defect, refined by golden-section search, kept
  // only if the refined state is genuinely regular (every effective tile regular). These are regular
  // by construction of the acceptance gate.
  const step = 0.5, xs: number[] = [], ys: number[] = [];
  for (let a = lo + step; a < hi; a += step) { xs.push(a); ys.push(tilingDefect(toFloat(evaluateParamCell(pc, a)).polys)); }
  for (let i = 1; i < xs.length - 1; i++) {
    if (ys[i] < ys[i - 1] && ys[i] <= ys[i + 1]) {
      let a0 = xs[i - 1], a1 = xs[i + 1];
      for (let it = 0; it < 50; it++) {
        const m0 = a0 + (a1 - a0) / 3, m1 = a1 - (a1 - a0) / 3;
        if (tilingDefect(toFloat(evaluateParamCell(pc, m0)).polys) < tilingDefect(toFloat(evaluateParamCell(pc, m1)).polys)) a1 = m1; else a0 = m0;
      }
      const a = (a0 + a1) / 2;
      const t = toFloat(evaluateParamCell(pc, a));
      if (tilingDefect(t.polys) < REGULAR_TOL) out.push({ alpha: a, tiling: t, kind: 'interior', regular: true });
    }
  }
  return out;
}
