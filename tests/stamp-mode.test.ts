import { describe, expect, it } from 'vitest';
import { SeedExpander } from '@/classes/algorithm/SeedExpander';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing } from '@/classes/Cyclotomic';

// The footprint dedup keys an isometry by where it sends the stamped tiles and keeps the first of each
// group. Which tiles those are has to follow `stampMode`: under seed stamping two isometries agreeing
// on the seed produce the identical child patch, so collapsing them is sound; under patch stamping they
// agree on the seed and can differ everywhere else, so collapsing them discards real placements.
//
// Keying on the seed in both modes cost exactly one tiling at k=1 — [3,3,3,3,6], the chiral snub. Its
// 5-tile seed is mirror-symmetric, so a reflection and a rotation share a seed-footprint; the reflection
// was kept, and applied to the (chiral) 8-tile patch it collides where the rotation would not have. The
// branch died with zero placements and the tiling was never found.
//
// These are structural checks on one frame rather than a full enumeration: whole-patch stamping needs
// minutes per seed and gigabytes of heap (scripts/diag-stamp-cost.ts), which is not a unit test.

function snubSeed() {
	const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns: [3, 4, 6, 8, 12] } };
	setActiveRing(computeRing(params));
	const pg = new PolygonsGenerator(params, []);
	const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
	const adj: Record<string, string[]> = {};
	for (const vc of vcs) adj[vc.name] = [];
	for (let i = 0; i < vcs.length; i++)
		for (let j = i + 1; j < vcs.length; j++)
			if (vcs[i].isCompatible(vcs[j])) { adj[vcs[i].name].push(vcs[j].name); adj[vcs[j].name].push(vcs[i].name); }
	const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
	const seedSets = new SeedSetExtractor(graph).findSeedSets(1);
	const seeds = new SeedBuilder().buildSeeds(1, 1, { seedSetLoader: () => seedSets });
	return seeds.find((s) => s.name.includes('3,3,3,3,6'))!;
}

/** The frame after one stamp, following the first placement — the smallest state where the two modes
 *  can disagree, since at step 1 the patch IS the seed and they are identical by construction. */
function frameAfterFirstStamp(mode: 'seed' | 'patch') {
	const seed = snubSeed();
	const exp = new SeedExpander(1);
	exp.stampMode = mode;
	const patch0 = seed.polygons.map((p) => p.clone());
	const first = exp.figureStep(seed, patch0, exp.figureStart(seed));
	const merged = exp.figureMerge(patch0, first.candidates[0]);
	return { seed, exp, first, merged };
}

describe('stampMode', () => {
	it('defaults to seed stamping', () => {
		expect(new SeedExpander(1).stampMode).toBe('seed');
	});

	it('is identical at the first stamp, where the patch IS the seed', { timeout: 60000 }, () => {
		const a = frameAfterFirstStamp('seed');
		const b = frameAfterFirstStamp('patch');
		expect(a.first.candidates.length).toBe(b.first.candidates.length);
		expect(a.merged.patch.length).toBe(b.merged.patch.length);
	});

	it('still offers a placement at the second stamp under patch stamping', { timeout: 60000 }, () => {
		// The regression. Before the footprint fix this was 0, the branch died, and the k=1 enumeration
		// returned 10 tilings instead of 11.
		const { seed, exp, merged } = frameAfterFirstStamp('patch');
		const second = exp.figureStep(seed, merged.patch, merged.collapsed);
		expect(second.target).not.toBeNull();
		expect(second.candidates.length).toBeGreaterThan(0);
	});

	it('does not collapse isometries that differ away from the seed', { timeout: 60000 }, () => {
		// The mechanism, stated directly: at that frame, patch stamping must consider MORE distinct
		// placements than the seed-keyed footprint would have admitted, because the seed no longer
		// determines the copy.
		const stagesFor = (mode: 'seed' | 'patch') => {
			const { seed, exp, merged } = frameAfterFirstStamp(mode);
			const seen: string[] = [];
			exp.candidateProbe = (info) => seen.push(info.stage);
			exp.figureStep(seed, merged.patch, merged.collapsed);
			exp.candidateProbe = undefined;
			return seen;
		};
		const dupes = (stages: string[]) => stages.filter((s) => s === 'footprintDup').length;
		expect(dupes(stagesFor('patch'))).toBeLessThan(dupes(stagesFor('seed')));
	});

	it('grows the patch geometrically, which is why it costs what it costs', { timeout: 120000 }, () => {
		// Seed stamping adds a seed's worth of tiles per step; patch stamping multiplies. This is the
		// cost result in a form that will fail if the growth law ever changes.
		const sizes = (mode: 'seed' | 'patch') => {
			const seed = snubSeed();
			const exp = new SeedExpander(1);
			exp.stampMode = mode;
			let patch = seed.polygons.map((p) => p.clone());
			let collapsed = exp.figureStart(seed);
			const out = [patch.length];
			for (let i = 0; i < 4; i++) {
				const step = exp.figureStep(seed, patch, collapsed);
				if (step.candidates.length === 0) break;
				const m = exp.figureMerge(patch, step.candidates[0]);
				patch = m.patch;
				collapsed = m.collapsed;
				out.push(patch.length);
			}
			return out;
		};
		const seedSizes = sizes('seed');
		const patchSizes = sizes('patch');
		// Additive vs multiplicative: after four stamps the seed-stamped patch has grown by a bounded
		// number of tiles per step, the patch-stamped one by a factor.
		expect(seedSizes.at(-1)! - seedSizes[0]).toBeLessThan(12);
		expect(patchSizes.at(-1)!).toBeGreaterThan(2 * seedSizes.at(-1)!);
	});
});
