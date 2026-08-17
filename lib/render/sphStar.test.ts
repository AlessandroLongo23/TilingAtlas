import { describe, expect, it } from "vitest";
import { starFaceRings } from "@/lib/render/sphStar";
import type { V3 } from "@/lib/render/icoFreedraw";

// The star-face decomposition is the one piece of real geometry in the spherical-star adapter, so it is
// checked against a number derived independently rather than against itself.
//
// The NONZERO-winding silhouette of a regular {5/2} of circumradius 1 is a simple 10-gon whose radii
// alternate between 1 (the points, at 72°k) and r = cos(72°)/cos(36°) = 0.3819660 (the crossings, at
// 36° + 72°k), with 36° between consecutive vertices. Shoelace over those ten gives
//
//     A = ½ · 10 · 1 · r · sin(36°) = 5 · (cos72°/cos36°) · sin36° = 1.1225699…
//
// The convex hull would be 2.377641 and the even-odd reading (core punched out) 0.775775, so a wrong
// decomposition cannot pass by accident.

function polyArea(ring: number[], verts: V3[]): number {
	// Planar polygon area in 3D via the vector area of a fan; the pieces are convex and coplanar.
	let ax = 0, ay = 0, az = 0;
	for (let i = 0; i < ring.length; i++) {
		const a = verts[ring[i]];
		const b = verts[ring[(i + 1) % ring.length]];
		ax += a[1] * b[2] - a[2] * b[1];
		ay += a[2] * b[0] - a[0] * b[2];
		az += a[0] * b[1] - a[1] * b[0];
	}
	return Math.hypot(ax, ay, az) / 2;
}

/** n points of a regular n-gon of circumradius 1 in the z = 0 plane, in GEOMETRIC order. */
function ngon(n: number): V3[] {
	return Array.from({ length: n }, (_, k): V3 => [
		Math.cos((2 * Math.PI * k) / n),
		Math.sin((2 * Math.PI * k) / n),
		0,
	]);
}

/** The traversal ring of {n/d}: v0, vd, v2d, … which is what a record stores. */
const traversal = (n: number, d: number) => Array.from({ length: n }, (_, k) => (k * d) % n);

describe("starFaceRings", () => {
	it("passes a convex face straight through and appends nothing", () => {
		const verts = ngon(5);
		const before = verts.length;
		const rings = starFaceRings([0, 1, 2, 3, 4], 1, verts);
		expect(rings).toEqual([[0, 1, 2, 3, 4]]);
		expect(verts.length).toBe(before);
	});

	it("decomposes a pentagram into its core pentagon and five point triangles", () => {
		const verts = ngon(5);
		const rings = starFaceRings(traversal(5, 2), 2, verts);
		expect(rings.length).toBe(6);
		expect(rings[0].length).toBe(5); // the core
		expect(rings.slice(1).every((r) => r.length === 3)).toBe(true);
		expect(verts.length).toBe(10); // five crossing points appended past the five real vertices
	});

	it("gives the pentagram its nonzero-winding area, not the hull and not even-odd", () => {
		const verts = ngon(5);
		const rings = starFaceRings(traversal(5, 2), 2, verts);
		const area = rings.reduce((s, r) => s + polyArea(r, verts), 0);
		expect(area).toBeCloseTo(5 * (Math.cos((2 * Math.PI) / 5) / Math.cos(Math.PI / 5)) * Math.sin(Math.PI / 5), 9);
	});

	it("puts the crossing points on the ring the chord geometry predicts", () => {
		const verts = ngon(5);
		starFaceRings(traversal(5, 2), 2, verts);
		const inner = verts.slice(5);
		// cos(2π/5)/cos(π/5) — the intersection radius of two chords of {5/2}
		const want = Math.cos((2 * Math.PI) / 5) / Math.cos(Math.PI / 5);
		for (const p of inner) expect(Math.hypot(p[0], p[1], p[2])).toBeCloseTo(want, 9);
	});

	it("handles a three-winding star with two crossing rings", () => {
		const verts = ngon(8);
		const rings = starFaceRings(traversal(8, 3), 3, verts);
		// core octagon + two bands of eight triangles
		expect(rings.length).toBe(1 + 2 * 8);
		expect(rings[0].length).toBe(8);
		expect(verts.length).toBe(8 + 2 * 8);
		const r1 = Math.cos((3 * Math.PI) / 8) / Math.cos(Math.PI / 8);
		const r2 = Math.cos((3 * Math.PI) / 8) / Math.cos((2 * Math.PI) / 8);
		const radii = verts.slice(8).map((p) => Math.hypot(p[0], p[1], p[2]));
		expect(Math.min(...radii)).toBeCloseTo(r1, 9);
		expect(Math.max(...radii)).toBeCloseTo(r2, 9);
	});
});
