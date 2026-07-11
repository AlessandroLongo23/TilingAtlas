import { Cyclotomic, CyclotomicRing } from '@/classes';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';
import { exactPolygonsOverlap } from '@/classes/algorithm/exact/exactOverlap';

export type HalfEdge = { startKey: string; endKey: string; start: Cyclotomic; end: Cyclotomic; dir: number };

// `exactPolygonsOverlap` decides everything through Surd real/imaginary-part readers (imSurd/reSurd)
// that hard-require the ℤ[ζ24] ring. Our tiles live in ℤ[ζ12] on purpose, so cornerAngleUnits reports
// 60° = 2 units (ℤ[ζ24] would report 4). Since ζ12 = ζ24², every ℤ[ζ12] element embeds in ℤ[ζ24] by
// doubling ζ-exponents, and the embedding preserves the exact complex value — so the proper-overlap
// decision (and the "shared glue edge is not a false positive" guarantee) is unchanged. We lift ONLY
// for the overlap call; all geometry/angle/key logic stays on N=12.
const RING24 = CyclotomicRing.create(24);
export function liftTo24(z: Cyclotomic): Cyclotomic {
  // ζ12 = ζ24² holds only for an N=12 source; a ring-24 (or other-N) input would be silently
  // mis-embedded (its power-basis coeffs mean different roots of unity), so reject it loudly.
  if (z.ring.N !== 12) throw new Error(`liftTo24: expected an N=12 element, got N=${z.ring.N}`);
  const num = z.num;
  let acc = Cyclotomic.fromRational(RING24, 0n);
  for (let j = 0; j < num.length; j++) {
    if (num[j] !== 0n) acc = acc.add(Cyclotomic.zeta(RING24, 2 * j).scaleRational(num[j], 1n));
  }
  return acc.scaleRational(1n, z.den);
}

export class Polyform {
  constructor(public readonly tiles: RegularPolygon[]) {}

  /** All directed unit edges of all tiles (CCW), keyed by exact endpoints. */
  private allHalfEdges(): HalfEdge[] {
    const out: HalfEdge[] = [];
    for (const t of this.tiles) {
      const v = t.exactVertices!;
      const d = t.edgeDirs!;
      for (let i = 0; i < v.length; i++) {
        const a = v[i], b = v[(i + 1) % v.length];
        out.push({ startKey: a.key(), endKey: b.key(), start: a, end: b, dir: d[i] });
      }
    }
    return out;
  }

  /** Boundary = edges whose reverse (endKey,startKey) is absent (shared edges cancel). */
  boundaryHalfEdges(): HalfEdge[] {
    const present = new Set(this.allHalfEdges().map(e => `${e.startKey}|${e.endKey}`));
    return this.allHalfEdges().filter(e => !present.has(`${e.endKey}|${e.startKey}`));
  }

  /** All ways to attach one unit regular n-gon across a boundary edge, overlap-rejected. */
  glue(n: number): Polyform[] {
    const ring = this.tiles[0].ring!;
    const out: Polyform[] = [];
    for (const e of this.boundaryHalfEdges()) {
      const revDir = ((e.dir + ring.N / 2) % ring.N + ring.N) % ring.N; // +6 mod 12: B->A
      const nu = RegularPolygon.fromAnchorAndDirExact(n, e.end, revDir);
      const nuLift = nu.exactVertices!.map(liftTo24);
      const overlaps = this.tiles.some(t =>
        exactPolygonsOverlap(nuLift, t.exactVertices!.map(liftTo24)));    // proper overlap; edge-sharing is NOT overlap
      if (!overlaps) out.push(new Polyform([...this.tiles, nu]));
    }
    return out;
  }

  /** Congruence-invariant key: min over the 24 grid isometries of the translation-normalized
   *  sorted per-tile exactKeys. transformedRigid('exact') gives a fresh transformed tile with no
   *  float rebuild; translateExact re-anchors to a canonical origin before keying.
   *
   *  DEVIATION from the plan: the plan anchored translation to "the lexicographically-min vertex
   *  key over all tiles", but a Cyclotomic's key string is NOT monotone under translation, so that
   *  anchor is not translation-covariant — two congruent placements related by a pure translation
   *  (which arise from a shape's own C_n symmetry, e.g. the three triangle+triangle rhombi) anchor
   *  to different vertices and produce spurious distinct keys (verified: rhombus edge-1 gained an
   *  8th orbit key not shared by edge-0/2, so keys.size==2). The vertex MEAN is translation-,
   *  rotation- and reflection-covariant, so subtracting it is a genuinely canonical translation
   *  normalization; it collapses all three rhombi to one key. */
  canonicalKey(): string {
    const ring = this.tiles[0].ring!;
    const zero = this.tiles[0].exactVertices![0].sub(this.tiles[0].exactVertices![0]); // exact 0
    let best: string | null = null;
    for (const reflect of [false, true]) {
      for (let rotK = 0; rotK < ring.N; rotK++) {
        const moved = this.tiles.map(t =>
          t.transformedRigid(zero, reflect, 0, rotK, zero, 'exact') as RegularPolygon);
        // canonical translation: subtract the vertex mean (translation-covariant, unlike a min key)
        let sum = zero, count = 0n;
        for (const t of moved) for (const v of t.exactVertices!) { sum = sum.add(v); count += 1n; }
        const negAnchor = zero.sub(sum.scaleRational(1n, count));
        const parts = moved
          .map(t => (t.translateExact(negAnchor) as RegularPolygon).exactKey())
          .sort();
        const key = parts.join('#');
        if (best === null || key < best) best = key;
      }
    }
    return best!;
  }

  /** Ordered boundary loop of vertex keys, or null if the boundary is not a single simple cycle. */
  private boundaryLoop(): HalfEdge[] | null {
    const bs = this.boundaryHalfEdges();
    const byStart = new Map<string, HalfEdge>();
    for (const e of bs) { if (byStart.has(e.startKey)) return null; byStart.set(e.startKey, e); }
    const loop: HalfEdge[] = [];
    let cur = bs[0];
    for (let i = 0; i < bs.length; i++) {
      loop.push(cur);
      const nxt = byStart.get(cur.endKey);
      if (!nxt) return null;
      cur = nxt;
      if (cur === bs[0]) break;
    }
    return loop.length === bs.length ? loop : null;   // single cycle covering every boundary edge
  }

  /** Interior angle (units of 2π/12) at the turn between two consecutive boundary edges. */
  private static interiorUnits(inDir: number, outDir: number, N: number): number {
    const ext = (((outDir - inDir) % N) + N) % N;      // left turn
    return (((N / 2 - ext) % N) + N) % N;              // interior = π − exterior
  }

  convexAngleWord(): number[] | null {
    const loop = this.boundaryLoop();
    if (!loop) return null;
    const N = this.tiles[0].ring!.N;
    const word: number[] = [];
    for (let i = 0; i < loop.length; i++) {
      const prev = loop[(i - 1 + loop.length) % loop.length];
      const u = Polyform.interiorUnits(prev.dir, loop[i].dir, N);
      if (u < 2 || u > 5) return null;                 // straight (6) or reflex (>6) ⇒ not a composable tile
      word.push(u);
    }
    return Polyform.canonicalCyclicWord(word);
  }

  /** Lexicographically-min rotation of the word or its reverse (dihedral canonical form). */
  static canonicalCyclicWord(w: number[]): number[] {
    const rots = (a: number[]) => a.map((_, s) => a.slice(s).concat(a.slice(0, s)));
    const all = [...rots(w), ...rots([...w].reverse())].map(a => a.join(','));
    const min = all.reduce((m, x) => (x < m ? x : m));
    return min.split(',').map(Number);
  }
}
