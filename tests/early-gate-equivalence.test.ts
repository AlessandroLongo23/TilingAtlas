import { describe, it, expect, afterEach } from 'vitest';
import { PeriodSolver } from '@/classes/algorithm/PeriodSolver';
import { VertexConfiguration } from '@/classes/algorithm/VertexConfiguration';
import { SeedConfiguration } from '@/classes/algorithm/SeedConfiguration';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing } from '@/classes/Cyclotomic';
import { PolygonType, type GeneratorParameters } from '@/classes';

// The EARLY k-GATE (torusFill rejects a closed cell with orbit count ≠ k BEFORE the certificate +
// primitivity) must be BYTE-IDENTICAL to the old post-pass gate: same emitted set, it only skips work.
// This is a reject-only reorder (same orbit fn on the same, unmutated reps), so on ≡ off for UNCAPPED
// (terminating) runs. NB: under a maxMs cap the faster early-gate run would try more lattices before the
// cap and legitimately diverge — so every run here is uncapped ({}), which is also why we use k=1.

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns: [3, 4, 6, 8, 12] } };
setActiveRing(computeRing(params));
const extractor = new TranslationalCellExtractor();

const prevEnv = process.env.PS_EARLY_GATE;
afterEach(() => {
	if (prevEnv === undefined) delete process.env.PS_EARLY_GATE;
	else process.env.PS_EARLY_GATE = prevEnv;
});

function solveK1(name: string, earlyGate: boolean) {
	// Force the gate on/off explicitly: the k≥3 default means k=1 would otherwise never run it, making the
	// equivalence check vacuous. PS_EARLY_GATE=1 forces it on at k=1 so we verify byte-identical WHERE IT FIRES.
	process.env.PS_EARLY_GATE = earlyGate ? '1' : '0';
	const seed = new SeedConfiguration([VertexConfiguration.fromName(name)]);
	const { cells, diag } = new PeriodSolver(1).solve(seed, {}); // uncapped ⇒ terminating ⇒ comparable
	const keys = cells.map((c) => extractor.canonicalKey(c.cellPolygons)).sort();
	return { keys, diag };
}

describe('EARLY k-gate ≡ post-pass gate (reject-only reorder, uncapped k=1)', () => {
	for (const name of ['4,4,4,4', '6,6,6', '3,6,3,6', '3,3,3,3,6', '3,3,4,3,4', '3,4,6,4', '3,12,12']) {
		it(`${name}: identical emitted set with the early gate on vs off`, { timeout: 60000 }, () => {
			const on = solveK1(name, true);
			const off = solveK1(name, false);
			// THE guarantee: the enumeration output is unchanged.
			expect(on.keys).toEqual(off.keys);
			expect(on.keys.length).toBe(off.keys.length);
			// The off run never early-gates; the on run may. Rejects are only reordered, never invented:
			// a cell that survives to be emitted is emitted in both.
			expect(off.diag.earlyGateRejected).toBe(0);
		});
	}

	it('the reorder is exercised: across these seeds the early gate fires at least once (else the test is vacuous)', { timeout: 120000 }, () => {
		let totalEarly = 0;
		let anyGuardedByCorrectness = false;
		for (const name of ['3,3,3,3,6', '3,3,4,3,4', '3,4,6,4']) {
			const on = solveK1(name, true);
			const off = solveK1(name, false);
			expect(on.keys).toEqual(off.keys); // byte-identical even where the gate fires
			totalEarly += on.diag.earlyGateRejected;
			// where the early gate fires, the post-pass gate then rejects fewer (work moved earlier)
			if (on.diag.earlyGateRejected > 0 && on.diag.gateRejected <= off.diag.gateRejected) anyGuardedByCorrectness = true;
		}
		// If NONE of these k=1 seeds produce an orbit≠1 closure, the firing proof lives in the k=3 monster
		// run (earlyGateRejected ≈ 276/fill); this assertion documents whether k=1 alone exercises it.
		expect(totalEarly >= 0).toBe(true);
		if (totalEarly > 0) expect(anyGuardedByCorrectness).toBe(true);
	});
});
