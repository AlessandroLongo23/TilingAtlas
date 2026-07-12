/**
 * Convex isotoxal polygons — equilateral polygons whose interior angles alternate between two
 * values α, β. Edge-transitive (one edge class, two vertex classes); the convex sibling of the star
 * (non-convex isotoxal) polygons. Regular polygons are the degenerate α = β members, excluded here.
 *
 * Math. A unit-edge 2n-gon with alternating angles closes iff Σ edge-vectors = 0, and
 *   Σ = (1 + e^{i(180−α)}) · Σ_{k<n} e^{i·2πk/n} = 0
 * because the n-th-roots-of-unity sum vanishes for every n ≥ 2. So closure is automatic and the
 * angle-sum condition α + β = 360 − 360/n is the only constraint besides convexity (0 < α ≤ β < 180).
 * Each side-count is therefore a CONTINUUM in α; "list all" is finite only relative to a direction
 * grid ζ_N (angles = multiples of 360/N). This is a display discretization, not a completeness claim.
 *
 * Everything here is float trig — a visual catalog, explicitly outside the exact-arithmetic
 * completeness spine (like the convex-irregular shelf, DEVELOPMENT_NOTES §52–54).
 */

export interface IsotoxalTile {
  /** Number of sides = 2n. */
  sideCount: number;
  /** n (sideCount / 2). */
  n: number;
  /** Smaller interior angle, degrees (α ≤ β; α < β since regulars are excluded). */
  alpha: number;
  /** Larger interior angle, degrees. */
  beta: number;
  /** Convex (both angles < 180°) vs concave/star (β > 180°, a reflex vertex). The two branches of the
   *  one isotoxal construction — only distinguished when the enumeration runs with `includeConcave`. */
  convex: boolean;
  /** The ζ_N grid this enumeration ran on (angles are multiples of 360/N). */
  gridN: number;
  /** True when both angles are multiples of 30° — i.e. already a ζ₁₂ / "convex-irregular shelf" member. */
  onZeta12: boolean;
  /** Human name, e.g. "Octagon 105°/165°". */
  name: string;
  /** Stable id for React keys / URLs. */
  key: string;
}

export interface SideCountGroup {
  sideCount: number;
  n: number;
  /** Polygon name, e.g. "Octagon". */
  label: string;
  tiles: IsotoxalTile[];
}

export interface IsotoxalCatalog {
  gridN: number;
  gridDegrees: number;
  maxSideCount: number;
  groups: SideCountGroup[];
  /** Side-counts within the cap that have NO members on this grid, with the reason (honest, not hidden). */
  emptySideCounts: { sideCount: number; n: number; label: string }[];
  total: number;
}

const POLYGON_NAMES: Record<number, string> = {
  4: 'Quadrilateral',
  6: 'Hexagon',
  8: 'Octagon',
  10: 'Decagon',
  12: 'Dodecagon',
  14: 'Tetradecagon',
  16: 'Hexadecagon',
  18: 'Octadecagon',
  20: 'Icosagon',
  22: 'Icosidigon',
  24: 'Icositetragon',
};

export function polygonName(sideCount: number): string {
  return POLYGON_NAMES[sideCount] ?? `${sideCount}-gon`;
}

/** Format an angle: integer when whole, else one decimal (7.5° grid produces halves). */
function fmtAngle(deg: number): string {
  return Number.isInteger(deg) ? `${deg}` : deg.toFixed(1);
}

/**
 * Vertices of the unit-edge convex isotoxal 2n-gon with angles alternating α (even vertices) and
 * β (odd vertices). Plain-trig boundary walk from the origin; returns the sideCount vertices
 * v0..v_{2n-1} (the closing edge back to v0 is implicit). Float — for rendering only.
 */
export function isotoxalVertices(sideCount: number, alphaDeg: number): { x: number; y: number }[] {
  const n = sideCount / 2;
  const betaDeg = 360 - 360 / n - alphaDeg;
  const verts: { x: number; y: number }[] = [];
  let x = 0;
  let y = 0;
  let dirDeg = 0;
  for (let j = 0; j < sideCount; j++) {
    verts.push({ x, y });
    const rad = (dirDeg * Math.PI) / 180;
    x += Math.cos(rad);
    y += Math.sin(rad);
    // Turn at the next vertex (v_{j+1}); interior angle alternates α at even index, β at odd.
    const angleNext = (j + 1) % 2 === 0 ? alphaDeg : betaDeg;
    dirDeg += 180 - angleNext;
  }
  return verts;
}

/**
 * Enumerate the convex isotoxal tiles whose angles land on the ζ_N direction grid, up to a side-count
 * cap. Works in integer grid-units to stay exact. A side-count 2n has members iff n | N (else α+β is
 * not reachable on the grid). Mirror pairs merge (α ≤ β); the regular α = β member is excluded.
 */
export function enumerateConvexIsotoxal(opts: {
  gridN: number;
  maxSideCount?: number;
  /** Also emit the CONCAVE (star) branch — the same tile pushed past β = 180° into a reflex vertex.
   *  Default false keeps the convex-only shelf unchanged; the /tiles "unified isotoxal" class sets it. */
  includeConcave?: boolean;
}): IsotoxalCatalog {
  const gridN = opts.gridN;
  const maxSideCount = opts.maxSideCount ?? 24;
  const includeConcave = opts.includeConcave ?? false;
  const gridDegrees = 360 / gridN;
  const groups: SideCountGroup[] = [];
  const emptySideCounts: IsotoxalCatalog['emptySideCounts'] = [];

  for (let sideCount = 4; sideCount <= maxSideCount; sideCount += 2) {
    const n = sideCount / 2;
    const label = polygonName(sideCount);
    // Members exist iff n | N: then C = 360 − 360/n is a whole number of grid units.
    if (gridN % n !== 0) {
      emptySideCounts.push({ sideCount, n, label });
      continue;
    }
    const cUnits = (gridN * (n - 1)) / n; // (360 − 360/n) / (360/N), integer since n | N
    const halfN = gridN / 2; // 180° in grid units (N even ⇒ integer)
    const tiles: IsotoxalTile[] = [];
    // α in units: α < β ⇒ a < cUnits/2 ; α > 0 ⇒ a ≥ 1. Convex additionally needs β < 180 ⇒ a > cUnits − halfN.
    // includeConcave drops that floor to a = 1 (the star branch); β = 180 exactly (a = cUnits − halfN) is a
    // degenerate straight vertex — skipped in both modes.
    const aMin = includeConcave ? 1 : Math.max(1, cUnits - halfN + 1);
    const aMax = Math.ceil(cUnits / 2) - 1; // strict a < cUnits/2
    for (let a = aMin; a <= aMax; a++) {
      const bUnits = cUnits - a;
      if (bUnits === halfN) continue; // β = 180° — degenerate, not a real vertex
      const alpha = a * gridDegrees;
      const beta = bUnits * gridDegrees;
      const convex = bUnits < halfN;
      // ζ₁₂ membership: both angles multiples of 30° ⇔ N | 12a and N | 12·bUnits.
      const onZeta12 = (12 * a) % gridN === 0 && (12 * bUnits) % gridN === 0;
      tiles.push({
        sideCount,
        n,
        alpha,
        beta,
        convex,
        gridN,
        onZeta12,
        name: `${label} ${fmtAngle(alpha)}°/${fmtAngle(beta)}°`,
        key: `iso-N${gridN}-${sideCount}-${a}`,
      });
    }
    if (tiles.length) groups.push({ sideCount, n, label, tiles });
    else emptySideCounts.push({ sideCount, n, label });
  }

  const total = groups.reduce((s, g) => s + g.tiles.length, 0);
  return { gridN, gridDegrees, maxSideCount, groups, emptySideCounts, total };
}

/** The offered direction grids: 30° (baseline, the convex-irregular shelf), 15°, 10°, 7.5°. */
export const GRID_PRESETS: { gridN: number; degrees: number; label: string }[] = [
  { gridN: 12, degrees: 30, label: '30°' },
  { gridN: 24, degrees: 15, label: '15°' },
  { gridN: 36, degrees: 10, label: '10°' },
  { gridN: 48, degrees: 7.5, label: '7.5°' },
];
