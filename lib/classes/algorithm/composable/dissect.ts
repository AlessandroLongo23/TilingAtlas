import { Cyclotomic, CyclotomicRing } from '@/classes';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';
import { exactPolygonsOverlap, orient2D } from '@/classes/algorithm/exact/exactOverlap';
import { tileVertices } from './convexTiles';
import { liftTo24 } from './Polyform';

/**
 * Exact edge-to-edge decomposability oracle for the convex composable tiles.
 *
 * `dissect(word, ring)` decides whether the convex unit-edge tile `word` (a cyclic angle-word over
 * {2,3,4,5}, see convexTiles.ts) tiles into unit REGULAR {3,4,6,12} pieces, edge-to-edge, and
 * returns a witness dissection when it does. Every decision is EXACT: vertex identity and edge
 * direction live in ℤ[ζ₁₂]; the inside-P and proper-overlap predicates lift to ℤ[ζ₂₄] (Surd signs)
 * exactly as `Polyform.glue` does. No float ever enters the verdict.
 *
 * Port of a validated float prototype (scratchpad/dissect.py). DFS that always covers the
 * canonical-minimum uncovered-boundary edge, so each placement is forced to seat its first edge on
 * that edge — the search branches only over the 4 regular orders, and every step strictly shrinks
 * the uncovered area.
 */

const REGULAR_ORDERS = [3, 4, 6, 12] as const;
/** Depth safety cap. The largest real dissection in this family is 12 tiles; 24 is a loud margin. */
const MAX_TILES = 24;

export type DirectedEdge = { a: Cyclotomic; b: Cyclotomic };

/**
 * Directed boundary of the still-uncovered region P \ placed, as unit edges with the uncovered
 * region on their LEFT. P contributes its CCW edges AS-IS; each placed tile contributes its CCW
 * edges REVERSED (the region subtracts the tiles ⇒ their boundary flips). Opposite directed pairs
 * cancel: a directed edge survives iff count(u→v) − count(v→u) > 0. Endpoints keyed by exact
 * `Cyclotomic.key()` (N=12), so the cancellation is exact, never a float coincidence.
 */
export function uncoveredBoundary(P: Cyclotomic[], placed: RegularPolygon[]): DirectedEdge[] {
  const count = new Map<string, number>();
  const point = new Map<string, DirectedEdge>();
  const bump = (a: Cyclotomic, b: Cyclotomic): void => {
    const k = `${a.key()}|${b.key()}`;
    count.set(k, (count.get(k) ?? 0) + 1);
    if (!point.has(k)) point.set(k, { a, b });
  };
  const n = P.length;
  for (let i = 0; i < n; i++) bump(P[i], P[(i + 1) % n]);        // P CCW, as-is
  for (const T of placed) {
    const v = T.exactVertices!;
    const m = v.length;
    for (let i = 0; i < m; i++) bump(v[(i + 1) % m], v[i]);       // tile CCW edges, reversed
  }
  const out: DirectedEdge[] = [];
  for (const [k, c] of count) {
    const { a, b } = point.get(k)!;
    const rev = count.get(`${b.key()}|${a.key()}`) ?? 0;
    if (c - rev > 0) out.push({ a, b });
  }
  return out;
}

/**
 * True iff every vertex of the (N=24-lifted) tile lies inside-or-on the CCW convex polygon P (also
 * N=24-lifted): orient(P_i, P_{i+1}, v) ≥ 0 for every directed P edge. Exact via `orient2D` (detSurd
 * sign) — the same machinery the star overlap test uses.
 *
 * PRECONDITION: P must be CONVEX. A vertices-only test implies full tile containment only because the
 * convex hull of the contained vertices ⊆ convex P. On a non-convex P a tile bulging across a reflex
 * notch would be wrongly admitted — do not reuse this on non-convex targets without an edge-crossing test.
 */
function tileInsideP(tile24: Cyclotomic[], P24: Cyclotomic[]): boolean {
  const n = P24.length;
  for (const v of tile24) {
    for (let i = 0; i < n; i++) {
      if (orient2D(P24[i], P24[(i + 1) % n], v) < 0) return false;
    }
  }
  return true;
}

/**
 * Decide edge-to-edge decomposability of the convex tile `word` into unit regular {3,4,6,12}.
 * Returns `{ decomposable: true, pieces }` with a witness dissection, or `{ decomposable: false,
 * pieces: [] }`. The witness pieces are CCW `RegularPolygon`s in the N=12 ring.
 */
export function dissect(
  word: number[],
  ring: CyclotomicRing,
): { decomposable: boolean; pieces: RegularPolygon[] } {
  const P = tileVertices(word, ring);            // exact CCW vertices, N=12
  const P24 = P.map(liftTo24);
  const placed: RegularPolygon[] = [];
  const placed24: Cyclotomic[][] = [];           // parallel N=24 lift cache

  const dfs = (depth: number): RegularPolygon[] | null => {
    const frontier = uncoveredBoundary(P, placed);
    if (frontier.length === 0) return placed.slice();     // fully covered ⇒ success
    if (depth >= MAX_TILES) return null;                  // cap (loud margin; see MAX_TILES)

    // canonical-minimum frontier edge, ordered by a.key() then b.key()
    let e = frontier[0];
    for (const f of frontier) {
      const fa = f.a.key(), ea = e.a.key();
      if (fa < ea || (fa === ea && f.b.key() < e.b.key())) e = f;
    }
    const dir = ring.expFromZetaKey(e.b.sub(e.a).key());
    if (dir === undefined) throw new Error('dissect: frontier edge is not a unit ζ direction (bug)');

    for (const n of REGULAR_ORDERS) {
      const T = RegularPolygon.fromAnchorAndDirExact(n, e.a, dir); // CCW n-gon, first edge e.a→e.b
      const T24 = T.exactVertices!.map(liftTo24);
      if (!tileInsideP(T24, P24)) continue;
      if (placed24.some(U24 => exactPolygonsOverlap(T24, U24))) continue;
      placed.push(T);
      placed24.push(T24);
      const r = dfs(depth + 1);
      if (r) return r;
      placed.pop();
      placed24.pop();
    }
    return null;
  };

  const sol = dfs(0);
  return sol ? { decomposable: true, pieces: sol } : { decomposable: false, pieces: [] };
}
