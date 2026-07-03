/* Seed-set census for thesis ch.4 table — run: node_modules/.bin/tsx scripts/seedset-census.ts [stars] [kmax]
 * Reproduces the working-draft census at the current commit. Fast-path convention:
 * singleton-support multisets excluded for k>1 (SeedSetExtractor m>1 branch). */
import fs from 'node:fs';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';

const withStars = process.argv[2] === 'stars';
const noOct = process.argv[2] === 'nooct';
const kmax = parseInt(process.argv[3] ?? (withStars ? '4' : '6'), 10);
const kmin = parseInt(process.argv[4] ?? '1', 10);

const regNs = noOct ? [3, 4, 6, 12] : [3, 4, 6, 8, 12];
const params: GeneratorParameters = withStars
	? { [PolygonType.REGULAR]: { ns: regNs }, [PolygonType.STAR_REGULAR]: { n_max: 12 } }
	: { [PolygonType.REGULAR]: { ns: regNs } };

const baseRing = computeRing(params);
setActiveRing(baseRing.N === 24 ? baseRing : CyclotomicRing.create(baseRing.N));
console.log(`family: regular{3,4,6,8,12}${withStars ? ' + star_regular n<=12' : ''}  N=${baseRing.N}`);

let t = performance.now();
const pg = new PolygonsGenerator(params, []);
console.log(`polygons: ${pg.polygons.length}  [${(performance.now() - t).toFixed(1)}ms]`);

t = performance.now();
const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
console.log(`vcs: ${vcs.length}  [${(performance.now() - t).toFixed(1)}ms]`);

t = performance.now();
const cachePath = `/tmp/census-adj-${withStars ? 'stars' : noOct ? 'nooct' : 'reg'}.json`;
let adj: Record<string, string[]>;
if (fs.existsSync(cachePath)) {
	adj = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
	console.log(`graph adjacency: cache hit (${cachePath})`);
} else {
	adj = {};
	for (const vc of vcs) adj[vc.name] = [];
	for (let i = 0; i < vcs.length; i++)
		for (let j = i + 1; j < vcs.length; j++)
			if (vcs[i].isCompatible(vcs[j])) { adj[vcs[i].name].push(vcs[j].name); adj[vcs[j].name].push(vcs[i].name); }
	fs.writeFileSync(cachePath, JSON.stringify(adj));
}
const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
console.log(`graph edges: ${Object.values(adj).reduce((a, l) => a + l.length, 0) / 2}  [${(performance.now() - t).toFixed(1)}ms]`);

for (let k = kmin; k <= kmax; k++) {
	t = performance.now();
	const sets = new SeedSetExtractor(graph).findSeedSets(k);
	const ms = performance.now() - t;
	const byM = new Map<number, number>();
	for (const s of sets) {
		const m = new Set(s).size;
		byM.set(m, (byM.get(m) ?? 0) + 1);
	}
	const buckets = [...byM.entries()].sort((a, b) => a[0] - b[0]).map(([m, c]) => `m${m}=${c}`).join(' ');
	console.log(`k=${k}: total=${sets.length}  ${buckets}  [${ms.toFixed(2)}ms]`);
}
