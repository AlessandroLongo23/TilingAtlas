// figures/trace/poolFigure.ts
/** F5 — the short-vector pool (candidate translation vectors) drawn as arrows from the origin, with
 *  the WINNING lattice (the example's) parallelogram in full. Uses the smallest pool for legibility;
 *  caps arrow count. */
import type { FigureIR, FigureElement, V2 } from '../ir/types';
import type { PoolNode, LatticeNode } from './loadTrace';

const MAX_ARROWS = 60;

export function poolFigure(pools: PoolNode[], lattices: LatticeNode[], winnerKey: string): FigureIR {
  const pool = [...pools].filter((p) => p.vectors.length).sort((a, b) => a.vectors.length - b.vectors.length)[0];
  const vecs = (pool?.vectors ?? []).slice(0, MAX_ARROWS);
  const elements: FigureElement[] = [];
  let ext = 1;
  for (const [x, y] of vecs) {
    elements.push({ kind: 'arrow', from: { x: 0, y: 0 }, to: { x, y }, styleRef: 'vec:pool' });
    ext = Math.max(ext, Math.abs(x), Math.abs(y));
  }
  let winner: [[number, number], [number, number]] | null = null;
  for (const l of lattices) { const c = l.candidates.find((c) => c.key === winnerKey); if (c) { winner = c.basis; break; } }
  if (winner) {
    const [u, v] = winner;
    const o: V2 = { x: 0, y: 0 };
    const uu: V2 = { x: u[0], y: u[1] };
    const vv: V2 = { x: v[0], y: v[1] };
    const uv: V2 = { x: u[0] + v[0], y: u[1] + v[1] };
    elements.push({ kind: 'polyline', verts: [o, uu, uv, vv], closed: true, styleRef: 'vec:winner' });
    elements.push({ kind: 'arrow', from: o, to: uu, styleRef: 'vec:winner' });
    elements.push({ kind: 'arrow', from: o, to: vv, styleRef: 'vec:winner' });
    elements.push({ kind: 'text', at: { x: uu.x, y: uu.y }, tex: '$\\vec u$', styleRef: 'label:basis' });
    elements.push({ kind: 'text', at: { x: vv.x, y: vv.y }, tex: '$\\vec v$', styleRef: 'label:basis' });
    ext = Math.max(ext, Math.abs(uv.x), Math.abs(uv.y));
  }
  const m = ext + 1;
  return { bbox: { minX: -m, minY: -m, maxX: m, maxY: m }, elements };
}
