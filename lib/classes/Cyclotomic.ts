/**
 * Exact coordinate representation in the cyclotomic field ℚ(ζ_N), ζ_N = e^{2πi/N}.
 *
 * Identify the plane with ℂ: a 2D point is ONE complex number z = x + iy, stored as a
 * coefficient vector of length φ(N) in the power basis {1, ζ, …, ζ^{φ(N)-1}}, with all
 * arithmetic reduced mod the cyclotomic polynomial Φ_N. This makes equality canonical, so
 * every *decision* in the pipeline (vertex coincidence, collision, orbit identity,
 * dedup, translational-cell detection) is an exact bigint/rational comparison instead of
 * a floating-point ε test. Floating point survives only at the render boundary
 * (`toVector()`).
 *
 * See docs/CYCLOTOMIC_SPEC.md. Scope of the current core: N = 24, φ = 24 → 8,
 * Φ₂₄ = x⁸ − x⁴ + 1 (reduction relation ζ⁸ = ζ⁴ − 1). N = 12 is also supported.
 *
 * NON-NEGOTIABLE invariants:
 *  - Canonical degree-φ(N) form only. The "redundant" length-N form is NOT used for
 *    equality (distinct length-N vectors can be the same number).
 *  - `bigint` coefficients (they grow under repeated rotation; Int32 overflows).
 *  - One reduced common denominator `den > 0`, gcd-reduced, so (num, den) is canonical.
 *  - NO field inversion: only `scaleRational(p, q)` (division by integers) is provided.
 *  - Mixing rings is a hard error.
 */

import { Vector } from "./Vector";

/** Cyclotomic polynomials Φ_N as integer coefficient arrays (index = power of x), monic. */
const PHI_POLY: Record<number, bigint[]> = {
	// Φ₁₂ = x⁴ − x² + 1
	12: [1n, 0n, -1n, 0n, 1n],
	// Φ₂₄ = x⁸ − x⁴ + 1
	24: [1n, 0n, 0n, 0n, -1n, 0n, 0n, 0n, 1n],
};

/** Euler totient values for supported N (degree of Φ_N). */
const PHI: Record<number, number> = { 12: 4, 24: 8 };

/**
 * The single shared ring for the current run. There is ONE arithmetic backend per run
 * (spec §5); construction sites that cannot thread a ring explicitly (e.g.
 * `VertexConfiguration.fromName`) read it here. Defaults to N=24 (the regular core) so
 * tests and the gate work without explicit setup; the pipeline sets it from `computeRing`.
 */
let activeRing: CyclotomicRing | null = null;

export function setActiveRing(ring: CyclotomicRing): void {
	activeRing = ring;
}

export function getActiveRing(): CyclotomicRing {
	if (!activeRing) activeRing = CyclotomicRing.create(24);
	return activeRing;
}

function bigAbs(a: bigint): bigint {
	return a < 0n ? -a : a;
}

/**
 * Snap a float angle (radians) that is KNOWN to be a multiple of 2π/N to its integer
 * ζ-exponent k ∈ [0, N). Safe only for on-grid directions/angles (edge directions, rotation
 * angles in these tilings) — NEVER for arbitrary coordinates. Throws if the angle is not
 * within `tol` of the grid, surfacing any off-grid assumption instead of silently rounding.
 */
export function zetaIndexFromAngle(angle: number, N: number, tol = 1e-6): number {
	const step = (2 * Math.PI) / N;
	const kReal = angle / step;
	const k = Math.round(kReal);
	if (Math.abs(kReal - k) > tol / step) {
		throw new Error(
			`zetaIndexFromAngle: angle ${angle} is not a multiple of 2π/${N} (off-grid by ${
				kReal - k
			} steps)`
		);
	}
	return ((k % N) + N) % N;
}

function bigGcd(a: bigint, b: bigint): bigint {
	a = bigAbs(a);
	b = bigAbs(b);
	while (b !== 0n) {
		[a, b] = [b, a % b];
	}
	return a;
}

/**
 * Shared, immutable ring data for ℚ(ζ_N). One instance per pipeline run (the N is chosen
 * once via computeOrder). Holds the reduction polynomial Φ_N and reduces raw coefficient
 * arrays of any degree down to the canonical length-φ form.
 */
export class CyclotomicRing {
	readonly N: number;
	readonly phi: number;
	/** Φ_N coefficients, length phi+1, monic (phiPoly[phi] === 1n). */
	private readonly phiPoly: bigint[];
	/** Precomputed cos/sin of 2πj/N for j=0..phi-1 — so `toVector` does mul-adds, no live trig. */
	readonly basisCos: number[];
	readonly basisSin: number[];
	/** Lazily-built map: canonical key of ζ^k → k. Turns the O(N) edge-direction search into O(1). */
	private _zetaKeyToExp?: Map<string, number>;

	private constructor(N: number, phi: number, phiPoly: bigint[]) {
		this.N = N;
		this.phi = phi;
		this.phiPoly = phiPoly;
		this.basisCos = new Array<number>(phi);
		this.basisSin = new Array<number>(phi);
		for (let j = 0; j < phi; j++) {
			const theta = (2 * Math.PI * j) / N;
			this.basisCos[j] = Math.cos(theta);
			this.basisSin[j] = Math.sin(theta);
		}
	}

	/** k such that ζ^k has the given canonical key, or undefined if the key is not a root of unity.
	 *  Used by `recomputeEdgeDirsExact` to identify unit edge directions in O(1). */
	expFromZetaKey(key: string): number | undefined {
		if (!this._zetaKeyToExp) {
			const m = new Map<string, number>();
			for (let k = 0; k < this.N; k++) m.set(Cyclotomic.zeta(this, k).key(), k);
			this._zetaKeyToExp = m;
		}
		return this._zetaKeyToExp.get(key);
	}

	/** Construct the ring for a supported N (12 or 24). Throws otherwise (Phase 5 extends). */
	static create(N: number): CyclotomicRing {
		const phiPoly = PHI_POLY[N];
		const phi = PHI[N];
		if (!phiPoly || phi === undefined) {
			throw new Error(
				`CyclotomicRing: N=${N} not supported yet (have ${Object.keys(PHI_POLY).join(", ")}).`
			);
		}
		return new CyclotomicRing(N, phi, phiPoly);
	}

	/**
	 * Reduce a raw coefficient array (Σ raw[i]·ζ^i, any length) to canonical length-φ form
	 * by polynomial long division by the monic Φ_N. Folds every power ζ^i with i ≥ φ back
	 * into degree < φ. For N=24 this is exactly the iterated relation ζ^i = ζ^{i-4} − ζ^{i-8}.
	 */
	reduce(raw: bigint[]): bigint[] {
		const r = raw.slice();
		for (let i = r.length - 1; i >= this.phi; i--) {
			const c = r[i];
			if (c === 0n) continue;
			// subtract c · x^{i-phi} · Φ_N  (Φ_N[phi] === 1 zeroes r[i])
			for (let j = 0; j <= this.phi; j++) {
				r[i - this.phi + j] -= c * this.phiPoly[j];
			}
		}
		const out = r.slice(0, this.phi);
		while (out.length < this.phi) out.push(0n);
		return out;
	}
}

/**
 * An element of ℚ(ζ_N) ⊂ ℂ — i.e. a 2D point. Immutable value type; every operation
 * returns a new instance in canonical form.
 */
export class Cyclotomic {
	readonly ring: CyclotomicRing;
	readonly num: bigint[]; // length phi, canonical (reduced mod Φ_N, gcd-reduced)
	readonly den: bigint; // common positive denominator
	private _key?: string; // memoized canonical key (immutable value ⇒ safe to cache)

	/**
	 * @param skipReduce  internal fast-path when `num` is already reduced mod Φ_N
	 *                    (still gcd/sign canonicalized).
	 */
	constructor(ring: CyclotomicRing, num: bigint[], den: bigint = 1n, skipReduce = false) {
		if (den === 0n) throw new Error("Cyclotomic: zero denominator");
		this.ring = ring;
		const reduced = skipReduce ? num.slice(0, ring.phi) : ring.reduce(num);
		while (reduced.length < ring.phi) reduced.push(0n);

		// gcd-reduce numerator + denominator, force den > 0
		let g = bigAbs(den);
		for (const c of reduced) g = bigGcd(g, c);
		if (g === 0n) g = 1n; // all-zero numerator
		let d = den / g;
		const n = reduced.map((c) => c / g);
		if (d < 0n) {
			d = -d;
			for (let i = 0; i < n.length; i++) n[i] = -n[i];
		}
		this.num = n;
		this.den = d;
	}

	private assertSameRing(o: Cyclotomic): void {
		if (this.ring !== o.ring) throw new Error("Cyclotomic: ring mismatch in binary op");
	}

	add(o: Cyclotomic): Cyclotomic {
		this.assertSameRing(o);
		const phi = this.ring.phi;
		const num = new Array<bigint>(phi);
		for (let i = 0; i < phi; i++) num[i] = this.num[i] * o.den + o.num[i] * this.den;
		return new Cyclotomic(this.ring, num, this.den * o.den, true);
	}

	sub(o: Cyclotomic): Cyclotomic {
		this.assertSameRing(o);
		const phi = this.ring.phi;
		const num = new Array<bigint>(phi);
		for (let i = 0; i < phi; i++) num[i] = this.num[i] * o.den - o.num[i] * this.den;
		return new Cyclotomic(this.ring, num, this.den * o.den, true);
	}

	neg(): Cyclotomic {
		return new Cyclotomic(this.ring, this.num.map((c) => -c), this.den, true);
	}

	/** Full multiply: convolve coefficients (degree ≤ 2φ−2), then reduce mod Φ_N. */
	mul(o: Cyclotomic): Cyclotomic {
		this.assertSameRing(o);
		const phi = this.ring.phi;
		const raw = new Array<bigint>(2 * phi - 1).fill(0n);
		for (let i = 0; i < phi; i++) {
			if (this.num[i] === 0n) continue;
			for (let j = 0; j < phi; j++) {
				if (o.num[j] === 0n) continue;
				raw[i + j] += this.num[i] * o.num[j];
			}
		}
		return new Cyclotomic(this.ring, raw, this.den * o.den);
	}

	/** Multiply by ζ^k (rotation by 2πk/N): shift coefficients up by k, then reduce. */
	mulZeta(k: number): Cyclotomic {
		const N = this.ring.N;
		const phi = this.ring.phi;
		k = ((k % N) + N) % N;
		if (k === 0) return this;
		const raw = new Array<bigint>(phi + k).fill(0n);
		for (let j = 0; j < phi; j++) raw[j + k] = this.num[j];
		return new Cyclotomic(this.ring, raw, this.den);
	}

	/** Complex conjugate: ζ ↦ ζ^{N-1} (= ζ^{-1}). Used for reflections. */
	conj(): Cyclotomic {
		const N = this.ring.N;
		const phi = this.ring.phi;
		const raw = new Array<bigint>(N).fill(0n);
		for (let j = 0; j < phi; j++) {
			// a_j·ζ^j ↦ a_j·ζ^{(N-j) mod N}
			raw[(N - j) % N] += this.num[j];
		}
		return new Cyclotomic(this.ring, raw, this.den);
	}

	/** Multiply by the rational p/q (centroids, midpoints). No field inversion involved. */
	scaleRational(p: bigint, q: bigint): Cyclotomic {
		if (q === 0n) throw new Error("Cyclotomic.scaleRational: zero denominator");
		return new Cyclotomic(this.ring, this.num.map((c) => c * p), this.den * q, true);
	}

	equals(o: Cyclotomic): boolean {
		this.assertSameRing(o);
		if (this.den !== o.den) return false;
		for (let i = 0; i < this.num.length; i++) if (this.num[i] !== o.num[i]) return false;
		return true;
	}

	isZero(): boolean {
		return this.num.every((c) => c === 0n);
	}

	/** Canonical string key for Map/Set dedup & orbit IDs. Memoized (value is immutable). */
	key(): string {
		if (this._key === undefined) this._key = `${this.den}|${this.num.join(",")}`;
		return this._key;
	}

	/** z·conj(z): a real, exact, non-negative element — a squared magnitude. */
	normSquared(): Cyclotomic {
		return this.mul(this.conj());
	}

	/**
	 * Numeric evaluation Σ (a_j/den)·(cos, sin)(2πj/N) → float Vector. RENDER ONLY — never
	 * use in a decision.
	 */
	toVector(): Vector {
		const den = Number(this.den);
		const cos = this.ring.basisCos;
		const sin = this.ring.basisSin;
		let x = 0;
		let y = 0;
		for (let j = 0; j < this.num.length; j++) {
			const a = Number(this.num[j]) / den;
			x += a * cos[j];
			y += a * sin[j];
		}
		return new Vector(x, y);
	}

	/** Serialize to a JSON-safe form (bigints as decimal strings). */
	encode(): { n: string[]; d: string } {
		return { n: this.num.map((c) => c.toString()), d: this.den.toString() };
	}

	static decode(ring: CyclotomicRing, enc: { n: string[]; d: string }): Cyclotomic {
		return new Cyclotomic(ring, enc.n.map((s) => BigInt(s)), BigInt(enc.d), true);
	}

	static ZERO(ring: CyclotomicRing): Cyclotomic {
		return new Cyclotomic(ring, new Array<bigint>(ring.phi).fill(0n), 1n, true);
	}

	static ONE(ring: CyclotomicRing): Cyclotomic {
		const num = new Array<bigint>(ring.phi).fill(0n);
		num[0] = 1n;
		return new Cyclotomic(ring, num, 1n, true);
	}

	/** ζ^k as a field element (the unit direction at angle 2πk/N). */
	static zeta(ring: CyclotomicRing, k: number): Cyclotomic {
		return Cyclotomic.ONE(ring).mulZeta(k);
	}

	/** The rational p/q embedded in the field. */
	static fromRational(ring: CyclotomicRing, p: bigint, q: bigint = 1n): Cyclotomic {
		const num = new Array<bigint>(ring.phi).fill(0n);
		num[0] = p;
		return new Cyclotomic(ring, num, q, true);
	}
}
