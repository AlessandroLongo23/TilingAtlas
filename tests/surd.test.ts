import { describe, it, expect } from "vitest";
import { Cyclotomic, CyclotomicRing } from "@/classes/Cyclotomic";
import { Surd, tileAreaSurd, detSurd } from "@/classes/algorithm/exact/Surd";

const ring = CyclotomicRing.create(24);
const ONE = Cyclotomic.ONE(ring);
const zeta = (k: number) => Cyclotomic.zeta(ring, k);

const SQRT2 = new Surd(0n, 1n, 0n, 0n, 1n);
const SQRT3 = new Surd(0n, 0n, 1n, 0n, 1n);
const SQRT6 = new Surd(0n, 0n, 0n, 1n, 1n);

/** Unit-edge regular n-gon area (float reference, = PeriodSolver.regularArea). */
const regularArea = (n: number) => n / (4 * Math.tan(Math.PI / n));

describe("Surd: ℚ(√2,√3) exact arithmetic", () => {
	it("radical squares and products", () => {
		expect(SQRT2.mul(SQRT2).equals(Surd.rational(2n))).toBe(true);
		expect(SQRT3.mul(SQRT3).equals(Surd.rational(3n))).toBe(true);
		expect(SQRT6.mul(SQRT6).equals(Surd.rational(6n))).toBe(true);
		expect(SQRT2.mul(SQRT3).equals(SQRT6)).toBe(true);
		expect(SQRT2.mul(SQRT6).equals(SQRT3.scaleRational(2n))).toBe(true); // √2·√6 = 2√3
		expect(SQRT3.mul(SQRT6).equals(SQRT2.scaleRational(3n))).toBe(true); // √3·√6 = 3√2
	});

	it("(1+√2)² = 3 + 2√2", () => {
		const onePlusRoot2 = Surd.ONE.add(SQRT2);
		expect(onePlusRoot2.mul(onePlusRoot2).equals(new Surd(3n, 2n, 0n, 0n, 1n))).toBe(true);
	});

	it("division is the inverse of multiplication", () => {
		const a = new Surd(3n, 2n, 0n, 0n, 1n); // 3+2√2
		const b = Surd.ONE.add(SQRT2); // 1+√2
		expect(a.div(b).equals(b)).toBe(true); // (3+2√2)/(1+√2) = 1+√2
		const x = new Surd(2n, -3n, 1n, 5n, 7n);
		expect(x.div(x).equals(Surd.ONE)).toBe(true);
		expect(x.mul(x.inverse()).equals(Surd.ONE)).toBe(true);
	});

	it("sign is exact, including near-equal surds", () => {
		expect(new Surd(2n, 2n, 0n, 0n, 1n).sub(new Surd(0n, 0n, 3n, 0n, 1n)).sign()).toBe(-1); // 2+2√2 < 3√3
		expect(SQRT6.sub(SQRT2.mul(SQRT3)).sign()).toBe(0); // √6 − √2·√3 = 0
		expect(Surd.ONE.add(SQRT2).cmp(new Surd(0n, 0n, 0n, 0n, 1n))).toBe(1);
		// rationals straddling √2 ≈ 1.4142135
		expect(Surd.rational(17n, 12n).sub(SQRT2).sign()).toBe(1); // 17/12 = 1.41667 > √2
		expect(Surd.rational(140n, 99n).sub(SQRT2).sign()).toBe(-1); // 140/99 = 1.414141 < √2
	});
});

describe("Surd: tile areas match the float oracle", () => {
	for (const n of [3, 4, 6, 8, 12]) {
		it(`area(${n}) ≈ regularArea(${n})`, () => {
			expect(tileAreaSurd(n).toFloat()).toBeCloseTo(regularArea(n), 10);
		});
	}
	it("the exact components are as specified", () => {
		expect(tileAreaSurd(3).equals(new Surd(0n, 0n, 1n, 0n, 4n))).toBe(true); // √3/4
		expect(tileAreaSurd(8).equals(new Surd(2n, 2n, 0n, 0n, 1n))).toBe(true); // 2+2√2
		expect(tileAreaSurd(12).equals(new Surd(6n, 0n, 3n, 0n, 1n))).toBe(true); // 6+3√3
	});
});

describe("detSurd: exact signed lattice area", () => {
	it("det(1, i) = 1 (unit square cell)", () => {
		// i = ζ₂₄⁶ (90°)
		expect(detSurd(ONE, zeta(6)).equals(Surd.ONE)).toBe(true);
	});
	it("det(1, ζ₆) = √3/2 (unit hexagonal cell)", () => {
		// ζ₆ = ζ₂₄⁴ (60°)
		expect(detSurd(ONE, zeta(4)).equals(new Surd(0n, 0n, 1n, 0n, 2n))).toBe(true);
	});
	it("is antisymmetric and matches the float cross product", () => {
		const u = ONE.add(zeta(4)); // 1 + ζ₆
		const v = zeta(2).add(zeta(7)); // arbitrary ℤ[ζ₂₄] vector
		const d = detSurd(u, v);
		expect(detSurd(v, u).equals(d.neg())).toBe(true);
		const uv = u.toVector();
		const vv = v.toVector();
		expect(d.toFloat()).toBeCloseTo(uv.x * vv.y - uv.y * vv.x, 9);
	});
	it("det of the 4.8.8 cell = (1+√2)² = 3+2√2", () => {
		// octagon-square period: square lattice of side 1+√2 along 0°/90°
		const sqrt2 = zeta(3).add(zeta(21)); // ζ³+ζ⁻³ = 2cos45° = √2 (real)
		const side = ONE.add(sqrt2); // (1+√2) along 0°
		const perp = side.mulZeta(6); // (1+√2) along 90°
		expect(detSurd(side, perp).equals(new Surd(3n, 2n, 0n, 0n, 1n))).toBe(true);
	});
});
