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
function liftTo24(z: Cyclotomic): Cyclotomic {
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
}
