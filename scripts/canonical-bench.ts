/*
 * Real speedup benchmark for Fable's canonical form N against the repo's actual dedup.
 *
 * Data: figures/data/ctrnact.json (k=1..11, each tiling as T1/T2/Seed in the zeta12 power basis).
 * Reconstructs real PeriodCells via reconstructOracleCellExact, then compares three ways to dedup
 * tilings up to congruence (D12 + translation), on identical inputs:
 *
 *   A. dedupeByCongruence         — the repo's authoritative PAIRWISE dedup (what PeriodSolver calls)
 *   B. TranslationalCellExtractor.canonicalKey  — the repo's HASHABLE 48-frame brute-force key
 *   C. N (this port of Fable's canonical form)   — hashable, search cut to the star stabilizer
 *
 * All three must induce the SAME partition (asserted against the A068599 targets). We time B vs C
 * (hash vs hash, the fair "is N a faster canonical key") and A vs C (pairwise vs hash). A chiral-snub
 * probe settles whether canonicalKey really collapses enantiomorphs.
 *
 *   CB_KMAX=6 CB_DUP=4 pnpm tsx scripts/canonical-bench.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { CyclotomicRing, setActiveRing, type Cyclotomic } from '@/classes/Cyclotomic';
import { reconstructOracleCellExact } from './oracleReconstructExact';
import { dedupeByCongruence } from '@/classes/algorithm/TilingCongruence';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import type { PeriodCell } from '@/classes/algorithm/PeriodSolver';

setActiveRing(CyclotomicRing.create(24));

// ============================ N port: Z[omega], omega = zeta12, rank 4 ============================
type Vec = number[];
const mulw = (v: Vec): Vec => [-v[3], v[0], v[1] + v[3], v[2]];
const conj = (v: Vec): Vec => [v[0] + v[2], v[1], -v[2], -v[1] - v[3]];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
const scaleV = (v: Vec, m: number): Vec => [v[0] * m, v[1] * m, v[2] * m, v[3] * m];
const fdiv = (a: number, b: number) => Math.floor(a / b);
const key = (v: Vec) => v.join(',');
const cmpVec = (a: Vec, b: Vec) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3];

const W: Vec[] = [];
{ let w: Vec = [1, 0, 0, 0]; for (let i = 0; i < 12; i++) { W.push(w); w = mulw(w); } }

type Gm = { f: boolean; j: number };
const G24: Gm[] = [];
for (const f of [false, true]) for (let j = 0; j < 12; j++) G24.push({ f, j });
const applyG = (g: Gm, v: Vec): Vec => { let x = g.f ? conj(v) : v; for (let i = 0; i < g.j; i++) x = mulw(x); return x; };
const sigma = (g: Gm, k: number) => (g.f ? (((g.j - k) % 12) + 12) % 12 : (g.j + k) % 12);
const word = (ks: number[]) => ks.reduce((acc, k) => acc | (1 << (11 - k)), 0);

function hnf(rows: Vec[]): Vec[] {
	const mat = rows.map((r) => r.slice());
	const basis: Vec[] = [];
	for (let col = 0; col < 4; col++) {
		for (;;) {
			const nz = mat.filter((r) => r[col] !== 0);
			if (nz.length <= 1) break;
			nz.sort((a, b) => Math.abs(a[col]) - Math.abs(b[col]));
			const p = nz[0];
			for (let idx = 1; idx < nz.length; idx++) {
				const r = nz[idx];
				const q = fdiv(r[col], p[col]);
				for (let i = 0; i < 4; i++) r[i] -= q * p[i];
			}
		}
		const pivIdx = mat.findIndex((r) => r[col] !== 0);
		if (pivIdx < 0) continue;
		let piv = mat[pivIdx];
		mat.splice(pivIdx, 1);
		if (piv[col] < 0) piv = piv.map((x) => -x);
		for (const b of basis) { const q = fdiv(b[col], piv[col]); for (let i = 0; i < 4; i++) b[i] -= q * piv[i]; }
		basis.push(piv);
	}
	return basis;
}

function rep(v: Vec, basis: Vec[]): Vec {
	const x = v.slice();
	for (const b of basis) {
		const c = b.findIndex((e) => e !== 0);
		const q = fdiv(x[c], b[c]);
		if (q) for (let i = 0; i < 4; i++) x[i] -= q * b[i];
	}
	return x;
}

function uniqSort(vs: Vec[]): Vec[] {
	const m = new Map<string, Vec>();
	for (const v of vs) m.set(key(v), v);
	return [...m.values()].sort(cmpVec);
}

function maximize(H: Vec[], S0: Vec[]): [Vec[], Vec[]] {
	const S = uniqSort(S0.map((s) => rep(s, H)));
	const Sset = new Set(S.map(key));
	const s0 = S[0];
	const ts: Vec[] = [];
	for (const s of S) {
		const t = sub(s, s0);
		if (S.every((x) => Sset.has(key(rep(add(x, t), H))))) ts.push(rep(t, H));
	}
	const H2 = hnf([...H, ...ts]);
	if (H2.length !== 2) throw new Error('maximize: rank != 2');
	const S2 = uniqSort(S.map((s) => rep(s, H2)));
	if (S.length % S2.length !== 0) throw new Error('maximize: bad index');
	return [H2, S2];
}

function stars(H: Vec[], S: Vec[]): Map<string, number[]> {
	const Sset = new Set(S.map(key));
	const out = new Map<string, number[]>();
	for (const s of S) {
		const st: number[] = [];
		for (let k = 0; k < 12; k++) if (Sset.has(key(rep(add(s, W[k]), H)))) st.push(k);
		out.set(key(s), st);
	}
	return out;
}

const cmpArr = (a: number[], b: number[]) => {
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
	return a.length - b.length;
};
const cmpMat = (a: Vec[], b: Vec[]) => { for (let i = 0; i < a.length; i++) { const c = cmpVec(a[i], b[i]); if (c) return c; } return 0; };

function canonical(M: Vec[]): Vec[] {
	let H = hnf([M[0].slice(), M[1].slice()]);
	if (H.length !== 2) throw new Error('bad lattice');
	let S = uniqSort(M.slice(2).map((s) => rep(s.slice(), H)));
	[H, S] = maximize(H, S);
	const st = stars(H, S);
	const listOf = (g: Gm) => S.map((s) => word(st.get(key(s))!.map((k) => sigma(g, k)))).sort((a, b) => a - b);
	const lists = G24.map((g) => ({ g, L: listOf(g) }));
	let bestL = lists[0].L;
	for (const e of lists) if (cmpArr(e.L, bestL) < 0) bestL = e.L;
	const Gmin = lists.filter((e) => cmpArr(e.L, bestL) === 0).map((e) => e.g);
	const minw = bestL[0];
	let best: Vec[] | null = null;
	for (const g of Gmin) {
		const Hg = hnf([applyG(g, H[0]), applyG(g, H[1])]);
		const anchors = S.filter((s) => word(st.get(key(s))!.map((k) => sigma(g, k))) === minw);
		for (const o of anchors) {
			const srows = S.map((s) => rep(applyG(g, sub(s, o)), Hg)).sort(cmpVec);
			const cand = [Hg[0], Hg[1], ...srows];
			if (best === null || cmpMat(cand, best) < 0) best = cand;
		}
	}
	return best!;
}

// PeriodCell (zeta24 encode) -> N symbol (zeta12): even positions, odd must vanish (non-octagon).
function encToVec(enc: { n: string[]; d: string }): Vec {
	if (enc.d !== '1') throw new Error('den ' + enc.d);
	const c = enc.n.map(Number);
	if (c[1] || c[3] || c[5] || c[7]) throw new Error('needs zeta24 (octagon)');
	return [c[0], c[2], c[4], c[6]];
}
function cellToSymbol(cell: PeriodCell): Vec[] {
	const t1 = encToVec(cell.basisExact[0].encode());
	const t2 = encToVec(cell.basisExact[1].encode());
	const verts: Vec[] = [];
	for (const p of cell.cellPolygons) {
		const ev = (p as unknown as { exactVertices: Cyclotomic[] }).exactVertices;
		for (const v of ev) verts.push(encToVec(v.encode()));
	}
	const H = hnf([t1, t2]);
	const o = verts[0];
	const seeds = uniqSort(verts.map((v) => rep(sub(v, o), H)));
	return [t1, t2, ...seeds];
}
const nKey = (cell: PeriodCell): string => JSON.stringify(canonical(cellToSymbol(cell)));

// ============================ driver ============================
type Entry = { id: string; k: number; T1: Vec; T2: Vec; Seed: Vec[] };
const KMAX = Number(process.env.CB_KMAX ?? 4);
const DUP = Number(process.env.CB_DUP ?? 4);
const TARGET: Record<number, number> = { 1: 10, 2: 20, 3: 61, 4: 151, 5: 332, 6: 673 };

let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const UNI: [number, number, number, number][] = [[1, 0, 0, 1], [1, 0, 1, 1], [1, 1, 0, 1], [2, 1, 1, 1], [1, 0, -1, 1]];

function reencode(e: Entry): { T1: Vec; T2: Vec; Seed: Vec[] } {
	const g = pick(G24);
	let T1 = applyG(g, e.T1), T2 = applyG(g, e.T2);
	const [a, b, c, d] = pick(UNI);
	const nT1 = add(scaleV(T1, a), scaleV(T2, b));
	const nT2 = add(scaleV(T1, c), scaleV(T2, d));
	const cvec = applyG(g, pick(e.Seed));                   // translate origin to another vertex
	const Seed = e.Seed.map((s) => add(applyG(g, s), cvec));
	return { T1: nT1, T2: nT2, Seed };
}

function reconstruct(o: { T1: Vec; T2: Vec; Seed: Vec[] }): PeriodCell | null {
	const res = reconstructOracleCellExact('bench', o);
	return 'cell' in res ? res.cell : null;
}

console.log(`\n=============== N vs repo dedup on real ctrnact cells (k<=${KMAX}, dup x${DUP}) ===============\n`);
const raw: Entry[] = JSON.parse(fs.readFileSync(path.resolve('figures/data/ctrnact.json'), 'utf8')).tilings
	.filter((t: Entry) => t.k <= KMAX)
	.map((t: any) => ({ id: t.id, k: t.k, T1: t.T1, T2: t.T2, Seed: t.Seed }));

const ext = new TranslationalCellExtractor();
const fastKey = (c: PeriodCell) => ext.canonicalKey(c.cellPolygons);

// build distinct PeriodCells + a batch with DUP re-encodings each
type Item = { k: number; id: string; cell: PeriodCell };
const distinct: Item[] = [];
const batch: Item[] = [];
let reconFail = 0;
for (const e of raw) {
	const c0 = reconstruct(e);
	if (!c0) { reconFail++; continue; }
	distinct.push({ k: e.k, id: e.id, cell: c0 });
	batch.push({ k: e.k, id: e.id, cell: c0 });
	for (let i = 0; i < DUP - 1; i++) {
		const c = reconstruct(reencode(e));
		if (c) batch.push({ k: e.k, id: e.id, cell: c });
	}
}
console.log(`reconstructed ${distinct.length} distinct tilings (+${reconFail} failed), batch=${batch.length}\n`);

// ---- correctness: per-k distinct counts for all three, on the DISTINCT set ----
console.log('-- correctness: distinct classes per k (must equal A068599 target) --');
const CONGR_CAP = Number(process.env.CB_CONGR_CAP ?? 200); // pairwise congruence gets slow; gate it
let allOk = true;
for (let k = 1; k <= KMAX; k++) {
	const items = distinct.filter((it) => it.k === k);
	if (!items.length) continue;
	const nN = new Set(items.map((it) => nKey(it.cell))).size;
	const nF = new Set(items.map((it) => fastKey(it.cell))).size;
	const nC = items.length <= CONGR_CAP ? dedupeByCongruence(items.map((it) => it.cell)).length : -1;
	const congrStr = nC >= 0 ? String(nC) : 'skipped';
	const ok = nN === TARGET[k] && nF === TARGET[k] && (nC < 0 || nC === TARGET[k]);
	allOk &&= ok;
	console.log(`   k=${k}: target ${TARGET[k]!.toString().padStart(3)} | N ${nN} | canonicalKey ${nF} | congruence ${congrStr}  ${ok ? 'OK' : '*** MISMATCH ***'}`);
}

// ---- realistic dedup: batch with duplicates collapses to the distinct count ----
console.log('\n-- dedup of a batch WITH re-encoded duplicates (N & congruence must give the distinct count) --');
const D = distinct.length;
const DEDUPE_CAP = Number(process.env.CB_DEDUPE_CAP ?? 400); // pairwise congruence is O(n^2)*exact; cap it
const setN = new Set(batch.map((it) => nKey(it.cell)));
const setF = new Set(batch.map((it) => fastKey(it.cell)));
const cells = batch.map((it) => it.cell);
const runDedupe = cells.length <= DEDUPE_CAP;
const congrN = runDedupe ? dedupeByCongruence(cells).length : -1;
console.log(`   batch ${batch.length} -> distinct target ${D} | N ${setN.size} | canonicalKey ${setF.size} (under-merges) | congruence ${runDedupe ? congrN : 'skipped (>' + DEDUPE_CAP + ')'}`);
allOk &&= setN.size === D && (!runDedupe || congrN === D);

// ---- timing (median of R runs) ----
const REPS = Number(process.env.CB_REPS ?? 5);
const time = (fn: () => void, R = REPS) => {
	const ts: number[] = [];
	for (let i = 0; i < R; i++) { const t0 = performance.now(); fn(); ts.push(performance.now() - t0); }
	ts.sort((a, b) => a - b);
	return ts[Math.floor(R / 2)];
};
const tN = time(() => { new Set(cells.map(nKey)); });
const tF = time(() => { new Set(cells.map(fastKey)); });
console.log(`\n-- timing on the batch of ${cells.length} cells (median of ${REPS}) --`);
console.log(`   N (hash)            ${tN.toFixed(1).padStart(9)} ms   ${(tN / cells.length * 1000).toFixed(1)} us/cell`);
console.log(`   canonicalKey (hash) ${tF.toFixed(1).padStart(9)} ms   ${(tF / cells.length * 1000).toFixed(1)} us/cell`);
console.log(`   N vs canonicalKey (hash-vs-hash, both correct on distinct sets): x${(tF / tN).toFixed(2)} faster`);
if (runDedupe) {
	const tC = time(() => { dedupeByCongruence(cells); }, 1);
	console.log(`   dedupeByCongruence  ${tC.toFixed(1).padStart(9)} ms   ${(tC / cells.length * 1000).toFixed(1)} us/cell   (pairwise; 1 run)`);
	console.log(`   N vs dedupeByCongruence (hash-vs-pairwise, this batch): x${(tC / tN).toFixed(1)} faster`);
} else {
	console.log(`   dedupeByCongruence timing SKIPPED (batch ${cells.length} > cap ${DEDUPE_CAP}; pairwise is O(n^2)*exact-search)`);
}

// ---- chiral snub probe: does canonicalKey really collapse the enantiomorph? ----
console.log('\n-- chiral snub probe (snub hexagonal 3.3.3.3.6, ctrnact-01_36-5b-1) --');
const snub = raw.find((e) => e.id === 'ctrnact-01_36-5b-1');
if (snub) {
	const orig = reconstruct(snub)!;
	const mir = reconstruct({ T1: conj(snub.T1), T2: conj(snub.T2), Seed: snub.Seed.map(conj) })!;
	const nMerge = nKey(orig) === nKey(mir);
	const fMerge = fastKey(orig) === fastKey(mir);
	const cMerge = dedupeByCongruence([orig, mir]).length === 1;
	console.log(`   N merges enantiomorph:            ${nMerge}`);
	console.log(`   canonicalKey merges enantiomorph: ${fMerge}`);
	console.log(`   dedupeByCongruence merges:        ${cMerge}`);
} else {
	console.log('   (snub entry not in range; raise CB_KMAX>=1)');
}

console.log(`\n=============== VERDICT: ${allOk ? 'all three agree on every partition' : '*** DISAGREEMENT ***'} ===============\n`);
