/* Diagnostic probe for the missing Galebach t3007 (NOTES §28.3 Fix-2 investigation).
 * Read-only: characterizes t3007's lattice from the pinned oracle and checks whether the
 * scout's k=3 seed list even contains its VC triple {3.12.12; 3.3.4.12; 3.4.6.4}.
 *   pnpm tsx scripts/diag-t3007.ts
 */
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import { detSurd } from '@/classes/algorithm/exact/Surd';
import { loadOracle, reconstructOracleCell } from './oracle-match';

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns: [3, 4, 6, 12] } };
const baseRing = computeRing(params);
setActiveRing(baseRing.N === 24 ? baseRing : CyclotomicRing.create(24));

// --- 1. seed coverage: rebuild the EXACT worker seed list (scout-worker.ts lines 33-44) ---
const k = 3;
const pg = new PolygonsGenerator(params, []);
const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
console.log(`VCs generated: ${vcs.length}`);
const twelve = vcs.filter((v) => v.name.includes('12'));
console.log(`VCs containing a 12-gon: ${twelve.map((v) => v.name).join(' | ')}`);

const adj: Record<string, string[]> = {};
for (const vc of vcs) adj[vc.name] = [];
for (let i = 0; i < vcs.length; i++)
	for (let j = i + 1; j < vcs.length; j++)
		if (vcs[i].isCompatible(vcs[j])) { adj[vcs[i].name].push(vcs[j].name); adj[vcs[j].name].push(vcs[i].name); }
const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
const seedSets = new SeedSetExtractor(graph).findSeedSets(k);
const seeds = new SeedBuilder().buildSeeds(k, 1, { seedSetLoader: () => seedSets });
const useSeeds = seeds.filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2);
console.log(`worker seed list: ${useSeeds.length} seeds (expect 447)`);

// t3007 VC types: 3.12.12, 3.3.4.12, 3.4.6.4 — match as multisets of polygon sizes per vertex,
// since VC names are cyclic-order-sensitive strings.
const wantSets = [
	[3, 12, 12],
	[3, 3, 4, 12],
	[3, 4, 6, 4],
].map((a) => a.slice().sort((x, y) => x - y).join(','));
const msOf = (name: string) => name.split(',').map(Number).sort((x, y) => x - y).join(',');

const hits: { idx: number; name: string }[] = [];
useSeeds.forEach((s, idx) => {
	const names = [...new Set(s.vertexConfigurations.map((v) => v.name))];
	const sets = names.map(msOf).sort();
	const want = wantSets.slice().sort();
	if (sets.length === want.length && sets.every((x, i) => x === want[i])) hits.push({ idx, name: s.name });
});
console.log(`\nseeds with VC multiset {3.12.12; 3.3.4.12; 3.4.6.4}: ${hits.length}`);
for (const h of hits) console.log(`  idx=${h.idx}  ${h.name}`);

// Looser check: any seed containing a 3.12.12-type VC at all
const loose = useSeeds.filter((s) =>
	s.vertexConfigurations.some((v) => msOf(v.name) === wantSets[0]));
console.log(`seeds containing a 3.12.12 VC: ${loose.length}`);

// --- 2. t3007 lattice characterization from the pinned oracle ---
const oracle = loadOracle();
const o = oracle['t3007'];
console.log(`\nt3007 raw: T1=[${o.T1}] T2=[${o.T2}] seeds=${o.Seed.length}`);
const rec = reconstructOracleCell('t3007', o);
if ('error' in rec) {
	console.log(`reconstruction ERROR: ${rec.error}`);
} else {
	const [u, v] = rec.cell.basisExact;
	const uV = u.toVector(); const vV = v.toVector();
	const det = detSurd(u, v).abs();
	const lu = Math.hypot(uV.x, uV.y), lv = Math.hypot(vV.x, vV.y);
	const dot = uV.x * vV.x + uV.y * vV.y;
	const ang = (Math.acos(dot / (lu * lv)) * 180) / Math.PI;
	console.log(`|u|=${lu.toFixed(4)}  |v|=${lv.toFixed(4)}  angle=${ang.toFixed(2)}°  |det|=${(uV.x * vV.y - uV.y * vV.x).toFixed(4)}`);
	console.log(`detSurd=(P=${det.P},Q=${det.Q},R=${det.R},S=${det.S},D=${det.D})`);
	console.log(`cell polygons: ${rec.cell.cellPolygons.length} — ${rec.cell.cellPolygons.map((p) => p.getName()).sort().join(',')}`);
	console.log(`poolLmax reference: 8.12 — long side ${Math.max(lu, lv).toFixed(4)} ${Math.max(lu, lv) > 8.12 ? 'EXCEEDS' : 'within'}`);
}
