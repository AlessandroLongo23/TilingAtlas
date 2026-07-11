import { describe, it, expect } from 'vitest';
import { CyclotomicRing, Cyclotomic } from '@/classes';
import { RegularPolygon } from '@/classes/polygons/RegularPolygon';
import { Polyform } from '@/classes/algorithm/composable/Polyform';

const ring = CyclotomicRing.create(12);
const origin = Cyclotomic.fromRational(ring, 0n); // exact 0 (confirmed: no Cyclotomic.zero)

describe('exact tile primitive', () => {
  it('places a unit triangle with three 60° (=2 unit) corners', () => {
    const t = RegularPolygon.fromAnchorAndDirExact(3, origin, 0);
    expect(t.exactVertices!.length).toBe(3);
    expect([0, 1, 2].map(i => t.cornerAngleUnits(i))).toEqual([2, 2, 2]);
  });
  it('places a unit square with four 90° (=3 unit) corners', () => {
    const s = RegularPolygon.fromAnchorAndDirExact(4, origin, 0);
    expect([0, 1, 2, 3].map(i => s.cornerAngleUnits(i))).toEqual([3, 3, 3, 3]);
  });
});

describe('Polyform boundary', () => {
  it('a single triangle has 3 boundary half-edges', () => {
    const pf = new Polyform([RegularPolygon.fromAnchorAndDirExact(3, origin, 0)]);
    expect(pf.boundaryHalfEdges().length).toBe(3);
  });
});

describe('Polyform glue', () => {
  it('gluing a triangle onto a triangle yields a 4-tile-edge rhombus (2 tiles)', () => {
    const tri = new Polyform([RegularPolygon.fromAnchorAndDirExact(3, origin, 0)]);
    const grown = tri.glue(3);                       // one polyform per boundary edge (no dedup here)
    // 3 boundary edges ⇒ 3 results (no overlap rejected); each is 2 triangles sharing an edge = 4-edge rhombus
    expect(grown.length).toBe(3);
    expect(grown.every(pf => pf.tiles.length === 2)).toBe(true);
    expect(grown.every(pf => pf.boundaryHalfEdges().length === 4)).toBe(true);
  });

  it('rejects candidate glues that would properly overlap (liftTo24 + exactPolygonsOverlap path)', () => {
    // Fan of 5 unit triangles sharing the origin vertex (dirs 0,2,4,6,8, each a 60° wedge) leaves a
    // concave 60° gap and has 7 boundary edges. Gluing a unit SQUARE onto each: the 2 edges bounding
    // the concave gap admit a square that properly overlaps a fan triangle ⇒ MUST be rejected, so
    // exactly 5 of 7 are accepted. Pins the overlap-rejection branch: a false-negative in liftTo24
    // (admitting an overlapping tile) would raise this count and fail — the "never silently admit a
    // tile" guard the fast glue tests do not exercise.
    const fan = new Polyform([0, 2, 4, 6, 8].map(d => RegularPolygon.fromAnchorAndDirExact(3, origin, d)));
    expect(fan.boundaryHalfEdges().length).toBe(7);
    expect(fan.glue(4).length).toBe(5);              // 7 candidates − 2 proper overlaps
  });
});

describe('Polyform canonicalKey', () => {
  it('a rhombus built from edge A equals one built from edge B (same shape)', () => {
    const tri = new Polyform([RegularPolygon.fromAnchorAndDirExact(3, origin, 0)]);
    const grown = tri.glue(3);
    const keys = new Set(grown.map(pf => pf.canonicalKey()));
    expect(keys.size).toBe(1);                       // all triangle+triangle glues are one rhombus
  });
  it('a rhombus and a square are different shapes', () => {
    const rhombus = new Polyform([RegularPolygon.fromAnchorAndDirExact(3, origin, 0)]).glue(3)[0];
    const square = new Polyform([RegularPolygon.fromAnchorAndDirExact(4, origin, 0)]);
    expect(rhombus.canonicalKey()).not.toBe(square.canonicalKey());
  });
});

describe('Polyform convexAngleWord', () => {
  it('rhombus (2 triangles) -> [2,4,2,4]', () => {
    const rhombus = new Polyform([RegularPolygon.fromAnchorAndDirExact(3, origin, 0)]).glue(3)[0];
    expect(rhombus.convexAngleWord()).toEqual([2, 4, 2, 4]);
  });
  it('a domino (2 squares) -> null (has 180° corners, not unit-edge convex)', () => {
    const domino = new Polyform([RegularPolygon.fromAnchorAndDirExact(4, origin, 0)]).glue(4)[0];
    expect(domino.convexAngleWord()).toBeNull();
  });
});

describe('canonicalCyclicWord chirality', () => {
  it('a chiral word and its reverse canonicalize to the same value (reflection branch)', () => {
    // [2,3,4,5] is not palindromic, so this genuinely drives the reverse arm of the dihedral min.
    expect(Polyform.canonicalCyclicWord([2, 3, 4, 5]))
      .toEqual(Polyform.canonicalCyclicWord([5, 4, 3, 2]));
    expect(Polyform.canonicalCyclicWord([2, 3, 4, 5])).toEqual([2, 3, 4, 5]);
  });
});
