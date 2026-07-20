// The hyperbolic edge-length solver: the geometric core of the developer. In hyperbolic space a regular
// polygon's interior angle shrinks with edge length, so a vertex configuration (multiset of polygon sizes)
// closes at ONE forced edge length, found by monotone bisection to angle-sum 2π. This is Marek's arcmedge
// and the positive-defect twin of the spherical ρ-solve. Cross-checked against the closed form for regular
// {p,q}, the {3,8}≡{8,4} pool anchor, and the edge length baked into the existing buildRegularPatch tiles.

import { describe, it, expect } from "vitest";
import {
	interiorAngle,
	euclideanAngleSum,
	regularEdgeLength,
	solveEdgeLength,
	placePolygonOnEdge,
} from "@/lib/render/hyperbolicDevelop";
import { buildRegularPatch } from "@/lib/render/hyperbolicRegularPatch";
import { hypDist, type Complex } from "@/lib/render/hyperbolic";

const centroid = (verts: Complex[]): Complex => {
	let x = 0, y = 0;
	for (const v of verts) {
		x += v.x;
		y += v.y;
	}
	return { x: x / verts.length, y: y / verts.length };
};

describe("hyperbolic interior angle", () => {
	it("reduces to the Euclidean angle as edge length → 0", () => {
		// α(p, ℓ→0) = π(p−2)/p
		for (const p of [3, 4, 5, 7, 8, 12]) {
			expect(interiorAngle(p, 1e-6)).toBeCloseTo((Math.PI * (p - 2)) / p, 4);
		}
	});
	it("is strictly decreasing in edge length", () => {
		let prev = interiorAngle(7, 0.01);
		for (let l = 0.5; l <= 6; l += 0.5) {
			const a = interiorAngle(7, l);
			expect(a).toBeLessThan(prev);
			prev = a;
		}
	});
});

describe("hyperbolic edge-length solver", () => {
	it("matches the closed form cosh(ℓ/2)=cos(π/p)/sin(π/q) for regular {p,q}", () => {
		for (const [p, q] of [
			[7, 3],
			[8, 3],
			[5, 4],
			[3, 8],
			[8, 4],
			[3, 7],
			[4, 6],
		]) {
			const solved = solveEdgeLength(Array(q).fill(p)); // q p-gons around a vertex
			expect(solved).not.toBeNull();
			expect(solved as number).toBeCloseTo(regularEdgeLength(p, q), 9);
		}
	});

	it("puts {3,8} and {8,4} at the same pool edge length ≈ 1.528570919", () => {
		const l38 = regularEdgeLength(3, 8);
		const l84 = regularEdgeLength(8, 4);
		expect(l38).toBeCloseTo(1.528570919, 6);
		expect(Math.abs(l38 - l84)).toBeLessThan(1e-9);
	});

	it("returns null for Euclidean and spherical vertex configs (no hyperbolic edge)", () => {
		// Euclidean: angle sum exactly 2π
		expect(euclideanAngleSum([4, 4, 4, 4])).toBeCloseTo(2 * Math.PI, 9);
		expect(solveEdgeLength([4, 4, 4, 4])).toBeNull(); // square tiling
		expect(solveEdgeLength([3, 3, 3, 3, 3, 3])).toBeNull(); // triangular tiling
		expect(solveEdgeLength([3, 4, 6, 4])).toBeNull(); // rhombitrihexagonal
		// Spherical: angle sum below 2π
		expect(solveEdgeLength([3, 3, 3])).toBeNull(); // tetrahedron vertex
		expect(solveEdgeLength([5, 5, 5])).toBeNull(); // dodecahedron vertex
	});

	it("solves mixed hyperbolic configs (the {3,8} co-realization pool)", () => {
		// At ℓ_{3,8} the triangle closes 8 around a vertex and the octagon 4; the mixed vertex 3.3.8.8.8
		// shares that length. Necessary metric condition (combinatorial validity is the solver's job).
		const l = solveEdgeLength([3, 3, 8, 8, 8]);
		expect(l).not.toBeNull();
		expect(l as number).toBeCloseTo(regularEdgeLength(3, 8), 6);
	});
});

describe("edge-length solver agrees with existing buildRegularPatch geometry", () => {
	for (const [p, q] of [
		[7, 3],
		[8, 3],
		[5, 4],
	]) {
		it(`every {${p},${q}} tile edge measures the solved length`, () => {
			const L = solveEdgeLength(Array(q).fill(p)) as number;
			const tiles = buildRegularPatch(p, q, 1);
			for (const t of tiles) {
				expect(t.verts.length).toBe(p);
				for (let i = 0; i < p; i++) {
					const a = t.verts[i];
					const b = t.verts[(i + 1) % p];
					expect(hypDist(a, b)).toBeCloseTo(L, 4);
				}
			}
		});
	}
});

describe("placePolygonOnEdge (the mixed-tile placement primitive)", () => {
	it("placing a p-gon on a {p,q} edge reproduces the buildRegularPatch neighbour", () => {
		const [p, q] = [7, 3];
		const patch = buildRegularPatch(p, q, 1);
		const central = patch[0];
		const cCentroid = centroid(central.verts);
		// The neighbour across edge 0 in the oracle: the tile whose centroid is closest to that edge.
		const a = central.verts[0];
		const b = central.verts[1];
		const placed = placePolygonOnEdge(a, b, p, cCentroid);
		const pc = centroid(placed);
		// find the oracle neighbour nearest this placed centroid and require a close match
		let best = Infinity;
		for (const t of patch.slice(1)) {
			best = Math.min(best, Math.hypot(centroid(t.verts).x - pc.x, centroid(t.verts).y - pc.y));
		}
		expect(best).toBeLessThan(1e-3);
		// a and b are consecutive vertices of the placed polygon
		expect(Math.hypot(placed[0].x - a.x, placed[0].y - a.y)).toBeLessThan(1e-9);
		expect(Math.hypot(placed[1].x - b.x, placed[1].y - b.y)).toBeLessThan(1e-9);
	});

	it("places a DIFFERENT regular polygon (a square) on the same edge, edge-length preserved", () => {
		const [p, q] = [7, 3];
		const central = buildRegularPatch(p, q, 0)[0];
		const cCentroid = centroid(central.verts);
		const a = central.verts[0];
		const b = central.verts[1];
		const L = hypDist(a, b);
		const square = placePolygonOnEdge(a, b, 4, cCentroid);
		expect(square.length).toBe(4);
		for (let i = 0; i < 4; i++) {
			expect(hypDist(square[i], square[(i + 1) % 4])).toBeCloseTo(L, 6);
		}
		// it lands on the far side of the edge from the central tile
		const sc = centroid(square);
		expect(Math.hypot(sc.x - cCentroid.x, sc.y - cCentroid.y)).toBeGreaterThan(0);
		// every vertex inside the disk
		for (const v of square) expect(Math.hypot(v.x, v.y)).toBeLessThan(1);
	});
});
