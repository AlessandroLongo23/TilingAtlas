/**
 * Exact arithmetic in the real subfield ℚ(√2, √3) = ℚ(ζ₂₄)⁺.
 *
 * A `Surd` is `(P + Q√2 + R√3 + S√6) / D` with integer P,Q,R,S and D > 0, kept gcd-reduced so
 * the representation is canonical (1, √2, √3, √6 are ℚ-linearly independent, so equality is
 * componentwise). This is where the *areas* of unit-edge regular tiles and the signed lattice
 * determinant `det(u,v) = Im(conj(u)·v)` live exactly — the algebra behind the area ladder and the
 * gap-free certificate. Pairs with `Cyclotomic` (the full ring ℤ[ζ₂₄], which is where points live);
 * `det` is the bridge from a pair of ℤ[ζ₂₄] vectors to their exact real signed area.
 *
 * NB: `det` assumes the N = 24 ring (the regular core {3,4,6,8,12}); the 15°-sine table is
 * N=24-specific.
 */
import { Cyclotomic } from "../../Cyclotomic";

function babs(a: bigint): bigint {
	return a < 0n ? -a : a;
}
function bgcd(a: bigint, b: bigint): bigint {
	a = babs(a);
	b = babs(b);
	while (b !== 0n) [a, b] = [b, a % b];
	return a;
}
/** Floor of the integer square root (n ≥ 0). */
function isqrt(n: bigint): bigint {
	if (n < 0n) throw new Error("isqrt: negative");
	if (n < 2n) return n;
	let x = n;
	let y = (x + 1n) >> 1n;
	while (y < x) {
		x = y;
		y = (x + n / x) >> 1n;
	}
	return x;
}

export class Surd {
	/** value = (P + Q√2 + R√3 + S√6) / D, with D > 0 and gcd(P,Q,R,S,D) = 1. */
	readonly P: bigint;
	readonly Q: bigint;
	readonly R: bigint;
	readonly S: bigint;
	readonly D: bigint;

	constructor(P: bigint, Q: bigint, R: bigint, S: bigint, D: bigint = 1n) {
		if (D === 0n) throw new Error("Surd: zero denominator");
		if (D < 0n) {
			P = -P;
			Q = -Q;
			R = -R;
			S = -S;
			D = -D;
		}
		let g = D;
		g = bgcd(g, P);
		g = bgcd(g, Q);
		g = bgcd(g, R);
		g = bgcd(g, S);
		if (g === 0n) g = 1n;
		this.P = P / g;
		this.Q = Q / g;
		this.R = R / g;
		this.S = S / g;
		this.D = D / g;
	}

	static readonly ZERO = new Surd(0n, 0n, 0n, 0n, 1n);
	static readonly ONE = new Surd(1n, 0n, 0n, 0n, 1n);
	static rational(p: bigint, q: bigint = 1n): Surd {
		return new Surd(p, 0n, 0n, 0n, q);
	}

	add(o: Surd): Surd {
		return new Surd(
			this.P * o.D + o.P * this.D,
			this.Q * o.D + o.Q * this.D,
			this.R * o.D + o.R * this.D,
			this.S * o.D + o.S * this.D,
			this.D * o.D
		);
	}
	sub(o: Surd): Surd {
		return this.add(o.neg());
	}
	neg(): Surd {
		return new Surd(-this.P, -this.Q, -this.R, -this.S, this.D);
	}

	/** Multiply using √2·√2=2, √3·√3=3, √6·√6=6, √2·√3=√6, √2·√6=2√3, √3·√6=3√2. */
	mul(o: Surd): Surd {
		const P = this.P * o.P + 2n * this.Q * o.Q + 3n * this.R * o.R + 6n * this.S * o.S;
		const Q = this.P * o.Q + this.Q * o.P + 3n * this.R * o.S + 3n * this.S * o.R;
		const R = this.P * o.R + this.R * o.P + 2n * this.Q * o.S + 2n * this.S * o.Q;
		const S = this.P * o.S + this.S * o.P + this.Q * o.R + this.R * o.Q;
		return new Surd(P, Q, R, S, this.D * o.D);
	}
	scaleRational(p: bigint, q: bigint = 1n): Surd {
		return new Surd(this.P * p, this.Q * p, this.R * p, this.S * p, this.D * q);
	}

	/** Multiplicative inverse via conjugate rationalisation (ℚ(√2,√3) is a field). */
	inverse(): Surd {
		if (this.isZero()) throw new Error("Surd: inverse of zero");
		const y2 = new Surd(this.P, -this.Q, this.R, -this.S, this.D); // √2 → −√2
		const y3 = new Surd(this.P, this.Q, -this.R, -this.S, this.D); // √3 → −√3
		const y23 = new Surd(this.P, -this.Q, -this.R, this.S, this.D); // both
		const m = y2.mul(y3).mul(y23);
		const norm = this.mul(m); // = ∏ conjugates: rational
		if (norm.Q !== 0n || norm.R !== 0n || norm.S !== 0n)
			throw new Error("Surd.inverse: norm not rational (bug)");
		return m.scaleRational(norm.D, norm.P);
	}
	div(o: Surd): Surd {
		return this.mul(o.inverse());
	}

	equals(o: Surd): boolean {
		return (
			this.P === o.P && this.Q === o.Q && this.R === o.R && this.S === o.S && this.D === o.D
		);
	}
	isZero(): boolean {
		return this.P === 0n && this.Q === 0n && this.R === 0n && this.S === 0n;
	}
	isRational(): boolean {
		return this.Q === 0n && this.R === 0n && this.S === 0n;
	}
	abs(): Surd {
		return this.sign() < 0 ? this.neg() : this;
	}

	/** −1 | 0 | +1. Float-first; exact rational-interval refinement on ambiguity. */
	sign(): number {
		if (this.isZero()) return 0;
		const f = this.toFloat();
		if (Number.isFinite(f) && Math.abs(f) > 1e-6) return f > 0 ? 1 : -1;
		return this.signExact();
	}
	/** -1/0/1 comparison with `o` (exact). */
	cmp(o: Surd): number {
		return this.sub(o).sign();
	}

	/** Exact sign via rational enclosures of √2,√3,√6 at doubling precision. */
	private signExact(): number {
		// value sign = sign of P + Q√2 + R√3 + S√6 (D > 0).
		let T = 1n << 32n;
		for (let iter = 0; iter < 256; iter++) {
			const T2 = T * T;
			const lo2 = isqrt(2n * T2),
				hi2 = lo2 + 1n; // lo2/T ≤ √2 ≤ hi2/T
			const lo3 = isqrt(3n * T2),
				hi3 = lo3 + 1n;
			const lo6 = isqrt(6n * T2),
				hi6 = lo6 + 1n;
			const lo = (c: bigint, lo_: bigint, hi_: bigint) => (c >= 0n ? c * lo_ : c * hi_);
			const hi = (c: bigint, lo_: bigint, hi_: bigint) => (c >= 0n ? c * hi_ : c * lo_);
			// value·T ∈ [Lnum, Hnum]
			const Lnum = this.P * T + lo(this.Q, lo2, hi2) + lo(this.R, lo3, hi3) + lo(this.S, lo6, hi6);
			const Hnum = this.P * T + hi(this.Q, lo2, hi2) + hi(this.R, lo3, hi3) + hi(this.S, lo6, hi6);
			if (Lnum > 0n) return 1;
			if (Hnum < 0n) return -1;
			T <<= 8n;
		}
		throw new Error("Surd.signExact: failed to separate from zero (bug?)");
	}

	/** Float value — debug / broadphase only, never a decision. */
	toFloat(): number {
		return (
			(Number(this.P) +
				Number(this.Q) * Math.SQRT2 +
				Number(this.R) * Math.sqrt(3) +
				Number(this.S) * Math.sqrt(6)) /
			Number(this.D)
		);
	}

	toString(): string {
		return `(${this.P}+${this.Q}√2+${this.R}√3+${this.S}√6)/${this.D}`;
	}
}

/**
 * Exact area of the unit-edge regular n-gon, in ℚ(√2,√3):
 * △=√3/4, □=1, ⬡=3√3/2, 8-gon=2+2√2, 12-gon=6+3√3.
 */
export function tileAreaSurd(n: number): Surd {
	switch (n) {
		case 3:
			return new Surd(0n, 0n, 1n, 0n, 4n);
		case 4:
			return new Surd(1n, 0n, 0n, 0n, 1n);
		case 6:
			return new Surd(0n, 0n, 3n, 0n, 2n);
		case 8:
			return new Surd(2n, 2n, 0n, 0n, 1n);
		case 12:
			return new Surd(6n, 0n, 3n, 0n, 1n);
		default:
			throw new Error(`tileAreaSurd: unsupported n=${n}`);
	}
}

/**
 * Imaginary part Im(c) of c ∈ ℤ[ζ₂₄] as an exact `Surd`. Read off the canonical coefficients
 * b₀..b₇ via the 15°-sine table: sin(15j°) for j=1..7 = (√6−√2)/4, 1/2, √2/2, √3/2, (√6+√2)/4, 1,
 * (√6+√2)/4 (b₀ contributes 0).
 */
export function imSurd(c: Cyclotomic): Surd {
	if (c.ring.N !== 24) throw new Error("imSurd: requires the N=24 ring");
	const b = c.num;
	return new Surd(
		2n * b[2] + 4n * b[6], // rational
		-b[1] + 2n * b[3] + b[5] + b[7], // √2
		2n * b[4], // √3
		b[1] + b[5] + b[7], // √6
		4n * c.den
	);
}

/**
 * Real part Re(c) of c ∈ ℤ[ζ₂₄] as an exact `Surd`, via the 15°-cosine table:
 * cos(15j°) for j=0..7 = 1, (√6+√2)/4, √3/2, √2/2, 1/2, (√6−√2)/4, 0, (√2−√6)/4.
 */
export function reSurd(c: Cyclotomic): Surd {
	if (c.ring.N !== 24) throw new Error("reSurd: requires the N=24 ring");
	const b = c.num;
	return new Surd(
		4n * b[0] + 2n * b[4], // rational
		b[1] + 2n * b[3] - b[5] + b[7], // √2
		2n * b[2], // √3
		b[1] + b[5] - b[7], // √6
		4n * c.den
	);
}

/** Per-ring cache of the cyclotomic embeddings of √2, √3, √6 (recomputing them is the hot cost). */
const RADICAL_CACHE = new WeakMap<object, { sqrt2: Cyclotomic; sqrt3: Cyclotomic; sqrt6: Cyclotomic }>();
function radicals(ring: Cyclotomic["ring"]): { sqrt2: Cyclotomic; sqrt3: Cyclotomic; sqrt6: Cyclotomic } {
	let r = RADICAL_CACHE.get(ring as object);
	if (!r) {
		const sqrt2 = Cyclotomic.zeta(ring, 3).add(Cyclotomic.zeta(ring, 21));
		const sqrt3 = Cyclotomic.zeta(ring, 2).add(Cyclotomic.zeta(ring, 22));
		r = { sqrt2, sqrt3, sqrt6: sqrt2.mul(sqrt3) };
		RADICAL_CACHE.set(ring as object, r);
	}
	return r;
}

/**
 * Embed a real value `s ∈ ℚ(√2,√3)` back into ℚ(ζ₂₄) as a Cyclotomic (a point on the real axis),
 * using √2 = ζ³+ζ⁻³, √3 = ζ²+ζ⁻², √6 = √2·√3. Inverse of `reSurd` for real elements.
 */
export function surdToCyclotomic(s: Surd, ring: Cyclotomic["ring"]): Cyclotomic {
	if (ring.N !== 24) throw new Error("surdToCyclotomic: requires the N=24 ring");
	const { sqrt2, sqrt3, sqrt6 } = radicals(ring);
	let acc = Cyclotomic.fromRational(ring, s.P, 1n);
	if (s.Q !== 0n) acc = acc.add(sqrt2.scaleRational(s.Q, 1n));
	if (s.R !== 0n) acc = acc.add(sqrt3.scaleRational(s.R, 1n));
	if (s.S !== 0n) acc = acc.add(sqrt6.scaleRational(s.S, 1n));
	return acc.scaleRational(1n, s.D);
}

/**
 * Exact signed lattice determinant det(u,v) = u×v = Im(conj(u)·v) for u,v ∈ ℤ[ζ₂₄], as a `Surd`.
 */
export function detSurd(u: Cyclotomic, v: Cyclotomic): Surd {
	return imSurd(u.conj().mul(v));
}
