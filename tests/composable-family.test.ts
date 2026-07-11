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
