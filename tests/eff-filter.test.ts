import { describe, it, expect } from "vitest";
import { Cyclotomic, CyclotomicRing } from "@/classes/Cyclotomic";
import { parseEffC2, passesEffFilter } from "@/classes/algorithm/effFilter";

// Efficiency-pruning filter (PRUNE_EFF_C2 work order, 2026-07-04). EXACT test:
//   keep v iff wt(v)² ≤ c²·|v|²,  c² = P/Q rational, |v|² = Re(conj(v)·v) exact Surd.
// The decisive comparison must be exact (a completeness knob — dropping a pool vector can drop a
// tiling), so these oracles are computed by hand in ℚ(√2) and asserted against the Surd path.

const ring = CyclotomicRing.create(24);
const zeta = (k: number) => Cyclotomic.zeta(ring, k);
const sum = (...cs: Cyclotomic[]) => cs.reduce((a, b) => a.add(b));

describe("parseEffC2", () => {
	it("parses a bare integer as c² = P/1", () => {
		expect(parseEffC2("2")).toEqual({ P: 2n, Q: 1n });
	});
	it("parses a fraction P/Q", () => {
		expect(parseEffC2("169/100")).toEqual({ P: 169n, Q: 100n });
	});
	it("accepts the sqrt2 spelling as c² = 2", () => {
		expect(parseEffC2("sqrt2")).toEqual({ P: 2n, Q: 1n });
		expect(parseEffC2("√2")).toEqual({ P: 2n, Q: 1n });
	});
	it("returns null for unset / empty (byte-identical no-op)", () => {
		expect(parseEffC2(undefined)).toBeNull();
		expect(parseEffC2(null)).toBeNull();
		expect(parseEffC2("")).toBeNull();
		expect(parseEffC2("   ")).toBeNull();
	});
	it("THROWS on a malformed value (a completeness knob must fail loud, not silently no-op)", () => {
		expect(() => parseEffC2("abc")).toThrow();
		expect(() => parseEffC2("1.30")).toThrow(); // decimals not allowed — force an exact rational
		expect(() => parseEffC2("0")).toThrow();     // c² must be > 0
		expect(() => parseEffC2("2/0")).toThrow();
	});
});

describe("passesEffFilter — exact wt² ≤ c²·|v|²", () => {
	// Unit root ζ⁰ = 1: wt = 1, |v|² = 1, ratio = 1.
	const unit = zeta(0);
	it("keeps a unit root at c² ≥ 1, drops it below", () => {
		expect(passesEffFilter(1, unit, { P: 2n, Q: 1n })).toBe(true);   // 1 ≤ 2·1
		expect(passesEffFilter(1, unit, { P: 1n, Q: 1n })).toBe(true);   // 1 ≤ 1 (boundary kept)
		expect(passesEffFilter(1, unit, { P: 1n, Q: 2n })).toBe(false);  // 1 ≤ ½ ? no
	});

	// Octagon period vector u = ζ⁰+ζ³+ζ⁶ = (1+√2/2, 1+√2/2): wt = 3, |u|² = 3+2√2 ≈ 5.828,
	// ratio² = 9/(3+2√2) = 27−18√2 ≈ 1.5442. (This is the 4.8.8 / t1002 basis vector.)
	const oct = sum(zeta(0), zeta(3), zeta(6));
	it("keeps the octagon vector at c = √2 (c²=2) and c = 1.30 (c²=1.69)", () => {
		expect(passesEffFilter(3, oct, { P: 2n, Q: 1n })).toBe(true);       // 9 ≤ 2(3+2√2)=11.66
		expect(passesEffFilter(3, oct, { P: 169n, Q: 100n })).toBe(true);   // 9 ≤ 1.69·5.828=9.85
	});
	it("drops the octagon vector once c² < ratio² (27−18√2 ≈ 1.544)", () => {
		expect(passesEffFilter(3, oct, { P: 3n, Q: 2n })).toBe(false);      // 9 ≤ 1.5·5.828=8.74 ? no
		expect(passesEffFilter(3, oct, { P: 154n, Q: 100n })).toBe(false);  // 1.54 < 1.5442 → drop
		expect(passesEffFilter(3, oct, { P: 155n, Q: 100n })).toBe(true);   // 1.55 > 1.5442 → keep
	});
	it("is exact at the boundary c² = 27/... — a rational just above/below ratio² flips cleanly", () => {
		// ratio² = 27 − 18√2. Rational 1544/1000 < ratio² < 1545/1000 (√2≈1.41421356).
		// c²·|u|² − wt²  at c²=1545/1000 is > 0 (keep); at 1544/1000 is < 0 (drop).
		expect(passesEffFilter(3, oct, { P: 1545n, Q: 1000n })).toBe(true);
		expect(passesEffFilter(3, oct, { P: 1544n, Q: 1000n })).toBe(false);
	});
});
