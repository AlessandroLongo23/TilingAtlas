// Ear-clipping triangulation for simple polygons, with the barycentric edge mask the single-pass
// wireframe shader needs.
//
// Why this exists: SubRosaGL splits each tile into triangles on the CPU and draws the whole patch in
// one call, and its original split is hard-wired to a quad — two triangles across one diagonal. That
// cannot represent the hat's 13-gon at all, so a general decomposition was needed.
//
// A naive fan from corner 0 would in fact draw the hat correctly, as it happens: measured over
// hatPatch(4)'s 1,156 tiles, the fan conserves area exactly and inverts nothing, because the hat's
// outline is star-shaped about the vertex its own construction lists first. That is a property of one
// shape's indexing, not a guarantee — it holds for no non-star-shaped tile, and /aperiodic is meant to
// keep gaining tile families. Ear clipping is correct for any simple polygon, so the renderer stops
// depending on a coincidence.
//
// Cost is O(n²) per polygon, which is the right trade here: n is 4 or 13, so the constant beats a
// monotone-chain sweep, and the whole thing runs once per upload rather than per frame.

export interface Pt {
	x: number;
	y: number;
}

/** Twice the signed area; positive when the ring runs counter-clockwise (world y up). */
export function signedArea2(pts: readonly Pt[]): number {
	let s = 0;
	for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += (pts[j].x - pts[i].x) * (pts[j].y + pts[i].y);
	return s;
}

const cross = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
	(bx - ax) * (cy - ay) - (by - ay) * (cx - ax);

/**
 * Inside-or-on, for a triangle known to be counter-clockwise.
 *
 * Inclusive is the load-bearing part, and only in combination with testing REFLEX vertices only
 * (see the clip loop). The hat has three collinear corners, so a candidate ear regularly has another
 * vertex lying exactly on one of its edges. Testing every vertex inclusively rejects too much and
 * stalls the clipper; testing every vertex strictly accepts too much — it admits an "ear" whose
 * reflex neighbour sits on its edge, which pinches the remaining ring and puts an inverted triangle
 * in the output a few clips later. Reflex-only plus inclusive is the condition that is actually
 * correct for a simple polygon: a convex vertex touching the boundary can never block an ear, a
 * reflex one always does.
 *
 * `area2` is twice the candidate triangle's area, and sets the tolerance. Exact zero is not good
 * enough: the hat's collinear corners put a vertex mathematically ON an edge, where the cross product
 * evaluates to ±1e-16 rather than 0. Taken as "outside", that vertex stops blocking, the ear is
 * clipped, the ring pinches, and an inverted triangle falls out a few clips later. Scaling the
 * tolerance by the triangle's own area keeps the test independent of where the patch sits — these
 * coordinates run to ±40 while a tile is ~1 across.
 */
function insideOrOn(px: number, py: number, a: Pt, b: Pt, c: Pt, area2: number): boolean {
	const eps = 1e-9 * Math.abs(area2);
	return (
		cross(a.x, a.y, b.x, b.y, px, py) >= -eps &&
		cross(b.x, b.y, c.x, c.y, px, py) >= -eps &&
		cross(c.x, c.y, a.x, a.y, px, py) >= -eps
	);
}

/**
 * Triangulate a simple polygon. Returns flat index triples into `pts` — 3·(n−2) entries for an
 * n-gon. Winding of the input does not matter; the output triangles are all counter-clockwise.
 *
 * Degenerate input (a repeated vertex, a zero-area spur) can leave no clippable ear. Rather than
 * spin, the loop gives up after a full pass with no ear and fans the remainder: the result may be
 * wrong for that one tile, but a malformed polygon can never hang the upload.
 */
export function triangulate(pts: readonly Pt[]): number[] {
	const n = pts.length;
	if (n < 3) return [];
	if (n === 3) return signedArea2(pts) > 0 ? [0, 1, 2] : [0, 2, 1];

	// Work on a ring of indices in counter-clockwise order, so "convex" is one sign test.
	const ccw = signedArea2(pts) > 0;
	const ring: number[] = [];
	for (let i = 0; i < n; i++) ring.push(ccw ? i : n - 1 - i);

	const out: number[] = [];
	let stalled = 0;
	while (ring.length > 3) {
		let clipped = false;
		for (let i = 0; i < ring.length; i++) {
			const ia = ring[(i + ring.length - 1) % ring.length];
			const ib = ring[i];
			const ic = ring[(i + 1) % ring.length];
			const a = pts[ia], b = pts[ib], c = pts[ic];
			const area2 = cross(a.x, a.y, b.x, b.y, c.x, c.y);
			if (area2 <= 0) continue; // reflex or straight — not an ear tip

			// An ear only if no REFLEX vertex of the current ring lies in the candidate triangle.
			// Reflexivity is against the ring as it stands now, not the original polygon — clipping
			// changes which corners are reflex.
			let contains = false;
			for (let k = 0; k < ring.length && !contains; k++) {
				const iv = ring[k];
				if (iv === ia || iv === ib || iv === ic) continue;
				const pv = pts[ring[(k + ring.length - 1) % ring.length]];
				const cv = pts[iv];
				const nv = pts[ring[(k + 1) % ring.length]];
				if (cross(pv.x, pv.y, cv.x, cv.y, nv.x, nv.y) > 0) continue; // convex: cannot block
				contains = insideOrOn(cv.x, cv.y, a, b, c, area2);
			}
			if (contains) continue;

			out.push(ia, ib, ic);
			ring.splice(i, 1);
			clipped = true;
			break;
		}
		// Count only the passes that found nothing — an earlier version incremented on success too,
		// which would have tripped the bail-out on any polygon needing more than n clips.
		if (clipped) {
			stalled = 0;
			continue;
		}
		// No ear anywhere. Only genuinely degenerate input reaches here. Clip the first convex corner
		// regardless of containment: that always removes a vertex (so this terminates) and the emitted
		// triangle is counter-clockwise by construction. Fanning the remainder instead — what an
		// earlier version did — inverts triangles whenever the remainder is non-convex.
		let forced = -1;
		for (let i = 0; i < ring.length && forced < 0; i++) {
			const a = pts[ring[(i + ring.length - 1) % ring.length]];
			const b = pts[ring[i]];
			const c = pts[ring[(i + 1) % ring.length]];
			if (cross(a.x, a.y, b.x, b.y, c.x, c.y) > 0) forced = i;
		}
		if (forced < 0) forced = 0; // wholly degenerate ring: drop a vertex to guarantee progress
		out.push(
			ring[(forced + ring.length - 1) % ring.length],
			ring[forced],
			ring[(forced + 1) % ring.length],
		);
		ring.splice(forced, 1);
		if (++stalled > n) break; // belt and braces; the splice above already bounds the loop
	}
	if (ring.length === 3) out.push(ring[0], ring[1], ring[2]);
	return out;
}

/**
 * Per-vertex barycentric edge attributes for one triangle of an n-gon, in the convention SubRosaGL's
 * fragment shader reads: channel c vanishes along the edge opposite the triangle's vertex c, so the
 * fragment's `min(x,y,z)` is the barycentric distance to the nearest edge it is allowed to stroke.
 *
 * An edge is *real* — and so strokeable — only when its two endpoints are adjacent on the polygon's
 * ring; anything else is an internal diagonal the triangulation invented, and pinning its channel to
 * 1 at all three vertices keeps `min` away from 0 there so it is never drawn.
 *
 * Returns 9 values: three vec3s, one per triangle vertex in the order (ia, ib, ic).
 */
export function edgeMask(ia: number, ib: number, ic: number, n: number): number[] {
	const adjacent = (p: number, q: number) => {
		const d = Math.abs(p - q);
		return d === 1 || d === n - 1;
	};
	// Channel c is opposite triangle-vertex c: channel 0 ↔ edge (ib,ic), 1 ↔ (ic,ia), 2 ↔ (ia,ib).
	const pin = [!adjacent(ib, ic), !adjacent(ic, ia), !adjacent(ia, ib)];
	const v = (self: number) => [
		pin[0] ? 1 : self === 0 ? 1 : 0,
		pin[1] ? 1 : self === 1 ? 1 : 0,
		pin[2] ? 1 : self === 2 ? 1 : 0,
	];
	return [...v(0), ...v(1), ...v(2)];
}
