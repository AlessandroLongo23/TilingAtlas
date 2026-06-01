/**
 * TEMPORARY diagnostic (docs/K2_DIAGNOSIS.md). Builds k=2 seeds in memory, then runs the
 * instrumented SeedExpander on a few of them to read the "tape" described in the doc:
 * frames climb rate, distinctAbs / distinctCanon re-exploration meters, branch factor, bit-length.
 *
 * Run: pnpm tsx scripts/diag-k2.ts            (threshold = 6k = 12, real)
 *      pnpm tsx scripts/diag-k2.ts 4          (reduced threshold)
 *      pnpm tsx scripts/diag-k2.ts 4 3        (threshold 4, run first 3 seeds)
 */
import {
	PolygonsGenerator,
	VCGenerator,
	PolygonType,
	type GeneratorParameters,
	CompatibilityGraph,
	SeedSetExtractor,
	SeedBuilder,
	SeedExpander,
	TranslationalCellExtractor,
	setActiveRing,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';

const thresholdArg = process.argv[2] ? parseInt(process.argv[2], 10) : null;
const seedLimit = process.argv[3] ? parseInt(process.argv[3], 10) : 3;
const runSeconds = process.argv[4] ? parseInt(process.argv[4], 10) : 20;
// canon mode: 'none' (true frame rate), 'interior' (canonicalPatchKey), 'full' (sound canonicalKey)
const canonMode = process.argv[5] ?? 'none';

const parameters: GeneratorParameters = {
	[PolygonType.REGULAR]: { ns: [3, 4, 6, 8, 12] },
};

function main() {
	setActiveRing(computeRing(parameters));
	const K = 2;

	process.stderr.write('[diag] building polygons / VCs / compat graph …\n');
	const polygonsGenerator = new PolygonsGenerator(parameters, []);
	const vcGen = new VCGenerator(polygonsGenerator.polygons);
	const vcs = vcGen.generateVertexConfigurations();

	const adjacency: Record<string, string[]> = {};
	for (const vc of vcs) adjacency[vc.name] = [];
	for (let i = 0; i < vcs.length; i++) {
		for (let j = i + 1; j < vcs.length; j++) {
			if (vcs[i].isCompatible(vcs[j])) {
				adjacency[vcs[i].name].push(vcs[j].name);
				adjacency[vcs[j].name].push(vcs[i].name);
			}
		}
	}

	const graph = CompatibilityGraph.fromAdjacencyList(adjacency, vcs);
	const extractor = new SeedSetExtractor(graph);
	const seedSets = extractor.findSeedSets(K);
	process.stderr.write(`[diag] k=${K}: ${seedSets.length} seed sets\n`);

	const builder = new SeedBuilder();
	const seedConfigs = builder.buildSeeds(K, 1, {
		seedSetLoader: () => seedSets,
	});
	process.stderr.write(`[diag] k=${K}: ${seedConfigs.length} seed configurations\n`);

	// only multi-VC seeds (effective m≥2) are the slow ones
	const multi = seedConfigs.filter(
		(sc) => new Set(sc.vertexConfigurations.map((vc) => vc.name)).size >= 2
	);
	process.stderr.write(`[diag] ${multi.length} seeds with ≥2 distinct VCs; running first ${seedLimit}\n`);

	const cellExtractor = new TranslationalCellExtractor();

	for (let i = 0; i < Math.min(seedLimit, multi.length); i++) {
		const seed = multi[i];
		const expander = new SeedExpander(K);
		if (thresholdArg != null) expander.threshold = thresholdArg;
		expander.debug = true;
		expander.debugMaxMs = runSeconds * 1000; // self-abort (DFS is synchronous)
		if (canonMode === 'interior') {
			expander.canonicalKeyFn = (polys) => cellExtractor.canonicalPatchKey(polys);
		} else if (canonMode === 'full') {
			expander.canonicalKeyFn = (polys) => cellExtractor.canonicalKey(polys);
		} // 'none' → leave undefined for true frame rate

		process.stderr.write(
			`\n[diag] ===== seed #${i} "${seed.name}" threshold=${expander.threshold} ` +
			`(cap ~${runSeconds}s) =====\n`
		);

		let count = 0;
		try {
			count = expander.expand(seed, () => {}) as number;
		} catch (e) {
			process.stderr.write(`[diag] seed #${i} threw: ${(e as Error).message}\n`);
		}
		process.stderr.write(`[diag] seed #${i} returned: ${count} leaves\n`);
	}

	process.stderr.write('\n[diag] done.\n');
}

main();
