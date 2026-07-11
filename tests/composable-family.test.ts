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
    const grown = tri.glue(3);                       // all triangle-gluings, deduped by shape
    // every result has 2 tiles and a 4-edge boundary (rhombus) — triangles glue one way up to congruence
    expect(grown.every(pf => pf.tiles.length === 2)).toBe(true);
    expect(grown.some(pf => pf.boundaryHalfEdges().length === 4)).toBe(true);
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
