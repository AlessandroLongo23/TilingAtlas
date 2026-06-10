/* Probe 9: seed-list impact of the emerging-VC naming fix — counts for k=1..3 ({3,4,6,12}) with
 * the FIXED naming vs the LEGACY (unsorted) naming, and the t3007 seed's presence/index.
 *   pnpm tsx scripts/diag-seedcount-impact.ts
 */
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	VertexConfiguration, PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import type { Polygon } from '@/classes/polygons/Polygon';
import type { Vector } from '@/classes/Vector';

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns: [3, 4, 6, 12] } };
const baseRing = computeRing(params);
setActiveRing(baseRing.N === 24 ? baseRing : CyclotomicRing.create(24));

const pg = new PolygonsGenerator(params, []);
const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
const adj: Record<string, string[]> = {};
for (const vc of vcs) adj[vc.name] = [];
for (let i = 0; i < vcs.length; i++)
	for (let j = i + 1; j < vcs.length; j++)
		if (vcs[i].isCompatible(vcs[j])) { adj[vcs[i].name].push(vcs[j].name); adj[vcs[j].name].push(vcs[i].name); }
const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);

function build(k: number, legacy: boolean): { count: number; names: string[] } {
	const seedSets = new SeedSetExtractor(graph).findSeedSets(k);
	const builder = new SeedBuilder();
	if (legacy) {
		// restore the pre-fix behavior: name from the unsorted polygon list
		(builder as any).getEmergingVCNameAtVertex = (vertex: Vector, polygons: Polygon[]): string | null => {
			if (polygons.length === 0) return null;
			return new VertexConfiguration(polygons).getName();
		};
	}
	const seeds = builder.buildSeeds(k, 1, { seedSetLoader: () => seedSets });
	const useSeeds = k >= 2 ? seeds.filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2) : seeds;
	return { count: useSeeds.length, names: useSeeds.map((s) => s.name) };
}

for (const k of [1, 2, 3]) {
	const fixed = build(k, false);
	const legacy = build(k, true);
	console.log(`k=${k}: legacy=${legacy.count} fixed=${fixed.count}`);
	const legacySet = new Set(legacy.names);
	const added = fixed.names.filter((n) => !legacySet.has(n));
	const fixedSet = new Set(fixed.names);
	const removed = legacy.names.filter((n) => !fixedSet.has(n));
	if (added.length) console.log(`  added:   ${added.join('  ')}`);
	if (removed.length) console.log(`  removed: ${removed.join('  ')}`);
}
