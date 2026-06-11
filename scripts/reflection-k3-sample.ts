/* Reflection-coverage falsifier — k=3 PARTIAL probe (reflection-coverage-experiment-2026-06-07.md §3).
 * The full k=3 falsifier needs the 36 h proven-A catalogue; this is the tractable mechanism probe the spec
 * asks for ("k=3 as much as is tractable; do not block on the 36 h run"). On a STRIDED sample of k=3 seeds
 * (singletons included), run BOTH streams on the SAME seeds, UNCAPPED per seed (a generous backstop cap
 * fires a LOUD INCOMPLETE, never silent):
 *   A = provenSeeding (rotation-only fans);  B = provenSeeding + reflectFans (mirror fans).
 * Decisive (exact ℚ(ζ_N) congruence): does B add any congruence class A (over the SAME sample) lacks?
 *   PASS-sample = dedupe(A ∪ B) == dedupe(A) (B ⊆ A on the sample).  Any extra B class = candidate witness.
 * Run: pnpm tsx scripts/reflection-k3-sample.ts [nSetSamples=40] [capMs=180000] */
import { PeriodSolver, type PeriodCell } from '@/classes/algorithm/PeriodSolver';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import { dedupeByCongruence, cellsCongruent } from '@/classes/algorithm/TilingCongruence';

const k = 3;
const nSetSamples = process.argv[2] ? parseInt(process.argv[2], 10) : 50;
const maxSeeds = process.argv[3] ? parseInt(process.argv[3], 10) : 20;
const capMs = process.argv[4] ? parseInt(process.argv[4], 10) : 60000;
const ns = [3, 4, 6, 8, 12];

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns } };
const baseRing = computeRing(params);
const ring = baseRing.N === 24 ? baseRing : CyclotomicRing.create(24);
setActiveRing(ring);
const extractor = new TranslationalCellExtractor();
const dedup = (cells: PeriodCell[]) => dedupeByCongruence(cells, (c) => extractor.canonicalKey(c.cellPolygons));
const T0 = Date.now();
const log = (m: string) => process.stderr.write(`[t+${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}\n`);

const pg = new PolygonsGenerator(params, []);
const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
const adj: Record<string, string[]> = {};
for (const vc of vcs) adj[vc.name] = [];
for (let i = 0; i < vcs.length; i++)
	for (let j = i + 1; j < vcs.length; j++)
		if (vcs[i].isCompatible(vcs[j])) { adj[vcs[i].name].push(vcs[j].name); adj[vcs[j].name].push(vcs[i].name); }
const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
const allSets = new SeedSetExtractor(graph).findSeedSets(k);
const step = Math.max(1, Math.floor(allSets.length / nSetSamples));
const someSets = allSets.filter((_, i) => i % step === 0).slice(0, nSetSamples);
const allSeeds = new SeedBuilder().buildSeeds(k, 1, { seedSetLoader: () => someSets }); // singletons included
// TRACTABILITY BIAS: the dense triangle coronas (3⁶ / 3⁴.6 snub-hex) wall the 60s cap (each ~6 min
// uncapped), so striding the dense-first seed list yields ~0 completed seeds. Sort by core-triangle count
// ASCENDING and take the most tractable maxSeeds — this completes AND still spans diverse families incl.
// CHIRAL ones (snub-square 3.3.4.3.4, etc.). ⚑ The dense chiral snub-HEX family is deliberately under-
// represented here; it is covered at k=2-FULL (PASS) and by the proved lemma — noted in the report.
const triCount = (s: { polygons: { n: number }[] }) => s.polygons.filter((p) => p.n === 3).length;
const seeds = [...allSeeds].sort((a, b) => triCount(a) - triCount(b)).slice(0, maxSeeds);
log(`k=3 reflection probe: ${allSets.length} seedSets → strided ${someSets.length} → ${allSeeds.length} seeds → ${seeds.length} most-tractable (triCount ${triCount(seeds[0])}..${triCount(seeds[seeds.length - 1])}); cap ${capMs}ms/seed`);

// Decisive comparison uses ONLY seeds where BOTH streams ran to completion — a timed-out fill returns a
// PARTIAL cell set, which could fake an "extra B class". Timed-out seeds are reported as INCOMPLETE.
const A: PeriodCell[] = [], B: PeriodCell[] = [];
let completed = 0, incomplete = 0;
for (let i = 0; i < seeds.length; i++) {
	const s = seeds[i];
	const ra = new PeriodSolver(k).solve(s, { provenSeeding: true, maxMs: capMs });
	const rb = new PeriodSolver(k).solve(s, { provenSeeding: true, reflectFans: true, maxMs: capMs });
	if (ra.diag.timedOut || rb.diag.timedOut) {
		incomplete++;
		log(`⚑ INCOMPLETE seed ${s.name.slice(0, 42)} (A.to=${ra.diag.timedOut} B.to=${rb.diag.timedOut}) — EXCLUDED from verdict`);
		continue;
	}
	completed++;
	A.push(...ra.cells); B.push(...rb.cells);
	log(`done seed ${s.name.slice(0, 42)} A=${ra.cells.length} B=${rb.cells.length}`);
}
const dedA = dedup(A);
const dA = dedA.length;
const dAB = dedup([...A, ...B]).length;
const ids = dedup([...A, ...B]).map((c) => extractor.canonicalKey(c.cellPolygons)).sort();
let h = 5381n;
for (const ch of ids.join('|')) h = ((h * 33n) ^ BigInt(ch.codePointAt(0)!)) & 0xffffffffffffffffn;
// witnesses = completed-stream B cells congruent to no completed A class (candidate — could be a sampling
// artifact since A here is sample-A, not the full certified k=3 catalogue).
const witnesses = B.filter((bc) => !dedA.some((ac) => cellsCongruent(ac, bc)));
console.log(`\nREFLECTION k=3 PARTIAL: completed ${completed}/${seeds.length} sampled seeds (${incomplete} INCOMPLETE, excluded)`);
console.log(`over completed seeds: A=${dA} classes, A∪B=${dAB} classes`);
console.log(dAB === dA
	? `✅ PASS-sample: B ⊆ A on the completed seeds (mirror stream adds 0 classes), unionDigest=${h.toString(16)}`
	: `❌ CANDIDATE: A∪B (${dAB}) > A (${dA}) — ${witnesses.length} B-cell(s) not in sample-A; verify vs the full certified k=3 catalogue (could be a sampling artifact) before concluding FAIL`);
