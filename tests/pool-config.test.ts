/**
 * CB-7 + CB-8 (review 2026-06-09): poolConfig centralization (tuned vs proven candidate-stage
 * bounds + the regime-banner predicate) and the primitivity-rejection guard's witness-closure
 * canonical key. Both items are diagnostics-only — the live-solve test pins that the guard never
 * fires at k=1 (the oracle says recovery always happened at k≤3; a firing IS a discovery).
 */
import { describe, it, expect } from 'vitest';
import { poolConfig, primitiveLatticeKey, latticeKeySet, PeriodSolver } from '@/classes/algorithm/PeriodSolver';
import { latticeKey } from '@/classes/algorithm/LatticeEnumerator';
import { VertexConfiguration } from '@/classes/algorithm/VertexConfiguration';
import { SeedConfiguration } from '@/classes/algorithm/SeedConfiguration';
import { setActiveRing, CyclotomicRing, Cyclotomic } from '@/classes/Cyclotomic';

// a_max for the regular {3,4,6,8,12} family = unit-edge 12-gon area = 3(2+√3).
const A_MAX = 3 * (2 + Math.sqrt(3));

describe('poolConfig (CB-8) — tuned vs proven candidate-stage bounds', () => {
	it('tuned values are byte-identical to the historical constants (k≤2 fixed, k≥3 formulas)', () => {
		const c1 = poolConfig(1, A_MAX, false);
		expect(c1.active.poolSteps).toBe(6);
		expect(c1.active.poolLmax).toBe(5.6);
		expect(c1.active.compactOffMax2).toBe(16);
		expect(c1.active.gridShortMax2).toBe(12.25);
		expect(c1.active.areaBoundF).toBeCloseTo(24 * A_MAX, 12);
		const c2 = poolConfig(2, A_MAX, false);
		expect(c2.active.poolSteps).toBe(6);
		expect(c2.active.poolLmax).toBe(5.6);
		const c3 = poolConfig(3, A_MAX, false);
		expect(c3.active.poolSteps).toBe(8); // 2k+2
		expect(c3.active.poolLmax).toBeCloseTo(Math.sqrt(66), 12); // √(22k)
		expect(c3.active.compactOffMax2).toBeCloseTo(66, 12); // poolLmax²
		expect(c3.active.gridShortMax2).toBeCloseTo(66, 12);
		const c4 = poolConfig(4, A_MAX, false);
		expect(c4.active.poolSteps).toBe(10);
		expect(c4.active.poolLmax).toBeCloseTo(Math.sqrt(88), 12);
	});

	it('proven values realize thm:weight + cor:box(ii)/(iii)', () => {
		for (const k of [1, 2, 3, 4, 5, 6]) {
			const { proven } = poolConfig(k, A_MAX, false);
			expect(proven.poolSteps).toBe(24 * k - 1); // thm:weight: wt ≤ 24k−1
			expect(proven.areaBoundF).toBeCloseTo(24 * k * A_MAX, 9); // cor:box(ii)
			expect(proven.poolLmax).toBeCloseTo((2 / Math.sqrt(3)) * 24 * k * A_MAX, 9); // cor:box(iii) |v|
			expect(proven.compactOffMax2).toBeCloseTo((2 / Math.sqrt(3)) * 24 * k * A_MAX, 9); // |u|² bound
			expect(proven.gridShortMax2).toBeCloseTo((2 / Math.sqrt(3)) * 24 * k * A_MAX, 9);
		}
	});

	it('the regime banner predicate (isTuned) fires for every tuned k — the executed regime is oracle-anchored', () => {
		for (const k of [1, 2, 3, 4, 5, 6]) expect(poolConfig(k, A_MAX, false).isTuned).toBe(true);
	});

	it('under the proven configuration the banner provably cannot fire (active === proven ⇒ isTuned false)', () => {
		for (const k of [1, 2, 3, 4, 5, 6]) {
			const cfg = poolConfig(k, A_MAX, true);
			expect(cfg.isTuned).toBe(false);
			expect(cfg.active).toEqual(cfg.proven);
		}
	});

	it('no tuned bound ever exceeds its proven counterpart (the tuned box is INSIDE the proven box)', () => {
		for (const k of [1, 2, 3, 4, 5, 6]) {
			const { active: t, proven: p } = poolConfig(k, A_MAX, false);
			expect(t.poolSteps).toBeLessThanOrEqual(p.poolSteps);
			expect(t.poolLmax).toBeLessThanOrEqual(p.poolLmax);
			expect(t.compactOffMax2).toBeLessThanOrEqual(p.compactOffMax2);
			expect(t.gridShortMax2).toBeLessThanOrEqual(p.gridShortMax2);
			expect(t.areaBoundF).toBeLessThanOrEqual(p.areaBoundF);
		}
	});
});

describe('primitiveLatticeKey (CB-7) — witness closure → canonical candidate key', () => {
	const ring = CyclotomicRing.create(24);
	setActiveRing(ring);
	const one = Cyclotomic.zeta(ring, 0); // 1
	const i = Cyclotomic.zeta(ring, 6); // i
	const two = one.scaleRational(2n, 1n);
	const twoI = i.scaleRational(2n, 1n);

	it('integer supercell: ⟨2, i⟩ + witness 1 closes to the unit square lattice ⟨1, i⟩', () => {
		expect(primitiveLatticeKey(two, i, [one])).toBe(latticeKey(one, i));
	});

	it('witness already in Λ is a no-op (key unchanged)', () => {
		expect(primitiveLatticeKey(one, i, [one.add(i)])).toBe(latticeKey(one, i));
	});

	it('half-integer (centering) witness: ⟨2, 2i⟩ + (1+i) closes to the checkerboard lattice ⟨2, 1+i⟩', () => {
		const c = one.add(i);
		expect(primitiveLatticeKey(two, twoI, [c])).toBe(latticeKey(two, c));
	});

	it('multiple witnesses fold: ⟨6, i⟩ + {2, 3} closes to ⟨1, i⟩ (gcd of the witnesses)', () => {
		const six = one.scaleRational(6n, 1n);
		const w2 = one.scaleRational(2n, 1n);
		const w3 = one.scaleRational(3n, 1n);
		expect(primitiveLatticeKey(six, i, [w2, w3])).toBe(latticeKey(one, i));
	});

	it('closure is witness-order independent', () => {
		const six = one.scaleRational(6n, 1n);
		const w2 = one.scaleRational(2n, 1n);
		const w3 = one.scaleRational(3n, 1n);
		expect(primitiveLatticeKey(six, i, [w2, w3])).toBe(primitiveLatticeKey(six, i, [w3, w2]));
	});
});

describe('latticeKeySet (CB-7) — latticeKey is ambiguous on tied minima; the set covers every key', () => {
	const ring = CyclotomicRing.create(24);
	setActiveRing(ring);
	const one = Cyclotomic.zeta(ring, 0); // 1
	const w = Cyclotomic.zeta(ring, 4); // ζ⁴ = e^{iπ/3}
	const i = Cyclotomic.zeta(ring, 6); // i

	it('the live honeycomb mismatch: candidate basis (v, v·ω) and closure basis (v, ζ⁴−2) key DIFFERENTLY…', () => {
		const v = one.add(w); // 1+ζ⁴, |v|=√3
		const candidateBasisKey = latticeKey(v, v.mulZeta(4)); // how roundCells stores it
		const closureBasisKey = latticeKey(v, w.sub(one.scaleRational(2n, 1n))); // how the witness closure reduces
		expect(candidateBasisKey).not.toBe(closureBasisKey); // the ambiguity is REAL (hexagonal = 3 tied shortest dirs)
	});

	it('…but latticeKeySet from EITHER basis contains BOTH keys (no false-positive guard miss)', () => {
		const v = one.add(w);
		const candidateBasisKey = latticeKey(v, v.mulZeta(4));
		const closureBasisKey = latticeKey(v, w.sub(one.scaleRational(2n, 1n)));
		const fromClosure = latticeKeySet(v, w.sub(one.scaleRational(2n, 1n)));
		expect(fromClosure.has(candidateBasisKey)).toBe(true);
		expect(fromClosure.has(closureBasisKey)).toBe(true);
		const fromCandidate = latticeKeySet(v, v.mulZeta(4));
		expect(fromCandidate.has(candidateBasisKey)).toBe(true);
		expect(fromCandidate.has(closureBasisKey)).toBe(true);
	});

	it('square lattice (no tie beyond sign/order): the key set is the single canonical key', () => {
		expect(latticeKeySet(one, i)).toEqual(new Set([latticeKey(one, i)]));
	});
});

describe('CB-7 guard on a live solve — supercells are rejected, the guard never fires at k=1', () => {
	it('4,4,4,4: supercell rejections occur AND every primitive lattice is in the candidate set (0 guard misses)', { timeout: 60000 }, () => {
		const ring = CyclotomicRing.create(24);
		setActiveRing(ring);
		const seed = new SeedConfiguration([VertexConfiguration.fromName('4,4,4,4')]);
		const { cells, diag } = new PeriodSolver(1).solve(seed, {});
		expect(cells.length).toBe(1); // the square tiling, exactly once
		expect(diag.supercellRejected).toBeGreaterThan(0); // supercell completions DID occur and were rejected
		expect(diag.primitivityGuardMisses).toBe(0); // the guard found every primitive lattice among the candidates
		expect(diag.primitivityGuardAreaSuppressed).toBe(0); // every suppression here is a candidate-set HIT, not an area-set miss (Finding-2 counter, TA sign-off 2026-06-10)
	});

	it('6,6,6 (honeycomb = hexagonal/tied-minima lattice): 0 guard misses — the latticeKeySet membership is tie-robust', { timeout: 60000 }, () => {
		const ring = CyclotomicRing.create(24);
		setActiveRing(ring);
		const seed = new SeedConfiguration([VertexConfiguration.fromName('6,6,6')]);
		const { cells, diag } = new PeriodSolver(1).solve(seed, {});
		expect(cells.length).toBe(1); // the honeycomb, exactly once
		expect(diag.supercellRejected).toBeGreaterThan(0); // honeycomb supercells (index 2, 3) get certified and rejected
		expect(diag.primitivityGuardMisses).toBe(0); // single-key membership false-fired here pre-fix
		expect(diag.primitivityGuardAreaSuppressed).toBe(0); // candidate-hit suppressions only (hex primitive lattices ARE candidates)
	});
});
