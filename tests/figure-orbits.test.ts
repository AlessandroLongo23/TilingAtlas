import { describe, it, expect } from 'vitest';
import { loadSnapshot } from '../figures/snapshot';
import { assignOrbits, loadOrbitCache } from '../figures/tiling/orbits';

/**
 * Figure-pipeline orbit data (figures/tiling/orbits.ts). The committed orbits.json was generated
 * with a hard k==orbits gate over all 92 certified tilings; these tests pin the invariants cheaply
 * (full regeneration: pnpm tsx figures/tiling/orbits.ts --force).
 */
describe('figure orbit cache', () => {
	const snap = loadSnapshot();
	const cache = loadOrbitCache();

	it('covers the whole snapshot with matching k', () => {
		for (const t of snap.tilings) {
			const o = cache[t.canonicalKey];
			expect(o, `missing orbits for ${t.canonicalKey}`).toBeDefined();
			expect(o.k, `orbit count != k for ${t.canonicalKey}`).toBe(t.k);
			expect(o.vcOfOrbit).toHaveLength(t.k);
		}
	});

	it('k=1 vertex-figure names are exactly the 11 Archimedean names', () => {
		const names = snap.tilings
			.filter((t) => t.k === 1)
			.map((t) => cache[t.canonicalKey].vcOfOrbit[0])
			.sort();
		expect(names).toEqual(
			[
				'3,12,12',
				'3,3,3,3,3,3',
				'3,3,3,3,6',
				'3,3,3,4,4',
				'3,3,4,3,4',
				'3,4,6,4',
				'3,6,3,6',
				'4,4,4,4',
				'4,6,12',
				'4,8,8',
			]
				.concat(['6,6,6'])
				.sort()
		);
	});

	it('recomputing the square tiling from its exact codec reproduces the cached entry', () => {
		const square = snap.tilings.find(
			(t) => t.k === 1 && cache[t.canonicalKey].vcOfOrbit[0] === '4,4,4,4'
		)!;
		expect(square).toBeDefined();
		const fresh = assignOrbits(square.cellCodec);
		expect(fresh).toEqual(cache[square.canonicalKey]);
		// every corner of the square cell is a tiling vertex in the single orbit
		expect(fresh.orbitOfCorner.flat().every((o) => o === 0)).toBe(true);
	});
});
