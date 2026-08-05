// Flattening a cubic Bézier into a polyline, and how finely.
//
// WHY THIS IS SHARED. Two unrelated-looking parts of the atlas draw the same curved edge and neither
// can hand a GPU a curve: the isohedral page tessellates its prototile outline for FlatCellRenderer
// (lib/isohedral/build.ts), and the periodic-cell IR the conformal lens consumes has one primitive,
// a ring or polyline of straight segments (lib/render/periodicCell.ts). Both therefore need a polyline
// and both need the SAME answer to "how many segments", or the same tile draws with visibly different
// faceting depending on which view is on. This is that answer, written once.
//
// THE BOUND. For a Bézier of degree d, splitting the parameter into n equal pieces deviates from the
// true curve by at most (d(d−1)/8)·max|Δ²P|/n², where Δ²Pᵢ = Pᵢ − 2Pᵢ₊₁ + Pᵢ₊₂ (Sederberg, *Computer
// Aided Geometric Design*, §2.7). For a cubic the constant is 0.75. Inverting it gives the segment
// count that holds the error under a target, so a gently bowed edge costs a couple of segments and a
// hard S curve costs dozens, instead of every edge paying the same flat ten.

/** The d(d−1)/8 factor at d = 3. */
export const CUBIC_ERROR_CONST = 0.75;

export interface Pt {
	x: number;
	y: number;
}

/** A cubic's four control points, in order. */
export type Cubic = readonly [Pt, Pt, Pt, Pt];

/** Point on the cubic at parameter `t`. */
export function cubicAt(p: Cubic, t: number): Pt {
	const u = 1 - t;
	const w0 = u * u * u;
	const w1 = 3 * u * u * t;
	const w2 = 3 * u * t * t;
	const w3 = t * t * t;
	return {
		x: w0 * p[0].x + w1 * p[1].x + w2 * p[2].x + w3 * p[3].x,
		y: w0 * p[0].y + w1 * p[1].y + w2 * p[2].y + w3 * p[3].y,
	};
}

/**
 * max|Δ²P| over the control polygon, in the control points' own units.
 *
 * Zero exactly when the control points sit on the chord at the thirds, which is the straight line.
 */
export function cubicFlatness(p: Cubic): number {
	const d0x = p[0].x - 2 * p[1].x + p[2].x;
	const d0y = p[0].y - 2 * p[1].y + p[2].y;
	const d1x = p[1].x - 2 * p[2].x + p[3].x;
	const d1y = p[1].y - 2 * p[2].y + p[3].y;
	return Math.max(Math.hypot(d0x, d0y), Math.hypot(d1x, d1y));
}

/**
 * Segments needed to hold the flattening error under `tol`.
 *
 * `flatness` and `tol` need not be in the same units, which is what `scale` is for: it converts the
 * former into the latter. Callers working in one space (a world-space curve against a world-space
 * tolerance) pass 1; the isohedral outline holds a dimensionless canonical-frame flatness against a
 * PIXEL tolerance and passes the chord's length in pixels.
 *
 * Inverting 0.75·M·scale/n² ≤ tol gives n ≥ √(0.75·M·scale/tol).
 */
export function cubicSegmentCount(flatness: number, scale: number, tol: number, max: number): number {
	if (!(flatness > 0) || !(scale > 0) || !(tol > 0)) return 1;
	return Math.min(max, Math.max(1, Math.ceil(Math.sqrt((CUBIC_ERROR_CONST * flatness * scale) / tol))));
}

/**
 * Sample a cubic into `n` segments, WITHOUT its endpoint.
 *
 * The endpoint is the next arc's start, so omitting it lets a ring be concatenated arc by arc with no
 * duplicate vertex — which matters to the ear clipper (a repeated vertex is a zero-area ear) and to the
 * lens's point-in-polygon test alike.
 */
export function flattenCubicOpen(p: Cubic, n: number, out: Pt[]): void {
	for (let i = 0; i < n; i++) out.push(cubicAt(p, i / n));
}
