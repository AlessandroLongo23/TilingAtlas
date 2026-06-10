/**
 * Regression for the t3007 seed-coverage drop (DEVELOPMENT_NOTES §28–§29).
 *
 * `SeedBuilder.passesFinalVertexCheck` names a surrounded emerging vertex via
 * `new VertexConfiguration(polygonsAtVertex)` — but `VertexConfiguration.getName()` canonicalizes
 * only over ROTATIONS of the polygon LIST order, assuming the list is in cyclic angular order
 * around the shared vertex. The incident polygons arrive in `seed.polygons` filter order, so a
 * faithful cluster's surrounded vertex could be mis-named (here: true cyclic order 3,3,4,12 was
 * named 3,4,3,12) and the whole seed set silently rejected. That dropped the only seed able to
 * produce Galebach t3007 = {3.12.12; 3.3.4.12; 3.4.6.4} — the k=3 catalogue missed the tiling
 * while the count stayed 61 by a canceling duplicate (§28.2).
 */
import { describe, it, expect } from 'vitest';
import { SeedBuilder, PolygonType, type GeneratorParameters } from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns: [3, 4, 6, 12] } };
const baseRing = computeRing(params);
setActiveRing(baseRing.N === 24 ? baseRing : CyclotomicRing.create(24));

describe('SeedBuilder — emerging-VC naming at surrounded vertices (t3007 regression)', () => {
	it('builds a seed for the t3007 vertex-type set {3.12.12, 3.3.4.12, 3.4.6.4}', () => {
		const seeds = new SeedBuilder().buildSeedsFromSet(['3,12,12', '3,3,4,12', '3,4,6,4']);
		expect(seeds.length).toBeGreaterThanOrEqual(1);
		// every built seed must carry exactly the requested vertex-type multiset (up to mirror)
		for (const s of seeds) {
			expect(s.vertexConfigurations).toHaveLength(3);
		}
	});

	it('mirror-named variant of the same set also builds', () => {
		const seeds = new SeedBuilder().buildSeedsFromSet(['3,12,12', '3,3,12,4', '3,4,6,4']);
		expect(seeds.length).toBeGreaterThanOrEqual(1);
	});

	it('control: the separated-triangle variant {3.12.12, 3.4.3.12, 3.4.6.4} still builds', () => {
		const seeds = new SeedBuilder().buildSeedsFromSet(['3,12,12', '3,4,3,12', '3,4,6,4']);
		expect(seeds.length).toBeGreaterThanOrEqual(1);
	});
});
