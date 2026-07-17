import type { FloatTiling } from './types';
import { effectiveVerts, polyArea } from './geometry';

// Identity for the non-edge-to-edge "flattening" limits. When a tile's corner reaches 180° it does not
// vanish — it flattens into a larger regular polygon (a dodecagon → a hexagon of twice the edge), and
// the plane stays fully tiled. The result is a genuine tiling by regular polygons of two sizes, but
// non-edge-to-edge (the small tile's corner meets the middle of the large tile's edge, a T-junction),
// so it has no valid vertex figure and matches nothing in the uniform catalogue.
//
// These limits get their own nodes, merged up to DIRECT similarity (rotation, translation, uniform
// scale, lattice relabeling — no reflection) so the same limit reached from two families, or from one
// family's two ends, is a single node. The key below is a similarity invariant built from the
// scale-normalised tile multiset, the Gauss-reduced period lattice, and the centroid distance spectrum.
// It is chirality-blind (distances are reflection-invariant); none of the k=1 flatten limits is chiral,
// and a handedness-sensitive refinement is deferred, matching the resolver's existing chirality note.

const dot = (p: [number, number], q: [number, number]) => p[0] * q[0] + p[1] * q[1];

/** Gauss (Lagrange) 2D lattice reduction: returns the two shortest independent vectors. */
function gaussReduce(u: [number, number], v: [number, number]): [[number, number], [number, number]] {
  let a: [number, number] = [u[0], u[1]], b: [number, number] = [v[0], v[1]];
  for (let it = 0; it < 100; it++) {
    if (dot(b, b) < dot(a, a)) { const t = a; a = b; b = t; }
    const m = Math.round(dot(a, b) / dot(a, a));
    if (m === 0) break;
    b = [b[0] - m * a[0], b[1] - m * a[1]];
  }
  return [a, b];
}

const rnd = (x: number, p = 1000) => Math.round(x * p) / p;
const edge0 = (v: [number, number][]) => Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]);
const centroid = (v: [number, number][]): [number, number] => {
  let x = 0, y = 0; for (const p of v) { x += p[0]; y += p[1]; } return [x / v.length, y / v.length];
};

function effTiles(t: FloatTiling): [number, number][][] {
  return t.polys.map((p) => effectiveVerts(p.verts)).filter((v) => v.length >= 3);
}

/** Shortest edge over every effective tile — the scale unit that makes the key similarity-invariant. */
function scaleUnit(tiles: [number, number][][]): number {
  let s = Infinity;
  for (const v of tiles) for (let i = 0; i < v.length; i++) {
    const q = v[(i + 1) % v.length];
    s = Math.min(s, Math.hypot(v[i][0] - q[0], v[i][1] - q[1]));
  }
  return Number.isFinite(s) && s > 0 ? s : 1;
}

export function flattenKey(t: FloatTiling): string {
  const tiles = effTiles(t);
  const s = scaleUnit(tiles);
  const tileDesc = tiles.map((v) => `${v.length}@${rnd(polyArea(v) / (s * s))}`).sort();
  const [ru, rw] = gaussReduce([t.basis[0][0] / s, t.basis[0][1] / s], [t.basis[1][0] / s, t.basis[1][1] / s]);
  // |dot| and |cross|, not signed: reflection flips both, and the key is chirality-blind, so a limit
  // and its mirror (a family's two ends related by α ↔ range-reflection) must land on one node.
  const lat = [rnd(Math.hypot(ru[0], ru[1])), rnd(Math.hypot(rw[0], rw[1])), rnd(Math.abs(ru[0] * rw[1] - ru[1] * rw[0])), rnd(Math.abs(dot(ru, rw)))];
  const c = tiles.map(centroid);
  const d: number[] = [];
  for (let i = 0; i < c.length; i++) for (let j = 0; j < c.length; j++) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    if (i === j && a === 0 && b === 0) continue;
    const dx = c[j][0] + t.basis[0][0] * a + t.basis[1][0] * b - c[i][0];
    const dy = c[j][1] + t.basis[0][1] * a + t.basis[1][1] * b - c[i][1];
    d.push(rnd(Math.hypot(dx, dy) / s, 100));
  }
  d.sort((x, y) => x - y);
  return JSON.stringify({ t: tileDesc, l: lat, d: d.slice(0, 20) });
}

const SUP: Record<number, string> = { 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶' };
/** Human label: effective side counts with a size superscript when a tile is enlarged (e.g. 4.4² is a
 *  unit square beside a double square; 3.3.6² is two unit triangles beside a double hexagon). */
export function flattenLabel(t: FloatTiling): string {
  const tiles = effTiles(t);
  const s = scaleUnit(tiles);
  return tiles
    .map((v) => { const k = Math.round(edge0(v) / s); return `${v.length}${k > 1 ? SUP[k] ?? '^' + k : ''}`; })
    .sort()
    .join('.');
}
