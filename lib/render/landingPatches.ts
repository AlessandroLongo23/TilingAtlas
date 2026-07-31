// Static geometry for the landing page's coming-soon minis: the hat monotile (the 2023 aperiodic
// monotile of Smith–Myers–Kaplan–Goodman-Strauss) and a Penrose P3 "sun" patch (5 thick rhombs
// around a vertex). Pure functions, no React — unit-tested in tests/landing-patches.test.ts and
// rendered as tiny inline SVGs by the landing's coming-soon cards.

export type Pt = readonly [number, number];

const SQRT3 = Math.sqrt(3);

/** Hex-basis point: (x, y) ↦ (x + y/2, y·√3/2) — the kite-lattice coordinate system. */
function hexPt(x: number, y: number): Pt {
	return [x + 0.5 * y, (SQRT3 / 2) * y];
}

// The hat's 13 vertices in hex coordinates, from Kaplan's hatviz (github.com/isohedral/hatviz,
// geometry.js) — the canonical outline of the aperiodic monotile, eight kites of the deltoidal
// trihexagonal tiling.
const HAT_HEX: ReadonlyArray<readonly [number, number]> = [
	[0, 0], [-1, -1], [0, -2], [2, -2],
	[2, -1], [4, -2], [5, -1], [4, 0],
	[3, 0], [2, 2], [0, 3], [0, 2],
	[-1, 2],
];

export function hatOutline(): Pt[] {
	return HAT_HEX.map(([x, y]) => hexPt(x, y));
}

/** Penrose P3 "sun": 5 thick rhombs (apex angle 72°, unit side) around the origin. Exact by
 *  construction: rhomb r has arms at angles 90° + 72r ± 36°. */
export function penroseSun(): Pt[][] {
	const rhombs: Pt[][] = [];
	for (let r = 0; r < 5; r++) {
		const base = Math.PI / 2 + (2 * Math.PI * r) / 5;
		const u: Pt = [Math.cos(base - Math.PI / 5), Math.sin(base - Math.PI / 5)];
		const v: Pt = [Math.cos(base + Math.PI / 5), Math.sin(base + Math.PI / 5)];
		rhombs.push([[0, 0], u, [u[0] + v[0], u[1] + v[1]], v]);
	}
	return rhombs;
}

// --- IH1: the general translation hexagon --------------------------------------------------------
//
// The first of Grünbaum and Shephard's 93 isohedral types (Tilings and Patterns §6.2), and the one
// that shows what "parametric" means with no explanation attached: a hexagon whose three pairs of
// opposite edges are related by translation, each edge free to be any curve at all as long as its
// opposite copies it. Every tile is the same tile, moved — the tiling's whole symmetry group is the
// translation lattice, which is what makes it isohedral.
//
// Incidence symbol TTTTTT: with v_k the corners of a regular hexagon, edge k maps onto edge k+3 under
// T_k = −(v_k + v_{k+1}), so the three independent edges are 0, 1 and 2 and the other three are their
// reversed translates. That relation is exact whatever the edges do in between, which is why the
// deformation below can be arbitrary and the tiles still meet.

/** Corner k of the unit-circumradius regular hexagon the type is parameterised around. */
const hexCorner = (k: number): Pt => [Math.cos((Math.PI / 3) * k), Math.sin((Math.PI / 3) * k)];

/** Edge v_k → v_{k+1} as `samples + 1` points, BOTH corners included, swung sideways by `bulge`. */
function edgeCurve(k: number, bulge: number, samples: number): Pt[] {
	const [x0, y0] = hexCorner(k);
	const [x1, y1] = hexCorner(k + 1);
	const nx = -(y1 - y0);
	const ny = x1 - x0;
	const pts: Pt[] = [];
	for (let i = 0; i <= samples; i++) {
		const t = i / samples;
		// sin(2πt) is zero at both ends and swings the middle out and back, so the edge is a visible S
		// and the corners stay exactly where the hexagon put them.
		const d = bulge * Math.sin(2 * Math.PI * t);
		pts.push([x0 + (x1 - x0) * t + nx * d, y0 + (y1 - y0) * t + ny * d]);
	}
	return pts;
}

/** The three edge amplitudes. Different per edge class, so the tile reads as a parameterised shape
 *  and not as a hexagon someone rounded off. */
const IH1_BULGES = [0.16, -0.1, 0.22] as const;

/** Translation carrying edge k onto edge k+3: T_k = −(v_k + v_{k+1}). */
function hexEdgeTranslation(k: number): Pt {
	const [x0, y0] = hexCorner(k);
	const [x1, y1] = hexCorner(k + 1);
	return [-(x0 + x1), -(y0 + y1)];
}

/**
 * One IH1 prototile, as a closed polyline of 6·`samples` points: edges 0–2 are free curves, edges 3–5
 * their reversed translates. Each edge contributes its own start corner and stops one sample short of
 * the next, so no vertex is repeated and the loop closes on the first point.
 */
export function isohedralTile(samples = 12): Pt[] {
	const free = [0, 1, 2].map((k) => edgeCurve(k, IH1_BULGES[k], samples));
	const out: Pt[] = [];
	for (const e of free) out.push(...e.slice(0, -1));
	for (let k = 0; k < 3; k++) {
		const [tx, ty] = hexEdgeTranslation(k);
		// Edge k translated runs v_{k+4} → v_{k+3}; the boundary walks it the other way, from v_{k+3}.
		for (let i = free[k].length - 1; i >= 1; i--) out.push([free[k][i][0] + tx, free[k][i][1] + ty]);
	}
	return out;
}

/**
 * A patch of the IH1 tiling: the prototile at every lattice point a·T_0 + b·T_2 with |a|, |b| ≤
 * `radius`. T_1 = T_0 + T_2, so those two generate the whole lattice and no copy is placed twice.
 */
export function isohedralPatch(radius = 2, samples = 12): Pt[][] {
	const tile = isohedralTile(samples);
	const [ax, ay] = hexEdgeTranslation(0);
	const [bx, by] = hexEdgeTranslation(2);
	const patch: Pt[][] = [];
	for (let a = -radius; a <= radius; a++) {
		for (let b = -radius; b <= radius; b++) {
			const dx = a * ax + b * bx;
			const dy = a * ay + b * by;
			patch.push(tile.map(([x, y]) => [x + dx, y + dy] as Pt));
		}
	}
	return patch;
}

export function polygonArea(poly: readonly Pt[]): number {
	let s = 0;
	for (let i = 0; i < poly.length; i++) {
		const [x0, y0] = poly[i];
		const [x1, y1] = poly[(i + 1) % poly.length];
		s += x0 * y1 - x1 * y0;
	}
	return Math.abs(s) / 2;
}

/** viewBox string fitting a set of polygons with a small margin. */
export function fitViewBox(polys: readonly (readonly Pt[])[], margin = 0.15): string {
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	for (const poly of polys) {
		for (const [x, y] of poly) {
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
		}
	}
	const w = maxX - minX, h = maxY - minY;
	return `${(minX - margin * w).toFixed(4)} ${(minY - margin * h).toFixed(4)} ${(w * (1 + 2 * margin)).toFixed(4)} ${(h * (1 + 2 * margin)).toFixed(4)}`;
}
