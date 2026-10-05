// The fill of ANY planar face ring: convex, concave, or crossing itself, regular or not.
//
// starFaceRings (lib/render/sphStar.ts) fills a REGULAR {n/d} in closed form, from the ring radii of a
// star polygon. A noble polyhedron's face is none of that: a crossed quadrilateral, an irregular
// self-intersecting pentagon, a nonagon that loops through itself three times. Nothing about it is
// known in advance except that it is planar, so the region is measured instead of derived.
//
// VERTICAL SLABS. Cut the face plane at the x of every vertex and of every point where two sides cross.
// Inside one slab no two sides meet, so the sides that span it are ordered bottom to top and each
// consecutive pair bounds a trapezoid. The winding number of that trapezoid is a running sum: stepping
// up across a side adds +1 when the side runs left to right and -1 when it runs right to left. So the
// winding comes out of the sweep and no point-in-polygon test is ever made, which is what keeps a pinched
// region (a loop touching the outline at one point) from needing a special case.
//
// Every piece handed back is CONVEX, which is the contract the rest of the pipeline already relies on:
// flatSolidTriangles fans each ring from its first vertex, and the crease clipper intersects a line with
// each ring as a convex polygon.
//
// ⚑ T-JUNCTIONS. Two slabs meet along a vertical line, and the trapezoids on its two sides generally have
// their corners at different heights on it. Rasterised as they stand, the long side of one and the two
// short sides of its neighbours do not share vertices, and the result is a dotted line of pinholes down
// every cut. So the corner heights on each cut are collected once, snapped to one value each, and a
// trapezoid whose side passes through another's corner is emitted as a fan about its own centroid with
// that corner on its boundary. Shared points are then the same three floats on both sides.

type V3 = [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
	a[1] * b[2] - a[2] * b[1],
	a[2] * b[0] - a[0] * b[2],
	a[0] * b[1] - a[1] * b[0],
];

/**
 * A normal to the ring's plane: the largest cross product of two consecutive sides.
 *
 * ⚑ NOT Newell's, which is the ring's vector AREA. A crossed quadrilateral with a mirror through its
 * crossing point has two lobes of equal and opposite area, so its Newell normal is exactly zero, and
 * that is every face of every stephanoid. The sign here is whichever way the sharpest corner turns,
 * which is all a convexity test or a fill needs: both read the same under a flip.
 */
export function ringNormal(verts: readonly V3[], f: readonly number[]): V3 {
	let best: V3 = [0, 0, 0];
	let len = 0;
	for (let i = 0; i < f.length; i++) {
		const p = verts[f[i]];
		const q = verts[f[(i + 1) % f.length]];
		const r = verts[f[(i + 2) % f.length]];
		const n = cross(sub(q, p), sub(r, q));
		const l = Math.hypot(n[0], n[1], n[2]);
		if (l > len) [best, len] = [n, l];
	}
	return best;
}

/**
 * Is this ring a convex polygon: the same way at every corner, AND once round in total?
 *
 * ⚑ The second half is not optional. A pentagram turns the same way at all five corners, and so does
 * the "propeller" hexagon of the noble polyhedron D-3; what separates them from a convex polygon is that
 * they go round twice. Testing the sign alone called both convex, handed them to a plain fan, and the
 * fan painted straight across the notches between the blades (AL saw it on D-3, 2026-10-02: "they
 * should have holes"). The regular stars never reached this test, which is how it went unnoticed.
 */
export function isConvexRing(verts: readonly V3[], f: readonly number[]): boolean {
	const n = ringNormal(verts, f);
	const nl = Math.hypot(n[0], n[1], n[2]) || 1;
	let turn = 0;
	for (let i = 0; i < f.length; i++) {
		const p = verts[f[i]];
		const q = verts[f[(i + 1) % f.length]];
		const r = verts[f[(i + 2) % f.length]];
		const u = sub(q, p);
		const v = sub(r, q);
		const s = dot(cross(u, v), n) / nl;
		if (s < -1e-9) return false;
		turn += Math.atan2(s, dot(u, v));
	}
	return Math.abs(turn) < 3 * Math.PI;
}

/**
 * Is this ring a regular polygon, {n} or {n/d}: every vertex the same distance from the centroid and
 * every side the same length? The closed-form star fill is only right for these.
 *
 * 1e-4 relative, and deliberately loose: the non-convex shelf's k = 4 records come out of a dihedral
 * root-find and miss by up to 4e-7, and a face within 1e-4 of regular is filled identically either way.
 */
export function isRegularRing(verts: readonly V3[], f: readonly number[]): boolean {
	const n = f.length;
	const c: V3 = [0, 0, 0];
	for (const i of f) for (let k = 0; k < 3; k++) c[k] += verts[i][k] / n;
	const R = Math.hypot(...sub(verts[f[0]], c));
	const L = Math.hypot(...sub(verts[f[1]], verts[f[0]]));
	const tol = 1e-4 * R;
	for (let i = 0; i < n; i++) {
		if (Math.abs(Math.hypot(...sub(verts[f[i]], c)) - R) > tol) return false;
		if (Math.abs(Math.hypot(...sub(verts[f[(i + 1) % n]], verts[f[i]])) - L) > tol) return false;
	}
	return true;
}

/** One trapezoid of the sweep: between the cuts `s` and `s + 1`, from side `a` up to side `b`. */
interface Cell {
	s: number;
	a0: number;
	a1: number;
	b0: number;
	b1: number;
	/** Winding number of the ring about any point of this cell. */
	w: number;
}

/**
 * The bounded regions of a closed planar ring, as trapezoids with their winding numbers, plus the cuts
 * they sit between. Regions of winding 0 are outside the polygon under either fill rule and are dropped.
 */
export function windingCells(xs: readonly number[], ys: readonly number[]): { cuts: number[]; cells: Cell[] } {
	const n = xs.length;
	let span = 0;
	for (let i = 1; i < n; i++) span = Math.max(span, Math.abs(xs[i] - xs[0]), Math.abs(ys[i] - ys[0]));
	const eps = 1e-9 * (span || 1);

	const raw = [...xs];
	for (let i = 0; i < n; i++) {
		const ax = xs[i];
		const ay = ys[i];
		const rx = xs[(i + 1) % n] - ax;
		const ry = ys[(i + 1) % n] - ay;
		for (let j = i + 1; j < n; j++) {
			const sx = xs[(j + 1) % n] - xs[j];
			const sy = ys[(j + 1) % n] - ys[j];
			const den = rx * sy - ry * sx;
			// Parallel sides never cross; where they overlap, their endpoints are already cuts.
			if (Math.abs(den) < 1e-12 * span * span) continue;
			const qx = xs[j] - ax;
			const qy = ys[j] - ay;
			const t = (qx * sy - qy * sx) / den;
			const u = (qx * ry - qy * rx) / den;
			if (t > -1e-9 && t < 1 + 1e-9 && u > -1e-9 && u < 1 + 1e-9) raw.push(ax + t * rx);
		}
	}
	raw.sort((p, q) => p - q);
	const cuts: number[] = [];
	for (const x of raw) if (!cuts.length || x - cuts[cuts.length - 1] > eps) cuts.push(x);

	const cells: Cell[] = [];
	for (let s = 0; s + 1 < cuts.length; s++) {
		const x0 = cuts[s];
		const x1 = cuts[s + 1];
		const spans: { y0: number; y1: number; dir: number }[] = [];
		for (let i = 0; i < n; i++) {
			const ax = xs[i];
			const ay = ys[i];
			const bx = xs[(i + 1) % n];
			const by = ys[(i + 1) % n];
			// A side lying ON a cut bounds nothing; one that stops short of either cut is not in this slab.
			if (Math.abs(bx - ax) <= eps || Math.min(ax, bx) > x0 + eps || Math.max(ax, bx) < x1 - eps) continue;
			const at = (x: number) => (Math.abs(x - ax) <= eps ? ay : Math.abs(x - bx) <= eps ? by : ay + ((by - ay) * (x - ax)) / (bx - ax));
			spans.push({ y0: at(x0), y1: at(x1), dir: bx > ax ? 1 : -1 });
		}
		spans.sort((p, q) => p.y0 + p.y1 - (q.y0 + q.y1));
		let w = 0;
		for (let k = 0; k + 1 < spans.length; k++) {
			w += spans[k].dir;
			const lo = spans[k];
			const hi = spans[k + 1];
			// Two sides on top of each other bound a cell of no height; the winding still steps across both.
			if (w !== 0 && hi.y0 - lo.y0 + hi.y1 - lo.y1 > eps) cells.push({ s, a0: lo.y0, a1: lo.y1, b0: hi.y0, b1: hi.y1, w });
		}
	}
	return { cuts, cells };
}

function facePlane(face: readonly number[], verts: readonly V3[]) {
	const c: V3 = [0, 0, 0];
	for (const i of face) for (let k = 0; k < 3; k++) c[k] += verts[i][k] / face.length;
	const n = ringNormal(verts, face);
	const nl = Math.hypot(n[0], n[1], n[2]);
	let ex = sub(verts[face[0]], c);
	const el = Math.hypot(ex[0], ex[1], ex[2]);
	if (nl < 1e-12 || el < 1e-12) return null;
	ex = [ex[0] / el, ex[1] / el, ex[2] / el];
	const ey = cross([n[0] / nl, n[1] / nl, n[2] / nl], ex);
	return {
		c,
		ex,
		ey,
		xs: face.map((i) => dot(sub(verts[i], c), ex)),
		ys: face.map((i) => dot(sub(verts[i], c), ey)),
	};
}

/** The largest winding number any region of this face carries: 1 for a simple face, 2 for a pentagram. */
export function maxWinding(face: readonly number[], verts: readonly V3[]): number {
	const pl = facePlane(face, verts);
	if (!pl) return 1;
	return windingCells(pl.xs, pl.ys).cells.reduce((m, c) => Math.max(m, Math.abs(c.w)), 1);
}

/**
 * Convex rings that fill the face, as NEW points appended to `verts`: the same contract as
 * starFaceRings, so the two are interchangeable to every caller.
 *
 * Nonzero winding by default, which fills everything the ring encloses; `mod2` is the even-odd rule and
 * keeps only the regions of odd winding, so a doubly covered core empties.
 */
export function planarFillRings(face: number[], verts: V3[], mod2 = false): number[][] {
	const pl = facePlane(face, verts);
	if (!pl) return [face];
	const { cuts, cells } = windingCells(pl.xs, pl.ys);
	const kept = cells.filter((c) => !mod2 || c.w % 2 !== 0);
	let span = 0;
	for (const y of pl.ys) span = Math.max(span, Math.abs(y));
	const eps = 1e-9 * (span || 1);

	// Corner heights on each cut, one value per cluster, so a point shared by two cells is one point.
	const heights: number[][] = cuts.map(() => []);
	for (const c of kept) {
		heights[c.s].push(c.a0, c.b0);
		heights[c.s + 1].push(c.a1, c.b1);
	}
	for (const h of heights) {
		h.sort((p, q) => p - q);
		let m = 0;
		for (const y of h) if (!m || y - h[m - 1] > eps) h[m++] = y;
		h.length = m;
	}
	const made = new Map<number, number>();
	const point = (s: number, k: number): number => {
		const key = s * 4096 + k;
		let idx = made.get(key);
		if (idx === undefined) {
			const x = cuts[s];
			const y = heights[s][k];
			idx = verts.push([
				pl.c[0] + pl.ex[0] * x + pl.ey[0] * y,
				pl.c[1] + pl.ex[1] * x + pl.ey[1] * y,
				pl.c[2] + pl.ex[2] * x + pl.ey[2] * y,
			]) - 1;
			made.set(key, idx);
		}
		return idx;
	};
	/** Indices into heights[s] of every corner from `lo` up to `hi`, inclusive. */
	const side = (s: number, lo: number, hi: number): number[] => {
		const out: number[] = [];
		heights[s].forEach((y, k) => {
			if (y >= lo - eps && y <= hi + eps) out.push(point(s, k));
		});
		return out;
	};

	const out: number[][] = [];
	for (const c of kept) {
		const left = side(c.s, c.a0, c.b0);
		const right = side(c.s + 1, c.a1, c.b1);
		const ring = [...right, ...left.reverse()];
		if (ring.length < 3) continue;
		// No corner of a neighbour on either side: the cell is a plain triangle or trapezoid.
		if (left.length <= 2 && right.length <= 2) {
			out.push(ring);
			continue;
		}
		const m: V3 = [0, 0, 0];
		for (const i of ring) for (let k = 0; k < 3; k++) m[k] += verts[i][k] / ring.length;
		const mi = verts.push(m) - 1;
		for (let k = 0; k < ring.length; k++) out.push([mi, ring[k], ring[(k + 1) % ring.length]]);
	}
	return out;
}

/**
 * One face laid flat: its vertices in the face's own plane, in ring order, and whether two of its sides
 * cross away from a vertex. What the info panel draws, so a reader can see the polygon the solid is made
 * of, which on a noble polyhedron is close to impossible to pick out of the solid itself.
 */
export function faceOutline(face: readonly number[], verts: readonly V3[]): { xs: number[]; ys: number[]; crossed: boolean } | null {
	const pl = facePlane(face, verts);
	if (!pl) return null;
	const { xs, ys } = pl;
	const n = xs.length;
	const side = (ax: number, ay: number, bx: number, by: number, px: number, py: number) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
	let crossed = false;
	for (let i = 0; i < n && !crossed; i++) {
		for (let j = i + 2; j < n; j++) {
			if (i === 0 && j === n - 1) continue; // neighbours round the end of the ring
			const [i2, j2] = [(i + 1) % n, (j + 1) % n];
			const d1 = side(xs[i], ys[i], xs[i2], ys[i2], xs[j], ys[j]) * side(xs[i], ys[i], xs[i2], ys[i2], xs[j2], ys[j2]);
			const d2 = side(xs[j], ys[j], xs[j2], ys[j2], xs[i], ys[i]) * side(xs[j], ys[j], xs[j2], ys[j2], xs[i2], ys[i2]);
			if (d1 < -1e-12 && d2 < -1e-12) {
				crossed = true;
				break;
			}
		}
	}
	return { xs, ys, crossed };
}
