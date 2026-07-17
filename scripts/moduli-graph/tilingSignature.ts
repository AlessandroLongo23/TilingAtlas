import type { FloatTiling } from './types';
import { effectiveVerts } from './geometry';

/**
 * Per-orbit vertex configurations of a tiling: for each distinct vertex (one representative per
 * lattice orbit), the cyclic sequence of surrounding polygon side-counts read counterclockwise and
 * rotated to its lexicographically smallest form. Orientation is retained (no reversal), the set is
 * deduplicated so the fingerprint is independent of fundamental-domain multiplicity.
 *
 * Each polygon is first reduced to its EFFECTIVE corners: a ~180° corner is a flattened non-corner,
 * so a dodecagon degenerated to a hexagon counts as a hexagon and its straight-through points are
 * not treated as tiling vertices. `eps` welds corners within tolerance into one vertex (default 1e-3
 * bridges the ~1e-5 sliver left when a family is evaluated just inside a degenerate endpoint).
 */
export function vertexConfigs(t: FloatTiling, opts: { eps?: number; dedup?: boolean } = {}): number[][] {
  const eps = opts.eps ?? 1e-3;
  const dedup = opts.dedup ?? true;
  const key2 = (x: number, y: number) => `${Math.round(x / eps)},${Math.round(y / eps)}`;
  type Inc = { n: number; cx: number; cy: number };
  const at = new Map<string, { x: number; y: number; inc: Inc[] }>();
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
    const ox = t.basis[0][0] * i + t.basis[1][0] * j;
    const oy = t.basis[0][1] * i + t.basis[1][1] * j;
    for (const p of t.polys) {
      const ev = effectiveVerts(p.verts);
      let cx = 0, cy = 0;
      for (const [vx, vy] of ev) { cx += vx + ox; cy += vy + oy; }
      cx /= ev.length; cy /= ev.length;
      for (const [vx, vy] of ev) {
        const x = vx + ox, y = vy + oy, k = key2(x, y);
        const slot = at.get(k) ?? { x, y, inc: [] };
        slot.inc.push({ n: ev.length, cx, cy });
        at.set(k, slot);
      }
    }
  }
  const det = t.basis[0][0] * t.basis[1][1] - t.basis[0][1] * t.basis[1][0];
  // One representative per lattice orbit: keep the vertex with the MOST incident polygons — the
  // fully-surrounded interior copy (a first-encountered vertex may be a partial window-boundary one).
  const rep = new Map<string, { x: number; y: number; inc: Inc[] }>();
  for (const v of at.values()) {
    const a = (v.x * t.basis[1][1] - v.y * t.basis[1][0]) / det;
    const b = (t.basis[0][0] * v.y - t.basis[0][1] * v.x) / det;
    const fa = a - Math.floor(a + eps), fb = b - Math.floor(b + eps);
    const orbit = `${Math.round(fa / eps)},${Math.round(fb / eps)}`;
    const cur = rep.get(orbit);
    if (!cur || v.inc.length > cur.inc.length) rep.set(orbit, v);
  }
  const seqs: number[][] = [];
  for (const { x, y, inc } of rep.values()) {
    if (inc.length < 3) continue;
    const ordered = inc.slice().sort((p, q) => Math.atan2(p.cy - y, p.cx - x) - Math.atan2(q.cy - y, q.cx - x));
    seqs.push(minRotation(ordered.map((p) => p.n)));
  }
  const asStr = (c: number[]) => c.join('.');
  const chosen = dedup ? [...new Map(seqs.map((c) => [asStr(c), c])).values()] : seqs;
  return chosen.sort((a, b) => (asStr(a) < asStr(b) ? -1 : asStr(a) > asStr(b) ? 1 : 0));
}

/** Hashable oriented vertex-configuration fingerprint — the `;`-joined sorted set of configs. */
export function tilingSignature(t: FloatTiling, opts: { eps?: number; dedup?: boolean } = {}): string {
  return vertexConfigs(t, opts).map((c) => c.join('.')).join(';');
}

/** Sum of the ideal interior angles of one vertex configuration, in degrees. A genuine planar tiling
 *  vertex sums to 360°; a degenerate/flattened limit does not (e.g. 3.3.3 = 180°, 3.6.6 = 300°). */
export function configAngleSum(cfg: number[]): number {
  return cfg.reduce((s, n) => s + ((n - 2) / n) * 180, 0);
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
