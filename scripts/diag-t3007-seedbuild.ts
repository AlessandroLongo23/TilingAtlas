/* Probe 3 for the missing t3007: does findSeedSets emit the {3.12.12, 3.3.4.12, 3.4.6.4} triple,
 * and does SeedBuilder.buildSeedsFromSet construct a seed for it?
 *   pnpm tsx scripts/diag-t3007-seedbuild.ts
 */
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';

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
const seedSets = new SeedSetExtractor(graph).findSeedSets(3);
console.log(`findSeedSets(3): ${seedSets.length} sets`);

const msOf = (name: string) => name.split(',').map(Number).sort((x, y) => x - y).join(',');
const want = ['3,12,12', '3,3,4,12', '3,4,6,4'].map(msOf).sort().join('|');
const hits = seedSets.filter((s) => s.map(msOf).sort().join('|') === want);
console.log(`sets with multiset {3.12.12, 3.3.4.12, 3.4.6.4}: ${hits.length}`);
for (const h of hits) console.log(`  [${h.join(' ; ')}]`);

// Build each hit and report
const builder = new SeedBuilder();
for (const h of hits) {
	const seeds = builder.buildSeedsFromSet(h);
	console.log(`buildSeedsFromSet([${h.join(';')}]) → ${seeds.length} seeds`);
	for (const s of seeds) console.log(`   seed: ${s.name ?? s.vertexConfigurations.map((v) => v.name).join(';')}`);
}

// Compare: the variant that IS in the list (3,4,3,12 instead)
const wantB = ['3,12,12', '3,4,3,12', '3,4,6,4'].sort().join('|');
const hitsB = seedSets.filter((s) => s.slice().sort().join('|') === wantB);
console.log(`\ncontrol — sets equal to {3,12,12; 3,4,3,12; 3,4,6,4}: ${hitsB.length}`);
for (const h of hitsB) {
	const seeds = builder.buildSeedsFromSet(h);
	console.log(`buildSeedsFromSet([${h.join(';')}]) → ${seeds.length} seeds`);
}
