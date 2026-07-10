/* TEMP (seed-lookahead scout gate): dump the emitted seed list for k, tiles — count + per-seed
 * name + canonical polygon multiset. Run pre- and post-refactor of SeedBuilder; outputs must be
 * byte-identical. Deleted after the gate passes.
 * Run: pnpm tsx scripts/_tmp-seed-baseline.ts [k] [tiles]
 */
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';

const k = parseInt(process.argv[2] ?? '1', 10);
const ns = (process.argv[3] ?? '3,4,6,8,12').split(',').map(Number);
const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns } };
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
const seedSets = new SeedSetExtractor(graph).findSeedSets(k);
const seeds = new SeedBuilder().buildSeeds(k, 1, { seedSetLoader: () => seedSets });
const useSeeds = k >= 2 ? seeds.filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2) : seeds;

console.log(`k=${k} tiles={${ns.join(',')}} seeds=${seeds.length} used=${useSeeds.length}`);
for (let i = 0; i < useSeeds.length; i++) {
	const s = useSeeds[i];
	const polys = s.polygons
		.map((p) => (p.hasExact() ? `${p.n}@${p.exactCentroid!.key()}` : `${p.n}@${p.centroid.x.toFixed(6)},${p.centroid.y.toFixed(6)}`))
		.sort()
		.join('|');
	console.log(`[${i}] ${s.name} :: ${polys}`);
}
