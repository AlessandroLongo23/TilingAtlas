import { describe, it, expect } from 'vitest';
import { CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { symmetryFromExactSource } from '@/lib/services/oracleSymmetry';
import { WALLPAPER_GROUPS, ORBIFOLD_SIGNATURE } from '@/lib/classes/symmetry/types';
import { _polyAreaForTest } from '@/lib/classes/symmetry/WallpaperSymmetry';
import { loadOracle } from '../scripts/oracle-match';
import ctrnact from '../figures/data/ctrnact.json';

// Fast guard for the browser reconstruction → analyze path: all galebach k=1 (minus t1002) + a slice of
// ctrnact k=7 must classify to a valid group with an area-exact FD. The full 2722-entry gate is
// scripts/validate-oracle-symmetry.ts (too slow for the default suite).
describe('oracle symmetry — reconstruct + classify (sample)', () => {
	const ring = CyclotomicRing.create(24);
	setActiveRing(ring);

	const cases: { id: string; T1: number[]; T2: number[]; Seed: number[][] }[] = [];
	for (const [tCode, o] of Object.entries(loadOracle())) {
		if (/^t1\d\d\d$/.test(tCode) && tCode !== 't1002') cases.push({ id: tCode, ...o }); // t1002=4.8.8, no seed
	}
	const cj = (ctrnact as { tilings: { id: string; k: number; T1?: number[]; T2?: number[]; Seed?: number[][] }[] })
		.tilings;
	const k7 = cj.filter((x) => x.k === 7 && x.T1 && x.T2 && x.Seed);
	// The reported tiling sits deep in file order (index 1438/1472 for k=7), so a plain slice(0, 25)
	// never samples it — force it in alongside the first 24 so the guard assertion below is meaningful.
	const REPORTED_ID = 'ctrnact-07_36-4j5_5b2-1';
	const sample = k7.slice(0, 24);
	const reported = k7.find((x) => x.id === REPORTED_ID);
	if (reported && !sample.some((x) => x.id === REPORTED_ID)) sample.push(reported);
	for (const t of sample) {
		cases.push({ id: t.id, T1: t.T1!, T2: t.T2!, Seed: t.Seed! });
	}

	it('classifies every sampled oracle cell to one of the 17 groups with area(FD)=cell/|G|', () => {
		expect(cases.some((c) => c.id === 'ctrnact-07_36-4j5_5b2-1')).toBe(true);
		for (const c of cases) {
			const d = symmetryFromExactSource(ring, c.id, { kind: 'seed', T1: c.T1, T2: c.T2, Seed: c.Seed });
			expect(d, `${c.id} reconstructs`).not.toBeNull();
			expect(WALLPAPER_GROUPS, `${c.id} group`).toContain(d!.group);
			expect(d!.orbifold).toBe(ORBIFOLD_SIGNATURE[d!.group]);
			const [c1, c2] = d!.cell;
			const cellArea = Math.abs(c1.x * c2.y - c1.y * c2.x);
			expect(Math.abs(_polyAreaForTest(d!.fd) - cellArea / d!.pointGroupOrder)).toBeLessThan(
				1e-3 * Math.max(1, cellArea),
			);
		}
	});
});
