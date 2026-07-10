/* Dump all k=3 seed configurations ({3,4,6,12}, build order) as float polygons for rendering.
 * Run: pnpm tsx scripts/dump-seeds-k3.ts [out.json]  (default .scout-cache/seeds-k3.json) */
import * as fs from 'node:fs';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';

const out = process.argv[2] ?? '.scout-cache/seeds-k3.json';
const k = 3;
const ns = [3, 4, 6, 12];
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
// same filter as probe-pipeline: genuinely multi-VC seeds at k >= 2
const useSeeds = seeds.filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2);

const data = useSeeds.map((s, i) => ({
	i,
	name: s.name,
	polys: s.polygons.map((p) => ({
		n: p.n,
		pts: p.exactVertices!.map((v) => { const f = v.toVector(); return [f.x, f.y]; }),
	})),
}));
fs.mkdirSync('.scout-cache', { recursive: true });
fs.writeFileSync(out, JSON.stringify(data));
console.log(`wrote ${data.length} seeds -> ${out}`);
