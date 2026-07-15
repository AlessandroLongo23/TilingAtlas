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

export type TileFamily = 'regular' | 'convex' | 'star' | 'isotoxal' | 'isotoxalFull' | 'scaled' | 'polyomino';

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
  /** Optional card render scale override (px per unit edge). Used by scaled tiles, whose side-3
   *  dodecagon spans ~6 units and would clip the card at the default 28. */
  pxPerEdge?: number;
  /** Explicit fill hue (degrees) overriding the geometric by-side-count ramp. Polyominoes use it: every
   *  tetromino except the O shares a 10-unit boundary, so side count can't tell them apart — a per-piece
   *  identity hue (the Tetris palette) does. Chroma/brightness stay the app default. */
  hue?: number;
}

export const FAMILY_LABELS: Record<TileFamily, string> = {
  regular: 'Regular',
  convex: 'Convex irregular',
  star: 'Star',
  isotoxal: 'Isotoxal',
  isotoxalFull: 'Isotoxal (unified)',
  scaled: 'Scaled',
  polyomino: 'Polyomino',
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

// ── Scaled (regular {3,4,6,12} at side length 2 and 3, as degenerate sN-gons) ─────────────────────

/** Degenerate sN-gon: the regular N-gon of edge length s, each edge subdivided into s unit segments.
 *  sN boundary vertices — N real corners (angle θ_N) + s-1 flat 180° corners per side. This is exactly
 *  how the Čtrnáct `scaled` palette carries a side-s tile (unit edges, flat corners noncounting). */
export function scaledVertices(n: number, s: number): { x: number; y: number }[] {
  const R = s / (2 * Math.sin(Math.PI / n)); // circumradius for edge length s
  const corners = Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n - Math.PI / 2;
    return { x: R * Math.cos(a), y: R * Math.sin(a) };
  });
  const verts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const A = corners[i], B = corners[(i + 1) % n];
    for (let j = 0; j < s; j++) {
      const t = j / s; // A (real corner) then s-1 collinear subdivision (flat) points
      verts.push({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t });
    }
  }
  return verts; // s·n vertices
}

/** {3,4,6,12} at side lengths 2 and 3 (side 1 = the Regular family). Each is a degenerate sN-gon. */
export const SCALED_SIDES = [3, 4, 6, 12] as const;
export const SCALED_SCALES = [2, 3] as const;

export function scaledPrototiles(): Prototile[] {
  const out: Prototile[] = [];
  for (const s of SCALED_SCALES) for (const n of SCALED_SIDES) {
    out.push({
      id: `scaled-${n}-${s}`,
      family: 'scaled',
      name: `Side-${s} ${REGULAR_NAMES[n] ?? `${n}-gon`}`,
      sideCount: s * n,
      vertices: scaledVertices(n, s),
      badges: [`side ${s}`, `= ${s * n}-gon`],
      pxPerEdge: 12, // side-3 dodecagon spans ~6 units; keep the whole family in-card
    });
  }
  return out;
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

// ── Polyomino (unions of unit squares — the Tetris family to start) ──────────────────────────────

/** Trace the outer boundary of a polyomino as a unit-edge loop, CCW, every grid point on the boundary
 *  kept as a vertex (so straight runs carry flat 180° corners, just like the scaled degenerate model;
 *  concave notches carry reflex 270° corners, like a star's dents). Cells are unit squares keyed by their
 *  bottom-left integer corner. Assumes a simply-connected polyomino with no diagonal pinch (true for all
 *  tetrominoes): then every boundary vertex has exactly one outgoing directed edge, so the walk is a
 *  function. Interior kept on the left ⇒ CCW. */
function polyominoBoundary(cells: [number, number][]): { x: number; y: number }[] {
  const key = (x: number, y: number) => `${x},${y}`;
  const has = new Set(cells.map(([x, y]) => key(x, y)));
  const next = new Map<string, [number, number]>(); // start grid vertex -> end grid vertex
  for (const [x, y] of cells) {
    if (!has.has(key(x, y - 1))) next.set(key(x, y), [x + 1, y]); // bottom edge, heading +x
    if (!has.has(key(x + 1, y))) next.set(key(x + 1, y), [x + 1, y + 1]); // right edge, heading +y
    if (!has.has(key(x, y + 1))) next.set(key(x + 1, y + 1), [x, y + 1]); // top edge, heading -x
    if (!has.has(key(x - 1, y))) next.set(key(x, y + 1), [x, y]); // left edge, heading -y
  }
  const start = cells.reduce((a, b) => (b[1] < a[1] || (b[1] === a[1] && b[0] < a[0]) ? b : a));
  const startKey = key(start[0], start[1]); // bottom-left cell's bottom-left corner is on the boundary
  const verts: { x: number; y: number }[] = [];
  let cur = startKey;
  let guard = 0;
  do {
    const [px, py] = cur.split(',').map(Number);
    verts.push({ x: px, y: py });
    const nxt = next.get(cur);
    if (!nxt) break;
    cur = key(nxt[0], nxt[1]);
  } while (cur !== startKey && guard++ < 1000);
  return verts;
}

/** The seven one-sided tetrominoes as they appear in the game, each in its spawn orientation (+y is up,
 *  matching the renderer's flipped axis). Hue is the piece's Tetris identity colour; the app's fixed
 *  chroma/brightness (S=40, B=100 in HSB) are kept, so only the hue matches the game. NB: the enumeration
 *  convention MERGES mirror pairs, so S≡Z and J≡L collapse to five FREE tetrominoes for the engine — the
 *  seven shown here are for visual inspection, not the solver's tile count. */
const TETROMINOES: { letter: string; hue: number; cells: [number, number][] }[] = [
  { letter: 'I', hue: 190, cells: [[0, 0], [1, 0], [2, 0], [3, 0]] }, // cyan
  { letter: 'O', hue: 51, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] }, // yellow
  { letter: 'T', hue: 282, cells: [[0, 0], [1, 0], [2, 0], [1, 1]] }, // purple
  { letter: 'S', hue: 125, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] }, // green
  { letter: 'Z', hue: 4, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] }, // red
  { letter: 'J', hue: 230, cells: [[0, 0], [1, 0], [2, 0], [0, 1]] }, // blue
  { letter: 'L', hue: 30, cells: [[0, 0], [1, 0], [2, 0], [2, 1]] }, // orange
];

export function polyominoPrototiles(): Prototile[] {
  return TETROMINOES.map(({ letter, hue, cells }) => {
    const verts = polyominoBoundary(cells);
    const xs = verts.map((v) => v.x), ys = verts.map((v) => v.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    return {
      id: `poly-${letter}`,
      family: 'polyomino' as const,
      name: `${letter}-tetromino`,
      sideCount: verts.length,
      vertices: verts.map((v) => ({ x: v.x - cx, y: v.y - cy })),
      badges: ['tetromino'],
      hue,
      pxPerEdge: 18, // the I bar spans 4 units; keep the whole family in-card at one unit length
    };
  });
}

// ── Aggregate ────────────────────────────────────────────────────────────────────────────────────

/** All prototiles across families; isotoxal is enumerated on the given grid. */
export function allPrototiles(isotoxalGridN: number): Prototile[] {
  return [
    ...regularPrototiles(),
    ...scaledPrototiles(),
    ...polyominoPrototiles(),
    ...convexPrototiles(),
    ...starPrototiles(),
    ...isotoxalPrototiles(isotoxalGridN),
    ...isotoxalFullPrototiles(isotoxalGridN),
  ];
}

function fmt(deg: number): string {
  return Number.isInteger(deg) ? `${deg}` : deg.toFixed(1);
}
