import { describe, it, expect } from 'vitest';
import { getActiveRing } from '@/classes/Cyclotomic';
import { reconstructOracleCell } from '@/classes/algorithm/oracleCellReconstruct';
import { loadOracle, reconstructOracleCell as reconstructLegacy } from '../scripts/oracle-match';
import { cellsCongruent } from '@/classes/algorithm/TilingCongruence';

// The new browser-safe module (ring passed in) must reproduce the legacy script wrapper (module ring),
// which is the proven float reconstruction. Congruence is the authoritative equality. Importing
// scripts/oracle-match (above) already created the N=24 ring and made it active; reuse THAT instance
// via getActiveRing() rather than calling CyclotomicRing.create(24) again here — a second instance
// would be a distinct object, and cellsCongruent would throw a ring-mismatch on every comparison
// (the exact footgun this extraction is required to avoid — see the note atop
// tests/oracle-reconstruct-exact.test.ts).
describe('oracleCellReconstruct (browser-safe, ring param)', () => {
	const ring = getActiveRing();
	const oracle = loadOracle();
	const k1 = Object.entries(oracle).filter(([key]) => /^t1\d\d\d$/.test(key));

	it('reconstructs all 11 k=1 galebach entries identically to the legacy wrapper', () => {
		expect(k1.length).toBe(11);
		for (const [tCode, o] of k1) {
			const neo = reconstructOracleCell(ring, tCode, o);
			const leg = reconstructLegacy(tCode, o);
			expect('error' in neo, `${tCode}: error parity`).toBe('error' in leg);
			if ('error' in neo || 'error' in leg) continue;
			expect(cellsCongruent(neo.cell, leg.cell, new Map()), `${tCode} congruent`).toBe(true);
		}
	});
});
