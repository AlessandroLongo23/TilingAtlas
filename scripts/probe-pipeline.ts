/* Validate PeriodSolver over the full k seed set. Run: pnpm tsx scripts/probe-pipeline.ts [k] */
import { VertexConfiguration } from '@/classes/algorithm/VertexConfiguration';
import { SeedConfiguration } from '@/classes/algorithm/SeedConfiguration';
import { PeriodSolver } from '@/classes/algorithm/PeriodSolver';
import { KUniformityChecker } from '@/classes/algorithm/KUniformityChecker';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing } from '@/classes/Cyclotomic';

const k = parseInt(process.argv[2] ?? '1', 10);
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
// Keep only genuinely multi-VC seeds for k≥2 (mirrors the test's filter).
const useSeeds = k >= 2 ? seeds.filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2) : seeds;
console.log(`k=${k}: ${seeds.length} seeds (${useSeeds.length} used)`);

const extractor = new TranslationalCellExtractor();
const checker = new KUniformityChecker();
const seenCanonical = new Set<string>();
let total = 0, capped = 0;
const t0 = Date.now();
for (let i = 0; i < useSeeds.length; i++) {
	const seed = useSeeds[i];
	const ts = Date.now();
	const { cells, diag } = new PeriodSolver(k).solve(seed, { maxMs: 120000 });
	const ms = Date.now() - ts;
	let added = 0;
	for (const c of cells) {
		const key = extractor.canonicalKey(c.cellPolygons);
		if (seenCanonical.has(key)) continue;
		seenCanonical.add(key);
		added++;
		total++;
	}
	if (diag.timedOut) capped++;
	if (ms > 3000 || diag.timedOut || added > 0)
		console.log(
			`  [${i}] ${seed.name.padEnd(28)} +${added} (cells=${cells.length}) ` +
			`lat=${diag.candidateLattices} raw=${diag.rawCells} gateRej=${diag.gateRejected} ${ms}ms${diag.timedOut ? ' TIMEOUT' : ''}`
		);
}
console.log(`\nk=${k}: ${total} distinct tilings, ${capped} seeds timed out, ${((Date.now() - t0) / 1000).toFixed(1)}s total`);
// Deterministic-composition fingerprint: sort the canonical cell keys and digest them. Two runs must
// print the SAME digest (count alone is not enough — the old discovery gave 15 with shifting members).
const sorted = [...seenCanonical].sort();
let h = 5381n;
for (const c of sorted.join('|')) h = ((h * 33n) ^ BigInt(c.codePointAt(0)!)) & 0xffffffffffffffffn;
console.log(`COMPOSITION digest=${h.toString(16)} count=${sorted.length}`);
