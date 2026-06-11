/* C1 — the PROVEN-CONFIG regression probe (route-a-proven-box.md §O1+O2). Runs the provably-complete
 * configuration: singleton seed multisets INCLUDED (O1, lem:seedcover) + blanket fan seeding (O2,
 * prop:fanseed, `provenSeeding:true`) + the proven box + join-closure already in PeriodSolver. Reports
 * the distinct-tiling count + the SAME DJB2 composition digest as scout-parallel.ts, so it is directly
 * comparable to the certified fast-path digests (k=1 6f9ca9cf2d16c75f / k=2 f3e2e0517191362c /
 * k=3 eb34499d5fba3457). Acceptance: same count + same digest, with NO seed timing out (no wall-clock
 * cap by default). Any [PeriodSolver] ⚑ INCOMPLETE-REGION line on stderr is a candidate-stage truncation.
 * Run: pnpm tsx scripts/proven-probe.ts [k] [maxMs=0]  (single-process; for k=3 use the parallel scout). */
import { PeriodSolver, type PeriodCell } from '@/classes/algorithm/PeriodSolver';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import { dedupeByCongruence } from '@/classes/algorithm/TilingCongruence';

const k = parseInt(process.argv[2] ?? '1', 10);
const maxMs = process.argv[3] ? parseInt(process.argv[3], 10) : 0; // 0 = no cap (certified)
const ns = [3, 4, 6, 8, 12];

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns } };
const baseRing = computeRing(params);
const ring = baseRing.N === 24 ? baseRing : CyclotomicRing.create(24);
setActiveRing(ring);
const extractor = new TranslationalCellExtractor();
const T0 = Date.now();
const log = (m: string) => process.stderr.write(`[t+${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}\n`);

log(`PROVEN-CONFIG probe k=${k} {${ns.join(',')}} cap=${maxMs}ms (singletons INCLUDED + blanket fans)`);
const pg = new PolygonsGenerator(params, []);
const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
const adj: Record<string, string[]> = {};
for (const vc of vcs) adj[vc.name] = [];
for (let i = 0; i < vcs.length; i++)
	for (let j = i + 1; j < vcs.length; j++)
		if (vcs[i].isCompatible(vcs[j])) { adj[vcs[i].name].push(vcs[j].name); adj[vcs[j].name].push(vcs[i].name); }
const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
const seedSets = new SeedSetExtractor(graph).findSeedSets(k);
// O1: NO ≥2-distinct-VC filter — singleton multisets are part of the proven config.
const seeds = new SeedBuilder().buildSeeds(k, 1, { seedSetLoader: () => seedSets });
log(`seeds=${seeds.length} (singletons included) — solving with provenSeeding…`);

const cells: PeriodCell[] = [];
let timeouts = 0, incomplete = false;
for (let i = 0; i < seeds.length; i++) {
	const ts = Date.now();
	const { cells: cs, diag } = new PeriodSolver(k).solve(seeds[i], { provenSeeding: true, maxMs });
	cells.push(...cs);
	if (diag.timedOut) timeouts++;
	if (diag.obliqueTruncated) incomplete = true;
	const ms = Date.now() - ts;
	if (ms > 3000 || diag.timedOut || cs.length > 0)
		log(`[${i}/${seeds.length}] ${seeds[i].name.slice(0, 40).padEnd(40)} cells=${cs.length} blanketFanLat=${diag.blanketFanLattices} ${diag.timedOut ? 'TIMEOUT ' : ''}${(ms / 1000).toFixed(1)}s`);
}

const reps = dedupeByCongruence(cells, (c) => extractor.canonicalKey(c.cellPolygons));
const ids = reps.map((c) => extractor.canonicalKey(c.cellPolygons)).sort();
let h = 5381n;
for (const ch of ids.join('|')) h = ((h * 33n) ^ BigInt(ch.codePointAt(0)!)) & 0xffffffffffffffffn;
console.log(`\nPROVEN k=${k}: ${reps.length} distinct tilings (from ${cells.length} raw cells), ${timeouts} seeds timed out, ${((Date.now() - T0) / 1000).toFixed(1)}s`);
console.log(`COMPOSITION digest=${h.toString(16)} count=${reps.length} timeouts=${timeouts} obliqueIncomplete=${incomplete}`);
