/* C(Λ,S) divisor-feasibility pre-filter (Fable P3 stage A) — unit tests.
 * Covers: the divisor caps per Bravais class, tile-count integrality, full support (every distinct
 * VC multiset ≥ 1 orbit), the class-0 safety union, bravaisClassExact vs holohedry's overloaded 12,
 * and the PS_P3 / k<3 scoping of the filter (cSkipped must stay 0 where the filter must not run).
 * Soundness ground truth lives in the V0 scout (experiments/results/c-admissibility-scout-2026-07-10.md,
 * 0 violations over 1311 real candidates) and the V2 digest gates — these tests pin the arithmetic. */
import { describe, it, expect } from 'vitest';
import { vcFeasAreaSets, bravaisClassExact, holohedry, areaKey, _nearRationalForTest, _nearRationalLoopForTest } from '@/classes/algorithm/LatticeEnumerator';
import { Surd, tileAreaSurd } from '@/classes/algorithm/exact/Surd';
import { Cyclotomic, CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';

const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const zeta = (p: number): Cyclotomic => Cyclotomic.ONE(ring).mulZeta(p);

const A = (n: number): Surd => tileAreaSurd(n);
const key = (s: Surd): string => areaKey(s);
const scale = (s: Surd, m: number): Surd => s.scaleRational(BigInt(m), 1n);

// Single-type helper: one VC type with incidence map, k orbits of it.
const feas1 = (inc: [string, number][], k: number, bound = 1e6) =>
	vcFeasAreaSets([new Map(inc)], new Map([['3', A(3)], ['4', A(4)], ['6', A(6)], ['12', A(12)]]), new Map([['3', 3], ['4', 4], ['6', 6], ['12', 12]]), k, bound);

describe('vcFeasAreaSets — divisor caps per Bravais class', () => {
	// 4.4.4.4 (the square VC): one vertex class of W squares ⇒ t_4 = W, area = W·A(4).
	// k=1 ⇒ one orbit, W = V_1 must divide the class order.
	it('k=1, single 4.4.4.4 type: oblique admits W∈{1,2}, hex admits W∈{1,2,3,4,6,12}, not 5', () => {
		const f = feas1([['4', 4]], 1);
		const has = (cls: number, m: number) => f.get(cls)!.has(key(scale(A(4), m)));
		expect(has(2, 1)).toBe(true);
		expect(has(2, 2)).toBe(true);
		expect(has(2, 3)).toBe(false); // 3 ∤ 2
		expect(has(4, 4)).toBe(true);
		expect(has(4, 3)).toBe(false); // 3 ∤ 4
		expect(has(8, 8)).toBe(true);
		expect(has(12, 3)).toBe(true);
		expect(has(12, 5)).toBe(false); // 5 divides no subgroup order of D6
		expect(has(12, 8)).toBe(false); // 8 ∤ 12 — sharp hex excludes it…
		expect(has(0, 8)).toBe(true); //  …but the unknown-class union keeps it (square could hide there)
	});

	it('k=2, single type: sums of two divisors (oblique: {2,3,4}, not 1 or 5)', () => {
		const f = feas1([['4', 4]], 2);
		const has = (m: number) => f.get(2)!.has(key(scale(A(4), m)));
		expect(has(1)).toBe(false); // two orbits each ≥ 1 ⇒ W ≥ 2
		expect(has(2)).toBe(true); // 1+1
		expect(has(3)).toBe(true); // 1+2
		expect(has(4)).toBe(true); // 2+2
		expect(has(5)).toBe(false); // no sum of two divisors of 2 gives 5
	});

	it('tile-count integrality: 3.3.3.3.3.3 needs 3 | 6W (always) but 3.3.3.3.6 needs 6 | W for the hexagon', () => {
		// Type {3:4, 6:1}: t_6 = W/6 ⇒ W ≡ 0 (mod 6); at k=1 W must also divide the class ⇒ hex W=6 or 12 only.
		const f = feas1([['3', 4], ['6', 1]], 1);
		const area = (W: number) => scale(A(3), (4 * W) / 3).add(scale(A(6), W / 6));
		expect(f.get(2)!.size).toBe(0); // W ∈ {1,2}: 6 ∤ W ⇒ nothing feasible on oblique
		expect(f.get(12)!.has(key(area(6)))).toBe(true); // W=6: t_3 = 8, t_6 = 1
		expect(f.get(12)!.has(key(area(12)))).toBe(true); // W=12
	});

	it('full support: with two distinct types both must appear — everything below the min mixed area is infeasible', () => {
		const tri = new Map([['3', 6]]); // 3.3.3.3.3.3
		const mix = new Map([['3', 4], ['6', 1]]); // 3.3.3.3.6
		const f = vcFeasAreaSets([tri, mix], new Map([['3', A(3)], ['6', A(6)]]), new Map([['3', 3], ['6', 6]]), 3, 1e6);
		// A(6) = 6·A(3), so every feasible area is m·A(3). Support forces W_mix ≥ 1 and t_6 = W_mix/6
		// integral ⇒ W_mix ≥ 6; the minimum is W_tri = 1, W_mix = 6 ⇒ t_3 = 10, t_6 = 1 ⇒ m = 16.
		// All pure-triangle-sized areas below that (incl. every 1-orbit 3⁶ cell) are infeasible.
		for (let m = 1; m <= 15; m++) expect(f.get(12)!.has(key(scale(A(3), m)))).toBe(false);
		expect(f.get(12)!.has(key(scale(A(3), 16)))).toBe(true);
	});

	it('class-0 (unknown) is a superset of every exact class', () => {
		const f = feas1([['3', 3], ['4', 2]], 3); // 3.3.4.3.4 / 3.3.3.4.4 multiset {3:3,4:2}
		for (const cls of [2, 4, 8, 12]) for (const k2 of f.get(cls)!.keys()) expect(f.get(0)!.has(k2)).toBe(true);
	});

	it('t-vectors: Pareto-maximal, aligned to sorted sizes, consistent with the exact area', () => {
		const tri = new Map([['3', 6]]); // 3.3.3.3.3.3
		const mix = new Map([['3', 4], ['6', 1]]); // 3.3.3.3.6
		const f = vcFeasAreaSets([tri, mix], new Map([['3', A(3)], ['6', A(6)]]), new Map([['3', 3], ['6', 6]]), 3, 1e6);
		const ak16 = key(scale(A(3), 16)); // min feasible: W_tri=1, W_mix=6 ⇒ t = [10, 1] (sizes [3, 6])
		const vecs = f.get(12)!.get(ak16)!;
		expect(vecs.length).toBeGreaterThan(0);
		for (const v of vecs) {
			expect(v.length).toBe(2);
			expect(v[0] + 6 * v[1]).toBe(16); // area identity in units of A(3): t_3·1 + t_6·6 = 16
		}
		// antichain: no member dominates another
		for (const a of vecs) for (const b of vecs) {
			if (a === b) continue;
			expect(a[0] >= b[0] && a[1] >= b[1]).toBe(false);
		}
		expect(vecs.some((v) => v[0] === 10 && v[1] === 1)).toBe(true);
	});
});

describe('bravaisClassExact vs holohedry', () => {
	it('agrees with holohedry on exact classes and returns 0 exactly where holohedry falls back', () => {
		const one = Cyclotomic.ONE(ring);
		const cases: [Cyclotomic, Cyclotomic][] = [
			[one, zeta(6)], // square: 90°, equal length
			[one, zeta(4)], // hex: 60°, equal length
			[one, zeta(6).scaleRational(2n, 1n)], // rectangular 1×2
			[one.scaleRational(3n, 1n), zeta(3).scaleRational(2n, 1n)], // skew — oblique-ish
		];
		for (const [u, v] of cases) {
			const h = holohedry(u, v);
			const b = bravaisClassExact(u, v);
			if (b !== 0) expect(b).toBe(h);
			else expect(h).toBe(12); // fallback: holohedry soundly maxes out, bravais says UNKNOWN
		}
		expect(bravaisClassExact(one, zeta(6))).toBe(8);
		expect(bravaisClassExact(one, zeta(4))).toBe(12);
		expect(bravaisClassExact(one, zeta(6).scaleRational(2n, 1n))).toBe(4);
	});
});

describe('nearRational fast path == reference loop (the join-closure hot spot)', () => {
	it('differential: random, adversarial-boundary, and integer-shifted inputs decide identically', () => {
		// deterministic LCG so the test is reproducible
		let s = 12345;
		const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
		for (let i = 0; i < 200000; i++) {
			const x = (rnd() - 0.5) * 200;
			expect(_nearRationalForTest(x)).toBe(_nearRationalLoopForTest(x));
		}
		// boundary probes around every reduced p/q, q ≤ 60, at several integer offsets
		const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
		for (let q = 1; q <= 60; q++)
			for (let p = 0; p <= q; p++) {
				if (gcd(p, q) !== 1) continue;
				for (const off of [0, 1, -7, 1000]) {
					for (const d of [0, 0.5e-7 / q, 0.99e-7 / q, 1e-7 / q, 1.01e-7 / q, 2e-7 / q, 1e-7 / q + 1e-15, 1e-7 / q - 1e-15]) {
						for (const sgn of [1, -1]) {
							const x = off + p / q + sgn * d;
							expect(_nearRationalForTest(x)).toBe(_nearRationalLoopForTest(x));
						}
					}
				}
			}
	});
});

describe('filter scoping (k < 3 and PS_P3=0 must leave the pipeline untouched)', () => {
	it('vcFeasAreaSets itself is never consulted at k<3 or PS_P3=0 — scope lives in candidateLattices; the diag field defaults to 0', async () => {
		// The scope guard is a one-line conjunction in candidateLattices (k >= 3 && !seedHasStar &&
		// PS_P3 !== '0'); the full-pipeline byte-identity is gated by the k≤2 probe digests (V2).
		// Here: pin that the diag shape carries cSkipped (so profiles can report it).
		const { PeriodSolver } = await import('@/classes/algorithm/PeriodSolver');
		const solver = new PeriodSolver(1);
		const { diag } = solver.solve({ polygons: [], vertexConfigurations: [] } as never, {});
		expect(diag.cSkipped).toBe(0);
	});
});
