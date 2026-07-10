import { describe, it, expect, beforeEach } from 'vitest';
import { PeriodSolver } from '@/classes/algorithm/PeriodSolver';
import { deserializeCell } from '@/classes/algorithm/cellCodec';
import { setActiveRing, CyclotomicRing, getActiveRing } from '@/classes/Cyclotomic';
import { loadSnapshot } from '../figures/snapshot';

// The active ring is a global singleton; other suites in the full `pnpm test` run mutate it, so pin it
// to N=24 before EVERY test (not just at module load) — otherwise a certified cell gets rebuilt in the
// wrong ring and the overlap check reads garbage (passes standalone, fails in-suite).
beforeEach(() => setActiveRing(CyclotomicRing.create(24)));

// RANK-1 optimization: blockOverlapPeriodic (reps-vs-block, O(reps·block)) must decide overlap
// byte-identically to the old blockHasProperOverlap (all-pairs, O(block²)). Both are exercised via
// PeriodSolver._testOnlyBlockOverlap, which builds the certificate block and runs each check.

describe('blockOverlapPeriodic === blockHasProperOverlap on the certified k≤3 catalogue (no overlaps)', () => {
	it('every certified cell: both checks agree and report NO overlap (valid tilings are gap-free & disjoint)', { timeout: 120000 }, () => {
		const snap = loadSnapshot();
		const ring = getActiveRing();
		const solver = new PeriodSolver(1);
		const mismatches: string[] = [];
		let n = 0;
		for (const t of snap.tilings) {
			if (![1, 2, 3].includes(t.k)) continue;
			const cell = deserializeCell(ring, t.cellCodec);
			const [u, v] = cell.basisExact;
			const r = solver._testOnlyBlockOverlap(cell.cellPolygons, u, v);
			if (!r) continue; // degenerate basis (shouldn't happen for a certified cell)
			n++;
			if (r.old !== r.periodic) mismatches.push(`k=${t.k} ${t.canonicalKey.slice(0, 24)}: old=${r.old} periodic=${r.periodic}`);
			if (r.old !== false) mismatches.push(`k=${t.k} ${t.canonicalKey.slice(0, 24)}: certified cell reported OVERLAP (old=${r.old})`);
		}
		expect(n).toBeGreaterThanOrEqual(92); // 11 + 20 + 61
		expect(mismatches).toEqual([]);
	});
});

describe('blockOverlapPeriodic === blockHasProperOverlap on constructed OVERLAPPING cells (both must fire)', () => {
	it('injecting a quarter-lattice-shifted duplicate makes BOTH checks report overlap', { timeout: 120000 }, () => {
		const snap = loadSnapshot();
		const ring = getActiveRing();
		const solver = new PeriodSolver(1);
		let tested = 0;
		for (const t of snap.tilings) {
			if (![1, 2, 3].includes(t.k)) continue;
			const cell = deserializeCell(ring, t.cellCodec);
			const [u, v] = cell.basisExact;
			// A quarter-u shift is a NON-lattice offset, so the copy properly overlaps the tile it came from.
			const shift = u.scaleRational(1n, 4n);
			const dup = cell.cellPolygons[0].clone();
			dup.translateExact(shift);
			const overlapping = [...cell.cellPolygons, dup];
			const r = solver._testOnlyBlockOverlap(overlapping, u, v);
			if (!r) continue;
			tested++;
			// both detect the injected overlap, and they agree
			expect(r.old).toBe(true);
			expect(r.periodic).toBe(true);
			if (tested >= 8) break; // a representative sample across k is enough for the TRUE branch
		}
		expect(tested).toBeGreaterThanOrEqual(8);
	});
});
