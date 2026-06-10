/* Probe 5: in the real t3007, does any 3.3.4.12 vertex have BOTH a 3.12.12 neighbor and a
 * 3.4.6.4 neighbor? If not, no connected 3-type cluster exists and the SeedBuilder paradigm
 * (seed = connected k-cluster covering all k types) cannot represent t3007 at all.
 *   pnpm tsx scripts/diag-t3007-neighbors.ts
 */
import { PolygonType, type GeneratorParameters } from '@/classes';
import { computeRing } from '@/classes/algorithm/PolygonsGenerator';
import { setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import { KUniformityChecker } from '@/classes/algorithm/KUniformityChecker';
import { canonicalizeVertexFigure } from '@/lib/utils/vertexFigureHue';
import { loadOracle, reconstructOracleCell } from './oracle-match';

const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns: [3, 4, 6, 12] } };
const baseRing = computeRing(params);
setActiveRing(baseRing.N === 24 ? baseRing : CyclotomicRing.create(24));

const o = loadOracle()['t3007'];
const rec = reconstructOracleCell('t3007', o);
if ('error' in rec) throw new Error(rec.error);
const cell = rec.cell;
const res = new KUniformityChecker().vertexOrbits(cell.cellPolygons, cell.basisExact[0], cell.basisExact[1]);
if (!res) throw new Error('vertexOrbits null');

// vcOfOrbit (same recipe as probe 2)
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
console.log(`orbit types: ${vcOfOrbit.map((n, i) => `${i}=${n}`).join('  ')}`);

// adjacency: vertex -> neighbor orbit ids (via polygon boundary edges, both endpoints tiling vertices)
const nbrOrbits = new Map<string, Set<number>>(); // vertex key -> neighbor orbit set
const orbitOfKey = new Map<string, number>();
for (const q of res.block) {
	const vs = q.exactVertices!;
	for (let i = 0; i < vs.length; i++) {
		const a = vs[i];
		const b = vs[(i + 1) % vs.length];
		const oa = res.orbitOf(a);
		const ob = res.orbitOf(b);
		if (oa == null || ob == null) continue;
		const ka = a.key(); const kb = b.key();
		orbitOfKey.set(ka, oa); orbitOfKey.set(kb, ob);
		if (!nbrOrbits.has(ka)) nbrOrbits.set(ka, new Set());
		if (!nbrOrbits.has(kb)) nbrOrbits.set(kb, new Set());
		nbrOrbits.get(ka)!.add(ob);
		nbrOrbits.get(kb)!.add(oa);
	}
}

// neighbor-type profiles per orbit (use interior vertices: full degree = VC length)
const profile = new Map<number, Map<string, number>>();
for (const [vk, nset] of nbrOrbits) {
	const orb = orbitOfKey.get(vk)!;
	const deg = [...nset].sort().join(',');
	if (!profile.has(orb)) profile.set(orb, new Map());
	const m = profile.get(orb)!;
	m.set(deg, (m.get(deg) ?? 0) + 1);
}
for (const [orb, m] of [...profile].sort((a, b) => a[0] - b[0])) {
	console.log(`orbit ${orb} (${vcOfOrbit[orb]}): neighbor-orbit-set histogram:`);
	for (const [sig, n] of [...m].sort()) console.log(`   {${sig.split(',').map((s) => vcOfOrbit[+s]).join(' | ')}} ×${n}`);
}
