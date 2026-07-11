import { CyclotomicRing } from '@/classes';
import { enumerateConvexFamily } from './convexTiles';
import { dissect } from './dissect';

/**
 * The two "composable tile" families over the 30° grid.
 *   Family B (convex)       — all 11 convex unit-edge tiles (`enumerateConvexFamily`).
 *   Family A (decomposable) — the subset of B that dissects edge-to-edge into unit regular
 *                             {3,4,6,12} pieces (`dissect`, exact). A ⊆ B.
 * Every decomposability verdict is exact ℤ[ζ₂₄]-signed; float never enters the decision.
 */

export type ComposableTile = {
  word: number[];
  sides: number;
  name: string;
  decomposable: boolean;
  pieceCounts: Record<number, number>;
};

/** One row of Table A: a side-count "family" with its convex/decomposable counts and corner classes. */
export type FamilyRow = {
  sides: number;
  convexCount: number;
  decomposableCount: number;
  cornerClasses: number;
};

/** Fundamental rotation period of a cyclic word (smallest p | len with w[i]==w[i+p]). */
export function period(w: number[]): number {
  const L = w.length;
  for (let p = 1; p <= L; p++) {
    if (L % p) continue;
    if (w.every((x, i) => x === w[(i + p) % L])) return p;
  }
  return L;
}

/** Stable name: side count + dash + the canonical angle-word (e.g. "cx4-2.4.2.4"). */
function nameFor(word: number[]): string {
  return `cx${word.length}-${word.join('.')}`;
}

export function generateFamily(ring: CyclotomicRing): {
  convex: ComposableTile[];
  decomposable: ComposableTile[];
  tableA: FamilyRow[];
} {
  const convex: ComposableTile[] = enumerateConvexFamily(ring).map(word => {
    const { decomposable, pieces } = dissect(word, ring);
    const pieceCounts: Record<number, number> = {};
    for (const p of pieces) pieceCounts[p.n] = (pieceCounts[p.n] ?? 0) + 1;
    return { word, sides: word.length, name: nameFor(word), decomposable, pieceCounts };
  });
  const decomposable = convex.filter(t => t.decomposable);
  return { convex, decomposable, tableA: buildTable(convex) };
}

/** cornerClasses = Σ over the side-count's CONVEX tiles of the word's fundamental period. */
function buildTable(convex: ComposableTile[]): FamilyRow[] {
  const bySides = new Map<number, ComposableTile[]>();
  for (const t of convex) {
    const arr = bySides.get(t.sides) ?? [];
    arr.push(t);
    bySides.set(t.sides, arr);
  }
  return [...bySides.keys()].sort((a, b) => a - b).map(sides => {
    const fam = bySides.get(sides)!;
    return {
      sides,
      convexCount: fam.length,
      decomposableCount: fam.filter(t => t.decomposable).length,
      cornerClasses: fam.reduce((s, t) => s + period(t.word), 0),
    };
  });
}
