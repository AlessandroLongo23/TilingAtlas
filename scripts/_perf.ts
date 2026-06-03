/* TEMP perf probe: time candidateLattices per k=2 seed. Run: pnpm tsx scripts/_perf.ts */
import { appendFileSync, writeFileSync } from 'node:fs';
import { PeriodSolver } from '@/classes/algorithm/PeriodSolver';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing } from '@/classes/Cyclotomic';

const LOG = '/tmp/perf.log';
const log = (s: string) => { appendFileSync(LOG, s + '\n'); };
writeFileSync(LOG, '');

const k = 2;
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
const seedSets = new SeedSetExtractor(graph).findSeedSets(k);
const seeds = new SeedBuilder().buildSeeds(k, 1, { seedSetLoader: () => seedSets });
const useSeeds = seeds.filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2);
log(`k=2: ${useSeeds.length} seeds`);

const mode = process.argv[2] ?? 'gen'; // 'gen' = candidateLattices only; 'full' = real solve
const extractor = new TranslationalCellExtractor();
const seen = new Set<string>();
let total = 0, timeouts = 0;
const tAll = Date.now();
for (let i = 0; i < useSeeds.length; i++) {
	const seed = useSeeds[i];
	process.stderr.write(`[seed ${i}] ${seed.name}\n`);
	const t = Date.now();
	const { cells, diag } = new PeriodSolver(k).solve(seed, { maxMs: mode === 'full' ? 20000 : 1 });
	const ms = Date.now() - t;
	let added = 0;
	for (const c of cells) {
		const key = extractor.canonicalKey(c.cellPolygons);
		if (seen.has(key)) continue;
		seen.add(key); added++; total++;
	}
	if (diag.timedOut) timeouts++;
	log(`  [${i}] ${seed.name.padEnd(30)} cand=${diag.candidateLattices} cells=${cells.length} +${added} ${ms}ms${diag.timedOut ? ' TIMEOUT' : ''}`);
}
log(`done: ${total} distinct tilings, ${timeouts} timeouts, ${((Date.now() - tAll) / 1000).toFixed(1)}s`);
