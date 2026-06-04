/* Profile ONE hard k=3 seed under PS_PROFILE to measure the P0/P1 fill levers (DEVELOPMENT_NOTES
 * §15.3 baseline). Run: PS_PROFILE=1 pnpm tsx scripts/profile-k3-seed.ts [maxMs]
 * Defaults to the repeated-3⁴.6 seed [3⁶;3⁴.6;3⁴.6] (12-dir {3,4,6,12}) at a 60s cap. */
import { PeriodSolver } from '@/classes/algorithm/PeriodSolver';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';

const k = 3;
const ns = [3, 4, 6, 12];
const targetName = process.argv[3] ?? '[3,3,3,3,3,3;3,3,3,3,6;3,3,3,3,6]';
const maxMs = process.argv[2] ? parseInt(process.argv[2], 10) : 60000;
const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns } };
const baseRing = computeRing(params);
setActiveRing(baseRing.N === 24 ? baseRing : CyclotomicRing.create(24));

console.log(`Building k=3 seeds for {${ns.join(',')}} …`);
const tb = Date.now();
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
console.log(`Built ${seeds.length} seeds in ${((Date.now() - tb) / 1000).toFixed(1)}s`);

const concretes = seeds.filter((s) => s.name === targetName);
console.log(`Target ${targetName}: ${concretes.length} concrete realisations\n`);
if (concretes.length === 0) {
	const names = [...new Set(seeds.map((s) => s.name))].filter((n) => n.includes('3,3,3,3,6'));
	console.log('No match. Candidate repeated-3⁴.6 names:', names.slice(0, 20));
	process.exit(1);
}

const seed = concretes[0];
const ts = Date.now();
const { cells, diag } = new PeriodSolver(k).solve(seed, { maxMs });
console.log(
	`solve: cells=${cells.length} lat=${diag.candidateLattices} tried=${diag.latticesTried} ` +
	`raw=${diag.rawCells} gateRej=${diag.gateRejected} fanLat=${diag.fanLattices} ` +
	`p0Skip=${diag.p0Skipped} p1Prune=${diag.p1Pruned} ssDedup=${diag.seedStateDedup} ` +
	`timedOut=${diag.timedOut} ${((Date.now() - ts) / 1000).toFixed(1)}s`
);
