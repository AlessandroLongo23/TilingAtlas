/**
 * Fill-internals profiling driver. Builds real k-uniform seeds and runs the NORMAL solve() pipeline
 * (bounded per-seed candidate enumeration + torusFill) — NOT the scout's example-mode W(s)×W(s) pair
 * cross-product (which OOMs before any fill). Purpose: measure where torusFill spends time, at k=2/k=3,
 * without the family-build tax.
 *
 * Run under the profiler + cpu-prof:
 *   PS_FILL_PROFILE=1 node --cpu-prof --cpu-prof-dir=<dir> --import tsx \
 *     scripts/fill-profile-driver.ts <k> [maxSeeds] [maxMsPerSolve]
 *
 * The PS_FILL_PROFILE aggregate prints on process exit (across every solve). cpu-prof is subtree-
 * filterable to `torusFill` via scripts/analyze-cpuprofile.mjs --subtree torusFill.
 */
import { PeriodSolver } from '@/classes/algorithm/PeriodSolver';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import {
	PolygonsGenerator,
	VCGenerator,
	CompatibilityGraph,
	SeedSetExtractor,
	SeedBuilder,
	PolygonType,
	type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing } from '@/classes/Cyclotomic';
import type { SeedConfiguration as SeedConfigurationType } from '@/classes/algorithm/SeedConfiguration';

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns: [3, 4, 6, 8, 12] } };
setActiveRing(computeRing(params));

function buildSeeds(k: number): SeedConfigurationType[] {
	const pg = new PolygonsGenerator(params, []);
	const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
	const adj: Record<string, string[]> = {};
	for (const vc of vcs) adj[vc.name] = [];
	for (let i = 0; i < vcs.length; i++)
		for (let j = i + 1; j < vcs.length; j++)
			if (vcs[i].isCompatible(vcs[j])) {
				adj[vcs[i].name].push(vcs[j].name);
				adj[vcs[j].name].push(vcs[i].name);
			}
	const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
	const seedSets = new SeedSetExtractor(graph).findSeedSets(k);
	return new SeedBuilder().buildSeeds(k, 1, { seedSetLoader: () => seedSets });
}

const K = parseInt(process.argv[2] ?? '2', 10);
const MAX_SEEDS = process.argv[3] ? parseInt(process.argv[3], 10) : Infinity;
const MAX_MS = process.argv[4] ? parseInt(process.argv[4], 10) : 20000;

const t0 = Date.now();
let seeds = buildSeeds(K);
// Prefer genuinely multi-VC seeds (the expensive fills); keep order otherwise.
if (K >= 2) {
	seeds = seeds.filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2);
}
const chosen = seeds.slice(0, MAX_SEEDS);
process.stderr.write(`[driver] k=${K}: built ${seeds.length} seeds (multi-VC${K >= 2 ? ' filtered' : ''}), solving ${chosen.length} (maxMs=${MAX_MS}/solve)\n`);

// DRIVER_DIGEST=1: collect DISTINCT canonical keys of emitted cells across all seeds → a deterministic
// byte-identical fingerprint of the enumeration output (fast alternative to the scout's congruence match;
// meaningful only for fully-terminating runs, e.g. k=1 uncapped).
const digestKeys = process.env.DRIVER_DIGEST === '1' ? new Set<string>() : null;
const extractor = digestKeys ? new TranslationalCellExtractor() : null;

let totalCells = 0, totalRaw = 0, totalGateRej = 0, timedOut = 0, totVbelowK = 0, totP2 = 0;
for (let i = 0; i < chosen.length; i++) {
	const seed = chosen[i];
	const ts = Date.now();
	const { cells, diag } = new PeriodSolver(K).solve(seed, { maxMs: MAX_MS });
	const ms = Date.now() - ts;
	if (digestKeys && extractor) for (const c of cells) digestKeys.add(extractor.canonicalKey(c.cellPolygons));
	totalCells += cells.length; totalRaw += diag.rawCells; totalGateRej += diag.gateRejected;
	totVbelowK += diag.vBelowKSkipped; totP2 += diag.p2Skipped;
	if (diag.timedOut) timedOut++;
	process.stderr.write(
		`[driver] #${String(i + 1).padStart(3)}/${chosen.length} ${seed.name.slice(0, 40).padEnd(40)} ` +
		`${String(ms).padStart(7)}ms cells=${cells.length} raw=${diag.rawCells} gateRej=${diag.gateRejected}${diag.timedOut ? ' ⟨TIMEOUT⟩' : ''}\n`,
	);
}
process.stderr.write(
	`[driver] DONE k=${K}: ${chosen.length} solves in ${((Date.now() - t0) / 1000).toFixed(1)}s — ` +
	`cells ${totalCells}, raw ${totalRaw}, gateRej ${totalGateRej}, timedOut ${timedOut}\n`,
);
process.stderr.write(`[driver] OP-1 split (Rank-2 target): vBelowKSkipped ${totVbelowK} + p2Skipped ${totP2} = ${totVbelowK + totP2} closures discarded post-certificate\n`);
if (digestKeys) {
	const sorted = [...digestKeys].sort();
	let h = 5381n;
	for (const ch of sorted.join('|')) h = ((h * 33n) ^ BigInt(ch.codePointAt(0)!)) & 0xffffffffffffffffn;
	process.stderr.write(`[driver] DIGEST k=${K}: ${digestKeys.size} distinct canonical keys, hash=${h.toString(16)}\n`);
}
