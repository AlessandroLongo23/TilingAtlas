/* Verify WORKER — per seed, solves in BOTH torus and orbifold mode and streams back both serialized
 * cell sets, so the orchestrator can confirm (by congruence) that orbifold reproduces torus EXACTLY.
 * Mirrors scout-worker's seed build (guard #4: each worker rebuilds independently, identical ordering).
 *
 *   worker → coord : {"type":"ready","nSeeds":N}
 *   coord  → worker: {"idx":i}
 *   worker → coord : {"type":"result","idx":i,"name":..,"torus":[..],"orb":[..],
 *                     "torusTO":b,"orbTO":b,"consViol":b,"biViol":b,"tms":n,"oms":n}
 *   coord  → worker: {"stop":true}
 */
import readline from 'node:readline';
import { PeriodSolver } from '@/classes/algorithm/PeriodSolver';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import { serializeCell } from './scoutCodec';

const k = parseInt(process.argv[2] ?? '1', 10);
const ns = (process.argv[3] ?? '3,4,6,8,12').split(',').map(Number);
const maxMs = process.argv[4] ? parseInt(process.argv[4], 10) : 0; // 0 = no cap

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

const send = (o: unknown) => process.stdout.write(JSON.stringify(o) + '\n');
send({ type: 'ready', nSeeds: useSeeds.length });

const rl = readline.createInterface({ input: process.stdin });
rl.on('close', () => process.exit(0));
rl.on('line', (line) => {
	const trimmed = line.trim();
	if (!trimmed) return;
	const msg = JSON.parse(trimmed) as { idx?: number; stop?: boolean };
	if (msg.stop) { rl.close(); process.exit(0); }
	if (typeof msg.idx !== 'number') return;
	const seed = useSeeds[msg.idx];
	const t0 = Date.now();
	const torus = new PeriodSolver(k).solve(seed, { maxMs, mode: 'torus' });
	const t1 = Date.now();
	const orb = new PeriodSolver(k).solve(seed, { maxMs, mode: 'orbifold' });
	const t2 = Date.now();
	send({
		type: 'result', idx: msg.idx, name: seed.name,
		torus: torus.cells.map(serializeCell),
		orb: orb.cells.map(serializeCell),
		torusTO: torus.diag.timedOut, orbTO: orb.diag.timedOut,
		consViol: !!orb.diag.conservationViolated, biViol: !!orb.diag.branchInvariantViolated,
		tms: t1 - t0, oms: t2 - t1,
	});
});
