/**
 * Where exactly does patch-stamping lose 3.3.3.3.6? Run: `pnpm tsx scripts/diag-stamp-snub.ts`
 *
 * scripts/diag-stamp-mode.ts showed k=1 dropping from 11 to 10 under patch-stamping, and named the
 * casualty: the snub trihexagonal tiling, the one chiral tiling among the eleven. Two very different
 * explanations fit that: the search never reaches it (the rule is genuinely incomplete), or the search
 * reaches it and the LEAF is unusable — patch-stamping roughly doubles the patch each step, so the
 * frontier clears the 6k threshold in far fewer steps and the emitted patch has a different shape than
 * the extractor was ever fed. This separates them.
 */
import { SeedExpander } from '@/classes/algorithm/SeedExpander';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import { KUniformityChecker } from '@/classes/algorithm/KUniformityChecker';
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
console.log(`seed ${snub.name}: ${snub.polygons.length} tiles\n`);

for (const mode of ['seed', 'patch'] as const) {
	const expander = new SeedExpander(1);
	expander.stampMode = mode;
	expander.maxExpandMs = 60000;
	const extractor = new TranslationalCellExtractor();
	const checker = new KUniformityChecker();
	let leaves = 0, noCell = 0, wrongOrbits = 0, ok = 0;
	const sizes: number[] = [];
	const t0 = Date.now();
	expander.expand(snub, (patch) => {
		leaves++;
		sizes.push(patch.length);
		const result = extractor.extract(patch);
		if (!result || !result.basisExact) { noCell++; return; }
		const orbits = checker.countVertexOrbits(result.cellPolygons, result.basisExact[0], result.basisExact[1]);
		if (orbits !== null && orbits !== 1) { wrongOrbits++; return; }
		ok++;
	});
	console.log(
		`${mode.padEnd(6)} leaves=${leaves} (sizes ${sizes.length ? Math.min(...sizes) : 0}..${sizes.length ? Math.max(...sizes) : 0}) ` +
		`| no cell extracted=${noCell} | orbit-gate rejected=${wrongOrbits} | usable=${ok} ` +
		`| capped=${expander.lastExpandCapped} | ${Date.now() - t0}ms`,
	);
}

console.log(`
Reading:
  leaves=0            -> the search itself dies: no valid whole-patch placement exists.
  leaves>0, usable=0  -> the search gets there; the emitted leaf is what fails.`);

// Step by step, using the figure trace: how many placements survive at each stamp in each mode.
console.log('\nplacements surviving per step (figure trace):');
for (const mode of ['seed', 'patch'] as const) {
	const exp = new SeedExpander(1);
	exp.stampMode = mode;
	let patch = snub.polygons.map((p) => p.clone());
	let collapsed = exp.figureStart(snub);
	const counts: string[] = [];
	for (let step = 0; step < 9; step++) {
		const s = exp.figureStep(snub, patch, collapsed);
		counts.push(`${patch.length}→${s.candidates.length}c`);
		if (s.candidates.length === 0) break;
		const merged = exp.figureMerge(patch, s.candidates[0]);
		patch = merged.patch;
		collapsed = merged.collapsed;
	}
	console.log(`  ${mode.padEnd(6)} ${counts.join(' | ')}`);
}

// Is the step-2 target vertex ALREADY surrounded? The bookkeeping marks a vertex collapsed only when
// one of the k cores maps onto it — which is right for a seed stamp, but a whole-patch stamp closes
// many vertices it never records. If those unrecorded-but-complete vertices come back as frontier, no
// copy can be placed there and the branch dies for a reason that is about the bookkeeping, not the idea.
console.log('\nis the step-2 target already surrounded?');
{
	const exp = new SeedExpander(1);
	exp.stampMode = 'patch';
	const patch0 = snub.polygons.map((p) => p.clone());
	const s1 = exp.figureStep(snub, patch0, exp.figureStart(snub));
	const m = exp.figureMerge(patch0, s1.candidates[0]);
	const s2 = exp.figureStep(snub, m.patch, m.collapsed);
	const angleAt = (v: { key: () => string }) => {
		let units = 0, tiles = 0;
		for (const p of m.patch) {
			p.exactVertices!.forEach((vx, i) => { if (vx.key() === v.key()) { units += p.cornerAngleUnits(i); tiles++; } });
		}
		return { units, tiles };
	};
	console.log(`  patch after stamp 1: ${m.patch.length} tiles, ${m.collapsed.length} recorded as collapsed`);
	let surrounded = 0;
	for (const f of s2.frontier) {
		const a = angleAt(f.vertex);
		if (Math.abs(a.units - 24) < 1e-9) surrounded++;
	}
	const t = s2.target ? angleAt(s2.target.vertex) : null;
	console.log(`  open vertices offered: ${s2.frontier.length}, of which ALREADY at 2pi: ${surrounded}`);
	console.log(`  step-2 target: ${t ? `${t.units}/24 angle units from ${t.tiles} tiles` : '(none)'} — ${t && Math.abs(t.units - 24) < 1e-9 ? 'ALREADY COMPLETE' : 'genuinely open'}`);
}
