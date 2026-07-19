import { describe, it, expect } from "vitest";
import { spiralSimilarity, wrapStripDrift } from "@/lib/render/spiralMap";

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

describe("wrapStripDrift", () => {
	// Solve w = a·v1 + b·v2 for real (a, b).
	function latticeCoords(
		w: [number, number],
		v1: [number, number],
		v2: [number, number],
	): [number, number] {
		const det = v1[0] * v2[1] - v2[0] * v1[1];
		return [(w[0] * v2[1] - v2[0] * w[1]) / det, (v1[0] * w[1] - w[0] * v1[1]) / det];
	}

	// The load-bearing invariant: the wrap must be INVISIBLE — K·(orig − wrapped) is an exact integer
	// combination of the world lattice, so the shader's lattice reduction lands on the same tile.
	it.each([
		[7.3, -12.9], [100.5, 61.2], [-3.14, 0.2], [0.9, -0.4],
	])("K·(orig − wrapped) is a world-lattice vector for drift (%f, %f)", (dx, dy) => {
		for (const [v1, v2] of [SQUARE, HEX]) {
			const { k } = spiralSimilarity(1, 2, v1, v2);
			const [wx, wy] = wrapStripDrift([dx, dy], k, v1, v2);
			const delta = cmul(k, [dx - wx, dy - wy]);
			const [a, b] = latticeCoords(delta, v1, v2);
			expect(a).toBeCloseTo(Math.round(a), 9);
			expect(b).toBeCloseTo(Math.round(b), 9);
		}
	});

	it("bounds the wrapped drift within half a strip cell in each basis coordinate", () => {
		const { k } = spiralSimilarity(2, 1, ...HEX);
		const [wx, wy] = wrapStripDrift([250.7, -99.3], k, ...HEX);
		// Express the wrapped drift back in the strip basis u_i = v_i/K: coords must be ≤ 1/2.
		const world = cmul(k, [wx, wy]);
		const [a, b] = latticeCoords(world, ...HEX);
		expect(Math.abs(a)).toBeLessThanOrEqual(0.5 + 1e-9);
		expect(Math.abs(b)).toBeLessThanOrEqual(0.5 + 1e-9);
	});

	it("returns a drift already inside the cell unchanged", () => {
		const { k } = spiralSimilarity(1, 0, ...SQUARE);
		const small: [number, number] = [0.05, -0.03];
		expect(wrapStripDrift(small, k, ...SQUARE)).toEqual(small);
	});

	it("returns the drift unchanged on a singular strip basis", () => {
		const { k } = spiralSimilarity(1, 0, ...SQUARE);
		const drift: [number, number] = [42, -7];
		expect(wrapStripDrift(drift, k, [1, 0], [1, 0])).toEqual(drift); // collinear v1, v2
		expect(wrapStripDrift(drift, [0, 0], ...SQUARE)).toEqual(drift); // degenerate K
	});
});
