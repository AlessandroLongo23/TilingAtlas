/**
 * WHY does whole-patch stamping find no placement at step 2? Run: `pnpm tsx scripts/diag-stamp-why.ts`
 *
 * Both modes reach the same 8-tile patch and pick the same target vertex; seed-stamping then finds a
 * placement and patch-stamping finds none (scripts/diag-stamp-snub.ts). Since the ONLY difference in
 * the code path is which polygons get collision-tested, the answer is in the per-candidate table: this
 * dumps every enumerated isometry with the stage that decided it, in both modes, side by side, and
 * then takes the isometries seed-stamping ACCEPTS and asks exactly which tile of the transformed patch
 * hits which tile of the existing patch.
 *
 * The question that matters: is the collision REAL — the transformed patch genuinely overlapping in a
 * way no tiling could contain — or an artifact of the collision test (a re-stamped tile that should
 * have been recognised as the same tile and skipped)? The first is a limit of the method. The second
 * is a bug.
 */
import { SeedExpander } from '@/classes/algorithm/SeedExpander';
import type { Polygon } from '@/classes/polygons/Polygon';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing } from '@/classes/Cyclotomic';

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
const seedSets = new SeedSetExtractor(graph).findSeedSets(1);
const seeds = new SeedBuilder().buildSeeds(1, 1, { seedSetLoader: () => seedSets });
const snub = seeds.find((s) => s.name.includes('3,3,3,3,6'))!;

type Key = string;
const keyOf = (i: { anchorIdx: number; seedDir?: number; boundaryDir?: number; reflect?: boolean }): Key =>
	`a${i.anchorIdx} s${i.seedDir ?? '-'} b${i.boundaryDir ?? '-'} ${i.reflect ? 'R' : '.'}`;

/** Walk to the 8-tile patch by taking the first placement, exactly as the snub probe does. */
function patchAfterFirstStamp(mode: 'seed' | 'patch') {
	const exp = new SeedExpander(1);
	exp.stampMode = mode;
	const patch0 = snub.polygons.map((p) => p.clone());
	const start = exp.figureStart(snub);
	const s1 = exp.figureStep(snub, patch0, start);
	const m = exp.figureMerge(patch0, s1.candidates[0]);
	return { exp, patch: m.patch, collapsed: m.collapsed };
}

console.log(`seed ${snub.name}\n`);

// --- per-candidate table, both modes on the identical frame -------------------------------------
const tables: Record<string, Map<Key, string>> = {};
for (const mode of ['seed', 'patch'] as const) {
	const { exp, patch, collapsed } = patchAfterFirstStamp(mode);
	const table = new Map<Key, string>();
	exp.candidateProbe = (info) => table.set(keyOf(info), info.stage);
	exp.figureStep(snub, patch, collapsed);
	exp.candidateProbe = undefined;
	tables[mode] = table;
	const tally = new Map<string, number>();
	for (const stage of table.values()) tally.set(stage, (tally.get(stage) ?? 0) + 1);
	console.log(`${mode.padEnd(6)} ${table.size} candidates: ${[...tally].map(([s, n]) => `${s}=${n}`).join(' ')}`);
}

console.log('\ncandidates whose fate DIFFERS between the modes:');
for (const [k, seedStage] of tables.seed) {
	const patchStage = tables.patch.get(k);
	if (patchStage !== seedStage) console.log(`  ${k}: seed=${seedStage}  patch=${patchStage}`);
}

// --- for each isometry seed-stamping accepts, what does the patch copy actually hit? --------------
console.log('\nwhat the whole-patch copy collides with:');
{
	const { exp, patch, collapsed } = patchAfterFirstStamp('seed');
	const accepted: string[] = [];
	exp.candidateProbe = (info) => { if (info.stage === 'accepted') accepted.push(keyOf(info)); };
	const s2 = exp.figureStep(snub, patch, collapsed);
	exp.candidateProbe = undefined;
	console.log(`  seed-stamping accepts ${accepted.length}: ${accepted.join(', ')}`);

	// Rebuild each accepted transform's WHOLE-PATCH image and inspect it tile by tile.
	const patchKeys = new Set(patch.map((p) => p.exactKey()));
	for (const cand of s2.candidates) {
		const img: Polygon[] = exp.applyIsometryPublic(patch, cand.transform);
		let same = 0, disjoint = 0;
		const hits: string[] = [];
		for (const tp of img) {
			if (patchKeys.has(tp.exactKey())) { same++; continue; }
			let hit = false;
			for (const ex of patch) {
				if (tp.isEquivalent(ex)) { hit = true; same++; break; }
				if (tp.intersects(ex)) {
					hit = true;
					hits.push(`${tp.n}-gon at (${tp.centroid.x.toFixed(3)},${tp.centroid.y.toFixed(3)}) overlaps ${ex.n}-gon at (${ex.centroid.x.toFixed(3)},${ex.centroid.y.toFixed(3)})`);
					break;
				}
			}
			if (!hit) disjoint++;
		}
		console.log(`  transform rotK=${cand.transform.rotK} reflect=${cand.transform.reflect}: ` +
			`${img.length} tiles → ${same} re-stamp an existing tile, ${disjoint} land on free space, ${hits.length} OVERLAP`);
		for (const h of hits.slice(0, 6)) console.log(`      ${h}`);
	}
}
