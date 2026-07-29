/**
 * Does stamping the WHOLE PATCH instead of the seed change what the expander finds, or only what it
 * costs? Run: `pnpm tsx scripts/diag-stamp-mode.ts [k] [msPerSeed]`
 *
 * AL's proposal (2026-07-28). The expander stamps a copy of the SEED at an open vertex. Stamping the
 * whole current patch is the stronger reading of the same fact: the symmetry carrying core_i onto that
 * vertex carries everything already placed with it. The argument that it is sound AND complete is
 * short — if the isometry is a genuine symmetry of the target tiling then the whole transformed patch
 * lies inside that tiling and cannot collide, and an isometry whose patch-image DOES collide is a
 * symmetry of no tiling containing the patch, so rejecting it drops nothing.
 *
 * Short arguments about this search have been wrong before (NOTES §15.4 — a prune that looked sound to
 * everyone and silently dropped tilings), so this measures instead of arguing. The decisive number is
 * not speed: it is whether the COUNT survives. k=1 must stay 11 and k=2 must stay 20. A count that
 * drops is a completeness bug and the end of the idea.
 */
import { SeedExpander } from '@/classes/algorithm/SeedExpander';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import { KUniformityChecker } from '@/classes/algorithm/KUniformityChecker';
import { dedupeByCongruence } from '@/classes/algorithm/TilingCongruence';
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing } from '@/classes/Cyclotomic';

const k = parseInt(process.argv[2] ?? '1', 10);
const msPerSeed = parseInt(process.argv[3] ?? '20000', 10);
// Deterministic frame cap. Whole-patch stamping needs one: its patches grow geometrically, so a
// wall-clock cap checked every 256 frames can allocate gigabytes between checks (measured: OOM at 12 GB
// with a 15 s cap). A frame cap bounds memory as well as time, and being wall-clock-free it is
// reproducible. 0 = unlimited.
const nodesPerSeed = parseInt(process.argv[4] ?? '0', 10);
// The same tile set the k=1=11 test uses, so the counts are comparable to the ones on record.
const ns = k === 1 ? [3, 4, 6, 8, 12] : [3, 4, 6, 12];

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns } };
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
const allSeeds = new SeedBuilder().buildSeeds(k, 1, { seedSetLoader: () => seedSets });
const seeds = k >= 2 ? allSeeds.filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2) : allSeeds;
console.log(`k=${k}, tiles {${ns.join(',')}}: ${seeds.length} seeds, ${msPerSeed}ms + ${nodesPerSeed || '∞'} frames cap each\n`);

interface Row { mode: string; extracted: number; deduped: number; leaves: number; capped: number; ms: number; bySeed: Map<string, number> }

function run(mode: 'seed' | 'patch'): Row {
	// Which seed each surviving cell came from, so a count that drops can be NAMED rather than just
	// counted — "10 instead of 11" is a bug report; "it loses 4.8.8" is a finding.
	const bySeed = new Map<string, number>();
	const extractor = new TranslationalCellExtractor();
	const checker = new KUniformityChecker();
	const seen = new Set<string>();
	const cells: PeriodCell[] = [];
	let extracted = 0, leaves = 0, capped = 0;
	const t0 = Date.now();

	for (const seed of seeds) {
		const expander = new SeedExpander(k);
		expander.stampMode = mode;
		expander.maxExpandMs = msPerSeed;
		expander.maxExpandNodes = nodesPerSeed;
		expander.expand(seed, (patch) => {
			leaves++;
			const canonical = extractor.canonicalPatchKey(patch);
			if (seen.has(canonical)) return;
			seen.add(canonical);
			const result = extractor.extract(patch);
			if (!result || !result.basisExact) return;
			const orbits = checker.countVertexOrbits(result.cellPolygons, result.basisExact[0], result.basisExact[1]);
			if (orbits !== null && orbits !== k) return;
			extracted++;
			bySeed.set(seed.name, (bySeed.get(seed.name) ?? 0) + 1);
			cells.push({ cellPolygons: result.cellPolygons, basisExact: [result.basisExact[0], result.basisExact[1]] });
		});
		if (expander.lastExpandCapped) capped++;
	}

	return { mode, extracted, deduped: dedupeByCongruence(cells).length, leaves, capped, ms: Date.now() - t0, bySeed };
}

const rows = [run('seed'), run('patch')];
console.log('mode   extracted  deduped  leaves  capped-seeds  ms');
for (const r of rows) {
	console.log(
		`${r.mode.padEnd(6)} ${String(r.extracted).padStart(9)} ${String(r.deduped).padStart(8)} ` +
		`${String(r.leaves).padStart(7)} ${String(r.capped).padStart(13)} ${String(r.ms).padStart(7)}`,
	);
}

const [a, b] = rows;
const target = k === 1 ? 11 : k === 2 ? 20 : null;
console.log('');
if (target !== null) console.log(`target for k=${k}: ${target}`);
console.log(
	b.deduped === a.deduped
		? `SAME COUNT (${a.deduped}) — patch-stamping did not drop a tiling at this k.`
		: `COUNT CHANGED: seed=${a.deduped}, patch=${b.deduped} — patch-stamping is INCOMPLETE here.`,
);
for (const seed of seeds) {
	const x = a.bySeed.get(seed.name) ?? 0, y = b.bySeed.get(seed.name) ?? 0;
	if (x !== y) console.log(`  seed ${seed.name}: seed-stamping ${x} cell(s), patch-stamping ${y}`);
}
console.log(`leaves ${a.leaves} → ${b.leaves} (${(100 * (1 - b.leaves / Math.max(1, a.leaves))).toFixed(1)}% fewer), ` +
	`capped seeds ${a.capped} → ${b.capped}, wall ${a.ms}ms → ${b.ms}ms`);
