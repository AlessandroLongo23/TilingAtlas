/**
 * Fuzz regression for the `Surd.sign()` semi-static error-bound filter (review CB-2).
 *
 * `sign()` is on the DECISIVE path (cmp, area comparisons, holohedry, overlap predicates), so it
 * must agree with the exact rational-interval refinement `signExact()` on EVERY input — including
 * adversarial near-cancellations at coefficient heights ≥ 2⁸⁰ where the float expression is pure
 * rounding noise. This test pins that contract:
 *
 *   1. ≥10⁵ random Surds across coefficient heights (up to 2⁹⁶, random D > 0): sign() === oracle.
 *   2. Pell-equation residuals (the best rational approximations of √2/√3/√6 — true value
 *      ~(√2−1)ⁿ etc., coefficients ~2⁸⁰): the float value is dominated by conversion noise
 *      (~2⁻⁵³·M ≫ |value|), which the old absolute 1e-6 gate accepted blindly.
 *   3. Exact-zero and exact-tiny constructions: x.sub(x), x.sub(x.add(tiny)).
 *   4. Non-finite float path (coefficients ~2²⁰⁰⁰ ⇒ Number() = Infinity).
 *   5. Filter-soundness: every case the semi-static filter ACCEPTS matches signExact (the filter
 *      may only re-route ambiguity to the exact path, never decide wrongly).
 */
import { describe, it, expect } from "vitest";
import { Surd } from "@/classes/algorithm/exact/Surd";

/** Ground-truth sign: the exact rational-interval refinement (private — reached for the oracle). */
function oracleSign(s: Surd): number {
	if (s.isZero()) return 0;
	return (s as unknown as { signExact(): number }).signExact();
}

/* ------------------------------------------------------------------------------------------------
 * Replica of the production filter (same expression, same constant). Used ONLY for assertion 5:
 * "every case the filter accepts matches signExact". Keep in sync with Surd.sign().
 * ---------------------------------------------------------------------------------------------- */
const SQRT3 = 1.7320508075688772; // correctly-rounded double of √3 (=== Math.sqrt(3))
const SQRT6 = 2.449489742783178; // correctly-rounded double of √6 (=== Math.sqrt(6))
const C_SIGN = 32;
/** +1/−1 if the semi-static filter accepts the float sign, null if it defers to signExact. */
function filterFloatSign(s: Surd): number | null {
	const p = Number(s.P);
	const q = Number(s.Q) * Math.SQRT2;
	const r = Number(s.R) * SQRT3;
	const t = Number(s.S) * SQRT6;
	const d = Number(s.D);
	const f = (p + q + r + t) / d;
	const M = (Math.abs(p) + Math.abs(q) + Math.abs(r) + Math.abs(t)) / d;
	if (Number.isFinite(f) && Math.abs(f) > C_SIGN * Number.EPSILON * M) return f > 0 ? 1 : -1;
	return null;
}

/** Deterministic PRNG (mulberry32) — the fuzz must be reproducible. */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Uniform-ish bigint in [0, 2^bits), built from 24-bit chunks. */
function randMagnitude(rng: () => number, bits: number): bigint {
	let v = 0n;
	for (let b = 0; b < bits; b += 24) v = (v << 24n) | BigInt(Math.floor(rng() * 0x1000000));
	return v & ((1n << BigInt(bits)) - 1n);
}
/** Signed bigint with |value| < 2^bits. */
function randSigned(rng: () => number, bits: number): bigint {
	const m = randMagnitude(rng, bits);
	return rng() < 0.5 ? -m : m;
}

/** Pell-style units: (a+b√k)·(x+y√k) with the fundamental unit, conjugate residual a−b√k tiny. */
function pellResiduals(
	fund: [bigint, bigint],
	k: bigint,
	maxN: number
): { a: bigint; b: bigint; n: number }[] {
	const out: { a: bigint; b: bigint; n: number }[] = [];
	let [a, b] = fund;
	for (let n = 1; n <= maxN; n++) {
		out.push({ a, b, n });
		[a, b] = [a * fund[0] + k * b * fund[1], a * fund[1] + b * fund[0]];
	}
	return out;
}

/** Assert sign() === oracle AND filter-acceptance soundness for one Surd. Returns 1 if accepted. */
function checkOne(s: Surd, label: string): number {
	const expected = oracleSign(s);
	const got = s.sign();
	if (got !== expected) {
		throw new Error(
			`sign mismatch [${label}]: sign()=${got} signExact=${expected} for ${s.toString()}`
		);
	}
	const accepted = filterFloatSign(s);
	if (accepted !== null && accepted !== expected) {
		throw new Error(
			`UNSOUND FILTER [${label}]: filter accepted ${accepted}, exact ${expected} for ${s.toString()}`
		);
	}
	return accepted !== null ? 1 : 0;
}

describe("Surd.sign fuzz: float-filtered sign must equal signExact everywhere", () => {
	it("the correctly-rounded literals match the hardware sqrt (filter precondition)", () => {
		expect(SQRT3).toBe(Math.sqrt(3));
		expect(SQRT6).toBe(Math.sqrt(6));
	});

	it("random Surds across coefficient heights (120000 cases, |coeffs| up to 2^96, random D > 0)", () => {
		const rng = mulberry32(0xc0ffee);
		const HEIGHTS = [8, 16, 32, 53, 64, 80, 96];
		const N = 120_000;
		let accepted = 0;
		for (let i = 0; i < N; i++) {
			const hb = HEIGHTS[i % HEIGHTS.length];
			const hd = HEIGHTS[Math.floor(rng() * HEIGHTS.length)];
			const s = new Surd(
				randSigned(rng, hb),
				randSigned(rng, hb),
				randSigned(rng, hb),
				randSigned(rng, hb),
				randMagnitude(rng, hd) + 1n // D > 0
			);
			accepted += checkOne(s, `random#${i} h=${hb}`);
		}
		// Sanity: the filter must accept the overwhelming majority of well-conditioned cases
		// (it exists to make the common case fast). Random Surds essentially never cancel.
		expect(accepted / N).toBeGreaterThan(0.99);
	});

	it("adversarial: Pell residuals a−b√k (true value ~unit⁻ⁿ, coefficients up to ~2^100)", () => {
		// (1+√2)ⁿ = aₙ+bₙ√2 ⇒ aₙ−bₙ√2 = (1−√2)ⁿ: sign (−1)ⁿ, |·| = (√2−1)ⁿ.
		for (const { a, b, n } of pellResiduals([1n, 1n], 2n, 110)) {
			const s = new Surd(a, -b, 0n, 0n, 1n);
			checkOne(s, `pell√2 n=${n}`);
			expect(s.sign()).toBe(n % 2 === 0 ? 1 : -1); // closed form, independent of the oracle
		}
		// (2+√3)ⁿ = aₙ+bₙ√3 ⇒ aₙ−bₙ√3 = (2−√3)ⁿ > 0.
		for (const { a, b, n } of pellResiduals([2n, 1n], 3n, 80)) {
			const s = new Surd(a, 0n, -b, 0n, 1n);
			checkOne(s, `pell√3 n=${n}`);
			expect(s.sign()).toBe(1);
		}
		// (5+2√6)ⁿ = aₙ+bₙ√6 ⇒ aₙ−bₙ√6 = (5−2√6)ⁿ > 0.
		for (const { a, b, n } of pellResiduals([5n, 2n], 6n, 50)) {
			const s = new Surd(a, 0n, 0n, -b, 1n);
			checkOne(s, `pell√6 n=${n}`);
			expect(s.sign()).toBe(1);
		}
	});

	it("adversarial: mixed near-zero combinations of √2/√3/√6 (products & sums of residuals)", () => {
		const rng = mulberry32(0xbadcafe);
		const r2 = pellResiduals([1n, 1n], 2n, 60);
		const r3 = pellResiduals([2n, 1n], 3n, 45);
		const r6 = pellResiduals([5n, 2n], 6n, 30);
		const surd2 = ({ a, b }: { a: bigint; b: bigint }) => new Surd(a, -b, 0n, 0n, 1n);
		const surd3 = ({ a, b }: { a: bigint; b: bigint }) => new Surd(a, 0n, -b, 0n, 1n);
		const surd6 = ({ a, b }: { a: bigint; b: bigint }) => new Surd(a, 0n, 0n, -b, 1n);
		for (let i = 0; i < 400; i++) {
			const x2 = surd2(r2[Math.floor(rng() * r2.length)]);
			const x3 = surd3(r3[Math.floor(rng() * r3.length)]);
			const x6 = surd6(r6[Math.floor(rng() * r6.length)]);
			// products populate all four components while staying near zero
			checkOne(x2.mul(x3), `prod23#${i}`);
			checkOne(x2.mul(x6), `prod26#${i}`);
			checkOne(x3.mul(x6).sub(x2), `mix#${i}`);
			// random rational scaling (incl. denominators) — exercises gcd reduction + D
			const num = randSigned(rng, 40);
			const den = randMagnitude(rng, 20) + 1n;
			if (num !== 0n) checkOne(x2.scaleRational(num, den), `scaled#${i}`);
		}
	});

	it("exact zero and exact tiny: x.sub(x) and x.sub(x.add(tiny))", () => {
		const rng = mulberry32(0xdeadbeef);
		const tiny = Surd.rational(1n, 10n ** 30n);
		for (let i = 0; i < 500; i++) {
			const x = new Surd(
				randSigned(rng, 80),
				randSigned(rng, 80),
				randSigned(rng, 80),
				randSigned(rng, 80),
				randMagnitude(rng, 40) + 1n
			);
			expect(x.sub(x).sign()).toBe(0); // exact cancellation ⇒ isZero path
			const d = x.sub(x.add(tiny)); // exactly −tiny: well-conditioned but |value| ≪ 1e-6
			checkOne(d, `subtiny#${i}`);
			expect(d.sign()).toBe(-1);
		}
	});

	it("non-finite float path: coefficients beyond 2^1024 still decide exactly", () => {
		const rng = mulberry32(0x5eed);
		const HUGE = 1n << 2000n;
		for (let i = 0; i < 50; i++) {
			const s = new Surd(
				randSigned(rng, 80) * HUGE,
				randSigned(rng, 80) * HUGE,
				randSigned(rng, 80) * HUGE,
				randSigned(rng, 80) * HUGE,
				randMagnitude(rng, 40) + 1n
			);
			if (s.isZero()) continue;
			checkOne(s, `huge#${i}`);
		}
		// near-cancellation at non-finite height: Pell residual scaled by 2^2000
		const { a, b } = pellResiduals([1n, 1n], 2n, 90)[89];
		const s = new Surd(a * HUGE, -b * HUGE, 0n, 0n, 3n);
		checkOne(s, "huge-pell");
		expect(s.sign()).toBe(1); // n=90 even ⇒ (1−√2)⁹⁰ > 0
	});
});
