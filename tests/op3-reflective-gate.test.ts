/**
 * OP-3 BLOCKING acceptance gate: reflective seeding through the REAL fill path (AL amendment,
 * Task 8b — Task 9 must not run without this).
 *
 * Why this exists: OP-3 stage 1 (48ff7dd) reduces oblique candidate lattices to grid-orbit
 * representatives and replaces each deleted member's fill by seeding g⁻¹(core) on the
 * representative (lem:orbitdedup (i)). The k≤2 digest gate is VACUOUS for that code path — there
 * are ZERO oblique candidates at k≤2, so a broken rotation/reflection seeding swap passes it by
 * construction — and the k=3 oracle bijection may under-test det g = −1 (if the two oblique k=3
 * tilings happen to be reachable via rotation-only orbit members, a latently broken reflection
 * path surfaces only at k=4, in production). THIS test pins the det g = −1 path with real fills:
 *
 *   Fill A: torusFill on Λ_member = g(Λ) seeded with `core`           (the unreduced world)
 *   Fill B: torusFill on Λ_rep    = Λ seeded with mapCore(core) = g⁻¹(core)  (the reduced world)
 *
 * for a REFLECTIVE g (refl=true, rot≠0) recorded by the REAL orbit machinery
 * (`groupIntoGridOrbits`), with `mapCore` = `applySeedMapInv`, the PRODUCTION g⁻¹ helper solve()'s
 * per-map seeding loop calls (PeriodSolver.ts, OP-3 stage 1) — the gate pins the real seeding path
 * directly, cross-checked vertex-by-vertex against the exact `gridImage` formulas. The gate:
 * BOTH fills non-empty, and an exact-congruence bijection between them. A rotation-only control
 * map pins the det g = +1 path the same way.
 *
 * Fixture: t3046 (one of the two true-oblique k=3 tilings; hol(Λ) = 2 asserted, never assumed),
 * reconstructed from the pinned Soto-Sánchez oracle via the proven decode in
 * scripts/oracle-match.ts. The seed core is a TWO-FAN patch (two adjacent full-vertex fans)
 * extracted FROM the reconstructed cell — exact polygons, correctly placed — mirroring how
 * solve() seeds VC fans. Two fans, not one, BY MEASUREMENT (mutation analysis, Task 8b probe):
 * a single-vertex fan of regular tiles is achiral (its mirror is a rotation of itself — every
 * cyclic VC word here is reversal-closed), so a conj-DROPPED g⁻¹ still seeds a valid patch and
 * fills to a congruent tiling — the fill-level gate would pass with the reflection path broken.
 * With the two-fan core all three simulated seeding-bug modes (conj dropped ζ^{N−rot};
 * wrong-axis conj∘ζ^{N−rot}; identity mapCore) produce fillB = 0 → the gate FAILS loudly, while
 * the correct g⁻¹ fills 1/1. The vertex-level mapCore ⇔ gridImage assertions below catch the
 * same bug modes independently of fill behavior.
 *
 * ⚑ Ring discipline (see tests/tiling-congruence-t3019.test.ts): oracle-match.ts owns the
 * module-level ring — reconstruct FIRST, then derive everything from THAT ring instance
 * (assertSameRing compares instances; a second CyclotomicRing.create(24) here would crash every
 * cross comparison).
 *
 * ⚑ Congruence verdicts: `cellsCongruent` HAD a false-negative mode (reducedClassKey float-tie on
 * skinny lattices — pinned in tests/tiling-congruence-t3019.test.ts; FIXED in R1/1aa1c84, the key
 * is now an exact class invariant). The bijection below still accepts a match via cellsCongruent OR
 * via an exhaustive
 * exact grid-isometry witness (every accept is an exact-arithmetic proof — the gate is robust to
 * the lib bug without being weakened: every A-cell must still be EXACTLY verified congruent to
 * some B-cell, and vice versa).
 */
import { describe, it, expect } from 'vitest';
import { Cyclotomic } from '@/classes/Cyclotomic';
import type { Polygon } from '@/classes/polygons/Polygon';
import {
	PeriodSolver,
	applySeedMapInv,
	type PeriodCell,
	type PeriodSolverDiag,
} from '@/classes/algorithm/PeriodSolver';
import {
	gridImage,
	gridImageBasis,
	groupIntoGridOrbits,
	sameLattice,
	holohedry,
} from '@/classes/algorithm/LatticeEnumerator';
import { cellsCongruent } from '@/classes/algorithm/TilingCongruence';
import { loadOracle, reconstructOracleCell } from '../scripts/oracle-match';

// --- fixture: t3046, reconstructed FIRST (fixes the ring) ---
const rec = reconstructOracleCell('t3046', loadOracle()['t3046']);
if ('error' in rec) throw new Error(`t3046 oracle reconstruction failed: ${rec.error}`);
const oracleCell = rec.cell;
const [U, V] = oracleCell.basisExact;
const ring = U.ring;
const N = ring.N;
const ZERO = Cyclotomic.ZERO(ring);

// --- seed core: a full single-vertex fan from the reconstructed cell (exact, correctly placed) ---
// Incidence needs the cell's lattice translates too (boundary vertices borrow tiles from
// neighboring copies), so gather fans from a ±2 patch; a vertex is FULL when its incident
// interior angles sum to 2π (float sum for SELECTION only — the polygons stay exact).
const patch: Polygon[] = [];
for (let i = -2; i <= 2; i++) {
	for (let j = -2; j <= 2; j++) {
		const t = U.scaleRational(BigInt(i), 1n).add(V.scaleRational(BigInt(j), 1n));
		for (const p of oracleCell.cellPolygons) {
			const q = p.clone();
			q.translateExact(t);
			patch.push(q);
		}
	}
}
const interiorAngle = (n: number) => ((n - 2) * Math.PI) / n;
const fullVertices: { w: Cyclotomic; fan: Polygon[] }[] = [];
const seenVertex = new Set<string>();
for (const p of oracleCell.cellPolygons) {
	for (const w of p.exactVertices!) {
		const wk = w.key();
		if (seenVertex.has(wk)) continue;
		seenVertex.add(wk);
		const fan = patch.filter((q) => q.vertexKeySet().has(wk));
		const sum = fan.reduce((s, q) => s + interiorAngle(q.n), 0);
		if (Math.abs(sum - 2 * Math.PI) < 1e-9) fullVertices.push({ w, fan });
	}
}

// --- the two-fan core: fan[0] ∪ the first adjacent fan (tile-sharing), distinct tiles only ---
// (chirality rationale in the header — a single fan is fill-level blind to a dropped conj)
const twoFanCore = ((): Polygon[] => {
	const fan0 = fullVertices[0].fan;
	const keys = new Set(fan0.map((p) => p.exactKey()));
	for (let i = 1; i < fullVertices.length; i++) {
		const f = fullVertices[i].fan;
		if (!f.some((p) => keys.has(p.exactKey()))) continue; // not adjacent
		const merged = [...fan0];
		for (const p of f) {
			if (!keys.has(p.exactKey())) {
				keys.add(p.exactKey());
				merged.push(p);
			}
		}
		return merged;
	}
	throw new Error('t3046 fixture: no adjacent full-vertex fan found');
})();

// --- allowed VC set + tile sizes, derived from the cell itself (the solver's own namer) ---
const solver = new PeriodSolver(3);
const allowed = new Set<string>(
	fullVertices.map(({ w, fan }) => (solver as any).vcNameAt(w, fan) as string)
);
const polySizes = Array.from(new Set(oracleCell.cellPolygons.map((p) => p.n))).sort((a, b) => a - b);

// --- the REAL orbit machinery: rep Λ plus a rotated and a reflected member ---
// Members are ζ³(Λ) and ζ⁵∘conj(Λ). At hol(Λ)=2 the stabilizer of Λ in the grid point group is
// {±1} (rot 0 and rot 12, no reflections), so `groupIntoGridOrbits` must record EXACTLY
// {rot:3, refl:false} and {rot:5, refl:true} (lexicographically smallest (rot, refl) — the
// helper's documented contract): a rotation-only control AND the det g = −1 map under test.
const memberBases: [Cyclotomic, Cyclotomic][] = [
	[U, V],
	gridImageBasis(U, V, 3, false),
	gridImageBasis(U, V, 5, true),
];
const groups = groupIntoGridOrbits(memberBases, N);

const freshDiag = (): PeriodSolverDiag => ({
	candidateLattices: 0, latticesTried: 0, rawCells: 0, emitted: 0, gateRejected: 0,
	fanLattices: 0, p0Skipped: 0, orbitSkipped: 0, p1Pruned: 0, p2Skipped: 0,
	vBelowKSkipped: 0, seedStateDedup: 0, obliqueCandidates: 0, obliqueTruncated: null,
	supercellRejected: 0, primitivityGuardMisses: 0, primitivityGuardAreaSuppressed: 0,
	starLadderTruncated: false, blockIndexCapTruncated: 0, timedOut: false,
});

/** Exact `w ≡ 0 (mod ⟨u,v⟩)` test, robust to Math.round ties: float-Cramer guesses the integers,
 *  a ±1 neighborhood is verified EXACTLY (only `.isZero()` accepts — sound). Mirrors the t3019
 *  witness machinery. */
function isLatticeVectorExact(w: Cyclotomic, u: Cyclotomic, v: Cyclotomic): boolean {
	const d = w.toVector();
	const a = u.toVector();
	const b = v.toVector();
	const det = a.x * b.y - a.y * b.x;
	const m0 = Math.round((d.x * b.y - d.y * b.x) / det);
	const n0 = Math.round((a.x * d.y - a.y * d.x) / det);
	for (let dm = -1; dm <= 1; dm++) {
		for (let dn = -1; dn <= 1; dn++) {
			const recon = u.scaleRational(BigInt(m0 + dm), 1n).add(v.scaleRational(BigInt(n0 + dn), 1n));
			if (w.sub(recon).isZero()) return true;
		}
	}
	return false;
}

/** Exact key of `p` translated by `t` (clone, never mutate). */
function translatedKey(p: Polygon, t: Cyclotomic): string {
	const q = p.clone();
	q.translateExact(t);
	return q.exactKey();
}

/**
 * Exhaustive exact congruence witness, used ONLY as the fallback when `cellsCongruent` says false
 * (its known false-negative mode — see header). Tries every grid isometry g' = (rot, refl) whose
 * linear part maps Λ_A onto Λ_B (exact `sameLattice` gate), anchored at every same-name polygon
 * pair (translation T from the centroid correspondence, exact in the ring); accepts iff g'+T maps
 * the A-cell polygons BIJECTIVELY onto the B-cell's lattice classes with exact key equality after
 * the lattice correction. No float enters a decision — floats only guess lattice integers,
 * exactness comes from .isZero()/.exactKey(). Unit-edge ℚ(ζ₂₄) tilings admit only grid linear
 * parts (edges map to unit ζ-steps), so a TRUE congruence is always reachable by this search.
 */
function exactCongruenceWitness(A: PeriodCell, B: PeriodCell): boolean {
	const [uA, vA] = A.basisExact;
	const [uB, vB] = B.basisExact;
	if (A.cellPolygons.length !== B.cellPolygons.length) return false;
	const P0 = A.cellPolygons.reduce((m, p) => (p.exactKey() < m.exactKey() ? p : m));
	for (let rot = 0; rot < N; rot++) {
		for (const refl of [false, true]) {
			if (!sameLattice(uB, vB, gridImage(uA, rot, refl), gridImage(vA, rot, refl))) continue;
			const gP0c = gridImage(P0.exactCentroid!, rot, refl);
			for (const anchor of B.cellPolygons) {
				if (anchor.getName() !== P0.getName()) continue;
				const T = anchor.exactCentroid!.sub(gP0c);
				const used = new Set<number>();
				const ok = A.cellPolygons.every((p) => {
					const gp = p.transformedRigid(ZERO, refl, refl ? rot : 0, refl ? 0 : rot, T, 'full');
					for (let qi = 0; qi < B.cellPolygons.length; qi++) {
						if (used.has(qi)) continue;
						const q = B.cellPolygons[qi];
						if (q.getName() !== gp.getName()) continue;
						const w = gp.exactCentroid!.sub(q.exactCentroid!);
						if (!isLatticeVectorExact(w, uB, vB)) continue;
						if (translatedKey(gp, w.neg()) === q.exactKey()) {
							used.add(qi);
							return true;
						}
					}
					return false;
				});
				if (ok) return true;
			}
		}
	}
	return false;
}

/** Gate matcher: exact congruence by the library OR by the exhaustive exact witness — every
 *  accept is an exact proof; structured any-member like the R2 recert matcher. */
function congruent(a: PeriodCell, b: PeriodCell, memo: Map<string, string>): boolean {
	return cellsCongruent(a, b, memo) || exactCongruenceWitness(a, b);
}

/**
 * THE GATE for one orbit map m: fill Λ_member = g(Λ) with `core` (unreduced world) and Λ_rep = Λ
 * with mapCore(core) = g⁻¹(core) (reduced world; mapCore is the production `applySeedMapInv`), then
 * require both fills non-empty and exact-congruence-bijective.
 */
function runGate(m: { rot: number; refl: boolean }): {
	fillA: PeriodCell[];
	fillB: PeriodCell[];
} {
	const fan = twoFanCore;

	// Forward g (gridImage semantics: refl ⇒ z ↦ conj(z)·ζ^rot, else z ↦ z·ζ^rot) as a polygon map.
	const gPoly = (p: Polygon): Polygon =>
		p.transformedRigid(ZERO, m.refl, m.refl ? m.rot : 0, m.refl ? 0 : m.rot, ZERO, 'full');
	// solve()'s g⁻¹ seeding — the PRODUCTION helper itself (`applySeedMapInv`, the expression used
	// by solve()'s per-map loop): refl ⇒ g⁻¹ = g (involution), else g⁻¹ = ζ^{(N−rot) mod N}.
	const mapCore = (ps: Polygon[]): Polygon[] => applySeedMapInv(ps, m, ring, ZERO);

	// `core` is the seed AS THE UNREDUCED WORLD SEES IT on the member lattice: g(fan) — guaranteed
	// completable on g(Λ) (g of the fixture tiling completes it), exactly as `fan` is on Λ.
	const core = fan.map(gPoly);

	// --- mapCore ⇔ gridImage cross-check, vertex by vertex (exact): the forward map matches
	// gridImage(·, rot, refl), and mapCore matches the g⁻¹ gridImage formulas — so the seeding
	// transform IS the inverse of the lattice-orbit map, at the vector level. ---
	for (let pi = 0; pi < fan.length; pi++) {
		const fwdKeys = new Set(core[pi].exactVertices!.map((w) => w.key()));
		for (const w of fan[pi].exactVertices!) {
			expect(fwdKeys.has(gridImage(w, m.rot, m.refl).key())).toBe(true);
		}
	}
	const seedB = mapCore(core);
	for (let pi = 0; pi < core.length; pi++) {
		const backKeys = new Set(seedB[pi].exactVertices!.map((w) => w.key()));
		for (const w of core[pi].exactVertices!) {
			const ginv = m.refl ? gridImage(w, m.rot, true) : gridImage(w, (N - m.rot) % N, false);
			expect(backKeys.has(ginv.key())).toBe(true);
		}
	}
	// g⁻¹∘g = id on the fan (exact polygon identity — pins the inversion end-to-end)
	expect(seedB.map((p) => p.exactKey()).sort().join('|')).toBe(
		fan.map((p) => p.exactKey()).sort().join('|')
	);

	// --- the two worlds' fills through the REAL torusFill ---
	const [gu, gv] = gridImageBasis(U, V, m.rot, m.refl);
	const ctxA = (solver as any).makeCtx(gu, gv, ring, allowed, polySizes, Number.MAX_SAFE_INTEGER);
	const ctxB = (solver as any).makeCtx(U, V, ring, allowed, polySizes, Number.MAX_SAFE_INTEGER);
	expect(ctxA).not.toBeNull();
	expect(ctxB).not.toBeNull();
	const rawA: Polygon[][] = (solver as any).torusFill(core, ctxA, () => false, freshDiag());
	const rawB: Polygon[][] = (solver as any).torusFill(seedB, ctxB, () => false, freshDiag());

	// BOTH non-empty — the gate is meaningless on empty fills (a broken seed yields nothing).
	expect(rawA.length).toBeGreaterThan(0);
	expect(rawB.length).toBeGreaterThan(0);

	const fillA: PeriodCell[] = rawA.map((reps) => ({ cellPolygons: reps, basisExact: [gu, gv] }));
	const fillB: PeriodCell[] = rawB.map((reps) => ({ cellPolygons: reps, basisExact: [U, V] }));

	// --- exact-congruence bijection, both directions (any-member matching) ---
	const memo = new Map<string, string>();
	for (const a of fillA) expect(fillB.some((b) => congruent(a, b, memo))).toBe(true);
	for (const b of fillB) expect(fillA.some((a) => congruent(a, b, memo))).toBe(true);

	// The reduced world reproduces the GENUINE oblique k=3 tiling (not merely some matching pair):
	// some B-fill is congruent to the t3046 reconstruction itself.
	expect(fillB.some((b) => congruent(b, oracleCell, memo))).toBe(true);

	return { fillA, fillB };
}

describe('OP-3 reflective seeding acceptance gate (t3046 true-oblique fixture, AL amendment)', () => {
	it('fixture sanity: Λ is genuinely oblique, the fan is a real full-vertex core, the orbit maps are as recorded', () => {
		expect(holohedry(U, V)).toBe(2); // true-oblique — ASSERTED, never assumed
		expect(oracleCell.cellPolygons.length).toBe(7); // 6 triangles + 1 hexagon
		expect(fullVertices.length).toBeGreaterThan(0);
		expect(fullVertices[0].fan.length).toBeGreaterThanOrEqual(3); // a proper vertex fan
		expect(twoFanCore.length).toBeGreaterThan(fullVertices[0].fan.length); // strictly more than one fan
		expect(allowed.size).toBeGreaterThan(0);
		// ONE orbit; the maps are identity-first, then the rotation control, then the REFLECTIVE map
		expect(groups.length).toBe(1);
		expect(groups[0].repIdx).toBe(0);
		expect(groups[0].memberMaps).toEqual([
			{ idx: 0, rot: 0, refl: false },
			{ idx: 1, rot: 3, refl: false },
			{ idx: 2, rot: 5, refl: true },
		]);
		// re-verify each recorded map exactly (the maps are re-verifiable, not trusted)
		for (const m of groups[0].memberMaps) {
			const [gu, gv] = gridImageBasis(U, V, m.rot, m.refl);
			expect(sameLattice(memberBases[m.idx][0], memberBases[m.idx][1], gu, gv)).toBe(true);
		}
	});

	it('GATE (det g = −1): refl:true map — gΛ-with-core vs Λ-with-g⁻¹(core), non-empty exact-congruence bijection', { timeout: 180000 }, () => {
		const m = groups[0].memberMaps.find((mm) => mm.refl)!;
		expect(m).toBeDefined();
		expect(m.rot).not.toBe(0); // exercises reflection WITH a nontrivial rotation part
		runGate(m);
	});

	it('control (det g = +1): rotation-only map — same bijection through the same path', { timeout: 180000 }, () => {
		const m = groups[0].memberMaps.find((mm) => !mm.refl && mm.rot !== 0)!;
		expect(m).toBeDefined();
		runGate(m);
	});
});
