/*
 * FAIL-FAST test of the hypothesis "N can be the dedup AUTHORITY" (so primitiveReducedCell + pairwise
 * congruence can be skipped). One genuine failure kills it. No slow pairwise needed: the oracle already
 * IS the ground-truth partition (A068599 distinct tilings per k), and N works directly on {T1,T2,Seed}.
 *
 *   FALSE MERGE (fatal): distinct N-keys per k must equal A068599. A collision merges two real tilings.
 *   FALSE SPLIT on a supercell (needed to skip primitiveReducedCell): a non-primitive re-encoding must
 *     hash to the same key as its primitive form.
 *   FALSE SPLIT under isometry/basis/translation: re-encodings must be N-invariant.
 *
 *   pnpm tsx scripts/n-authority-test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { nKeyOfSymbol } from '@/classes/algorithm/canonicalFormN';

type Vec = number[];
const mulw = (v: Vec): Vec => [-v[3], v[0], v[1] + v[3], v[2]];
const conj = (v: Vec): Vec => [v[0] + v[2], v[1], -v[2], -v[1] - v[3]];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
const scaleV = (v: Vec, m: number): Vec => [v[0] * m, v[1] * m, v[2] * m, v[3] * m];
const W: Vec[] = []; { let w: Vec = [1, 0, 0, 0]; for (let i = 0; i < 12; i++) { W.push(w); w = mulw(w); } }
const rotc = (v: Vec, j: number, f: boolean): Vec => { let x = f ? conj(v) : v; for (let i = 0; i < ((j % 12) + 12) % 12; i++) x = mulw(x); return x; };

const A068599: Record<number, number> = { 1: 10, 2: 20, 3: 61, 4: 151, 5: 332, 6: 673, 7: 1472, 8: 2850, 9: 5960, 10: 11866, 11: 24459 };

type Entry = { id: string; k: number; T1: Vec; T2: Vec; Seed: Vec[] };
const raw: Entry[] = JSON.parse(fs.readFileSync(path.resolve('figures/data/ctrnact.json'), 'utf8')).tilings;
console.log(`\n=============== FAIL-FAST: can N be the dedup authority? (${raw.length} tilings, k≤11) ===============\n`);

let FAILED = false;
const keyOf = (e: { T1: Vec; T2: Vec; Seed: Vec[] }) => nKeyOfSymbol([e.T1, e.T2, ...e.Seed]);

// ---- TEST 1: FALSE MERGE across the whole oracle (distinct N-keys per k == A068599) ----
console.log('-- test 1: false-merge (distinct N-keys per k must equal A068599) --');
const byK = new Map<number, Entry[]>();
for (const e of raw) { const a = byK.get(e.k) ?? []; a.push(e); byK.set(e.k, a); }
const t0 = performance.now();
let nulls = 0;
for (const k of [...byK.keys()].sort((a, b) => a - b)) {
	const items = byK.get(k)!;
	const keys = new Map<string, string>(); // N-key -> first tiling id
	const collisions: [string, string][] = [];
	for (const e of items) {
		const nk = keyOf(e);
		if (nk === null) { nulls++; continue; }
		const prev = keys.get(nk);
		if (prev && prev !== e.id) collisions.push([prev, e.id]);
		else keys.set(nk, e.id);
	}
	const distinct = keys.size;
	const target = A068599[k];
	const ok = distinct === target && collisions.length === 0;
	FAILED = FAILED || !ok;
	console.log(`   k=${String(k).padStart(2)}: target ${String(target).padStart(5)} | distinct N ${String(distinct).padStart(5)} | ${ok ? 'OK' : `*** FALSE MERGE: ${collisions.length} collisions e.g. ${collisions[0]}`}`);
}
console.log(`   (${((performance.now() - t0) / 1000).toFixed(1)}s to hash all ${raw.length}; nulls=${nulls})`);

// ---- TEST 2: FALSE SPLIT on supercells (skip primitiveReducedCell) + isometry/basis/translation ----
console.log('\n-- test 2: false-split — re-encodings must be N-invariant --');
let rng = 987654321;
const rnd = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];

function reencodeIso(e: Entry): { T1: Vec; T2: Vec; Seed: Vec[] } {
	const j = Math.floor(rnd() * 12), f = rnd() < 0.5;
	const uni = pick([[1, 0, 0, 1], [1, 0, 1, 1], [1, 1, 0, 1], [2, 1, 1, 1], [1, 0, -1, 1]]);
	let T1 = rotc(e.T1, j, f), T2 = rotc(e.T2, j, f);
	const nT1 = add(scaleV(T1, uni[0]), scaleV(T2, uni[1]));
	const nT2 = add(scaleV(T1, uni[2]), scaleV(T2, uni[3]));
	const c = rotc(pick(e.Seed), j, f);
	return { T1: nT1, T2: nT2, Seed: e.Seed.map((s) => add(rotc(s, j, f), c)) };
}
// non-primitive supercell of index m: lattice (m·T1, T2), seeds lifted over the m cosets
function supercell(e: Entry, m: number): { T1: Vec; T2: Vec; Seed: Vec[] } {
	const T1 = scaleV(e.T1, m);
	const seeds: Vec[] = [];
	for (const s of e.Seed) for (let i = 0; i < m; i++) seeds.push(add(s, scaleV(e.T1, i)));
	return { T1, T2: e.T2, Seed: seeds };
}

// sample across all k; hammer each with isometries + supercells
const sample: Entry[] = [];
for (const k of byK.keys()) { const items = byK.get(k)!; for (let i = 0; i < Math.min(30, items.length); i++) sample.push(items[i]); }
let splitIso = 0, splitSuper = 0, checked = 0;
for (const e of sample) {
	const base = keyOf(e);
	for (let r = 0; r < 20; r++) { if (keyOf(reencodeIso(e)) !== base) { splitIso++; if (splitIso <= 3) console.log(`   *** ISO SPLIT ${e.id}`); } checked++; }
	for (const m of [2, 3, 4, 5, 7]) { if (keyOf(supercell(e, m)) !== base) { splitSuper++; if (splitSuper <= 3) console.log(`   *** SUPERCELL SPLIT ${e.id} index ${m}`); } checked++; }
}
FAILED = FAILED || splitIso > 0 || splitSuper > 0;
console.log(`   ${sample.length} tilings × (20 isometries + 5 supercells) = ${checked} re-encodings`);
console.log(`   isometry/basis/translation splits: ${splitIso} | supercell splits: ${splitSuper} | ${splitIso === 0 && splitSuper === 0 ? 'OK' : '*** FALSE SPLIT'}`);

console.log(`\n=============== VERDICT: ${FAILED ? 'N is NOT a safe authority — option 1 DEAD, use option 2' : 'N survived — no false merge across 47854 tilings, no false split. Option 1 empirically viable; now PROVE it.'} ===============\n`);
process.exit(FAILED ? 1 : 0);
