/* Parallel-scout WORKER (parallelization v1, SYNC 2026-06-04). One process per core. Rebuilds the
 * ring + seed list itself (guard #4 — no shared mutable state), then solves seed indices handed to it
 * by the coordinator over stdin and streams back serialized exact cells over stdout as NDJSON.
 *
 * Protocol (all single-line JSON):
 *   worker → coord : {"type":"ready","nSeeds":N}                       once, after build
 *   coord  → worker: {"idx":i}                                         solve useSeeds[i]
 *   worker → coord : {"type":"result","idx":i,"name":..,"cells":[..],"timedOut":b,"ms":n,"diag":{..}}
 *     (diag is ADDITIVE — the coordinator's reduce/digest ignore it; it feeds the emitter only.)
 *   coord  → worker: {"stop":true}                                     exit
 *
 * stdout carries ONLY protocol JSON — all diagnostics go to stderr (inherited) so the stream stays clean.
 */
import readline from 'node:readline';
import fs from 'node:fs';
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

// OP-2: per-worker NDJSON census stream (opt-in via PS_LATTICE_CENSUS=1).
// No mkdir here: the coordinator (scout-parallel.ts) mkdirs .scout-cache before spawning workers.
const censusStream = process.env.PS_LATTICE_CENSUS === '1'
	? fs.createWriteStream(`.scout-cache/lattice-census-k${k}.${process.pid}.ndjson`, { flags: 'a' })
	: null;
const maxMs = process.argv[4] ? parseInt(process.argv[4], 10) : 0; // 0 = no wall-clock cap (guard #2)

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns } };
const baseRing = computeRing(params);
// Surd enumeration is N=24-only; force the containing ring exactly as scripts/probe-pipeline.ts does.
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
// Same seed filter as the serial probe — identical ordering ⇒ index i means the SAME seed in every worker.
const useSeeds = k >= 2 ? seeds.filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2) : seeds;

const send = (o: unknown) => process.stdout.write(JSON.stringify(o) + '\n');
send({ type: 'ready', nSeeds: useSeeds.length });

const rl = readline.createInterface({ input: process.stdin });
// Orphan-safety: if the coordinator dies, our stdin closes — exit instead of hanging forever waiting
// for the next assignment (a mid-solve worker finishes its current seed first, then this fires). Also
// covers the normal `{stop}` path (rl.close() emits 'close'). Without this, an unclean coordinator
// death leaves workers burning a core. (DEVELOPMENT_NOTES §17.4.)
rl.on('close', () => process.exit(0));
rl.on('line', (line) => {
	const trimmed = line.trim();
	if (!trimmed) return;
	const msg = JSON.parse(trimmed) as { idx?: number; stop?: boolean };
	if (msg.stop) {
		// process.exit() does NOT flush fs.WriteStream buffers — end() the census stream and exit in its flush callback.
		// (No rl.close() here: it emits 'close' synchronously and the handler above would exit before the flush lands.)
		censusStream ? censusStream.end(() => process.exit(0)) : process.exit(0);
		return;
	}
	if (typeof msg.idx !== 'number') return;
	const seed = useSeeds[msg.idx];
	const ts = Date.now();
	const solveOpts: Parameters<InstanceType<typeof PeriodSolver>['solve']>[1] = { maxMs };
	if (censusStream) {
		solveOpts.onCandidateLattices = (lattices) => {
			censusStream.write(JSON.stringify({ seed: seed.name, k, lattices }) + '\n');
		};
	}
	const { cells, diag } = new PeriodSolver(k).solve(seed, solveOpts);
	send({
		type: 'result',
		idx: msg.idx,
		name: seed.name,
		cells: cells.map(serializeCell),
		timedOut: diag.timedOut,
		ms: Date.now() - ts,
		diag, // additive: forwarded for the emitter's diagnostics; coordinator reduce ignores it
	});
});
