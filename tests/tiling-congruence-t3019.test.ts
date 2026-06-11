/**
 * Frozen regression fixture: the t3019 reducedClassKey float-tie FALSE NEGATIVE (OP-1 root-cause
 * investigation, 2026-06-11 — experiments/results/op1-t3019-investigation-2026-06-11.log).
 *
 * The pair: op1[301].0 (the 7-poly [3.3.3.3.4.4.4] scout cell emitted by seed idx 301 of the OP-1
 * k=3 sweep) vs the oracle t3019 reconstruction. Ground truth: they ARE the same tiling — the
 * investigation verified 4 exact grid isometries between them, including a PURE TRANSLATION
 * (identity candidate Q#0, reflect=false, r=0: transformedKey OK, sameLattice OK, exact class map
 * OK). Yet `cellsCongruent` returns FALSE: `reducedClassKey` is not a canonical function of the
 * lattice class on this geometry — a skinny lattice (|u|=1, |v|=3+√3≈4.73) with tile centroids at
 * exact half-integer u-coordinates puts the float centroid-reduction argument ON the Math.round
 * tie boundary; float noise (v.toVector().x ≈ 4.1e-16 ≠ 0) rounds different class members to bases
 * one u-step apart, the ±2-translate min-key window does not absorb the shift, one class gets two
 * "canonical" keys, and every candidate isometry fails the mapped-keys test. Second false-negative
 * instance in TilingCongruence after 2c8ad69 (the rotation drop).
 *
 * Scope of this file: pin the bug (test a) and pin the exact ground truth that exposes it as a bug
 * (test b). The R1 lib fix (TilingCongruence.reducedClassKey) is DEFERRED — decisive-path
 * certification machinery, cross-lane (CB-4), TA flag pending. The recert matcher was made
 * any-member-robust instead (R2, scripts/recert-oracle-match.ts).
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

describe('t3019 frozen fixture — reducedClassKey float-tie false negative (R1 pending)', () => {
	it('(a) pins the BUG: cellsCongruent(op1[301].0, t3019recon) is false', () => {
		// ⚠ pins the BUG — when the R1 reducedClassKey fix lands this must flip to true; the
		// failure of THIS test is the R1 acceptance signal. The pair is genuinely congruent
		// (test b proves it with an exact pure-translation witness); the false verdict is the
		// reducedClassKey non-canonicality on t3019's skinny-lattice half-integer geometry.
		expect(cellsCongruent(scout, oracle)).toBe(false);
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
