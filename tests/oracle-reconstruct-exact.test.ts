/**
 * Workstream B (paper spike): the exact pure-integer cloud reconstruction of an oracle cell must
 * agree with the proven float reconstruction (`reconstructOracleCell`), and its face-from-gap guard
 * must admit ONLY the five regular tiles {3,4,6,8,12}. The gap→n map n=24/(12−g) would silently
 * admit g=11 → n=24; the guard closes that (TA review). Congruence is the authoritative equality.
 */
import { describe, it, expect } from 'vitest';
import { cellsCongruent } from '@/classes/algorithm/TilingCongruence';
// Importing oracle-match runs its module body, which creates the N=24 ring and sets it active. The
// exact reconstruction reads that same active ring via getActiveRing(), so both methods share one
// ring instance — we deliberately do NOT create a second ring here (that caused a ring-mismatch).
import { loadOracle, reconstructOracleCell } from '../scripts/oracle-match';
import { reconstructOracleCellExact, faceFromGap } from '../scripts/oracleReconstructExact';

describe('faceFromGap guard (only {3,4,6,8,12})', () => {
	it('maps the five valid interior-angle gaps to their tile', () => {
		expect(faceFromGap(4)).toBe(3);
		expect(faceFromGap(6)).toBe(4);
		expect(faceFromGap(8)).toBe(6);
		expect(faceFromGap(9)).toBe(8);
		expect(faceFromGap(10)).toBe(12);
	});
	it('rejects every other gap (closes the g=11→n=24 hole)', () => {
		for (const g of [0, 1, 2, 3, 5, 7, 11, 12, 13]) expect(faceFromGap(g)).toBeNull();
	});
});

describe('exact reconstruction agrees with the float reconstruction (k=1)', () => {
	const oracle = loadOracle();
	const k1 = Object.entries(oracle).filter(([key]) => /^t1\d\d\d$/.test(key));

	it('reconstructs all 11 k=1 entries congruent to the float method (or both error alike)', () => {
		expect(k1.length).toBe(11);
		for (const [tCode, o] of k1) {
			const flo = reconstructOracleCell(tCode, o);
			const exa = reconstructOracleCellExact(tCode, o);
			if ('error' in flo) {
				// t1002 (4.8.8) has a degenerate ℤ[ζ₁₂] basis — the exact method must also refuse it.
				expect('error' in exa, `${tCode}: float errored, exact must too`).toBe(true);
				continue;
			}
			expect('error' in exa, `${tCode}: exact errored — ${(exa as { error?: string }).error}`).toBe(false);
			if ('error' in exa) continue;
			expect(cellsCongruent(flo.cell, exa.cell, new Map()), `${tCode} congruent`).toBe(true);
		}
	});
});
