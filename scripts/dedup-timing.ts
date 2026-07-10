/* Real pipeline dedup timing: collect the cross-seed aggregate cells a real k-solve produces, then
 * time the OLD authoritative pairwise (dedupeByCongruence) vs the NEW N-hash (dedupeByNKey) on that
 * exact set. Answers "how much did N earn on the pipeline's dedup?".
 *   pnpm tsx scripts/dedup-timing.ts [k=2] [tiles=3,4,6,12] [maxMs=20000]
 */
import { PeriodSolver, type PeriodCell } from '@/classes/algorithm/PeriodSolver';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import { dedupeByCongruence, dedupeByNKey } from '@/classes/algorithm/TilingCongruence';
import { CompatibilityGraph, PolygonsGenerator, VCGenerator, SeedSetExtractor, SeedBuilder, PolygonType, type GeneratorParameters } from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import { performance } from 'node:perf_hooks';

const k = parseInt(process.argv[2] ?? '2', 10);
const ns = (process.argv[3] ?? '3,4,6,12').split(',').map(Number);
const maxMs = parseInt(process.argv[4] ?? '20000', 10);
const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns } };
const baseRing = computeRing(params);
setActiveRing(baseRing.N === 24 ? baseRing : CyclotomicRing.create(24));

const pg = new PolygonsGenerator(params, []);
const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
const adj: Record<string, string[]> = {};
for (const vc of vcs) adj[vc.name] = [];
for (let i = 0; i < vcs.length; i++) for (let j = i + 1; j < vcs.length; j++)
	if (vcs[i].isCompatible(vcs[j])) { adj[vcs[i].name].push(vcs[j].name); adj[vcs[j].name].push(vcs[i].name); }
const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
const seedSets = new SeedSetExtractor(graph).findSeedSets(k);
const seeds = new SeedBuilder().buildSeeds(k, 1, { seedSetLoader: () => seedSets });
const useSeeds = k >= 2 ? seeds.filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2) : seeds;
console.log(`k=${k} tiles={${ns.join(',')}}: ${useSeeds.length} seeds, collecting cells (per-seed dedup = N, default)...`);

const extractor = new TranslationalCellExtractor();
const keyOf = (c: PeriodCell) => extractor.canonicalKey(c.cellPolygons);

const t0 = performance.now();
const allCells: PeriodCell[] = [];
let capped = 0;
for (const seed of useSeeds) {
	const { cells, diag } = new PeriodSolver(k).solve(seed, { maxMs });
	for (const c of cells) allCells.push(c);
	if (diag.timedOut) capped++;
}
console.log(`collected ${allCells.length} cross-seed cells in ${((performance.now() - t0) / 1000).toFixed(1)}s (${capped} seeds capped at ${maxMs}ms)\n`);

if (allCells.length === 0) { console.log('no cells — raise maxMs or check tiles'); process.exit(0); }

// correctness: both methods must give the same partition size
const nReps = dedupeByNKey(allCells, keyOf);
const t0c = performance.now();
const cReps = dedupeByCongruence(allCells, keyOf);
const congTime = performance.now() - t0c;
console.log(`distinct tilings: N-hash ${nReps.length} | congruence ${cReps.length}  ${nReps.length === cReps.length ? 'MATCH' : '*** MISMATCH ***'}`);
// representative parity: same keyOf multiset ⇒ identical output
const sigN = nReps.map(keyOf).sort().join('|');
const sigC = cReps.map(keyOf).sort().join('|');
console.log(`representative sets identical: ${sigN === sigC}\n`);

const median = (fn: () => void, R: number) => { const t: number[] = []; for (let i = 0; i < R; i++) { const s = performance.now(); fn(); t.push(performance.now() - s); } t.sort((a, b) => a - b); return t[Math.floor(R / 2)]; };
const tN = median(() => dedupeByNKey(allCells, keyOf), 5);
console.log(`AGGREGATE cross-seed dedup on ${allCells.length} cells:`);
console.log(`  dedupeByCongruence (old): ${congTime.toFixed(0).padStart(8)} ms`);
console.log(`  dedupeByNKey       (new): ${tN.toFixed(1).padStart(8)} ms`);
console.log(`  earned: x${(congTime / tN).toFixed(1)} faster  (${((congTime - tN) / 1000).toFixed(1)}s saved on this dedup)`);
