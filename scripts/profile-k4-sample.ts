/* C2 calibration (NOT core code): REPRESENTATIVE per-seed k=4 FILL profile. Strides across ALL seed-sets
 * (not just the 3⁶-heavy first ones) so the timeout distribution reflects square/octagon families too.
 * Builds only the sampled sets (fast), then profiles a strided, bounded set of useSeeds under a per-seed cap.
 * PS_PROFILE=1 adds the cand/fill/gate ms breakdown on stderr.
 * Run: PS_PROFILE=1 pnpm tsx scripts/profile-k4-sample.ts [maxMsPerSeed=30000] [nSetSamples=40] [maxFills=40] [family=3,4,6,8,12] */
import { PeriodSolver } from '@/classes/algorithm/PeriodSolver';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';

const k = 4;
const maxMs = process.argv[2] ? parseInt(process.argv[2], 10) : 30000;
const nSetSamples = process.argv[3] ? parseInt(process.argv[3], 10) : 40;
const maxFills = process.argv[4] ? parseInt(process.argv[4], 10) : 40;
const ns = (process.argv[5] ?? '3,4,6,8,12').split(',').map(Number);

const T0 = Date.now();
const log = (m: string) => process.stderr.write(`[t+${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}\n`);

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
const allSets = new SeedSetExtractor(graph).findSeedSets(k);
const step = Math.max(1, Math.floor(allSets.length / nSetSamples));
const someSets = allSets.filter((_, i) => i % step === 0).slice(0, nSetSamples);
log(`family {${ns.join(',')}} k=${k}: VCs=${vcs.length} seedSets=${allSets.length} — STRIDED ${someSets.length} (every ${step}th) — buildSeeds…`);
const tb = Date.now();
const seeds = new SeedBuilder().buildSeeds(k, 1, { seedSetLoader: () => someSets });
const useSeeds = seeds.filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2);
log(`built ${useSeeds.length} useSeeds from ${someSets.length} strided sets in ${((Date.now() - tb) / 1000).toFixed(1)}s — profiling up to ${maxFills} (cap ${maxMs}ms)…`);

const fStep = Math.max(1, Math.floor(useSeeds.length / maxFills));
const picks: number[] = [];
for (let i = 0; i < useSeeds.length && picks.length < maxFills; i += fStep) picks.push(i);

const mss: number[] = [];
let timeouts = 0, finished = 0, totalCells = 0;
for (const i of picks) {
	const seed = useSeeds[i];
	const ts = Date.now();
	const { cells, diag } = new PeriodSolver(k).solve(seed, { maxMs });
	const ms = Date.now() - ts;
	mss.push(ms); totalCells += cells.length; if (diag.timedOut) timeouts++; else finished++;
	// classify the seed's polygon mix from its name (counts of each n in the multiset)
	const mix = seed.name.replace(/[\[\]]/g, '').split(';')[0]; // first VC as a coarse label
	log(
		`[${i}] mix0=${mix.slice(0, 22).padEnd(22)} cells=${cells.length} lat=${diag.candidateLattices} ` +
		`raw=${diag.rawCells} gateRej=${diag.gateRejected} fanLat=${diag.fanLattices} p0Skip=${diag.p0Skipped} ` +
		`${diag.timedOut ? 'TIMEOUT' : 'done   '} ${(ms / 1000).toFixed(1)}s`,
	);
}
mss.sort((a, b) => a - b);
console.log(
	`PROFILE-STRIDED family={${ns.join(',')}} profiled=${picks.length} finished=${finished} timedOut=${timeouts} ` +
	`(${((timeouts / picks.length) * 100).toFixed(0)}% timeout) totalCells=${totalCells} ` +
	`median=${((mss[Math.floor(mss.length / 2)] ?? 0) / 1000).toFixed(1)}s max=${((mss[mss.length - 1] ?? 0) / 1000).toFixed(1)}s`,
);
