import { describe, it, expect } from "vitest";
import { spiralLogToLattice } from "@/lib/render/spiralMap";

const TAU = Math.PI * 2;

// The matrix maps (r, θ) → lattice (a, b): latA = m[0]·r + m[1]·θ, latB = m[2]·r + m[3]·θ.
function applyM(m: [number, number, number, number], r: number, theta: number): [number, number] {
	return [m[0] * r + m[1] * theta, m[2] * r + m[3] * theta];
}

describe("spiralLogToLattice", () => {
	// The load-bearing invariant: advancing θ by one full turn must move world by exactly the seam
	// lattice vector (a,b). That is what closes the atan2 branch cut with no gash, for any (a,b).
	it.each([
		[1, 0],
		[0, 1],
		[2, 3],
		[3, -2],
		[-1, 2],
		[2, 4], // gcd 2
		[-3, -6], // gcd 3, both negative
	])("seam closes: M·(0, 2π) == (a,b) for (%i, %i)", (a, b) => {
		const { m } = spiralLogToLattice(a, b, 0, 1);
		const [da, db] = applyM(m, 0, TAU);
		expect(da).toBeCloseTo(a, 9);
		expect(db).toBeCloseTo(b, 9);
	});

	it("θ-column is independent of pitch (shear only touches the r-column)", () => {
		const flat = spiralLogToLattice(2, 3, 0, 1).m;
		const leaned = spiralLogToLattice(2, 3, 40, 1).m;
		// θ-column = m[1], m[3]
		expect(leaned[1]).toBeCloseTo(flat[1], 12);
		expect(leaned[3]).toBeCloseTo(flat[3], 12);
		// r-column = m[0], m[2] must change with pitch
		expect(leaned[0]).not.toBeCloseTo(flat[0], 6);
	});

	it("primitive/complement form a unimodular basis (det ±1)", () => {
		for (const [a, b] of [[1, 0], [0, 1], [2, 3], [3, -2], [2, 4], [-3, -6]]) {
			const { primitive, complement } = spiralLogToLattice(a, b, 0, 1);
			const det = primitive[0] * complement[1] - primitive[1] * complement[0];
			expect(Math.abs(det)).toBe(1);
		}
	});

	it("reports the arm-multiplication factor gcd(|a|,|b|)", () => {
		expect(spiralLogToLattice(1, 0, 0, 1).arms).toBe(1);
		expect(spiralLogToLattice(2, 3, 0, 1).arms).toBe(1);
		expect(spiralLogToLattice(2, 4, 0, 1).arms).toBe(2);
		expect(spiralLogToLattice(-3, -6, 0, 1).arms).toBe(3);
	});

	it("a=1,b=0 at pitch 0 gives the plain single-wind matrix", () => {
		const { m, complement } = spiralLogToLattice(1, 0, 0, 1);
		expect(complement).toEqual([0, 1]);
		// r-column = complement = (0,1); θ-column = (1,0)/2π
		expect(m[0]).toBeCloseTo(0, 12);
		expect(m[2]).toBeCloseTo(1, 12);
		expect(m[1]).toBeCloseTo(1 / TAU, 12);
		expect(m[3]).toBeCloseTo(0, 12);
	});

	it("radialDensity scales the r-column", () => {
		const a = spiralLogToLattice(1, 0, 0, 1).m;
		const b = spiralLogToLattice(1, 0, 0, 3).m;
		expect(b[2]).toBeCloseTo(a[2] * 3, 9);
	});

	it("degenerate a=b=0 falls back to (1,0) without NaN", () => {
		const { m, primitive } = spiralLogToLattice(0, 0, 0, 1);
		expect(primitive).toEqual([1, 0]);
		for (const v of m) expect(Number.isFinite(v)).toBe(true);
		const [da, db] = applyM(m, 0, TAU);
		expect(da).toBeCloseTo(1, 9);
		expect(db).toBeCloseTo(0, 9);
	});
});
