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
} from "@/lib/render/hyperbolicDevelop";
import { buildRegularPatch } from "@/lib/render/hyperbolicIslamicPatch";
import { hypDist } from "@/lib/render/hyperbolic";

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
