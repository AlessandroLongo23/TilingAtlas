import { evaluateParamCell, type ParametricCellData } from '@/lib/utils/paramCell';
import type { FloatTiling, NodeState } from './types';

const polyArea = (verts: [number, number][]): number => {
  let s = 0;
  for (let i = 0; i < verts.length; i++) { const a = verts[i], b = verts[(i + 1) % verts.length]; s += a[0] * b[1] - a[1] * b[0]; }
  return Math.abs(s) / 2;
};

type EvalPoly = { n: number; star?: boolean; vertices: [number, number][] };

const toFloat = (cell: ReturnType<typeof evaluateParamCell>): FloatTiling => ({
  polys: (cell.cellPolygons as EvalPoly[]).map((p) => ({ n: p.n, star: p.star, verts: p.vertices })),
  basis: cell.basis as [[number, number], [number, number]],
});

/** How far one polygon is from regular: worst edge-length spread plus worst interior-angle error (radians). */
function polyDefect(verts: [number, number][]): number {
  const n = verts.length;
  const e: number[] = [], ang: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = verts[(i - 1 + n) % n], b = verts[i], c = verts[(i + 1) % n];
    e.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
    const u = [a[0] - b[0], a[1] - b[1]], v = [c[0] - b[0], c[1] - b[1]];
    ang.push(Math.acos((u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]))));
  }
  const meanE = e.reduce((s, x) => s + x, 0) / e.length;
  const regAng = (Math.PI * (n - 2)) / n;
  return Math.max(...e.map((x) => Math.abs(x - meanE))) + Math.max(...ang.map((x) => Math.abs(x - regAng)));
}

/**
 * Whole-tiling regularity defect: the WORST tile's defect. Zero iff every tile is regular —
 * the symmetry-maximal state that marks an interior node. Taking the worst tile (not the
 * best) is essential: a family can carry non-flexing regular tiles whose defect is always
 * zero, and minimizing over tiles would let those mask the flexing tile and fire at every α.
 */
function tilingDefect(t: FloatTiling): number {
  let worst = 0;
  for (const p of t.polys) worst = Math.max(worst, polyDefect(p.verts));
  return worst;
}

const REGULAR_TOL = 1e-3; // accept an interior node only if the refined worst-tile defect is below this

export function extractNodes(pc: ParametricCellData): NodeState[] {
  const [lo, hi] = pc.params[0].alphaRangeDegOpen;
  const out: NodeState[] = [];

  // Endpoints: drop tiles collapsed to ~zero area; the residue is the limit tiling. A family
  // whose only tile collapses leaves nothing — not a real tiling limit, so it is not a node.
  for (const a of [lo + 1e-3, hi - 1e-3]) {
    const t = toFloat(evaluateParamCell(pc, a));
    t.polys = t.polys.filter((p) => polyArea(p.verts) > 1e-4);
    if (t.polys.length === 0) continue;
    out.push({ alpha: a, tiling: t, kind: 'endpoint' });
  }

  // Interior nodes: local minima of the whole-tiling defect, each refined by golden-section
  // search, kept only if the refined state is genuinely regular (every tile regular). The
  // coarse-grid value is not thresholded directly — a node between grid points can read well
  // above the tolerance at the nearest sample, so acceptance is decided after refinement.
  const step = 0.5, xs: number[] = [], ys: number[] = [];
  for (let a = lo + step; a < hi; a += step) { xs.push(a); ys.push(tilingDefect(toFloat(evaluateParamCell(pc, a)))); }
  for (let i = 1; i < xs.length - 1; i++) {
    if (ys[i] < ys[i - 1] && ys[i] <= ys[i + 1]) {
      let a0 = xs[i - 1], a1 = xs[i + 1];
      for (let it = 0; it < 50; it++) {
        const m0 = a0 + (a1 - a0) / 3, m1 = a1 - (a1 - a0) / 3;
        if (tilingDefect(toFloat(evaluateParamCell(pc, m0))) < tilingDefect(toFloat(evaluateParamCell(pc, m1)))) a1 = m1; else a0 = m0;
      }
      const a = (a0 + a1) / 2;
      const t = toFloat(evaluateParamCell(pc, a));
      if (tilingDefect(t) < REGULAR_TOL) out.push({ alpha: a, tiling: t, kind: 'interior' });
    }
  }
  return out;
}
