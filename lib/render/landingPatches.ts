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
