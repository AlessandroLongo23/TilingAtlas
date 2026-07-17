import type { FloatTiling } from './types';

/**
 * Oriented vertex-configuration fingerprint of a tiling.
 *
 * `eps` is a vertex-weld tolerance: corners within `eps` are treated as one vertex.
 * The default 1e-3 merges the ~1e-5 sliver left when a family is evaluated just inside
 * a degenerate endpoint (a tile collapsed but not to exactly zero area), while staying
 * far below the unit spacing of genuine distinct vertices. `dedup` (default true) returns
 * the SET of distinct vertex configurations, so the fingerprint is independent of how
 * large a fundamental domain the cell spans — a doubled cell signs like its primitive.
 * Catalogue tilings and deformed family node states must be signed with the same options
 * for their signatures to be comparable.
 */
export function tilingSignature(t: FloatTiling, opts: { eps?: number; dedup?: boolean } = {}): string {
  const eps = opts.eps ?? 1e-3;
  const dedup = opts.dedup ?? true;
  const key2 = (x: number, y: number) => `${Math.round(x / eps)},${Math.round(y / eps)}`;
  type Inc = { n: number; cx: number; cy: number };
  const at = new Map<string, { x: number; y: number; inc: Inc[] }>();
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    const ox = t.basis[0][0] * i + t.basis[1][0] * j;
    const oy = t.basis[0][1] * i + t.basis[1][1] * j;
    for (const p of t.polys) {
      let cx = 0, cy = 0;
      for (const [vx, vy] of p.verts) { cx += vx + ox; cy += vy + oy; }
      cx /= p.verts.length; cy /= p.verts.length;
      for (const [vx, vy] of p.verts) {
        const x = vx + ox, y = vy + oy, k = key2(x, y);
        const slot = at.get(k) ?? { x, y, inc: [] };
        slot.inc.push({ n: p.n, cx, cy });
        at.set(k, slot);
      }
    }
  }
  const det = t.basis[0][0] * t.basis[1][1] - t.basis[0][1] * t.basis[1][0];
  // One representative per lattice orbit: keep the vertex with the MOST incident
  // polygons — the fully-surrounded interior copy. A first-encountered-wins rule
  // can lock onto a window-boundary vertex that happens to have exactly 3
  // incidences (which the `< 3` rim filter does not catch), truncating e.g. 3^6
  // to "3.3.3". Widening the window cannot fix that: the bottom-left boundary is
  // visited first at any size, so a partial vertex always precedes a full one.
  const rep = new Map<string, { x: number; y: number; inc: Inc[] }>();
  for (const v of at.values()) {
    const a = (v.x * t.basis[1][1] - v.y * t.basis[1][0]) / det;
    const b = (t.basis[0][0] * v.y - t.basis[0][1] * v.x) / det;
    const fa = a - Math.floor(a + eps), fb = b - Math.floor(b + eps);
    const orbit = `${Math.round(fa / eps)},${Math.round(fb / eps)}`;
    const cur = rep.get(orbit);
    if (!cur || v.inc.length > cur.inc.length) rep.set(orbit, v);
  }
  const seqs: string[] = [];
  for (const { x, y, inc } of rep.values()) {
    if (inc.length < 3) continue; // rim/partial orbit with no complete representative in-window
    const ordered = inc.slice().sort((p, q) => Math.atan2(p.cy - y, p.cx - x) - Math.atan2(q.cy - y, q.cx - x));
    seqs.push(minRotation(ordered.map((p) => p.n)).join('.'));
  }
  const arr = dedup ? [...new Set(seqs)] : seqs;
  return arr.sort().join(';');
}

function minRotation(ns: number[]): number[] {
  let best: number[] | null = null;
  for (let s = 0; s < ns.length; s++) {
    const rot = ns.slice(s).concat(ns.slice(0, s));
    if (best === null || cmp(rot, best) < 0) best = rot;
  }
  return best!;
}
const cmp = (a: number[], b: number[]) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
