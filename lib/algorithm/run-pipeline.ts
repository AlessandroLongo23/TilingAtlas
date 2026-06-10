/**
 * Standalone script to run the tiling generation pipeline with real-time progress logging.
 * Run with: pnpm run pipeline
 *
 * Unlike the test file, this shows progress immediately (like tqdm in Python).
 */

import {
	PolygonsGenerator,
	VCGenerator,
	PolygonType,
	type GeneratorParameters,
	PolygonSignature,
	CompatibilityGraph,
	SeedSetExtractor,
	VertexConfiguration,
	SeedBuilder,
	SeedExpander,
	SeedConfiguration,
	type CompactSeedConfiguration,
	type CompactSeedConfigurationShort,
	type FullSeedConfiguration,
	TranslationalCellExtractor,
	KUniformityChecker,
	PeriodSolver,
	Vector,
	RegularPolygon,
	StarRegularPolygon,
	StarParametricPolygon,
	EquilateralPolygon,
	GenericPolygon,
	Cyclotomic,
	getActiveRing,
	setActiveRing,
} from "@/classes";
import { computeRing } from "@/classes/algorithm/PolygonsGenerator";
import { dsymPipeline } from "@/lib/algorithm/dsym-pipeline";
import { dedupeByCongruence } from "@/classes/algorithm/TilingCongruence";
import type { PeriodCell } from "@/classes/algorithm/PeriodSolver";
import { AlgorithmTilingGenerator } from "@/classes/algorithm/TilingGenerator";
import { comparePolygonNames, compareVertexConfigurationNames, roundNumbersInJson, toRadians, getEffectiveUniqueCount } from "@/utils";
import { BATCH_SIZE } from "@/lib/constants";
import { PipelineLogger } from "@/lib/algorithm/PipelineLogger";
import { buildParamsFolderName } from "@/lib/algorithm/paramsFolder";
import fs from "node:fs";
import zlib from "node:zlib";

/** Output path for CLI pipeline. Use ./pipeline-output when running locally (src/lib/data removed). */
const DATA_FOLDER_PATH = 'pipeline-output';

/** Base path for a polygon type (paramsFolder). Type is the outer folder. */
function typeBasePath(paramsFolder: string): string {
	return `${DATA_FOLDER_PATH}/${paramsFolder}`;
}

/** Encode polygon for storage (short format). Prefers the exact generator-level form
 *  (anchor + integer direction index) so vertices reconstruct exactly via the boundary walk. */
function polygonToShort(enc: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = { t: enc.type, n: enc.n };
	if (enc.anchor && enc.dir != null) {
		out.a = enc.anchor; // exact { n: string[], d: string }
		out.dir = enc.dir; // integer ζ-exponent
	} else if (enc.vertices && Array.isArray(enc.vertices)) {
		out.v = (enc.vertices as { x: number; y: number }[]).map((v) => [v.x, v.y]);
	}
	if (enc.sides) out.s = enc.sides;
	if (enc.angles) out.an = enc.angles;
	if (enc.d != null) out.d = enc.d;
	if (enc.alpha != null) out.alpha = enc.alpha;
	return out;
}

/** Decode polygon from short format to Polygon instance. Exact path when anchor+dir present. */
function polygonFromShort(enc: Record<string, unknown>) {
	const type = (enc.t ?? enc.type) as string;
	// Exact reconstruction: anchor (exact) + integer direction → boundary walk.
	if (enc.a && typeof enc.a === "object" && !Array.isArray(enc.a) && enc.dir != null) {
		const ring = getActiveRing();
		const anchor = Cyclotomic.decode(ring, enc.a as { n: string[]; d: string });
		const n = (enc.n ?? 0) as number;
		// only regular polygons are on the exact gate path
		return RegularPolygon.fromAnchorAndDirExact(n, anchor, enc.dir as number);
	}
	const v = enc.v as [number, number][] | undefined;
	const vertices = v
		? v.map((p) => new Vector(p[0], p[1]))
		: (enc.vertices as { x: number; y: number }[])?.map((p) =>
				Array.isArray(p) ? new Vector(p[0], p[1]) : new Vector(p.x, p.y)
			) ?? [];
	switch (type) {
		case PolygonType.REGULAR:
			return RegularPolygon.fromVertices(vertices);
		case PolygonType.STAR_REGULAR:
			return StarRegularPolygon.fromVertices(vertices);
		case PolygonType.STAR_PARAMETRIC:
			return StarParametricPolygon.fromVertices(vertices);
		case PolygonType.EQUILATERAL:
			return EquilateralPolygon.fromVertices(vertices);
		case PolygonType.GENERIC:
			return GenericPolygon.fromVertices(vertices);
		default:
			return RegularPolygon.fromVertices(vertices);
	}
}

// k=1 reproduces 11 exactly. Expansion hot paths optimized (fused transform, lite float refresh,
// trig-free toVector, coincident-skip collision, intermediate-state DAG memoization). Validating
// k=2 → 20; bump toward 6 as each k is confirmed.
const MAX_K = 2;

const parameters: GeneratorParameters = {
	[PolygonType.REGULAR]: {
		// k-uniform gate set: the regular polygons that tile edge-to-edge → N = 24.
		ns: [3, 4, 6, 8, 12],
	},
};

main();

function main() {
	// One shared cyclotomic ring per run, derived from the enabled polygons (spec §5).
	setActiveRing(computeRing(parameters));

	const additionalPolygons: PolygonSignature[] = [];

	for (const p of additionalPolygons) {
		if (parameters[p.type] === PolygonType.EQUILATERAL) {
			for (let i = 1; i <= p.angles.length; i++) {
				const cycledAngles = p.angles.slice(i).concat(p.angles.slice(0, i));
				additionalPolygons.push(new PolygonSignature({
					type: PolygonType.EQUILATERAL,
					n: p.n,
					angles: cycledAngles.map(a => toRadians(a))
				}))
			}
		}
	}

	const log = new PipelineLogger();
	log.log('Tiling generation pipeline\n' + '='.repeat(50));

	if (!fs.existsSync(DATA_FOLDER_PATH)) fs.mkdirSync(DATA_FOLDER_PATH, { recursive: true });

	const paramsFolder = buildParamsFolderName(parameters);
	log.log(`Polygon set: ${paramsFolder}\n`);

	const polygonSignatures = polygonGeneration(parameters, additionalPolygons, paramsFolder, log);
	const vertexConfigurations = vertexConfigurationGeneration(polygonSignatures, paramsFolder, log);

	if (process.env.USE_DSYM === '1') {
		// Delaney–Dress (third enumeration engine). Skips seeds/compat/expand — D-D does not use
		// seeds. M0/M1 = Stage-1 wall probe only (no realizer; M2 gated on the count curve). With
		// USE_DSYM unset this branch is dead, so the certified torus/orbifold path is byte-identical.
		dsymPipeline(vertexConfigurations, paramsFolder, MAX_K, log);
		log.log('='.repeat(50));
		log.log('Pipeline complete (USE_DSYM)!');
		return;
	}

	const adjacencyList = compatibilityGraphGeneration(vertexConfigurations, paramsFolder, log);
	seedSetExtraction(adjacencyList, vertexConfigurations, paramsFolder, log);
	seedsGeneration(paramsFolder, null, null, log);

	if (process.env.USE_PERIOD_SOLVER === '1') {
		// Solve-for-period path (docs/DEVELOPMENT_NOTES.md §8.1): go straight from each seed to its
		// fundamental cell(s) by fixing the period and filling the bounded torus — replacing the
		// expand-to-radius-6k + extract path. Bounded even for the hard seeds that the expander could
		// not finish. Writes the same translationalCells output the downstream stages consume.
		for (let k = 1; k <= MAX_K; k++) periodSolveForK(paramsFolder, k, log);
	} else {
		seedsExpansion(paramsFolder, null, null, log);
		extractTranslationalCell(paramsFolder, null, null, log);
	}
	tilingsGeneration(paramsFolder, 1, 1, log);

	log.log('='.repeat(50));
	log.log('Pipeline complete!');
}

function polygonGeneration(
	parameters: GeneratorParameters,
	additionalPolygons: PolygonSignature[],
	paramsFolder: string,
	log: PipelineLogger
): PolygonSignature[] {
	return log.runStep('Polygon generation', () => {
		const polygonsGenerator = new PolygonsGenerator(parameters, additionalPolygons);
		const base = typeBasePath(paramsFolder);
		if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
		const polygonsPath = `${base}/polygons.json`;
		let savedPolygons: string[] = [];
		if (fs.existsSync(polygonsPath)) {
			const fileData = fs.readFileSync(polygonsPath, 'utf-8');
			if (fileData.trim()) {
				savedPolygons = JSON.parse(fileData);
			}
		}
		const newPolygonNames = polygonsGenerator.polygons.map((p) => p.name);
		for (const name of newPolygonNames) {
			if (!savedPolygons.includes(name)) {
				savedPolygons.push(name);
			}
		}
		savedPolygons.sort((a, b) => comparePolygonNames(a, b));
		fs.writeFileSync(polygonsPath, JSON.stringify(savedPolygons, null, 4));
		return polygonsGenerator.polygons;
	});
}

function vertexConfigurationGeneration(
	polygonSignatures: PolygonSignature[],
	paramsFolder: string,
	log: PipelineLogger
): VertexConfiguration[] {
	return log.runStep('Vertex configuration generation', () => {
		const vcGenerator = new VCGenerator(polygonSignatures);
		const vertexConfigurations = vcGenerator.generateVertexConfigurations();
		const base = typeBasePath(paramsFolder);
		if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
		const vcsPath = `${base}/vcs.json`;
		let savedVCs: string[] = [];
		if (fs.existsSync(vcsPath)) {
			const fileData = fs.readFileSync(vcsPath, 'utf-8');
			if (fileData.trim()) {
				savedVCs = JSON.parse(fileData);
			}
		}
		const newVCNames = vertexConfigurations.map((vc) => vc.name);
		for (const name of newVCNames) {
			if (!savedVCs.includes(name)) {
				savedVCs.push(name);
			}
		}
		savedVCs.sort((a, b) => compareVertexConfigurationNames(a, b));
		fs.writeFileSync(vcsPath, JSON.stringify(savedVCs, null, 4));
		return vertexConfigurations;
	});
}

function compatibilityGraphGeneration(
	vertexConfigurations: VertexConfiguration[],
	paramsFolder: string,
	log: PipelineLogger
): Record<string, string[]> {
	return log.runStep('Compatibility graph', () => {
		const base = typeBasePath(paramsFolder);
		if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
		const compatPath = `${base}/compatibilityGraph.json`;
		let adjacencyList: Record<string, string[]> = {};
		if (fs.existsSync(compatPath)) {
			const fileData = fs.readFileSync(compatPath, 'utf-8');
			if (fileData.trim()) {
				try {
					const parsed = JSON.parse(fileData);
					if (typeof parsed === 'object' && !Array.isArray(parsed)) {
						adjacencyList = parsed;
					}
				} catch {}
			}
		}

		for (const vc of vertexConfigurations) {
			if (!adjacencyList[vc.name]) adjacencyList[vc.name] = [];
		}

		const total = (vertexConfigurations.length * (vertexConfigurations.length - 1)) / 2;
		let checked = 0;
		for (let i = 0; i < vertexConfigurations.length; i++) {
			const nameA = vertexConfigurations[i].name;
			for (let j = i + 1; j < vertexConfigurations.length; j++) {
				checked++;
				log.progress('Pairs', checked, total);
				const nameB = vertexConfigurations[j].name;
				if (adjacencyList[nameA].includes(nameB)) continue;

				if (vertexConfigurations[i].isCompatible(vertexConfigurations[j])) {
					adjacencyList[nameA].push(nameB);
					adjacencyList[nameB].push(nameA);
				}
			}
		}

		fs.writeFileSync(compatPath, JSON.stringify(adjacencyList));
		log.clearLine();
		return adjacencyList;
	});
}

function seedSetExtraction(
	adjacencyList: Record<string, string[]>,
	vertexConfigurations: VertexConfiguration[],
	paramsFolder: string,
	log: PipelineLogger
): void {
	log.runStep('Seed set extraction', () => {
		const compatibilityGraph = CompatibilityGraph.fromAdjacencyList(
			adjacencyList,
			vertexConfigurations
		);
		const extractor = new SeedSetExtractor(compatibilityGraph);

		const baseFolderPath = `${typeBasePath(paramsFolder)}/seedSets`;
		if (!fs.existsSync(baseFolderPath)) {
			fs.mkdirSync(baseFolderPath, { recursive: true });
		}

		for (let k = 1; k <= MAX_K; k++) {
			const folderPath = `${baseFolderPath}/k=${k}`;
			if (!fs.existsSync(folderPath)) {
				fs.mkdirSync(folderPath, { recursive: true });
			}
			const start: number = performance.now();
			const seedSets: string[][] = extractor.findSeedSets(k);
			const end: number = performance.now();
			console.log(`k=${k}: found ${seedSets.length} seed sets in ${end - start} milliseconds`);

			const seedSetsByM = new Map<number, string[][]>();
			for (const seedSet of seedSets) {
				const m = new Set(seedSet).size;
				if (!seedSetsByM.has(m)) {
					seedSetsByM.set(m, []);
				}
				seedSetsByM.get(m)?.push(seedSet);
			}

			for (const [m, sets] of seedSetsByM.entries()) {
				console.log(`k=${k}, m=${m}: writing ${sets.length} seed sets`);
				const filePath = `${baseFolderPath}/k=${k}/m=${m}.json`;
				if (!fs.existsSync(filePath)) {
					fs.writeFileSync(filePath, JSON.stringify(sets, null, 4));
				}
			}
		}
		log.clearLine();
	});
}

function seedsGeneration(
	paramsFolder: string,
	k: number | null,
	m: number | null,
	log: PipelineLogger
): void {
	const loadAllForK = loadAllSeedSetsForK(paramsFolder);
	if (k === null) {
		for (let kVal = 1; kVal <= MAX_K; kVal++) {
			generateSeedsForK(paramsFolder, loadAllForK, kVal, log);
		}
	} else {
		generateSeedsForK(paramsFolder, loadAllForK, k, log);
	}
}

function generateSeedsForK(
	paramsFolder: string,
	loadAllForK: (k: number) => Map<number, string[][]>,
	k: number,
	log: PipelineLogger
): void {
	log.runStep(
		`Seeds generation for k=${k}`,
		() => {
			const byM = loadAllForK(k);
			const allSeedSets = [...byM.values()].flat();
			if (allSeedSets.length === 0) return 0;

			const seedSetLoader = (_k: number, _m: number) => allSeedSets;
			const vcLibrary = ensureVcLibrary(paramsFolder);
			const seedBuilder = new SeedBuilder();
			const seedConfigurations = seedBuilder.buildSeeds(k, 1, {
				seedSetLoader,
				onProgress: log.progressForSeeds('Seed sets')
			});
			log.clearLine();

			const byEffectiveM = new Map<number, typeof seedConfigurations>();
			for (const sc of seedConfigurations) {
				const vcNames = sc.vertexConfigurations.map((vc) => vc.name);
				const effectiveM = getEffectiveUniqueCount(vcNames);
				if (!byEffectiveM.has(effectiveM)) byEffectiveM.set(effectiveM, []);
				byEffectiveM.get(effectiveM)!.push(sc);
			}

			let totalWritten = 0;
			for (const [effectiveM, seeds] of byEffectiveM.entries()) {
				const folderPath = `${typeBasePath(paramsFolder)}/seedConfigurations/k=${k}/m=${effectiveM}`;
				if (!fs.existsSync(folderPath)) {
					fs.mkdirSync(folderPath, { recursive: true });
				}

				const compactData = log.mapWithProgress(
					seeds,
					`Encoding m=${effectiveM}`,
					(sc) => sc.encodeCompact(vcLibrary, true),
					1
				);

				const total = compactData.length;
				const totalBatches = Math.ceil(total / BATCH_SIZE);
				for (let i = 0; i < total; i += BATCH_SIZE) {
					const batchIndex = Math.floor(i / BATCH_SIZE);
					log.progress('Writing batches', batchIndex + 1, totalBatches);
					const batch = compactData.slice(i, i + BATCH_SIZE);
					const rounded = roundNumbersInJson(batch) as typeof batch;
					const json = JSON.stringify(rounded);
					const compressed = zlib.gzipSync(json, { level: 9 });
					const filePath = `${folderPath}/seedConfigurations_${String(batchIndex).padStart(4, '0')}.json.gz`;
					fs.writeFileSync(filePath, compressed);
				}

				const manifest = { format: 'compact', vcLibrary: true, shortKeys: true, compressed: true, total, batchSize: BATCH_SIZE };
				fs.writeFileSync(`${folderPath}/manifest.json`, JSON.stringify(manifest));
				totalWritten += total;
			}
			log.clearLine();
			return totalWritten;
		},
		(count) => log.log(`  → ${count} seeds`)
	);
}

function seedsExpansion(
	paramsFolder: string,
	k: number | null,
	m: number | null,
	log: PipelineLogger
): void {
	if (k === null) {
		for (let kVal = 1; kVal <= MAX_K; kVal++) {
			expandSeedsForK(paramsFolder, kVal, m, log);
		}
	} else {
		expandSeedsForK(paramsFolder, k, m, log);
	}
}

function expandSeedsForK(
	paramsFolder: string,
	k: number,
	m: number | null,
	log: PipelineLogger
): void {
	log.runStep(
		`Seed expansion for k=${k}`,
		() => {
			const expander = new SeedExpander(k);
			// Per-seed wall-clock cap so one pathological hard seed (deep threshold=6k DFS) cannot
			// stall the whole run. Capped seeds are logged below (no silent truncation).
			expander.maxExpandMs = k >= 2 ? 90_000 : 0;
			let processed = 0;
			let expanded = 0;
			let entropyWalls = 0;
			let deadEnds = 0;
			let cappedSeeds = 0;
			const cappedNames: string[] = [];

			const basePath = `${typeBasePath(paramsFolder)}/seedConfigurations/k=${k}`;
			if (!fs.existsSync(basePath)) return 0;

			let totalToProcess = 0;
			const mDirsToProcess: { mDir: string; mVal: number }[] = [];
			const mDirs = fs.readdirSync(basePath).filter((d) => d.startsWith('m='));
			for (const mDir of mDirs) {
				const mVal = parseInt(mDir.replace('m=', ''), 10);
				if (m !== null && mVal !== m) continue;
				const manifestPath = `${basePath}/${mDir}/manifest.json`;
				if (!fs.existsSync(manifestPath)) continue;
				const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
				totalToProcess += manifest.total ?? 0;
				mDirsToProcess.push({ mDir, mVal });
			}

			if (totalToProcess === 0) return 0;

			for (const { mDir, mVal } of mDirsToProcess) {
				const { configs, vcLibrary } = loadSeedConfigBatches(paramsFolder, k, mVal);
				const folderPath = `${typeBasePath(paramsFolder)}/expandedSeeds/k=${k}/m=${mVal}`;
				if (!fs.existsSync(folderPath)) {
					fs.mkdirSync(folderPath, { recursive: true });
				}

				let batch: { n: string; p: Record<string, unknown>[] }[] = [];
				let batchIndex = 0;
				let totalItems = 0;

				for (let i = 0; i < configs.length; i++) {
					processed++;
					log.progress('Seeds', processed, totalToProcess);
					const seed = SeedConfiguration.decodeCompact(
						configs[i] as CompactSeedConfiguration | CompactSeedConfigurationShort,
						vcLibrary,
					);
					const count = expander.expand(seed, (patch) => {
						const encodedPolygons = patch.map((p) =>
							polygonToShort(p.encode() as Record<string, unknown>)
						);
						batch.push({
							n: seed.name,
							p: roundNumbersInJson(encodedPolygons) as Record<string, unknown>[],
						});
						if (batch.length >= BATCH_SIZE) {
							const json = JSON.stringify(batch);
							const compressed = zlib.gzipSync(json, { level: 9 });
							fs.writeFileSync(
								`${folderPath}/expandedSeeds_${String(batchIndex).padStart(4, '0')}.json.gz`,
								compressed
							);
							totalItems += batch.length;
							batch = [];
							batchIndex++;
						}
					}) as number;
					if (expander.lastExpandCapped) {
						cappedSeeds++;
						cappedNames.push(seed.name);
					}
					if (count > 0) {
						expanded += count;
					} else {
						deadEnds++;
					}
				}

				if (batch.length > 0) {
					const json = JSON.stringify(batch);
					const compressed = zlib.gzipSync(json, { level: 9 });
					fs.writeFileSync(
						`${folderPath}/expandedSeeds_${String(batchIndex).padStart(4, '0')}.json.gz`,
						compressed
					);
					totalItems += batch.length;
				}

				if (totalItems > 0) {
					fs.writeFileSync(
						`${folderPath}/manifest.json`,
						JSON.stringify({
							format: 'full',
							shortKeys: true,
							compressed: true,
							total: totalItems,
							batchSize: BATCH_SIZE,
						})
					);
				}
			}
			log.clearLine();
			return { expanded, entropyWalls, deadEnds, processed, cappedSeeds, cappedNames };
		},
		(result) => {
			if (typeof result === 'number' && result === 0) return;
			const r = result as {
				expanded: number; entropyWalls: number; deadEnds: number; processed: number;
				cappedSeeds: number; cappedNames: string[];
			};
			log.log(
				`  → ${r.expanded} fully expanded, ${r.entropyWalls} entropy walls, ${r.deadEnds} dead ends (${r.processed} total)`
			);
			// Capped seeds are INCOMPLETE — their tilings are silently missing unless surfaced. Never
			// hide them: a non-zero count means the run is not exhaustive for those seeds.
			if (r.cappedSeeds > 0) {
				log.log(
					`  ⚠ ${r.cappedSeeds} seed(s) hit the ${'90s'} per-seed cap and produced NO tilings ` +
					`(INCOMPLETE — completeness not guaranteed for these): ${r.cappedNames.join(', ')}`
				);
			}
		}
	);
}

function extractTranslationalCell(
	paramsFolder: string,
	k: number | null,
	m: number | null,
	log: PipelineLogger
): void {
	if (k === null) {
		for (let kVal = 1; kVal <= MAX_K; kVal++) {
			extractTranslationalCellForK(paramsFolder, kVal, m, log);
		}
	} else {
		extractTranslationalCellForK(paramsFolder, k, m, log);
	}
}

function extractTranslationalCellForK(
	paramsFolder: string,
	k: number,
	m: number | null,
	log: PipelineLogger
): void {
	log.runStep(
		`Translational cell extraction for k=${k}`,
		() => {
			const extractor = new TranslationalCellExtractor();
			const kChecker = new KUniformityChecker();
			let processed = 0;
			let extracted = 0;
			let skipped = 0;
			let gateRejected = 0; // periodic cells whose true vertex-orbit count ≠ k (not k-uniform)

			const basePath = `${typeBasePath(paramsFolder)}/expandedSeeds/k=${k}`;
			if (!fs.existsSync(basePath)) return 0;

			let totalToProcess = 0;
			const mDirsToProcess: { mDir: string; mVal: number }[] = [];
			const mDirs = fs.readdirSync(basePath).filter((d) => d.startsWith('m='));
			for (const mDir of mDirs) {
				const mVal = parseInt(mDir.replace('m=', ''), 10);
				if (m !== null && mVal !== m) continue;
				const manifestPath = `${basePath}/${mDir}/manifest.json`;
				if (!fs.existsSync(manifestPath)) continue;
				const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
				totalToProcess += manifest.total ?? 0;
				mDirsToProcess.push({ mDir, mVal });
			}

			if (totalToProcess === 0) return 0;

			const byM = new Map<
				number,
				{ n: string; p: Record<string, unknown>[]; b: [[number, number], [number, number]]; o: [number, number] }[]
			>();

			// Global dedup of tilings up to the full isometry group (canonical cell key):
			// the two chiral mirror forms of a snub tiling share a key → counted once.
			const seenCanonical = new Set<string>();

			for (const { mDir, mVal } of mDirsToProcess) {
				const items = loadExpandedSeedsBatches(paramsFolder, k, mVal);
				if (!byM.has(mVal)) byM.set(mVal, []);

				for (let i = 0; i < items.length; i++) {
					processed++;
					log.progress('Seeds', processed, totalToProcess);
					const item = items[i];
					const polygons = (item.p ?? []).map((p: Record<string, unknown>) => polygonFromShort(p));
					if (polygons.length === 0) {
						skipped++;
						continue;
					}

					// Dedup tilings up to the full isometry group using the boundary-free
					// interior-neighbourhood canonical key (basis-independent, robust).
					const canonical = extractor.canonicalPatchKey(polygons);
					if (seenCanonical.has(canonical)) {
						skipped++;
						continue;
					}
					seenCanonical.add(canonical);

					const result = extractor.extract(polygons);
					if (!result) {
						skipped++;
						continue;
					}

					// k-uniformity gate (plan §5 Step 1): the defining property is "exactly k vertex
					// orbits under the full symmetry group". Verify it exactly. A null result means the
					// patch is too small/degenerate to decide — keep it (never drop on uncertainty,
					// only on a definite ≠ k verdict), so the gate cannot reduce completeness.
					if (result.basisExact) {
						const orbits = kChecker.countVertexOrbits(
							result.cellPolygons,
							result.basisExact[0],
							result.basisExact[1]
						);
						if (orbits !== null && orbits !== k) {
							gateRejected++;
							continue;
						}
					}

					extracted++;
					const encodedCell = result.cellPolygons.map((p) =>
						polygonToShort(p.encode() as Record<string, unknown>)
					);
					const [v1, v2] = result.basis;
					byM.get(mVal)!.push({
						n: item.n ?? '',
						p: roundNumbersInJson(encodedCell) as Record<string, unknown>[],
						b: [
							[v1.x, v1.y],
							[v2.x, v2.y],
						],
						o: [result.origin.x, result.origin.y],
					});
				}
			}

			log.clearLine();

			for (const [mVal, cells] of byM.entries()) {
				if (cells.length === 0) continue;
				const folderPath = `${typeBasePath(paramsFolder)}/translationalCells/k=${k}/m=${mVal}`;
				if (!fs.existsSync(folderPath)) {
					fs.mkdirSync(folderPath, { recursive: true });
				}
				const total = cells.length;
				const totalBatches = Math.ceil(total / BATCH_SIZE);
				for (let i = 0; i < total; i += BATCH_SIZE) {
					const batchIndex = Math.floor(i / BATCH_SIZE);
					log.progress('Writing batches', batchIndex + 1, totalBatches);
					const batch = cells.slice(i, i + BATCH_SIZE);
					const json = JSON.stringify(batch);
					const compressed = zlib.gzipSync(json, { level: 9 });
					fs.writeFileSync(
						`${folderPath}/translationalCells_${String(batchIndex).padStart(4, '0')}.json.gz`,
						compressed
					);
				}
				fs.writeFileSync(
					`${folderPath}/manifest.json`,
					JSON.stringify({
						format: 'full',
						shortKeys: true,
						compressed: true,
						total,
						batchSize: BATCH_SIZE,
					})
				);
			}
			log.clearLine();
			return { extracted, skipped, gateRejected, processed };
		},
		(result) => {
			if (typeof result === 'number' && result === 0) return;
			const r = result as { extracted: number; skipped: number; gateRejected: number; processed: number };
			log.log(
				`  → ${r.extracted} cells extracted, ${r.gateRejected} rejected by k-uniformity gate, ` +
				`${r.skipped} skipped (${r.processed} total)`
			);
		}
	);
}

/**
 * Solve-for-period stage (opt-in via USE_PERIOD_SOLVER=1): for each seed, fix the period and fill the
 * bounded torus directly (PeriodSolver), producing fundamental cells already gated to exactly k vertex
 * orbits. Replaces seedsExpansion + extractTranslationalCell with one bounded step (no radius-6k growth,
 * so the hard seeds that the expander could not finish now terminate). Writes the identical
 * translationalCells output that the downstream tiling stage consumes.
 */
function periodSolveForK(paramsFolder: string, k: number, log: PipelineLogger): void {
	log.runStep(
		`Solve-for-period cells for k=${k}`,
		() => {
			const basePath = `${typeBasePath(paramsFolder)}/seedConfigurations/k=${k}`;
			if (!fs.existsSync(basePath)) return 0;

			const extractor = new TranslationalCellExtractor();
			type CellRec = { n: string; p: Record<string, unknown>[]; b: [[number, number], [number, number]]; o: [number, number] };
			const byM = new Map<number, CellRec[]>();
			// Collect every certified cell across all seeds, then dedup ONCE up to congruence at the end
			// (representation- & chirality-robust). The old canonicalKey-Set under-merges the chiral snub →
			// over-counts t2020 4× (DEVELOPMENT_NOTES §12.7/§12.11). Each cell's m (= #distinct VC types) is
			// tracked so survivors persist under the right m= folder.
			const allCells: PeriodCell[] = [];
			const cellMeta = new Map<PeriodCell, { mVal: number; name: string }>();

			const mDirs = fs.readdirSync(basePath).filter((d) => d.startsWith('m='));
			let processed = 0;
			let capped = 0;
			const cappedNames: string[] = [];
			// total for progress
			let total = 0;
			for (const mDir of mDirs) {
				const manifestPath = `${basePath}/${mDir}/manifest.json`;
				if (fs.existsSync(manifestPath)) total += (JSON.parse(fs.readFileSync(manifestPath, 'utf8')).total ?? 0);
			}

			for (const mDir of mDirs) {
				const mVal = parseInt(mDir.replace('m=', ''), 10);
				const manifestPath = `${basePath}/${mDir}/manifest.json`;
				if (!fs.existsSync(manifestPath)) continue;
				const { configs, vcLibrary } = loadSeedConfigBatches(paramsFolder, k, mVal);
				const solver = new PeriodSolver(k);

				for (const cfg of configs) {
					processed++;
					log.progress('Seeds', processed, total);
					const seed = SeedConfiguration.decodeCompact(
						cfg as CompactSeedConfiguration | CompactSeedConfigurationShort,
						vcLibrary
					);
					// 120s for k≥2: union seeding (fan fills on the few small-cell lattices, e.g. t2014's
					// 1×(1+√3)) pushes the hardest 3⁶ seeds to ~55s; the cap gives headroom so the
					// deterministic seed-free fill is not truncated. Timeouts are surfaced as INCOMPLETE below.
					const { cells, diag } = solver.solve(seed, { maxMs: k >= 2 ? 120_000 : 30_000 });
					if (diag.timedOut) { capped++; cappedNames.push(seed.name); }
					for (const cell of cells) {
						allCells.push(cell);
						cellMeta.set(cell, { mVal, name: seed.name });
					}
				}
			}
			log.clearLine();

			// Authoritative cross-seed dedup up to congruence; survivors regrouped by m for persistence.
			const reps = dedupeByCongruence(allCells, (c) => extractor.canonicalKey(c.cellPolygons));
			const emitted = reps.length;
			for (const cell of reps) {
				const { mVal, name } = cellMeta.get(cell)!;
				if (!byM.has(mVal)) byM.set(mVal, []);
				const u = cell.basisExact[0].toVector();
				const v = cell.basisExact[1].toVector();
				const origin = cell.cellPolygons[0].exactCentroid!.toVector();
				byM.get(mVal)!.push({
					n: name,
					p: roundNumbersInJson(cell.cellPolygons.map((p) => polygonToShort(p.encode() as Record<string, unknown>))) as Record<string, unknown>[],
					b: [[u.x, u.y], [v.x, v.y]],
					o: [origin.x, origin.y],
				});
			}

			for (const [mVal, cells] of byM.entries()) {
				if (cells.length === 0) continue;
				const folderPath = `${typeBasePath(paramsFolder)}/translationalCells/k=${k}/m=${mVal}`;
				if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });
				const totalCells = cells.length;
				for (let i = 0; i < totalCells; i += BATCH_SIZE) {
					const batchIndex = Math.floor(i / BATCH_SIZE);
					const batch = cells.slice(i, i + BATCH_SIZE);
					const compressed = zlib.gzipSync(JSON.stringify(batch), { level: 9 });
					fs.writeFileSync(`${folderPath}/translationalCells_${String(batchIndex).padStart(4, '0')}.json.gz`, compressed);
				}
				fs.writeFileSync(
					`${folderPath}/manifest.json`,
					JSON.stringify({ format: 'full', shortKeys: true, compressed: true, total: totalCells, batchSize: BATCH_SIZE })
				);
			}
			return { emitted, processed, capped, cappedNames };
		},
		(result) => {
			if (typeof result === 'number' && result === 0) return;
			const r = result as { emitted: number; processed: number; capped: number; cappedNames: string[] };
			log.log(`  → ${r.emitted} distinct k-uniform cells from ${r.processed} seeds`);
			if (r.capped > 0) {
				log.log(
					`  ⚠ ${r.capped} seed(s) hit the per-seed time cap (INCOMPLETE — their cells may be missing): ${r.cappedNames.join(', ')}`
				);
			}
		}
	);
}

function loadExpandedSeedsBatches(
	paramsFolder: string,
	k: number,
	m: number
): { n: string; p: Record<string, unknown>[] }[] {
	const folder = `${typeBasePath(paramsFolder)}/expandedSeeds/k=${k}/m=${m}`;
	if (!fs.existsSync(folder)) return [];
	const manifest = JSON.parse(fs.readFileSync(`${folder}/manifest.json`, 'utf8'));
	const total = manifest.total;
	const items: { n: string; p: Record<string, unknown>[] }[] = [];
	for (let i = 0; i < total; i += BATCH_SIZE) {
		const batchIndex = Math.floor(i / BATCH_SIZE);
		const baseName = `expandedSeeds_${String(batchIndex).padStart(4, '0')}`;
		const gzPath = `${folder}/${baseName}.json.gz`;
		const jsonPath = `${folder}/${baseName}.json`;
		let batch: { n: string; p: Record<string, unknown>[] }[];
		if (fs.existsSync(gzPath)) {
			batch = JSON.parse(zlib.gunzipSync(fs.readFileSync(gzPath)).toString('utf8'));
		} else {
			batch = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
		}
		items.push(...batch);
	}
	return items;
}

function tilingsGeneration(
	paramsFolder: string,
	k: number | null,
	m: number | null,
	log: PipelineLogger
): void {
	if (k === null) {
		generateTilings(paramsFolder, 1, 1, log);

		for (let k = 2; k <= MAX_K; k++) {
			for (let m = 2; m <= k; m++) {
				generateTilings(paramsFolder, k, m, log);
			}
		}
	} else {
		if (m === null) {
			for (let m = 2; m <= k; m++) {
				generateTilings(paramsFolder, k, m, log);
			}
		} else {
			generateTilings(paramsFolder, k, m, log);
		}
	}
}

type SeedConfigPayload =
	| CompactSeedConfiguration
	| CompactSeedConfigurationShort
	| FullSeedConfiguration;

function loadSeedConfigBatches(
	paramsFolder: string,
	k: number,
	m: number,
	onProgress?: (phase: string, current: number, total: number, msg?: string) => void
): { format: string; configs: SeedConfigPayload[]; vcLibrary?: string[] } {
	const folder = `${typeBasePath(paramsFolder)}/seedConfigurations/k=${k}/m=${m}`;
	const manifest = JSON.parse(fs.readFileSync(`${folder}/manifest.json`, 'utf8'));
	const total = manifest.total;
	const format = manifest.format || 'compact';
	const configs: SeedConfigPayload[] = [];
	let vcLibrary: string[] | undefined;
	if (manifest.vcLibrary) {
		try {
			const vcLibraryPath = `${typeBasePath(paramsFolder)}/seedConfigurations/vcLibrary.json`;
			vcLibrary = JSON.parse(fs.readFileSync(vcLibraryPath, 'utf8'));
		} catch {
			vcLibrary = undefined;
		}
	}
	const totalBatches = Math.ceil(total / BATCH_SIZE);
	for (let i = 0; i < total; i += BATCH_SIZE) {
		const batchIndex = Math.floor(i / BATCH_SIZE);
		onProgress?.('load', batchIndex + 1, totalBatches, `Loading batch ${batchIndex + 1}/${totalBatches}`);
		const baseName = `seedConfigurations_${String(batchIndex).padStart(4, '0')}`;
		const gzPath = `${folder}/${baseName}.json.gz`;
		const jsonPath = `${folder}/${baseName}.json`;
		let batch: SeedConfigPayload[];
		if (fs.existsSync(gzPath)) {
			batch = JSON.parse(zlib.gunzipSync(fs.readFileSync(gzPath)).toString('utf8')) as SeedConfigPayload[];
		} else {
			batch = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as SeedConfigPayload[];
		}
		configs.push(...batch);
	}
	return { format, configs, vcLibrary };
}

function generateTilings(
	paramsFolder: string,
	k: number,
	m: number,
	log: PipelineLogger
): void {
	log.runStep(
		`Tilings generation for k=${k} and m=${m}`,
		() => {
			const progress = log.progressForPhases({
				load: 'Loading seed configs',
				seed: 'Processing seeds',
				generators: 'Testing generator sets'
			});
			const seedConfigs = loadSeedConfigBatches(paramsFolder, k, m, progress);
			const tilingGenerator = new AlgorithmTilingGenerator(paramsFolder);
			const tilings = tilingGenerator.generateTilings(
				k,
				m,
				progress,
				seedConfigs
			);
			log.clearLine(70, 2);

			const tilingsFolderPath = `${typeBasePath(paramsFolder)}/tilings/k=${k}/m=${m}`;
			if (!fs.existsSync(tilingsFolderPath)) {
				fs.mkdirSync(tilingsFolderPath, { recursive: true });
			}

			const encoded = log.mapWithProgress(tilings, 'Encoding tilings', (t) => t.encode(true), 1);

			const total = encoded.length;
			const totalBatches = Math.ceil(total / BATCH_SIZE);
			for (let i = 0; i < total; i += BATCH_SIZE) {
				const batchIndex = Math.floor(i / BATCH_SIZE);
				log.progress('Writing batches', batchIndex + 1, totalBatches);
				const batch = encoded.slice(i, i + BATCH_SIZE);
				const rounded = roundNumbersInJson(batch) as typeof batch;
				const json = JSON.stringify(rounded);
				const compressed = zlib.gzipSync(json, { level: 9 });
				const filePath = `${tilingsFolderPath}/tilings_${String(batchIndex).padStart(4, '0')}.json.gz`;
				fs.writeFileSync(filePath, compressed);
			}
			const manifest = { format: 'full', compressed: true, total, batchSize: BATCH_SIZE };
			fs.writeFileSync(`${tilingsFolderPath}/manifest.json`, JSON.stringify(manifest));
			log.clearLine();
			return tilings.length;
		},
		(count) => log.log(`  → ${count} tilings`)
	);
}

/** Load all seed sets for k (from m=1 to m=k). Returns (k, m) => seedSets for that m. */
function loadAllSeedSetsForK(paramsFolder: string): (k: number) => Map<number, string[][]> {
	return (k: number) => {
		const byM = new Map<number, string[][]>();
		for (let m = 1; m <= k; m++) {
			const filePath = `${typeBasePath(paramsFolder)}/seedSets/k=${k}/m=${m}.json`;
			if (!fs.existsSync(filePath)) continue;
			const content = fs.readFileSync(filePath, 'utf8');
			byM.set(m, JSON.parse(content));
		}
		return byM;
	};
}

/** Ensure vcLibrary.json exists for paramsFolder; return the VC name array. */
function ensureVcLibrary(paramsFolder: string): string[] {
	const base = typeBasePath(paramsFolder);
	const vcLibraryPath = `${base}/seedConfigurations/vcLibrary.json`;
	const baseFolder = `${base}/seedConfigurations`;
	if (!fs.existsSync(baseFolder)) {
		fs.mkdirSync(baseFolder, { recursive: true });
	}
	let vcLibrary: string[];
	if (fs.existsSync(vcLibraryPath)) {
		vcLibrary = JSON.parse(fs.readFileSync(vcLibraryPath, 'utf8'));
	} else {
		const vcsPath = `${typeBasePath(paramsFolder)}/vcs.json`;
		vcLibrary = fs.existsSync(vcsPath)
			? JSON.parse(fs.readFileSync(vcsPath, 'utf8'))
			: [];
		fs.writeFileSync(vcLibraryPath, JSON.stringify(vcLibrary));
	}
	return vcLibrary;
}
