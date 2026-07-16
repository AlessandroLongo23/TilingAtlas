import { describe, it, expect } from "vitest";
import { spiralSimilarity } from "@/lib/render/spiralMap";

const TAU = Math.PI * 2;

// Complex multiply, matching the shader's cmul.
function cmul(a: [number, number], b: [number, number]): [number, number] {
	return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
}

const SQUARE: [[number, number], [number, number]] = [[1, 0], [0, 1]];
// Hexagonal lattice basis (60° between equal-length vectors) — Kaplan's IH01 case.
const HEX: [[number, number], [number, number]] = [[1, 0], [0.5, Math.sqrt(3) / 2]];

describe("spiralSimilarity", () => {
	// The load-bearing invariant: one full turn of θ must advance world by exactly the seam
	// S = a·v1 + b·v2 — that closes the atan2 branch cut onto a lattice translation, for any (a,b).
	it.each([
		[1, 0], [0, 1], [1, 6], [2, 3], [3, -2], [-1, 2], [2, 4],
	])("seam closes on both bases: cmul(K, (0,2π)) == a·v1+b·v2 for (%i, %i)", (a, b) => {
		for (const [v1, v2] of [SQUARE, HEX]) {
			const { k, seam } = spiralSimilarity(a, b, v1, v2);
			const [dx, dy] = cmul(k, [0, TAU]);
			expect(dx).toBeCloseTo(a * v1[0] + b * v2[0], 9);
			expect(dy).toBeCloseTo(a * v1[1] + b * v2[1], 9);
			expect(seam[0]).toBeCloseTo(a * v1[0] + b * v2[0], 12);
			expect(seam[1]).toBeCloseTo(a * v1[1] + b * v2[1], 12);
		}
	});

	// Conformality is structural: the map is a single complex number (rotation + uniform scale). The
	// two real columns of the induced 2×2 must be orthogonal with equal norm — no shear, no anisotropy.
	it("is a similarity: orthogonal equal-norm columns", () => {
		const { k } = spiralSimilarity(1, 6, HEX[0], HEX[1]);
		const colR = cmul(k, [1, 0]); // image of the r direction
		const colT = cmul(k, [0, 1]); // image of the θ direction
		const dot = colR[0] * colT[0] + colR[1] * colT[1];
		const nR = Math.hypot(...colR);
		const nT = Math.hypot(...colT);
		expect(dot).toBeCloseTo(0, 12);
		expect(nR).toBeCloseTo(nT, 12);
	});

	it("reports the arm-multiplication factor gcd(|a|,|b|)", () => {
		expect(spiralSimilarity(1, 0, ...SQUARE).arms).toBe(1);
		expect(spiralSimilarity(1, 6, ...SQUARE).arms).toBe(1);
		expect(spiralSimilarity(2, 4, ...SQUARE).arms).toBe(2);
		expect(spiralSimilarity(-3, -6, ...SQUARE).arms).toBe(3);
	});

	it("degenerate a=b=0 falls back to seam v1 without NaN", () => {
		const { k, seam } = spiralSimilarity(0, 0, ...HEX);
		expect(seam).toEqual([1, 0]);
		for (const v of k) expect(Number.isFinite(v)).toBe(true);
	});

	it("collinear basis making the seam ~zero falls back to v1", () => {
		const { seam } = spiralSimilarity(1, -1, [1, 0], [1, 0]); // v1 == v2 ⇒ S = 0
		expect(seam).toEqual([1, 0]);
	});
});
