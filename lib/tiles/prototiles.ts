/**
 * Prototile SHAPES across the tile families — the shape-level companion to the tiling Library.
 * Each provider returns unit-edge polygons as float {x,y}[] for the card renderer (display-only,
 * outside the exact-arithmetic completeness spine).
 *
 * The four families are two pairs. Regular / convex-irregular are the "rigid" convex tiles. Star / isotoxal
 * are the two branches of ONE construction — the isotoxal 2n-gon (n points of angle α alternating
 * with n of angle β, α + β = 360 − 360/n): β > 180° gives a star (reflex dents), β < 180° gives the
 * convex isotoxal tile. The convex-irregular family ⊃ the alternating convex tiles on ζ₁₂, so a tile can appear under
 * more than one family filter; that overlap is real, not a bug.
 */
import { CyclotomicRing, StarParametricPolygon } from '@/classes';
import { generateFamily } from '@/lib/classes/algorithm/composable/generateFamily';
import { tileVertices } from '@/lib/classes/algorithm/composable/convexTiles';
import { enumerateConvexIsotoxal, isotoxalVertices } from '@/lib/isotoxal/enumerate';

export type TileFamily = 'regular' | 'convex' | 'star' | 'isotoxal' | 'isotoxalFull';

export interface Prototile {
  id: string;
  family: TileFamily;
  /** Display name. */
  name: string;
  /** Number of boundary vertices. */
  sideCount: number;
  /** Unit-edge boundary vertices, float. */
  vertices: { x: number; y: number }[];
  /** Small tags shown on the card (e.g. "ζ₁₂", "non-decomp"). */
  badges: string[];
  /** Non-convex star — the renderer colors it on the star hue ramp. */
  star?: boolean;
}

export const FAMILY_LABELS: Record<TileFamily, string> = {
  regular: 'Regular',
  convex: 'Convex irregular',
  star: 'Star',
  isotoxal: 'Isotoxal',
  isotoxalFull: 'Isotoxal (unified)',
};

// ── Regular ────────────────────────────────────────────────────────────────────────────────────

const REGULAR_NAMES: Record<number, string> = { 3: 'triangle', 4: 'square', 6: 'hexagon', 8: 'octagon', 12: 'dodecagon' };

/** Unit-edge regular n-gon centered at the origin, first vertex near the top. */
export function regularVertices(n: number): { x: number; y: number }[] {
  const R = 1 / (2 * Math.sin(Math.PI / n));
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    return { x: R * Math.cos(a), y: R * Math.sin(a) };
  });
}

/** The regular polygons that appear in edge-to-edge regular tilings. */
export const REGULAR_SIDES = [3, 4, 6, 8, 12] as const;

export function regularPrototiles(): Prototile[] {
  return REGULAR_SIDES.map((n) => ({
    id: `reg-${n}`,
    family: 'regular' as const,
    name: `Regular ${REGULAR_NAMES[n] ?? `${n}-gon`}`,
    sideCount: n,
    vertices: regularVertices(n),
    badges: [`${n}-gon`],
  }));
}

// ── Star (non-convex isotoxal) ───────────────────────────────────────────────────────────────────

/** The project's star species (from the ζ₂₄ and ζ₁₈ palettes): n points at interior angle αU·360/D°. */
const STAR_SPECIES: { n: number; alphaU: number; D: number }[] = [
  // star24 (D=24) — folds 3,4,6,8,12
  { n: 3, alphaU: 1, D: 24 }, { n: 3, alphaU: 2, D: 24 },
  { n: 4, alphaU: 2, D: 24 }, { n: 4, alphaU: 3, D: 24 }, { n: 4, alphaU: 4, D: 24 },
  { n: 6, alphaU: 2, D: 24 }, { n: 6, alphaU: 4, D: 24 }, { n: 6, alphaU: 5, D: 24 }, { n: 6, alphaU: 6, D: 24 },
  { n: 8, alphaU: 1, D: 24 }, { n: 8, alphaU: 3, D: 24 }, { n: 8, alphaU: 6, D: 24 },
  { n: 12, alphaU: 2, D: 24 }, { n: 12, alphaU: 4, D: 24 }, { n: 12, alphaU: 6, D: 24 },
  // star18 (D=18) — folds 9,18 only (3,6 already covered above)
  { n: 9, alphaU: 1, D: 18 }, { n: 9, alphaU: 2, D: 18 }, { n: 9, alphaU: 3, D: 18 },
  { n: 9, alphaU: 4, D: 18 }, { n: 9, alphaU: 5, D: 18 }, { n: 9, alphaU: 6, D: 18 },
  { n: 18, alphaU: 1, D: 18 }, { n: 18, alphaU: 2, D: 18 }, { n: 18, alphaU: 3, D: 18 },
  { n: 18, alphaU: 4, D: 18 }, { n: 18, alphaU: 5, D: 18 }, { n: 18, alphaU: 6, D: 18 }, { n: 18, alphaU: 7, D: 18 },
  // star20 (D=20) — the 5-fold family: folds 5,10,20 (n=4 skipped, redundant with star24's 4★)
  { n: 5, alphaU: 1, D: 20 }, { n: 5, alphaU: 2, D: 20 }, { n: 5, alphaU: 3, D: 20 },
  { n: 5, alphaU: 4, D: 20 }, { n: 5, alphaU: 5, D: 20 },
  { n: 10, alphaU: 1, D: 20 }, { n: 10, alphaU: 2, D: 20 }, { n: 10, alphaU: 3, D: 20 }, { n: 10, alphaU: 4, D: 20 },
  { n: 10, alphaU: 5, D: 20 }, { n: 10, alphaU: 6, D: 20 }, { n: 10, alphaU: 7, D: 20 },
  { n: 20, alphaU: 1, D: 20 }, { n: 20, alphaU: 2, D: 20 }, { n: 20, alphaU: 3, D: 20 }, { n: 20, alphaU: 4, D: 20 },
  { n: 20, alphaU: 5, D: 20 }, { n: 20, alphaU: 6, D: 20 }, { n: 20, alphaU: 7, D: 20 }, { n: 20, alphaU: 8, D: 20 },
];

export function starPrototiles(): Prototile[] {
  return STAR_SPECIES.map(({ n, alphaU, D }) => {
    const alphaDeg = (alphaU * 360) / D;
    const poly = StarParametricPolygon.fromCentroidAndAngle(n, (alphaU * 2 * Math.PI) / D);
    return {
      id: `star-${n}-${alphaU}-${D}`,
      family: 'star' as const,
      name: `${n}★ ${fmt(alphaDeg)}°`,
      sideCount: 2 * n,
      vertices: poly.vertices.map((v) => ({ x: v.x, y: v.y })),
      badges: [`${n}★`],
      star: true,
    };
  });
}

// ── Convex irregular (unit-edge on ζ₁₂) ──────────────────────────────────────────────────────────

export function convexPrototiles(): Prototile[] {
  const ring = CyclotomicRing.create(12); // convexTiles reads directions as 30° units — MUST be N=12
  return generateFamily(ring).convex.map((t) => ({
    id: `convex-${t.name}`,
    family: 'convex' as const,
    name: t.name,
    sideCount: t.word.length,
    vertices: tileVertices(t.word, ring).map((c) => {
      const v = c.toVector();
      return { x: v.x, y: v.y };
    }),
    badges: [t.decomposable ? 'decomposable' : 'non-decomp'],
  }));
}

// ── Isotoxal (convex, two alternating angles) ────────────────────────────────────────────────────

export function isotoxalPrototiles(gridN: number): Prototile[] {
  return enumerateConvexIsotoxal({ gridN, maxSideCount: 24 }).groups.flatMap((g) =>
    g.tiles.map((t) => ({
      id: t.key,
      family: 'isotoxal' as const,
      name: t.name,
      sideCount: t.sideCount,
      vertices: isotoxalVertices(t.sideCount, t.alpha),
      badges: t.onZeta12 ? ['ζ₁₂'] : [],
    })),
  );
}

// ── Isotoxal, unified (convex + concave/star, one continuum) ─────────────────────────────────────

/**
 * The whole isotoxal family on one grid — convex members AND their concave (star) continuation past
 * β = 180°, in a single α-sorted sequence per side-count. This is the "they're one object" view: the
 * same 2n-gon walked from a convex tile into a reflex-vertex star as α drops below 360/n. Concave
 * members carry `star: true` (star hue) and a "star" badge; convex ones a "convex" badge. Grid-based,
 * so only side-counts with n | gridN appear (5-/9-fold stars need their own grids, as in starPrototiles).
 */
export function isotoxalFullPrototiles(gridN: number): Prototile[] {
  return enumerateConvexIsotoxal({ gridN, maxSideCount: 24, includeConcave: true }).groups.flatMap((g) =>
    g.tiles.map((t) => ({
      id: `isofull-${t.key}`,
      family: 'isotoxalFull' as const,
      name: t.name,
      sideCount: t.sideCount,
      vertices: isotoxalVertices(t.sideCount, t.alpha),
      badges: [t.convex ? 'convex' : 'star', ...(t.onZeta12 ? ['ζ₁₂'] : [])],
      star: !t.convex,
    })),
  );
}

// ── Aggregate ────────────────────────────────────────────────────────────────────────────────────

/** All prototiles across families; isotoxal is enumerated on the given grid. */
export function allPrototiles(isotoxalGridN: number): Prototile[] {
  return [
    ...regularPrototiles(),
    ...convexPrototiles(),
    ...starPrototiles(),
    ...isotoxalPrototiles(isotoxalGridN),
    ...isotoxalFullPrototiles(isotoxalGridN),
  ];
}

function fmt(deg: number): string {
  return Number.isInteger(deg) ? `${deg}` : deg.toFixed(1);
}
