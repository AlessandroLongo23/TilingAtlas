/**
 * What does whole-patch stamping actually cost? Run: `pnpm tsx scripts/diag-stamp-cost.ts`
 *
 * The completeness question is settled (scripts/diag-stamp-why.ts: the loss was a footprint-dedup bug,
 * fixed, and the snub comes back). What remains is why it is so much slower, and whether that too is
 * fixable or structural. This scales the deterministic frame cap and watches time and heap grow, so
 * the answer is a curve rather than a single "16x".
 *
 * Run it with a raised heap; the point of the exercise is that the default one is not enough:
 *   NODE_OPTIONS=--max-old-space-size=8192 pnpm tsx scripts/diag-stamp-cost.ts
 */
import { SeedExpander } from '@/classes/algorithm/SeedExpander';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing } from '@/classes/Cyclotomic';

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
const snub = seeds.find((s) => s.name.includes('3,3,3,3,6'))!;

const mb = (n: number) => (n / 1024 / 1024).toFixed(0);

console.log(`seed ${snub.name} (${snub.polygons.length} tiles)\n`);
console.log('mode    frames  leaves  maxPatch  totalTilesBuilt        ms   heapUsed');

for (const mode of ['seed', 'patch'] as const) {
	for (const cap of [200, 400, 800, 1600]) {
		const exp = new SeedExpander(1);
		exp.stampMode = mode;
		exp.maxExpandNodes = cap;
		let leaves = 0, maxPatch = 0, tiles = 0;
		// Every leaf's size, plus a running total of tiles the search materialised — the quantity that
		// actually drives both time and memory, since each accepted placement builds a whole new patch.
		global.gc?.();
		const before = process.memoryUsage().heapUsed;
		const t0 = Date.now();
		exp.expand(snub, (patch) => { leaves++; maxPatch = Math.max(maxPatch, patch.length); tiles += patch.length; });
		const ms = Date.now() - t0;
		const heap = process.memoryUsage().heapUsed - before;
		console.log(
			`${mode.padEnd(6)} ${String(cap).padStart(7)} ${String(leaves).padStart(7)} ` +
			`${String(maxPatch).padStart(9)} ${String(tiles).padStart(16)} ${String(ms).padStart(9)} ${mb(heap).padStart(8)} MB`,
		);
	}
}

console.log(`
The two modes differ in ONE line of findValidIsometries — which polygons get transformed and
collision-tested. Seed stamping transforms 5 tiles per candidate; patch stamping transforms the whole
current patch, which grows geometrically (measured on one branch: 5, 8, 13, 23, 31, 44, 66, 88, 123).
So the per-candidate cost is O(patch) against a patch that is itself exponential in the step, and every
ACCEPTED candidate materialises a fresh copy of it as the child frame's patch.`);
