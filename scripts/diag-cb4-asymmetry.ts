/* CB-4 guard firing diagnosis: cong(a,b) ≠ cong(b,a) in bucket
 * 3,3,3,3,3,3,3,3,3,3,3,3,6,6@0,0,6,0,1 of the k=3 artifact (362 raw cells).
 *
 * Phase-1 evidence gathering (systematic-debugging):
 *  (1) locate ALL asymmetric ordered pairs in the bucket (fresh memo per call — excludes memo state);
 *  (2) independent ground truth both directions (CongruenceDifferential — exact, no float windows);
 *  (3) instrumented replica of tilingsCongruent's candidate loop on the failing direction: for the
 *      passing direction's witness (Q, reflect, r), where does the INVERSE candidate die — pin,
 *      lattice, or reduced-key-set?
 *  (4) direct test of reducedClassKey's class-invariance claim (same key for every Λ-translate).
 *
 *   pnpm tsx scripts/diag-cb4-asymmetry.ts
 */
import fs from 'node:fs';
import { setActiveRing, CyclotomicRing, Cyclotomic } from '@/classes/Cyclotomic';
import { cellsCongruent, primitiveReducedCell } from '@/classes/algorithm/TilingCongruence';
import { independentCellsCongruent } from '@/classes/algorithm/CongruenceDifferential';
import { detSurd } from '@/classes/algorithm/exact/Surd';
import { sameLattice } from '@/classes/algorithm/LatticeEnumerator';
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';
import type { Polygon } from '@/classes/polygons/Polygon';
import { readResumeNdjson, deserializeCell } from './scoutCodec';

const LOG = `experiments/results/diag-cb4-asymmetry-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}.log`;
const lines: string[] = [];
function log(s: string): void {
	console.log(s);
	lines.push(s);
	fs.writeFileSync(LOG, lines.join('\n') + '\n');
}

const ring = CyclotomicRing.create(24);
setActiveRing(ring);

const { cells: raw } = readResumeNdjson('.scout-cache/k3_3.4.6.12_cap0.ndjson');
const cells = raw.map((sc) => deserializeCell(ring, sc)).map(primitiveReducedCell);
log(`raw cells: ${raw.length}`);

const nameMultiset = (cell: Polygon[]) => cell.map((p) => p.getName()).sort().join(',');
const detAbsKey = (u: Cyclotomic, v: Cyclotomic) => {
	const d = detSurd(u, v).abs();
	return `${d.P},${d.Q},${d.R},${d.S},${d.D}`;
};
const TARGET = '3,3,3,3,3,3,3,3,3,3,3,3,6,6@0,0,6,0,1';
const bucket = cells
	.map((c, gi) => ({ c, gi }))
	.filter(({ c }) => `${nameMultiset(c.cellPolygons)}@${detAbsKey(c.basisExact[0], c.basisExact[1])}` === TARGET);
log(`bucket ${TARGET}: ${bucket.length} cells (global indices ${bucket.map((b) => b.gi).join(',')})`);

// --- (1) full ordered-pair matrix, fresh memo per call ---
type Pair = { i: number; j: number; ab: boolean; ba: boolean };
const asym: Pair[] = [];
for (let i = 0; i < bucket.length; i++) {
	for (let j = i + 1; j < bucket.length; j++) {
		const ab = cellsCongruent(bucket[i].c, bucket[j].c, new Map());
		const ba = cellsCongruent(bucket[j].c, bucket[i].c, new Map());
		if (ab !== ba) {
			asym.push({ i, j, ab, ba });
			log(`ASYM: [${i}]→[${j}] = ${ab}, [${j}]→[${i}] = ${ba} (global ${bucket[i].gi}, ${bucket[j].gi})`);
		}
	}
}
log(`asymmetric pairs: ${asym.length}`);

// --- replicas of the module-private helpers (faithful copies for instrumentation) ---
function reducedClassKey(p: Polygon, u: Cyclotomic, v: Cyclotomic): string {
	const uV = u.toVector();
	const vV = v.toVector();
	const det = uV.x * vV.y - uV.y * vV.x;
	const c = p.exactCentroid!.toVector();
	const ma = Math.round((c.x * vV.y - c.y * vV.x) / det);
	const mb = Math.round((uV.x * c.y - uV.y * c.x) / det);
	let base = p;
	if (ma !== 0 || mb !== 0) {
		const T = u.scaleRational(BigInt(-ma), 1n).add(v.scaleRational(BigInt(-mb), 1n));
		base = p.clone();
		base.translateExact(T);
	}
	const cellDiam = Math.max(Math.hypot(uV.x, uV.y), Math.hypot(vV.x, vV.y));
	const lim = 1.5 * cellDiam + 0.1;
	let bestKey = base.exactKey();
	for (let i = -2; i <= 2; i++) {
		for (let j = -2; j <= 2; j++) {
			if (i === 0 && j === 0) continue;
			const T = u.scaleRational(BigInt(i), 1n).add(v.scaleRational(BigInt(j), 1n));
			const q = base.clone();
			q.translateExact(T);
			const cf = q.exactCentroid!.toVector();
			if (Math.hypot(cf.x, cf.y) > lim) continue;
			const kq = q.exactKey();
			if (kq < bestKey) bestKey = kq;
		}
	}
	return bestKey;
}

// instrumented replica of tilingsCongruent's candidate loop
function probeDirection(A: PeriodCell, B: PeriodCell, label: string): void {
	const cellA = A.cellPolygons;
	const cellB = B.cellPolygons;
	const [uA, vA] = A.basisExact;
	const [uB, vB] = B.basisExact;
	const N = ring.N;
	const ZERO = Cyclotomic.ZERO(ring);
	const KB = new Set(cellB.map((q) => reducedClassKey(q, uB, vB)));
	log(`  ${label}: |KB| = ${KB.size} (cell size ${cellB.length}${KB.size !== cellB.length ? ' ⚑ KB COLLAPSED — B reduction not injective' : ''})`);
	const P0 = cellA.reduce((m, p) => (p.exactKey() < m.exactKey() ? p : m));
	const c0 = P0.exactCentroid!;
	const p0Name = P0.getName();
	const mapPoint = (z: Cyclotomic, reflect: boolean, r: number, T: Cyclotomic): Cyclotomic =>
		(reflect ? z.conj().mulZeta(r) : z.mulZeta(r)).add(T);
	const transformedKey = (p: Polygon, reflect: boolean, r: number, T: Cyclotomic): string => {
		const c = mapPoint(p.exactCentroid!, reflect, r, T);
		const vks = p.exactVertices!.map((vx) => mapPoint(vx, reflect, r, T).key()).sort().join(';');
		return `${p.getName()}:${c.key()}:${vks}`;
	};
	let pinPass = 0;
	let latPass = 0;
	const targets = cellB.filter((q) => q.getName() === p0Name);
	for (const Q of targets) {
		const cQ = Q.exactCentroid!;
		const qKey = Q.exactKey();
		for (const reflect of [false, true]) {
			for (let r = 0; r < N; r++) {
				const Mc0 = reflect ? c0.conj().mulZeta(r) : c0.mulZeta(r);
				const T = cQ.sub(Mc0);
				if (transformedKey(P0, reflect, r, T) !== qKey) continue;
				pinPass++;
				const Mu = reflect ? uA.conj().mulZeta(r) : uA.mulZeta(r);
				const Mv = reflect ? vA.conj().mulZeta(r) : vA.mulZeta(r);
				if (!sameLattice(uB, vB, Mu, Mv)) continue;
				latPass++;
				const mapped = new Set<string>();
				for (const p of cellA) {
					const gp = p.transformedRigid(ZERO, reflect, 0, r, T, 'full');
					mapped.add(reducedClassKey(gp, uB, vB));
				}
				const missing = [...mapped].filter((kk) => !KB.has(kk)).length;
				log(
					`  ${label}: candidate reflect=${reflect} r=${r} PIN+LAT pass — |mapped|=${mapped.size}, missing from KB: ${missing}${mapped.size === cellB.length && missing === 0 ? ' ✓ WOULD ACCEPT' : ''}`
				);
			}
		}
	}
	log(`  ${label}: pin passes=${pinPass}, lattice passes=${latPass}, targets=${targets.length}`);
}

for (const { i, j } of asym) {
	const A = bucket[i].c;
	const B = bucket[j].c;
	log(`\n=== asymmetric pair [${i}]↔[${j}] ===`);
	const fa = A.basisExact.map((x) => {
		const w = x.toVector();
		return `(${w.x.toFixed(4)},${w.y.toFixed(4)})`;
	});
	const fb = B.basisExact.map((x) => {
		const w = x.toVector();
		return `(${w.x.toFixed(4)},${w.y.toFixed(4)})`;
	});
	log(`  Λ_A = ${fa.join(' ')}, Λ_B = ${fb.join(' ')}`);

	// --- (2) independent ground truth ---
	const iab = independentCellsCongruent(A, B);
	const iba = independentCellsCongruent(B, A);
	log(`  independent: A→B = ${iab}, B→A = ${iba}  (ground truth — exact, no float windows)`);

	// --- (3) instrumented production loop, both directions ---
	probeDirection(A, B, 'prod A→B');
	probeDirection(B, A, 'prod B→A');

	// --- (4) reducedClassKey class-invariance on both cells' own bases ---
	for (const [name, cell] of [
		[`A(idx${i})`, A],
		[`B(idx${j})`, B],
	] as [string, PeriodCell][]) {
		const [u, v] = cell.basisExact;
		let violations = 0;
		for (const p of cell.cellPolygons) {
			const k0 = reducedClassKey(p, u, v);
			for (const [m, n] of [
				[1, 0],
				[0, 1],
				[-1, 0],
				[0, -1],
				[1, 1],
				[-1, -1],
				[2, -1],
				[-2, 1],
				[3, 2],
				[-3, -2],
			]) {
				const T = u.scaleRational(BigInt(m), 1n).add(v.scaleRational(BigInt(n), 1n));
				const q = p.clone();
				q.translateExact(T);
				if (reducedClassKey(q, u, v) !== k0) violations++;
			}
		}
		log(`  reducedClassKey invariance on ${name}: ${violations} violations over ${cell.cellPolygons.length}×10 translates`);
	}
}
log('\ndone.');

// --- (5) dump ONE concrete invariance violation, reconstructible in a unit test ---
outer: for (const { i, j } of asym) {
	for (const [nm, cell] of [[`A`, bucket[i].c], [`B`, bucket[j].c]] as [string, PeriodCell][]) {
		const [u, v] = cell.basisExact;
		for (const p of cell.cellPolygons) {
			const k0 = reducedClassKey(p, u, v);
			for (const [m, n] of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,-1],[2,-1],[-2,1],[3,2],[-3,-2]]) {
				const T = u.scaleRational(BigInt(m), 1n).add(v.scaleRational(BigInt(n), 1n));
				const q = p.clone();
				q.translateExact(T);
				if (reducedClassKey(q, u, v) !== k0) {
					log(`\nVIOLATION DUMP (cell ${nm}, shift (${m},${n})):`);
					log(`  u.key = ${u.key()}`);
					log(`  v.key = ${v.key()}`);
					log(`  poly n=${(p as any).n} name=${p.getName()}`);
					log(`  vertex keys: ${p.exactVertices!.map((x) => x.key()).join('  ')}`);
					log(`  edgeDirs: ${JSON.stringify((p as any).edgeDirs)}`);
					log(`  key(p)   = ${k0}`);
					log(`  key(p+λ) = ${reducedClassKey(q, u, v)}`);
					break outer;
				}
			}
		}
	}
}
log('dump done.');
