import { describe, it, expect } from "vitest";
import { Cyclotomic, CyclotomicRing } from "@/classes/Cyclotomic";

const ring = CyclotomicRing.create(24);
const ZERO = Cyclotomic.ZERO(ring);
const ONE = Cyclotomic.ONE(ring);
const zeta = (k: number) => Cyclotomic.zeta(ring, k);

/** Deterministic small pseudo-random element (no Math.random — keep tests reproducible). */
function randEl(seed: number): Cyclotomic {
	const num: bigint[] = [];
	let s = seed;
	for (let i = 0; i < ring.phi; i++) {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		num.push(BigInt((s % 11) - 5)); // −5..5
	}
	s = (s * 1103515245 + 12345) & 0x7fffffff;
	const den = BigInt((s % 6) + 1); // 1..6
	return new Cyclotomic(ring, num, den);
}

describe("CyclotomicRing / Cyclotomic — N=24", () => {
	it("ZERO and ONE", () => {
		expect(ZERO.isZero()).toBe(true);
		expect(ONE.equals(ONE)).toBe(true);
		expect(ZERO.add(ONE).equals(ONE)).toBe(true);
		expect(ONE.add(ZERO).equals(ONE)).toBe(true);
		expect(ONE.mul(ONE).equals(ONE)).toBe(true);
	});

	it("ring axioms on random elements (comm, assoc, distrib)", () => {
		for (let seed = 1; seed <= 40; seed++) {
			const a = randEl(seed * 7 + 1);
			const b = randEl(seed * 13 + 2);
			const c = randEl(seed * 17 + 3);
			// additive comm + assoc
			expect(a.add(b).equals(b.add(a))).toBe(true);
			expect(a.add(b).add(c).equals(a.add(b.add(c)))).toBe(true);
			// multiplicative comm + assoc
			expect(a.mul(b).equals(b.mul(a))).toBe(true);
			expect(a.mul(b).mul(c).equals(a.mul(b.mul(c)))).toBe(true);
			// distributivity
			expect(a.mul(b.add(c)).equals(a.mul(b).add(a.mul(c)))).toBe(true);
			// negation
			expect(a.add(a.neg()).isZero()).toBe(true);
		}
	});

	it("ζ identities", () => {
		expect(zeta(24).equals(ONE)).toBe(true); // ζ^24 = 1
		expect(zeta(12).equals(ONE.neg())).toBe(true); // ζ^12 = −1
		expect(zeta(0).equals(ONE)).toBe(true);
		// ζ^6 = i  (e^{iπ/2})
		const i = zeta(6);
		const v = i.toVector();
		expect(v.x).toBeCloseTo(0, 12);
		expect(v.y).toBeCloseTo(1, 12);
		// i^2 = −1
		expect(i.mul(i).equals(ONE.neg())).toBe(true);
	});

	it("reduction: ζ⁸ = ζ⁴ − 1 (Φ₂₄)", () => {
		expect(zeta(8).equals(zeta(4).sub(ONE))).toBe(true);
	});

	it("mulZeta is rotation: ζ^k · ζ^m = ζ^{k+m}", () => {
		for (let k = 0; k < 24; k++) {
			for (let m = 0; m < 24; m++) {
				expect(zeta(k).mul(zeta(m)).equals(zeta(k + m))).toBe(true);
				expect(zeta(k).mulZeta(m).equals(zeta(k + m))).toBe(true);
			}
		}
	});

	it("conj: conj(ζ^k) = ζ^{−k}; conj(i) = −i", () => {
		for (let k = 0; k < 24; k++) {
			expect(zeta(k).conj().equals(zeta(-k))).toBe(true);
		}
		expect(zeta(6).conj().equals(zeta(6).neg())).toBe(true);
	});

	it("rotation closure: 12× mulZeta(2) = identity, no drift", () => {
		// unit square by boundary walk: v0=0, step ζ^0, turn N/4=6 each edge
		const verts = (offset: number): Cyclotomic[] => {
			const vs: Cyclotomic[] = [];
			let p = ZERO;
			let dir = offset;
			for (let i = 0; i < 4; i++) {
				vs.push(p);
				p = p.add(zeta(dir));
				dir += 6;
			}
			return vs;
		};
		const square = verts(0);
		// closes back to start
		let p = square[3].add(zeta(0 + 18));
		expect(p.equals(square[0])).toBe(true);

		const squareKey = (vs: Cyclotomic[]) =>
			vs
				.map((v) => v.key())
				.sort()
				.join("|");

		const base = square;
		const keys = new Set<string>();
		let rotated = base;
		for (let step = 0; step < 12; step++) {
			keys.add(squareKey(rotated));
			rotated = rotated.map((v) => v.mulZeta(2)); // +30°
		}
		// 12 distinct orientations
		expect(keys.size).toBe(12);
		// after 12 steps (×ζ^24) we are back exactly — no drift
		expect(squareKey(rotated)).toBe(squareKey(base));
	});

	it("toVector parity with float construction", () => {
		for (let k = 0; k < 24; k++) {
			const v = zeta(k).toVector();
			expect(v.x).toBeCloseTo(Math.cos((2 * Math.PI * k) / 24), 10);
			expect(v.y).toBeCloseTo(Math.sin((2 * Math.PI * k) / 24), 10);
		}
		// a rational combination
		const z = zeta(1).add(zeta(5)).scaleRational(1n, 3n);
		const v = z.toVector();
		const ex = Math.cos((2 * Math.PI) / 24) / 3 + Math.cos((2 * Math.PI * 5) / 24) / 3;
		const ey = Math.sin((2 * Math.PI) / 24) / 3 + Math.sin((2 * Math.PI * 5) / 24) / 3;
		expect(v.x).toBeCloseTo(ex, 10);
		expect(v.y).toBeCloseTo(ey, 10);
	});

	it("ring mismatch is a hard error", () => {
		const other = Cyclotomic.ONE(CyclotomicRing.create(12));
		expect(() => ONE.add(other)).toThrow();
	});
});
