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

const flexN = (pc: ParametricCellData): number => {
  const m = /cx(\d+)/.exec(pc.params[0].tile ?? '');
  return m ? Number(m[1]) : 0;
};

function regularityDefect(t: FloatTiling, n: number): number {
  let best = Infinity;
  for (const p of t.polys) {
    if (p.n !== n) continue;
    const e: number[] = [], ang: number[] = [];
    for (let i = 0; i < p.verts.length; i++) {
      const a = p.verts[(i - 1 + p.verts.length) % p.verts.length], b = p.verts[i], c = p.verts[(i + 1) % p.verts.length];
      e.push(Math.hypot(b[0] - a[0], b[1] - a[1]));
      const u = [a[0] - b[0], a[1] - b[1]], v = [c[0] - b[0], c[1] - b[1]];
      ang.push(Math.acos((u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]))));
    }
    const meanE = e.reduce((s, x) => s + x, 0) / e.length;
    const regAng = (Math.PI * (n - 2)) / n;
    const defect = Math.max(...e.map((x) => Math.abs(x - meanE))) + Math.max(...ang.map((x) => Math.abs(x - regAng)));
    best = Math.min(best, defect);
  }
  return best;
}

export function extractNodes(pc: ParametricCellData): NodeState[] {
  const [lo, hi] = pc.params[0].alphaRangeDegOpen;
  const out: NodeState[] = [];

  for (const a of [lo + 1e-3, hi - 1e-3]) {
    const t = toFloat(evaluateParamCell(pc, a));
    t.polys = t.polys.filter((p) => polyArea(p.verts) > 1e-4);
    out.push({ alpha: a, tiling: t, kind: 'endpoint' });
  }

  const n = flexN(pc);
  if (n) {
    const step = 0.5, xs: number[] = [], ys: number[] = [];
    for (let a = lo + step; a < hi; a += step) { xs.push(a); ys.push(regularityDefect(toFloat(evaluateParamCell(pc, a)), n)); }
    for (let i = 1; i < xs.length - 1; i++) {
      if (ys[i] < ys[i - 1] && ys[i] <= ys[i + 1] && ys[i] < 1e-3) {
        let a0 = xs[i - 1], a1 = xs[i + 1];
        for (let it = 0; it < 40; it++) {
          const m0 = a0 + (a1 - a0) / 3, m1 = a1 - (a1 - a0) / 3;
          if (regularityDefect(toFloat(evaluateParamCell(pc, m0)), n) < regularityDefect(toFloat(evaluateParamCell(pc, m1)), n)) a1 = m1; else a0 = m0;
        }
        const a = (a0 + a1) / 2;
        out.push({ alpha: a, tiling: toFloat(evaluateParamCell(pc, a)), kind: 'interior' });
      }
    }
  }
  return out;
}
