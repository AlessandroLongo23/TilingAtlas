/* C2 calibration (NOT core code): measure k=4 scout SCALE + localize the wall before a long run.
 * Logs each pipeline stage to stderr (flushed) with elapsed time + counts, so a blow-up is VISIBLE and
 * attributable (polygons → VCs → compat graph → findSeedSets → buildSeeds → filter). Stage 2 (stride>0)
 * profiles useSeeds at indices 0, stride, 2·stride, … under a per-seed cap.
 * Run: PS_PROFILE=1 pnpm tsx scripts/scale-k4.ts [maxMsPerSeed=30000] [stride=0] [family=3,4,6,8,12]
 * Mirrors scout-worker.ts seed-building EXACTLY so indices line up with a real scout run. */
import { PeriodSolver } from '@/classes/algorithm/PeriodSolver';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';

const k = 4;
const maxMs = process.argv[2] ? parseInt(process.argv[2], 10) : 30000;
const stride = process.argv[3] ? parseInt(process.argv[3], 10) : 0;
const ns = (process.argv[4] ?? '3,4,6,8,12').split(',').map(Number);

const T0 = Date.now();
const log = (m: string) => process.stderr.write(`[t+${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}\n`);

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns } };
const baseRing = computeRing(params);
const ring = baseRing.N === 24 ? baseRing : CyclotomicRing.create(24);
setActiveRing(ring);
log(`ring N=${ring.N} (baseRing N=${baseRing.N})  family {${ns.join(',')}}  k=${k}`);

const pg = new PolygonsGenerator(params, []);
log(`polygons=${pg.polygons.length}`);
const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
log(`VCs=${vcs.length} — building compatibility graph…`);
const adj: Record<string, string[]> = {};
for (const vc of vcs) adj[vc.name] = [];
let edges = 0;
for (let i = 0; i < vcs.length; i++)
	for (let j = i + 1; j < vcs.length; j++)
		if (vcs[i].isCompatible(vcs[j])) { adj[vcs[i].name].push(vcs[j].name); adj[vcs[j].name].push(vcs[i].name); edges++; }
const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
log(`compat edges=${edges} — findSeedSets(${k})…  [if this is the last line, seed-set enumeration is the wall]`);
const seedSets = new SeedSetExtractor(graph).findSeedSets(k);
log(`seedSets=${seedSets.length} — buildSeeds(${k})…  [if this is the last line, seed expansion is the wall]`);
const seeds = new SeedBuilder().buildSeeds(k, 1, { seedSetLoader: () => seedSets });
const useSeeds = k >= 2 ? seeds.filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2) : seeds;
log(`seeds(raw)=${seeds.length}  useSeeds(>=2 distinct VC)=${useSeeds.length}  — seed-build DONE`);
console.log(`SUMMARY family={${ns.join(',')}} k=${k}: polygons=${pg.polygons.length} VCs=${vcs.length} edges=${edges} seedSets=${seedSets.length} seeds=${seeds.length} useSeeds=${useSeeds.length} buildSecs=${((Date.now() - T0) / 1000).toFixed(1)}`);

if (stride <= 0) { log('stride=0 → counts only; done'); process.exit(0); }

log(`profiling every ${stride}th of ${useSeeds.length} useSeeds (cap ${maxMs}ms)…`);
const mss: number[] = [];
let timeouts = 0, totalCells = 0, n = 0;
for (let i = 0; i < useSeeds.length; i += stride) {
	const seed = useSeeds[i];
	const ts = Date.now();
	const { cells, diag } = new PeriodSolver(k).solve(seed, { maxMs });
	const ms = Date.now() - ts;
	mss.push(ms); totalCells += cells.length; if (diag.timedOut) timeouts++; n++;
	log(
		`[${i}] ${seed.name.slice(0, 40).padEnd(40)} cells=${cells.length} lat=${diag.candidateLattices} ` +
		`tried=${diag.latticesTried} raw=${diag.rawCells} gateRej=${diag.gateRejected} fanLat=${diag.fanLattices} ` +
		`p0Skip=${diag.p0Skipped} p1Prune=${diag.p1Pruned} ${diag.timedOut ? 'TIMEOUT ' : ''}${(ms / 1000).toFixed(1)}s`,
	);
}
mss.sort((a, b) => a - b);
console.log(
	`PROFILE family={${ns.join(',')}} profiled=${n} timedOut=${timeouts} totalCells=${totalCells} ` +
	`median=${((mss[Math.floor(n / 2)] ?? 0) / 1000).toFixed(1)}s max=${((mss[n - 1] ?? 0) / 1000).toFixed(1)}s`,
);
