import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { faceCrossings, starFaceRings } from "@/lib/render/sphStar";
import type { V3 } from "@/lib/render/icoFreedraw";
import type { SphStarPattern } from "@/lib/tilings/sph-star";

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

	// ⚑ This used to assert the OLD decomposition: a core on the innermost crossing ring plus one band
	// of triangles per ring, 17 rings and 16 appended points for {8/3}. That is the shape Marek Čtrnáct
	// reported holes in, and the test agreed with the bug because it was written from the same picture.
	// The fill is bounded by the OUTERMOST crossing ring alone; everything further in is interior.
	it("bounds a three-winding star by its outer crossing ring, not its inner one", () => {
		const verts = ngon(8);
		const rings = starFaceRings(traversal(8, 3), 3, verts);
		// core octagon + eight point triangles, the same shape as a pentagram's
		expect(rings.length).toBe(1 + 8);
		expect(rings[0].length).toBe(8);
		expect(verts.length).toBe(8 + 8);
		// ring d−1 = ring 2 of {8/3}, NOT ring 1
		const outer = Math.cos((3 * Math.PI) / 8) / Math.cos((2 * Math.PI) / 8);
		for (const p of verts.slice(8)) expect(Math.hypot(p[0], p[1], p[2])).toBeCloseTo(outer, 9);
	});

	// The area is the whole point: a decomposition that misses a notch still passes every structural
	// check above. {8/3} was short by 8.6% and it showed as holes in the octagrammic prism.
	it("covers the whole filled region for every winding on the shelf", () => {
		const nonzero = (poly: V3[], px: number, py: number) => {
			let w = 0;
			for (let i = 0; i < poly.length; i++) {
				const a = poly[i];
				const b = poly[(i + 1) % poly.length];
				const side = (b[0] - a[0]) * (py - a[1]) - (px - a[0]) * (b[1] - a[1]);
				if (a[1] <= py) {
					if (b[1] > py && side > 0) w++;
				} else if (b[1] <= py && side < 0) w--;
			}
			return w !== 0;
		};
		const area = (pts: V3[]) => {
			let s = 0;
			for (let i = 0; i < pts.length; i++) {
				const a = pts[i];
				const b = pts[(i + 1) % pts.length];
				s += a[0] * b[1] - b[0] * a[1];
			}
			return Math.abs(s) / 2;
		};
		// every star face type the spherical-star shelf actually carries, plus two retrograde forms
		for (const [n, d] of [[5, 2], [7, 2], [7, 3], [8, 3], [10, 3], [8, 5], [12, 7]] as [number, number][]) {
			const verts = ngon(n);
			const face = traversal(n, d);
			const poly = face.map((i) => verts[i]);
			const got = starFaceRings(face, d, verts).reduce((s, r) => s + area(r.map((i) => verts[i])), 0);
			const N = 500;
			let hit = 0;
			for (let i = 0; i < N; i++) {
				for (let j = 0; j < N; j++) {
					if (nonzero(poly, -1 + (2 * (i + 0.5)) / N, -1 + (2 * (j + 0.5)) / N)) hit++;
				}
			}
			const want = (hit * 4) / (N * N);
			expect(Math.abs(got - want) / want, `{${n}/${d}}`).toBeLessThan(0.01);
		}
	});

	// {n/d} with d > n/2 is the same polygon traversed backwards. It used to send the ring radii to
	// ~1e32, because cos(pi*d/n) turns negative while cos(pi*j/n) crosses zero.
	it("fills a retrograde face exactly as it fills the forward one", () => {
		const a = ngon(8);
		const b = ngon(8);
		const fwd = starFaceRings(traversal(8, 3), 3, a);
		const rev = starFaceRings(traversal(8, 5), 5, b);
		expect(rev.length).toBe(fwd.length);
		for (const p of b.slice(8)) expect(Math.hypot(p[0], p[1], p[2])).toBeLessThan(1);
	});
});

// ── Face-through-face creases ───────────────────────────────────────────────────────────────────
// Marek Čtrnáct, 2026-08-19: the pentagrammic prism's concave edges did not show. They are not edges,
// so nothing drew them; `faceCrossings` is what does.
describe("faceCrossings", () => {
	const prism = (): SphStarPattern =>
		JSON.parse(readFileSync("public/spherical-star/ss-10-15-7-d2.json", "utf8"));

	const build = (p: SphStarPattern) => {
		const verts = p.vertices.map((v) => [...v] as [number, number, number]);
		const rings = p.faces.map((f, i) => starFaceRings(f, p.faceType[i][1], verts));
		return { verts, segs: faceCrossings(p, verts, rings) };
	};

	it("finds the pentagrammic prism's five concave creases", () => {
		// Five squares round the prism, each passing through the two that are not its neighbours, and
		// the five creases run parallel to the axis. Five is the number the picture is missing.
		const p = prism();
		const { segs } = build(p);
		expect(segs.length).toBe(5);
	});

	it("never returns a crease that is one of the solid's own edges", () => {
		const p = prism();
		const { verts, segs } = build(p);
		const real = p.edges.map(([a, b]) => [verts[a], verts[b]] as const);
		const near = (u: number[], v: number[]) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]) < 1e-6;
		for (const c of segs) {
			for (const [a, b] of real) {
				expect((near(c.a, a) && near(c.b, b)) || (near(c.a, b) && near(c.b, a))).toBe(false);
			}
		}
	});

	it("finds nothing when there is nothing to cross", () => {
		// A single face cannot pass through another one, so the toggle changes no pixel. The guard that
		// matters: an empty result must come from the geometry, not from an early return.
		const p = prism();
		const verts = p.vertices.map((v) => [...v] as [number, number, number]);
		const rings = [starFaceRings(p.faces[0], p.faceType[0][1], verts)];
		const one: SphStarPattern = { ...p, faces: [p.faces[0]], faceType: [p.faceType[0]], edges: [] };
		expect(faceCrossings(one, verts, rings)).toEqual([]);
	});

	it("draws each crease once, however many face pairs produce it", () => {
		const p = prism();
		const { verts, segs } = build(p);
		const q = (v: V3) => v.map((z) => z.toFixed(5)).join(",");
		const keys = segs.map((c) => [q(c.a), q(c.b)].sort().join("|"));
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("puts both endpoints of every crease inside the circumsphere", () => {
		// A crease is interior geometry by construction: two faces meet strictly inside the solid.
		const p = prism();
		const { segs } = build(p);
		for (const c of segs) {
			for (const q of [c.a, c.b]) {
				expect(Math.hypot(q[0], q[1], q[2])).toBeLessThan(1 + 1e-6);
			}
		}
	});
});
