/**
 * Frozen regression fixture: the t3019 reducedClassKey float-tie false negative (OP-1 root-cause
 * investigation, 2026-06-11 — experiments/results/op1-t3019-investigation-2026-06-11.log) — now
 * FIXED by R1. ⚑ R1 LANDED: `reducedClassKey` reduces the centroid's EXACT (u,v)-coordinates with
 * shift-equivariant half-up rounding, so its key is one canonical value per lattice class (ties
 * included); the float-`Math.round` reduction + ±2 lex-min window that produced the false negative
 * is gone.
 *
 * The pair: op1[301].0 (the 7-poly [3.3.3.3.4.4.4] scout cell emitted by seed idx 301 of the OP-1
 * k=3 sweep) vs the oracle t3019 reconstruction. Ground truth: they ARE the same tiling — the
 * investigation verified 4 exact grid isometries between them, including a PURE TRANSLATION
 * (identity candidate Q#0, reflect=false, r=0: transformedKey OK, sameLattice OK, exact class map
 * OK). The OLD code returned FALSE because `reducedClassKey` was not a canonical function of the
 * lattice class on this geometry — a skinny lattice (|u|=1, |v|=3+√3≈4.73) with tile centroids at
 * exact half-integer u-coordinates put the float centroid-reduction argument ON the Math.round tie
 * boundary; float noise (v.toVector().x ≈ 4.1e-16 ≠ 0) rounded different class members to bases one
 * u-step apart, the ±2-translate min-key window did not absorb the shift, one class got two
 * "canonical" keys, and every candidate isometry failed the mapped-keys test. Second false-negative
 * instance in TilingCongruence after 2c8ad69 (the rotation drop).
 *
 * Scope of this file: regression-pin the FIX (test a — congruence is now recognised by the fast
 * path) and independently pin the exact ground truth (test b — a reducedClassKey-free witness, so
 * the test cannot rot with the function it guards). The recert matcher's exact-witness fallback
 * (R2, scripts/recert-oracle-match.ts) is retained as a standing differential check; post-R1 it is
 * expected to stay dormant (0 uses).
 */
import { describe, it, expect } from 'vitest';
import type { Cyclotomic } from '@/classes/Cyclotomic';
import type { Polygon } from '@/classes/polygons/Polygon';
import { cellsCongruent } from '@/classes/algorithm/TilingCongruence';
import { sameLattice } from '@/classes/algorithm/LatticeEnumerator';
import { detSurd } from '@/classes/algorithm/exact/Surd';
import { deserializeCell, type SerializedCell } from '../scripts/scoutCodec';
import { loadOracle, reconstructOracleCell } from '../scripts/oracle-match';

/**
 * op1[301].0 — embedded VERBATIM from the OP-1 sweep artifact
 * `.scout-cache/k3_3.4.6.12_cap0.ndjson` (digest b5c622070cff8b4, sweep @ b49f105), NDJSON line
 * `{"idx":301,...}`, `cells[0]`. Seed idx 301 = "[3,3,3,4,4;3,3,3,4,4;4,4,4,4]". 7 polygons
 * [3.3.3.3.4.4.4], basis u=(1,0), v=(0,3+√3)≈(0,4.7321) — byte-identical to the baseline sweep's
 * emission from the same seed (the investigation's per-seed byte census). DO NOT regenerate or
 * "clean up": the fixture freezes the exact failing representation.
 */
const OP1_301_0: SerializedCell = {
	polys: [
		{ n: 3, a: { n: ['-4', '0', '0', '0', '2', '0', '3', '0'], d: '1' }, d: 0 },
		{ n: 3, a: { n: ['0', '0', '0', '0', '-2', '0', '-3', '0'], d: '1' }, d: 4 },
		{ n: 4, a: { n: ['0', '0', '0', '0', '-2', '0', '-3', '0'], d: '1' }, d: 12 },
		{ n: 4, a: { n: ['0', '0', '0', '0', '-2', '0', '-4', '0'], d: '1' }, d: 12 },
		{ n: 4, a: { n: ['-1', '0', '0', '0', '-1', '0', '-3', '0'], d: '1' }, d: 0 },
		{ n: 3, a: { n: ['-4', '0', '0', '0', '3', '0', '4', '0'], d: '1' }, d: 0 },
		{ n: 3, a: { n: ['0', '0', '0', '0', '-1', '0', '-2', '0'], d: '1' }, d: 4 },
	],
	basis: [
		{ n: ['1', '0', '0', '0', '0', '0', '0', '0'], d: '1' },
		{ n: ['-1', '0', '0', '0', '2', '0', '3', '0'], d: '1' },
	],
};

// Oracle side via the proven decode (oracle-match.ts owns the module-level ring — reconstruct
// FIRST, then deserialize the scout fixture with THAT ring instance; assertSameRing compares
// instances, a second CyclotomicRing.create(24) would crash every cross comparison).
const rec = reconstructOracleCell('t3019', loadOracle()['t3019']);
if ('error' in rec) throw new Error(`t3019 oracle reconstruction failed: ${rec.error}`);
const oracle = rec.cell;
const ring = oracle.basisExact[0].ring;
const scout = deserializeCell(ring, OP1_301_0);

/**
 * Exact test that `w ≡ 0 (mod Λ=(u,v))`, robust to the very Math.round tie under investigation:
 * float-Cramer guesses the integer coordinates, then a ±1 neighborhood of the guess is verified
 * EXACTLY (`.isZero()`). Sound — only an exact verification accepts; the neighborhood only
 * restores the tie-broken guess.
 */
function isLatticeVectorExact(w: Cyclotomic, u: Cyclotomic, v: Cyclotomic): boolean {
	const d = w.toVector();
	const a = u.toVector();
	const b = v.toVector();
	const det = a.x * b.y - a.y * b.x;
	const m0 = Math.round((d.x * b.y - d.y * b.x) / det);
	const n0 = Math.round((a.x * d.y - a.y * d.x) / det);
	for (let dm = -1; dm <= 1; dm++) {
		for (let dn = -1; dn <= 1; dn++) {
			const recon = u
				.scaleRational(BigInt(m0 + dm), 1n)
				.add(v.scaleRational(BigInt(n0 + dn), 1n));
			if (w.sub(recon).isZero()) return true;
		}
	}
	return false;
}

/** Exact key of `p` translated by `t` (clone, never mutate the fixture). */
function translatedKey(p: Polygon, t: Cyclotomic): string {
	const q = p.clone();
	q.translateExact(t);
	return q.exactKey();
}

describe('t3019 frozen fixture — reducedClassKey float-tie false negative (R1 FIXED)', () => {
	it('(a) R1 regression: cellsCongruent(op1[301].0, t3019recon) is now TRUE (fast path)', () => {
		// Was the R1 acceptance signal (the bug returned false here); R1 made reducedClassKey an
		// exact class invariant, so the genuine congruence — proven independently in test (b) by an
		// exact pure-translation witness — is now recognised by the fast path. A regression to false
		// would mean reducedClassKey lost canonicality again on this skinny-lattice geometry.
		expect(cellsCongruent(scout, oracle)).toBe(true);
	});

	it('(b) ground truth: structural invariants agree and an exact PURE TRANSLATION maps the scout cell onto t3019', () => {
		const [uA, vA] = scout.basisExact;
		const [uB, vB] = oracle.basisExact;

		// structural evidence: identical translation lattice, equal |det|, equal cell size
		expect(sameLattice(uB, vB, uA, vA)).toBe(true);
		expect(detSurd(uA, vA).abs().cmp(detSurd(uB, vB).abs())).toBe(0);
		expect(scout.cellPolygons.length).toBe(oracle.cellPolygons.length); // 7

		// Miniature of the investigation's reducedClassKey-FREE exact class-map check, restricted
		// to pure translations (the investigation's identity candidate Q#0/reflect=false/r=0 was a
		// verified TRUE congruence). Witness: T = c_Q − c_P0 for some same-name oracle polygon Q;
		// it must map EVERY scout polygon onto a distinct oracle polygon up to an exact Λ_B vector
		// with exact key equality after the lattice correction — a bijection of lattice classes,
		// i.e. a genuine congruence of the two periodic tilings. No float enters a decision:
		// floats only guess the lattice integers, exactness comes from .isZero()/exactKey().
		const P0 = scout.cellPolygons.reduce((m, p) => (p.exactKey() < m.exactKey() ? p : m));
		const witnesses: Cyclotomic[] = [];
		for (const Q of oracle.cellPolygons) {
			if (Q.getName() !== P0.getName()) continue;
			const T = Q.exactCentroid!.sub(P0.exactCentroid!);
			const used = new Set<number>();
			const ok = scout.cellPolygons.every((p) => {
				const cp = p.exactCentroid!.add(T);
				for (let qi = 0; qi < oracle.cellPolygons.length; qi++) {
					if (used.has(qi)) continue;
					const q = oracle.cellPolygons[qi];
					if (q.getName() !== p.getName()) continue;
					const w = cp.sub(q.exactCentroid!);
					if (!isLatticeVectorExact(w, uB, vB)) continue;
					// exact polygon identity after the lattice correction, not just centroid match
					if (translatedKey(p, T.sub(w)) === q.exactKey()) {
						used.add(qi);
						return true;
					}
				}
				return false;
			});
			if (ok) witnesses.push(T);
		}
		// at least one exact pure-translation congruence exists — the library's FALSE in (a) is
		// therefore a false negative, not a disagreement about the tilings.
		expect(witnesses.length).toBeGreaterThan(0);
	});
});
