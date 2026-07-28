import { describe, expect, it } from "vitest";
import { edgeMask, signedArea2, triangulate, type Pt } from "./triangulate";
import { hatPatch } from "./hatPatch";
import { penrosePatch } from "./penrosePatch";

const area = (pts: readonly Pt[]) => Math.abs(signedArea2(pts)) / 2;

/** Sum of the triangles' areas, which must equal the polygon's iff the fan covers it exactly once. */
function triArea(pts: readonly Pt[], idx: number[]): number {
	let s = 0;
	for (let i = 0; i < idx.length; i += 3) s += area([pts[idx[i]], pts[idx[i + 1]], pts[idx[i + 2]]]);
	return s;
}

/**
 * No triangle wound clockwise, to within float noise. An inverted triangle is how an overlap shows
 * up, and it is the check that matters: area conservation alone cannot catch one, because the area
 * sum takes absolute values — a triangle covering the same region twice, once flipped, still adds up.
 *
 * The tolerance is relative to the polygon, and it has to be. Zero-area slivers are legitimate here
 * (three of the hat's thirteen corners are collinear, so an ear can clip to nothing), and they land
 * at ±1e-16 rather than exactly 0. A real inversion is a fraction of the tile: the bug this suite
 * caught produced −6.25% of the tile's area, twelve orders of magnitude clear of the tolerance.
 */
function noneInverted(pts: readonly Pt[], idx: number[]): boolean {
	const tol = 1e-9 * Math.abs(signedArea2(pts));
	for (let i = 0; i < idx.length; i += 3) {
		if (signedArea2([pts[idx[i]], pts[idx[i + 1]], pts[idx[i + 2]]]) < -tol) return false;
	}
	return true;
}

const square: Pt[] = [
	{ x: 0, y: 0 },
	{ x: 2, y: 0 },
	{ x: 2, y: 2 },
	{ x: 0, y: 2 },
];

// A non-convex L: the reflex corner is the case a fan from vertex 0 gets wrong.
const ell: Pt[] = [
	{ x: 0, y: 0 },
	{ x: 3, y: 0 },
	{ x: 3, y: 1 },
	{ x: 1, y: 1 },
	{ x: 1, y: 3 },
	{ x: 0, y: 3 },
];

describe("triangulate", () => {
	it("returns n-2 triangles", () => {
		expect(triangulate(square).length).toBe(3 * 2);
		expect(triangulate(ell).length).toBe(3 * 4);
	});

	it("conserves area on a convex polygon", () => {
		const idx = triangulate(square);
		expect(triArea(square, idx)).toBeCloseTo(area(square), 12);
		expect(noneInverted(square, idx)).toBe(true);
	});

	it("conserves area on a non-convex polygon", () => {
		const idx = triangulate(ell);
		expect(area(ell)).toBeCloseTo(5, 12);
		expect(triArea(ell, idx)).toBeCloseTo(5, 12);
		expect(noneInverted(ell, idx)).toBe(true);
	});

	it("is winding-agnostic — a reversed ring gives the same covered area", () => {
		const rev = [...ell].reverse();
		const idx = triangulate(rev);
		expect(triArea(rev, idx)).toBeCloseTo(5, 12);
		expect(noneInverted(rev, idx)).toBe(true);
	});

	it("uses every vertex of a non-convex ring", () => {
		const used = new Set(triangulate(ell));
		expect(used.size).toBe(ell.length);
	});

	it("terminates on a degenerate ring rather than hanging", () => {
		const spur: Pt[] = [
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 1, y: 0 }, // repeated vertex — no ear at that corner
			{ x: 1, y: 1 },
			{ x: 0, y: 1 },
		];
		const idx = triangulate(spur);
		expect(idx.length).toBe(3 * (spur.length - 2));
	});

	// Level 4, not level 2. The tile orientations a patch contains grow with the level, and the
	// inversion bug this test was written against did not appear at all until level 3 — a suite that
	// only checked level 2 passed while the renderer was quietly drawing overlapping triangles.
	it("triangulates every hat in a patch exactly", () => {
		const tiles = hatPatch(4);
		expect(tiles.length).toBe(1156);
		for (const t of tiles) {
			const idx = triangulate(t.vertices);
			expect(idx.length).toBe(3 * (t.vertices.length - 2));
			expect(triArea(t.vertices, idx)).toBeCloseTo(area(t.vertices), 10);
			expect(noneInverted(t.vertices, idx)).toBe(true);
		}
	});

	// A fan from corner 0 is not wrong for the hat — its outline happens to be star-shaped about the
	// vertex listed first, so the fan conserves area over all 1,156 tiles. Pinning that here so the
	// claim in the module header stays honest, and so a future re-indexing of HAT_SHAPE is noticed.
	it("agrees with a corner-0 fan on the hat, which is star-shaped from that corner", () => {
		for (const t of hatPatch(3)) {
			const v = t.vertices;
			const fan: number[] = [];
			for (let i = 1; i < v.length - 1; i++) fan.push(0, i, i + 1);
			expect(triArea(v, fan)).toBeCloseTo(area(v), 10);
		}
	});

	// …but a fan is only valid for a star-shaped ring, which is the reason not to rely on it. This
	// comb is not star-shaped from any vertex: the fan double-covers, the ear clipper does not.
	it("beats a corner-0 fan on a polygon that is not star-shaped", () => {
		const comb: Pt[] = [
			{ x: 0, y: 0 },
			{ x: 6, y: 0 },
			{ x: 6, y: 4 },
			{ x: 5, y: 4 },
			{ x: 5, y: 1 },
			{ x: 4, y: 1 },
			{ x: 4, y: 4 },
			{ x: 3, y: 4 },
			{ x: 3, y: 1 },
			{ x: 2, y: 1 },
			{ x: 2, y: 4 },
			{ x: 0, y: 4 },
		];
		const idx = triangulate(comb);
		expect(triArea(comb, idx)).toBeCloseTo(area(comb), 12);
		expect(noneInverted(comb, idx)).toBe(true);

		const fan: number[] = [];
		for (let i = 1; i < comb.length - 1; i++) fan.push(0, i, i + 1);
		expect(triArea(comb, fan)).toBeGreaterThan(area(comb) * 1.05);
	});

	// The specific failure mode: a vertex mathematically ON a candidate ear's edge, where the cross
	// product lands at ±1e-16. Read as "outside", it stops blocking the ear and the ring pinches.
	it("rejects an ear blocked by a reflex vertex lying exactly on its edge", () => {
		// Vertex 3 is reflex and sits exactly on the segment from 4 to 1, the far edge of the ear at 0.
		const pinch: Pt[] = [
			{ x: 0, y: 0 },
			{ x: 2, y: 0 },
			{ x: 2, y: 2 },
			{ x: 1, y: 1 }, // reflex, on the line x = y from (2,2) to (0,0)
			{ x: 0, y: 2 },
		];
		const idx = triangulate(pinch);
		expect(triArea(pinch, idx)).toBeCloseTo(area(pinch), 12);
		expect(noneInverted(pinch, idx)).toBe(true);
	});

	it("triangulates Penrose rhombi exactly", () => {
		for (const t of penrosePatch(3)) {
			const idx = triangulate(t.vertices);
			expect(triArea(t.vertices, idx)).toBeCloseTo(area(t.vertices), 12);
		}
	});
});

describe("edgeMask", () => {
	it("pins nothing when all three edges are real (a triangle of a 3-gon)", () => {
		expect(edgeMask(0, 1, 2, 3)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
	});

	it("pins the diagonal channel of a quad's first triangle", () => {
		// (0,1,2) of a 4-gon: edges 0-1 and 1-2 are real, 2-0 is the diagonal. 2-0 is opposite vertex
		// 1, so channel 1 pins to 1 everywhere — exactly SubRosaGL's hand-written EDGE_A.
		expect(edgeMask(0, 1, 2, 4)).toEqual([1, 1, 0, 0, 1, 0, 0, 1, 1]);
	});

	it("pins the diagonal channel of a quad's second triangle", () => {
		// (0,2,3): 2-3 and 3-0 real, 0-2 the diagonal, opposite vertex 3 — the third listed — so
		// channel 2 pins. Matches EDGE_B.
		expect(edgeMask(0, 2, 3, 4)).toEqual([1, 0, 1, 0, 1, 1, 0, 0, 1]);
	});

	it("treats the wrap-around edge (n-1, 0) as real", () => {
		// (4,0,1) of a 5-gon: 4-0 wraps and is real, 0-1 is real, 1-4 is the diagonal. The channel a
		// diagonal pins is the one for the vertex OPPOSITE it — the triangle vertex that is neither of
		// its endpoints — so edge (1,4) pins channel 1 (the middle-listed vertex, 0), not channel 0.
		expect(edgeMask(4, 0, 1, 5)).toEqual([1, 1, 0, 0, 1, 0, 0, 1, 1]);
	});

	it("never pins a channel at a vertex where the real edge must be measured", () => {
		// Any triangle of any n-gon: the mask at vertex k has channel k = 1, so min() still reaches 0
		// on every unpinned edge.
		for (const [a, b, c, n] of [[0, 1, 2, 13], [3, 7, 12, 13], [5, 6, 11, 13]] as const) {
			const m = edgeMask(a, b, c, n);
			expect(m[0]).toBe(1); // vertex 0's own channel
			expect(m[4]).toBe(1); // vertex 1's own channel
			expect(m[8]).toBe(1); // vertex 2's own channel
		}
	});
});
