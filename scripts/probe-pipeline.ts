/* Validate PeriodSolver over the full k seed set. Run: pnpm tsx scripts/probe-pipeline.ts [k] */
import { VertexConfiguration } from '@/classes/algorithm/VertexConfiguration';
import { SeedConfiguration } from '@/classes/algorithm/SeedConfiguration';
import { PeriodSolver, type PeriodCell } from '@/classes/algorithm/PeriodSolver';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import { dedupeByCongruence } from '@/classes/algorithm/TilingCongruence';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';

const k = parseInt(process.argv[2] ?? '1', 10);
// Optional tile-set arg, e.g. `pnpm tsx scripts/probe-pipeline.ts 3 3,4,6,12` to scope k=3 to the
// 12-direction (tractable) tiles, excluding octagons (n=8 → 24 directions → ~700k pool, the §11 wall).
const ns = process.argv[3] ? process.argv[3].split(',').map(Number) : [3, 4, 6, 8, 12];
const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns } };
// The seed-free lattice enumeration (Surd = ℚ(√2,√3) = ℚ(ζ₂₄)⁺) REQUIRES N=24. computeRing picks the
// minimal N (e.g. {3,4,6,12} → N=12), which crashes gridDirOf/imSurd — so force N=24 (every regular
// n ∈ {3,4,6,8,12} divides 24, so this is always valid and just uses a larger containing ring).
const baseRing = computeRing(params);
setActiveRing(baseRing.N === 24 ? baseRing : CyclotomicRing.create(24));
console.log(`tiles: {${ns.join(',')}}  ring N=${baseRing.N === 24 ? 24 : `24 (computeRing gave ${baseRing.N}, forced to 24 for Surd)`}`);

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
const allCells: PeriodCell[] = [];
let capped = 0;
const maxMs = process.argv[4] ? parseInt(process.argv[4], 10) : 120000; // per-seed cap (ms)
const t0 = Date.now();
for (let i = 0; i < useSeeds.length; i++) {
	const seed = useSeeds[i];
	const ts = Date.now();
	const { cells, diag } = new PeriodSolver(k).solve(seed, { maxMs });
	const ms = Date.now() - ts;
	for (const c of cells) allCells.push(c);
	if (diag.timedOut) capped++;
	if (ms > 3000 || diag.timedOut || cells.length > 0)
		console.log(
			`  [${i}] ${seed.name.padEnd(28)} cells=${cells.length} ` +
			`lat=${diag.candidateLattices} raw=${diag.rawCells} gateRej=${diag.gateRejected} fanLat=${diag.fanLattices} ${ms}ms${diag.timedOut ? ' TIMEOUT' : ''}`
		);
}
// Authoritative cross-seed dedup: up to CONGRUENCE (representation- & chirality-robust). The old
// canonicalKey-Set under-merges the chiral snub, over-counting t2020 4× (DEVELOPMENT_NOTES §12.7/§12.11).
const reps = dedupeByCongruence(allCells, (c) => extractor.canonicalKey(c.cellPolygons));
console.log(`\nk=${k}: ${reps.length} distinct tilings (from ${allCells.length} raw cells), ${capped} seeds timed out, ${((Date.now() - t0) / 1000).toFixed(1)}s total`);
// Deterministic-composition fingerprint over the congruence-class representatives (each the
// min-canonicalKey member of its class ⇒ order-independent). Two runs must print the SAME digest.
const ids = reps.map((c) => extractor.canonicalKey(c.cellPolygons)).sort();
let h = 5381n;
for (const c of ids.join('|')) h = ((h * 33n) ^ BigInt(c.codePointAt(0)!)) & 0xffffffffffffffffn;
console.log(`COMPOSITION digest=${h.toString(16)} count=${reps.length}`);
