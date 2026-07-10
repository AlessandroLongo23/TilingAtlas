/* Scratch per-fill profiler (sandbox calibration). Delete when done.
 * Run: PS_PROFILE=1 tsx scripts/fillprof-sandbox.ts <k> <maxMsPerSeed> <nSeeds>
 * Prints per-solve `SOLVE tried=N`; PeriodSolver's PS_PROFILE prints `fill=Xms`.
 * per-fill (ms) = sum(fill) / sum(tried), aggregated in the shell. */
import { PeriodSolver } from '@/classes/algorithm/PeriodSolver';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';

const k = parseInt(process.argv[2] ?? '2', 10);
const maxMs = parseInt(process.argv[3] ?? '4000', 10);
const nSeeds = parseInt(process.argv[4] ?? '3', 10);
const ns = [3, 4, 6, 12];
const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns } };
const baseRing = computeRing(params);
setActiveRing(baseRing.N === 24 ? baseRing : CyclotomicRing.create(24));

const t0 = Date.now();
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
console.log(`SEEDBUILD k=${k}: ${seeds.length} seeds in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// pick seeds spread across the list to sample varied cells
const step = Math.max(1, Math.floor(seeds.length / nSeeds));
let solved = 0;
for (let i = 0; i < seeds.length && solved < nSeeds; i += step) {
	const { diag } = new PeriodSolver(k).solve(seeds[i], { maxMs });
	console.log(`SOLVE k=${k} seed="${seeds[i].name}" tried=${diag.latticesTried} timedOut=${diag.timedOut}`);
	solved++;
}
console.log(`DONE k=${k}`);
