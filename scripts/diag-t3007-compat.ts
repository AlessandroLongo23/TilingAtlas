/* Probe 2 for the missing t3007 (NOTES §28.3 Fix-2): confirm its true cyclic vertex types,
 * its type-adjacency pairs, and whether the compatibility graph carries the edges that
 * findSeedSets needs to emit the seed triple.
 *   pnpm tsx scripts/diag-t3007-compat.ts
 */
import {
	PolygonsGenerator, VCGenerator,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import { KUniformityChecker } from '@/classes/algorithm/KUniformityChecker';
import { canonicalizeVertexFigure } from '@/lib/utils/vertexFigureHue';
import { loadOracle, reconstructOracleCell } from './oracle-match';

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns: [3, 4, 6, 12] } };
const baseRing = computeRing(params);
setActiveRing(baseRing.N === 24 ? baseRing : CyclotomicRing.create(24));

// --- 1. t3007: orbits, canonical vertex-figure names, and type-pair adjacency ---
const o = loadOracle()['t3007'];
const rec = reconstructOracleCell('t3007', o);
if ('error' in rec) throw new Error(rec.error);
const cell = rec.cell;
const res = new KUniformityChecker().vertexOrbits(cell.cellPolygons, cell.basisExact[0], cell.basisExact[1]);
if (!res) throw new Error('vertexOrbits null');
console.log(`t3007 orbits: ${res.orbits}`);

// vertex-figure name per orbit (same recipe as figures/tiling/orbits.ts)
const polysByVertexKey = new Map<string, { n: number; cx: number; cy: number }[]>();
for (const q of res.block) {
	const c = q.exactCentroid!.toVector();
	for (const vx of q.exactVertices!) {
		const k = vx.key();
		const list = polysByVertexKey.get(k);
		const entry = { n: q.n, cx: c.x, cy: c.y };
		if (list) list.push(entry);
		else polysByVertexKey.set(k, [entry]);
	}
}
const vcOfOrbit: string[] = new Array(res.orbits);
res.reps.forEach((rep, j) => {
	const rv = rep.toVector();
	const inc = polysByVertexKey.get(rep.key()) ?? [];
	const ordered = inc
		.map((e) => ({ n: e.n, ang: Math.atan2(e.cy - rv.y, e.cx - rv.x) }))
		.sort((a, b) => a.ang - b.ang)
		.map((e) => e.n);
	vcOfOrbit[res.repOrbit[j]] = canonicalizeVertexFigure(ordered).join(',');
});
console.log(`t3007 vertex types (canonical): ${vcOfOrbit.join(' | ')}`);

// type-pair adjacency: every polygon boundary edge in the block whose two endpoints are both
// tiling vertices links two orbit types.
const pairs = new Set<string>();
for (const q of res.block) {
	const vs = q.exactVertices!;
	for (let i = 0; i < vs.length; i++) {
		const a = res.orbitOf(vs[i]);
		const b = res.orbitOf(vs[(i + 1) % vs.length]);
		if (a == null || b == null) continue;
		const [x, y] = [vcOfOrbit[a], vcOfOrbit[b]].sort();
		pairs.add(`${x}  <->  ${y}`);
	}
}
console.log(`t3007 edge-adjacent type pairs:`);
for (const p of [...pairs].sort()) console.log(`  ${p}`);

// --- 2. compatibility graph among the generated VCs ---
const pg = new PolygonsGenerator(params, []);
const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
const byName = new Map(vcs.map((v) => [v.name, v]));
const interesting = ['3,12,12', '3,3,4,12', '3,3,12,4', '3,4,3,12', '3,4,6,4', '4,6,12', '4,12,6'];
console.log(`\ncompatibility adjacency (generated VC names: ${vcs.map((v) => v.name).join(' ')})`);
for (const a of interesting) {
	const va = byName.get(a);
	if (!va) { console.log(`  ${a}: NOT GENERATED`); continue; }
	const nbrs = vcs.filter((vb) => vb.name !== a && va.isCompatible(vb)).map((vb) => vb.name);
	console.log(`  ${a}: ${nbrs.join(' | ') || '(none)'}`);
}

// --- 3. the specific pairs t3007 needs ---
console.log(`\ndirect isCompatible checks:`);
for (const [a, b] of [
	['3,3,4,12', '3,12,12'], ['3,3,12,4', '3,12,12'],
	['3,3,4,12', '3,4,6,4'], ['3,3,12,4', '3,4,6,4'],
	['3,3,4,12', '3,3,4,12'], ['3,3,4,12', '3,3,12,4'],
	['3,4,3,12', '3,12,12'], ['3,4,3,12', '3,4,6,4'],
] as const) {
	const va = byName.get(a); const vb = byName.get(b);
	if (!va || !vb) { console.log(`  ${a} ~ ${b}: VC missing`); continue; }
	console.log(`  ${a} ~ ${b}: ${va.isCompatible(vb)}  (sym: ${vb.isCompatible(va)})`);
}
