/*
 * Independent k-check: run the EXACT vertex-orbit counter (KUniformityChecker) on Čtrnáct cells,
 * ignoring the `07_`-style label entirely. Reconstructs each cell from {T1,T2,Seed} (area-certified),
 * then counts vertex-transitivity classes under the FULL symmetry group. This is our own answer to
 * "is this tiling really k=N", not a re-read of Čtrnáct's combinatorial bookkeeping.
 *
 * Validates the counter on known-truth low-k tilings first (Čtrnáct's k=1..6 labels reproduce the
 * textbook 10/20/61/151/332/673, so they are solid ground truth), then runs the weight violators.
 *
 *   pnpm tsx scripts/ctrnact-kcheck.ts [id ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import { CyclotomicRing, setActiveRing } from '@/classes/Cyclotomic';
import { KUniformityChecker } from '@/classes/algorithm/KUniformityChecker';
import { reconstructOracleCellExact } from './oracleReconstructExact';

setActiveRing(CyclotomicRing.create(24));

type T = { id: string; k: number; family: string; T1?: number[]; T2?: number[]; Seed?: number[][] };
const ds = JSON.parse(fs.readFileSync(process.env.CTRNACT_DS || path.join(process.cwd(), 'figures', 'data', 'ctrnact.json'), 'utf8')) as { tilings: T[] };
const byId = new Map(ds.tilings.map((t) => [t.id, t]));

function measureK(t: T): number | null | string {
	if (!t.T1 || !t.T2 || !t.Seed) return 'no geometry';
	const res = reconstructOracleCellExact(t.id, { T1: t.T1, T2: t.T2, Seed: t.Seed });
	if ('error' in res) return `recon: ${res.error}`;
	const { cellPolygons, basisExact } = res.cell;
	return new KUniformityChecker().countVertexOrbits(cellPolygons, basisExact![0], basisExact![1]);
}

// default set: one representative per k (first by id) for validation + the known violators
const firstPerK: T[] = [];
for (let k = 1; k <= 8; k++) {
	const one = ds.tilings.find((t) => t.k === k && t.T1);
	if (one) firstPerK.push(one);
}
const violatorIds = [
	'ctrnact-07_36-4j5_5b2-1', // the tiling under scrutiny (weight 18)
];
// pull the k=1 4.6.12 (weight-5) and a k=8 heavy one by family if present
const k1_46_12 = ds.tilings.find((t) => t.k === 1 && t.family.split('.').sort().join('.') === '12.4.6'.split('.').sort().join('.'));
if (k1_46_12) violatorIds.push(k1_46_12.id);

const argvIds = process.argv.slice(2);
const targets: T[] = argvIds.length
	? argvIds.map((id) => byId.get(id)).filter((t): t is T => !!t)
	: [...firstPerK, ...violatorIds.map((id) => byId.get(id)).filter((t): t is T => !!t)];

console.log('claimed  measured  match  id  (family)');
console.log('─'.repeat(70));
let mism = 0;
for (const t of targets) {
	const m = measureK(t);
	const ok = typeof m === 'number' && m === t.k;
	if (!ok && typeof m === 'number') mism++;
	const mark = typeof m !== 'number' ? '·' : ok ? '✓' : '✗ MISMATCH';
	console.log(`  k=${t.k}     ${String(m).padStart(4)}     ${mark.padEnd(11)} ${t.id}  (${t.family})`);
}
console.log('─'.repeat(70));
console.log(mism === 0 ? 'all measured orbit counts equal the claimed k.' : `${mism} MISMATCH(es) — claimed k ≠ measured orbits.`);
