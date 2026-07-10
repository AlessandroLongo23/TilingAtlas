/*
 * Ceiling family extension: count k for generated tri+hex tube candidates (triangular
 * lattice minus independent hexagon set) via the validated reconstruct→countVertexOrbits
 * toolchain. Reports min-k per tube height p, and validates CHECK-* against catalogue k.
 *
 * Input : scratchpad candidates.json  [{id,p,T1,T2,Seed,catK?}]
 * Run   : pnpm tsx scripts/ceiling-extend.ts <candidates.json> <out.csv>
 */
import { reconstructOracleCell } from './oracle-match';
import { getActiveRing } from '@/classes/Cyclotomic';
import { KUniformityChecker } from '@/classes/algorithm/KUniformityChecker';
import fs from 'node:fs';

const ring = getActiveRing();
if (ring.N !== 24) throw new Error(`ring N=${ring.N}`);
const IN = process.argv[2];
const OUT = process.argv[3] ?? '';
type C = { id: string; p: number; T1: number[]; T2: number[]; Seed: number[][]; catK?: number };
const cands = JSON.parse(fs.readFileSync(IN, 'utf8')) as C[];
const checker = new KUniformityChecker();

const minK: Record<number, number> = {};
const rows: string[] = ['id,p,k,valid,catK'];
let checkOk = 0, checkBad = 0, valid = 0, invalid = 0;

for (const c of cands) {
	const rec = reconstructOracleCell(c.id, { T1: c.T1, T2: c.T2, Seed: c.Seed });
	if ('error' in rec) {
		invalid++;
		if (c.id.startsWith('CHECK')) console.log(`  ${c.id}  ✗ reconstruct: ${rec.error}`);
		rows.push(`${c.id},${c.p},,0,${c.catK ?? ''}`);
		continue;
	}
	const [u, v] = rec.cell.basisExact;
	const k = checker.countVertexOrbits(rec.cell.cellPolygons, u, v);
	if (k === null) { invalid++; rows.push(`${c.id},${c.p},,0,${c.catK ?? ''}`); continue; }
	valid++;
	rows.push(`${c.id},${c.p},${k},1,${c.catK ?? ''}`);
	if (c.id.startsWith('CHECK')) {
		const ok = k === c.catK;
		console.log(`  ${c.id}  catK=${c.catK}  counted=${k}  ${ok ? '✓' : '✗ MISMATCH'}`);
		if (ok) checkOk++; else checkBad++;
	} else {
		minK[c.p] = Math.min(minK[c.p] ?? 999, k);
	}
}

console.log(`\nCHECK: ${checkOk} ok, ${checkBad} bad;  generated: ${valid} valid, ${invalid} invalid`);
console.log(`\n p | min-k | s*=2p | s*/k  | p-k   |  vs 2.33k+2.7 / 2.4k+3 / 2.5k`);
for (const p of Object.keys(minK).map(Number).sort((a, b) => a - b)) {
	const k = minK[p], s = 2 * p;
	console.log(
		`${String(p).padStart(2)} | ${String(k).padStart(5)} | ${String(s).padStart(5)} | ${(s / k).toFixed(2)} | ${String(p - k).padStart(4)}  |  ${(2.33 * k + 2.7).toFixed(1)} / ${(2.4 * k + 3).toFixed(1)} / ${(2.5 * k).toFixed(1)}`
	);
}
if (OUT) { fs.writeFileSync(OUT, rows.join('\n') + '\n'); console.log(`\n-> ${OUT}`); }
