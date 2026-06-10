/* End-to-end acceptance for the §29 seed-coverage fix: the restored seed
 * [3,12,12;3,3,12,4;3,4,6,4] must solve to a cell congruent to the oracle's t3007.
 * Logs synchronously to experiments/results/ (progress + ETA, human-readable).
 *   pnpm tsx scripts/verify-t3007-found.ts
 */
import fs from 'node:fs';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import { PeriodSolver } from '@/classes/algorithm/PeriodSolver';
import { cellsCongruent, dedupeByCongruence } from '@/classes/algorithm/TilingCongruence';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import { serializeCell, deserializeCell } from './scoutCodec';
import { loadOracle, reconstructOracleCell } from './oracle-match';

const LOG = 'experiments/results/t3007-fix-verify-2026-06-10.log';
const log = (s: string) => {
	const line = `[${new Date().toISOString()}] ${s}\n`;
	fs.appendFileSync(LOG, line);
	process.stderr.write(line);
};

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns: [3, 4, 6, 12] } };
const baseRing = computeRing(params);
const RING = baseRing.N === 24 ? baseRing : CyclotomicRing.create(24);
setActiveRing(RING);

fs.writeFileSync(LOG, '');
log('=== t3007 fix verification (NOTES §29) ===');
log('rebuilding worker-identical seed list ({3,4,6,12}, k=3)…');

const pg = new PolygonsGenerator(params, []);
const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
const adj: Record<string, string[]> = {};
for (const vc of vcs) adj[vc.name] = [];
for (let i = 0; i < vcs.length; i++)
	for (let j = i + 1; j < vcs.length; j++)
		if (vcs[i].isCompatible(vcs[j])) { adj[vcs[i].name].push(vcs[j].name); adj[vcs[j].name].push(vcs[i].name); }
const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
const seedSets = new SeedSetExtractor(graph).findSeedSets(3);
const seeds = new SeedBuilder().buildSeeds(3, 1, { seedSetLoader: () => seedSets });
const useSeeds = seeds.filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2);
log(`seed list: ${useSeeds.length} seeds (was 447 pre-fix)`);

const msOf = (name: string) => name.split(',').map(Number).sort((x, y) => x - y).join(',');
const want = ['3,12,12', '3,3,4,12', '3,4,6,4'].map(msOf).sort().join('|');
const targets = useSeeds
	.map((s, idx) => ({ s, idx }))
	.filter(({ s }) => {
		const names = [...new Set(s.vertexConfigurations.map((v) => v.name))];
		return names.map(msOf).sort().join('|') === want;
	});
log(`t3007-multiset seeds: ${targets.map((t) => `idx=${t.idx} ${t.s.name}`).join('; ') || 'NONE'}`);
if (targets.length === 0) { log('FAIL: seed still missing'); process.exit(1); }

const rec = reconstructOracleCell('t3007', loadOracle()['t3007']);
if ('error' in rec) { log(`FAIL: oracle reconstruction: ${rec.error}`); process.exit(1); }
// oracle-match decodes in its own module-level ring instance — round-trip through the codec so
// the reconstruction lives in THIS script's active ring (cellsCongruent asserts same-ring).
const oracleCell = deserializeCell(RING, serializeCell(rec.cell));
log(`oracle t3007 reconstructed: ${oracleCell.cellPolygons.length} tiles`);

const extractor = new TranslationalCellExtractor();
let matched = false;
for (const { s, idx } of targets) {
	log(`solving seed idx=${idx} ${s.name} (no cap — this is the slow part, expect tens of minutes)…`);
	const t0 = Date.now();
	const { cells, diag } = new PeriodSolver(3).solve(s, { maxMs: 0 });
	log(`seed idx=${idx}: ${cells.length} cells in ${((Date.now() - t0) / 60000).toFixed(1)} min (timedOut=${diag.timedOut})`);
	const reps = dedupeByCongruence(cells, (c) => extractor.canonicalKey(c.cellPolygons));
	log(`  ${reps.length} distinct tilings from this seed`);
	reps.forEach((c, i) => {
		const hit = cellsCongruent(oracleCell, c);
		log(`  rep ${i}: ${c.cellPolygons.length} tiles — congruent to t3007: ${hit}`);
		if (hit) matched = true;
	});
}
log(matched ? '★ SUCCESS: t3007 found by the fixed seed path' : '✗ FAILURE: t3007 still not produced — investigate the solve path');
process.exit(matched ? 0 : 1);
