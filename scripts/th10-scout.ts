/*
 * ██ TH-10 SCOUT — EXAMPLE MODE ██  (weight-bound program, ../resources/research/
 * weight-bound-program-2026-07-03.md §CC scout; SYNC 2026-07-03)
 *
 * Measures the RUN ECONOMICS of the proven configuration (cor:box procedure: pairs → exact
 * area-admissibility → joins → fills → oracle match) under a HYPOTHETICAL tightened weight bound:
 * the weight-(24k−1) generator pool W(24k−1) is replaced by W(s) with s = the TA's staged target
 * (k=1: s=5, k=2: s=6, k=3: s=8 — the measured s* maxima + slack).
 *
 * ⚑⚑ THE SUBSTITUTED POOL BOUND IS UNPROVEN. Nothing here is a certified run, a count claim, or a
 * completeness claim. Every stage is labeled EXAMPLE MODE; the PeriodSolver injection is hard-gated
 * on TH10_EXAMPLE_MODE=1 and emits its own ⚑ banner. Decision rule (TA program note): k=1 completes
 * overnight AND k=2 projects ≤ weeks ⇒ Route 2 worth full effort; k=1 walls on fills ⇒ thesis-only.
 *
 * Stages (cor:box shape, seed-free lattice-first):
 *   0. W(s) by level-BFS over unit 24th-root sums — EXACT (8 int coords over 1,ζ,…,ζ⁷ mod
 *      Φ₂₄ = x⁸−x⁴+1; frontier-only expansion, proof in scripts/measure-proven-pool.ts header).
 *      Levels are asserted against the TA's exact |W(s)| table (s ≤ 7) — a real falsifier.
 *   1. PAIRS: all unordered {w₁,w₂} ⊂ W(s)\{0}; float-det broadphase + quantized ladder bitmap,
 *      then INTEGER-EXACT det quadruple (4·det = a+b√2+c√3+d√6, a..d ∈ ℤ — no float decides).
 *      Admissibility = det equals an exact tile-multiset sum (ladder capped at min(s², 24k·a_max):
 *      s² because det(w₁,w₂) ≤ |w₁||w₂| ≤ s² intrinsically). NOTE the pair-stage ladder carries NO
 *      tile-count cap (a pair may span an index-m sublattice of the true cell = m× the multiset;
 *      the ≤24k-tile sharp filter is applied per-seed before fills) — both counts are reported.
 *   2. JOINS: close the admissible-pair lattice family under L ↦ ⟨L ∪ {w}⟩, w ∈ W(s) (cor:box(iv);
 *      float rationality prefilter with denominator ≤ det/(√3/2), exact `joinLattice` decides).
 *      Inadmissible-det intermediates are KEPT in the closure (joins chain), flagged non-fillable.
 *   3. FILLS (k=1 only): per seed, the family filtered by the seed's exact vcAreaSet + P0
 *      (identical sound filters to the live pipeline), injected one lattice per solve via
 *      PeriodSolverOptions.th10Override → torusFill → certificate → k-gate. maxMs=0 (no cap).
 *   4. MATCH (k=1 only): cross-seed dedupeByCongruence → COMPOSITION digest (comparable to the
 *      certified k=1 digest) → per-tiling bijection vs the certified snapshot (authoritative) and
 *      vs the Galebach reconstruction (t1002 translations known-broken upstream, TA 2026-07-03).
 *
 * Run:  TH10_EXAMPLE_MODE=1 pnpm tsx scripts/th10-scout.ts k1|k2|k3
 * Log:  experiments/results/th10-scout-<date>.log (synchronous, progress + ETA — CLAUDE.md doctrine)
 * Budgets (loud abort + projection, this is a measurement): pair stage 120 min; joins 120 min;
 * fills TH10_FILL_BUDGET_MIN (default 600 min); k=3 sample 45 min.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
// ⚑ RING DISCIPLINE (k=3 recert lesson): import oracle-match FIRST — its module scope creates THE
// CyclotomicRing(24) instance and setActiveRing()s it. Everything below (pool, polygons, snapshot
// cells, oracle cells) must live on that instance; `assertSameRing` compares instances, so a second
// CyclotomicRing.create(24) here would make cellsCongruent throw.
import { loadOracle, reconstructOracleCell } from './oracle-match';
import { Cyclotomic, getActiveRing } from '@/classes/Cyclotomic';
import { Surd, detSurd, tileAreaSurd } from '@/classes/algorithm/exact/Surd';
import {
	gaussReduceExact, latticeKey, joinLattice, holohedry, vcAreaSet, vcAreaMinVerts, areaKey,
} from '@/classes/algorithm/LatticeEnumerator';
import { PeriodSolver, getFillProfile, type PeriodCell } from '@/classes/algorithm/PeriodSolver';
import { dedupeByCongruence, cellsCongruent } from '@/classes/algorithm/TilingCongruence';
import { parseEffC2, passesEffFilter, effC2Label } from '@/classes/algorithm/effFilter';
import { TranslationalCellExtractor } from '@/classes/algorithm/TranslationalCellExtractor';
import {
	PolygonsGenerator, VCGenerator, CompatibilityGraph, SeedSetExtractor, SeedBuilder,
	PolygonType, type GeneratorParameters,
} from '@/classes';
import { loadSnapshot } from '../figures/snapshot';
import { deserializeCell } from './scoutCodec';

// ---------------------------------------------------------------------------------------------
// Phase selection + constants
// ---------------------------------------------------------------------------------------------
if (process.env.TH10_EXAMPLE_MODE !== '1') {
	console.error('th10-scout: refusing to run without TH10_EXAMPLE_MODE=1 — the weight-s pool bound is UNPROVEN (example mode must be explicit)');
	process.exit(1);
}
const PHASE = process.argv[2];
if (PHASE !== 'k1' && PHASE !== 'k2' && PHASE !== 'k3') {
	console.error('usage: TH10_EXAMPLE_MODE=1 pnpm tsx scripts/th10-scout.ts k1|k2|k3');
	process.exit(1);
}
const CFG = { k1: { k: 1, s: 5 }, k2: { k: 2, s: 6 }, k3: { k: 3, s: 8 } }[PHASE]!;
const K = CFG.k;
// Weight-bound override (TH10_S). Lets a run substitute a tighter/looser pool weight bound than the
// staged default (k1:5, k2:6, k3:8) — e.g. TH10_S=4 to test the 2k+2 conjecture at k=1. This is a
// COMPLETENESS KNOB: a smaller S can DROP a certified tiling whose reduced basis exceeds it (settled
// rule — turning it down can lose a tiling). Loud banner in main(); unset ⇒ the staged default.
const S = process.env.TH10_S !== undefined ? parseInt(process.env.TH10_S, 10) : CFG.s;
if (!Number.isInteger(S) || S < 1 || S > 8) throw new Error(`TH10_S=${process.env.TH10_S} invalid — want an integer in [1,8]`);
const N = 24;
const PHI = 8;
// Direction count (TH10_DIRS). 24 = full ℤ[ζ₂₄] (every 24th root; octagon-capable). 12 = even powers
// only = ℤ[ζ₁₂] (the 12th roots) ⟹ OCTAGON-BLIND: √2-length octagon periods (odd ζ₂₄ powers) are
// unrepresentable, so 4.8.8 (t1002) and ANY octagon-bearing tiling at ANY k are dropped — not just
// the known 488. Deliberate AL scope choice (2026-07-08): accept the octagon loss for speed. This is
// a hard COMPLETENESS knob; the 24-dir default is preserved for octagon-complete runs.
const DIRS = process.env.TH10_DIRS !== undefined ? parseInt(process.env.TH10_DIRS, 10) : 24;
if (DIRS !== 12 && DIRS !== 24) throw new Error(`TH10_DIRS=${process.env.TH10_DIRS} invalid — want 12 or 24`);
const DIR_STEP = 24 / DIRS; // 24-dir → step 1 (all roots); 12-dir → step 2 (even powers = ℤ[ζ₁₂])
const A_MAX_F = 3 * (2 + Math.sqrt(3)); // unit-edge 12-gon
const AREA_BOUND_F = 24 * K * A_MAX_F; // cor:box(ii)
const PAIR_DET_CAP = Math.min(S * S, AREA_BOUND_F); // det(w₁,w₂) ≤ |w₁||w₂| ≤ s²
const SQRT3_2 = Math.sqrt(3) / 2; // covolume floor (cor:box(iv))

// TA's exact |W(s)| (cumulative, incl. 0) — program note §Feasibility arithmetic. Falsifier.
const EXPECTED_W: Record<number, number> = { 1: 25, 2: 289, 3: 2089, 4: 10825, 5: 43777, 6: 146521, 7: 423169 };

// Budgets (ms)
const PAIR_BUDGET_MS = parseInt(process.env.TH10_PAIR_BUDGET_MIN ?? '120', 10) * 60_000;
const JOIN_BUDGET_MS = parseInt(process.env.TH10_JOIN_BUDGET_MIN ?? '120', 10) * 60_000;
const FILL_BUDGET_MS = parseInt(process.env.TH10_FILL_BUDGET_MIN ?? '600', 10) * 60_000;
const K3_SAMPLE_BUDGET_MS = parseInt(process.env.TH10_K3_SAMPLE_BUDGET_MIN ?? '45', 10) * 60_000;
// Distinct-lattice family memory backstop (pairStage). Default 12e6; raise for the k=3 fill run
// (bigger pruned family) alongside NODE_OPTIONS=--max-old-space-size. Measurement knob only.
const FAMILY_GUARD = parseInt(process.env.TH10_FAMILY_GUARD_M ?? '12', 10) * 1_000_000;

const ring = getActiveRing();
if (ring.N !== 24) throw new Error(`active ring N=${ring.N}, expected 24 (oracle-match import should have set it)`);

// Efficiency-pruning knob (work order 2026-07-04). PRUNE_EFF_C2 = rational c² ("169/100", "2",
// "sqrt2"). Unset ⇒ null ⇒ the pool is untouched and every stage is byte-identical to the
// unfiltered scout. A malformed value throws HERE (module load, example-mode only) — fail loud.
const PRUNE_C2 = parseEffC2(process.env.PRUNE_EFF_C2);

// ---------------------------------------------------------------------------------------------
// Synchronous logging (CLAUDE.md experiments doctrine)
// ---------------------------------------------------------------------------------------------
const LOG_DIR = path.join(process.cwd(), 'experiments', 'results');
fs.mkdirSync(LOG_DIR, { recursive: true });
const dateTag = new Date().toISOString().slice(0, 10);
const LOG_FILE = path.join(LOG_DIR, `th10-scout-${dateTag}.log`);
function log(line: string): void {
	const stamped = `[${new Date().toISOString().slice(11, 19)}] ${line}`;
	fs.appendFileSync(LOG_FILE, stamped + '\n');
	console.log(stamped);
}
const fmtInt = (n: number): string => Math.round(n).toLocaleString('en-US');
const fmtSci = (n: number): string => n.toExponential(2);
function fmtDur(sec: number): string {
	if (!isFinite(sec)) return 'inf';
	if (sec < 120) return sec.toFixed(1) + 's';
	if (sec < 7200) return (sec / 60).toFixed(1) + 'min';
	if (sec < 48 * 3600) return (sec / 3600).toFixed(1) + 'h';
	if (sec < 365 * 86400) return (sec / 86400).toFixed(1) + 'd';
	return (sec / (365 * 86400)).toFixed(1) + 'y';
}

// ---------------------------------------------------------------------------------------------
// ζ^j coordinate table (Φ₂₄ reduction: ζ⁸ = ζ⁴ − 1) + float embedding — as scripts/measure-proven-pool.ts
// ---------------------------------------------------------------------------------------------
function buildZetaTable(): Int8Array {
	const table = new Int8Array(N * PHI);
	const cur = new Array<number>(PHI).fill(0);
	cur[0] = 1;
	for (let j = 0; j < N; j++) {
		for (let i = 0; i < PHI; i++) table[j * PHI + i] = cur[i];
		const c7 = cur[PHI - 1];
		for (let i = PHI - 1; i >= 1; i--) cur[i] = cur[i - 1];
		cur[0] = 0;
		cur[4] += c7;
		cur[0] -= c7;
	}
	return table;
}
const ZETA = buildZetaTable();
const COS = new Float64Array(PHI);
const SIN = new Float64Array(PHI);
for (let i = 0; i < PHI; i++) {
	COS[i] = Math.cos((2 * Math.PI * i) / N);
	SIN[i] = Math.sin((2 * Math.PI * i) / N);
}

// ---------------------------------------------------------------------------------------------
// Stage 0 — W(s) level-BFS (frontier-only; correctness proof in measure-proven-pool.ts header)
// ---------------------------------------------------------------------------------------------
type Pool = { coords: Int8Array; count: number; xs: Float64Array; ys: Float64Array; wts: Int8Array };

function enumerateW(s: number): Pool {
	const slotsPow = s <= 5 ? 18 : s <= 6 ? 20 : 22;
	const SLOTS = 1 << slotsPow;
	const MASK = SLOTS - 1;
	const hiA = new Uint32Array(SLOTS);
	const loA = new Uint32Array(SLOTS);
	const insert = (hi: number, lo: number): boolean => {
		let h = Math.imul(hi, 0x9e3779b1);
		h ^= Math.imul(lo, 0x85ebca77);
		h ^= h >>> 15;
		h = Math.imul(h, 0xc2b2ae3d);
		let i = (h >>> 0) & MASK;
		for (;;) {
			const sh = hiA[i];
			if (sh === 0) { hiA[i] = hi; loA[i] = lo; return true; }
			if (sh === hi && loA[i] === lo) return false;
			i = (i + 1) & MASK;
		}
	};
	// cumulative store of NONZERO values (zero is not a generator); capacity grown per level
	let cap = 1 << 16;
	let coords = new Int8Array(cap * PHI);
	let wts = new Int8Array(cap); // per-vector exact weight = the BFS level at first discovery
	let count = 0;
	const pushVal = (c: number[], w: number): void => {
		if (count === cap) {
			cap *= 2;
			const next = new Int8Array(cap * PHI);
			next.set(coords);
			coords = next;
			const nextW = new Int8Array(cap);
			nextW.set(wts);
			wts = nextW;
		}
		coords.set(c, count * PHI);
		wts[count] = w;
		count++;
	};
	// level 0: {0}
	insert((128 << 24) | (128 << 16) | (128 << 8) | 128, (128 << 24) | (128 << 16) | (128 << 8) | 128);
	let cumulative = 1; // incl. zero
	let frontier: number[][] = [[0, 0, 0, 0, 0, 0, 0, 0]];
	const t0 = Date.now();
	for (let t = 1; t <= s; t++) {
		const next: number[][] = [];
		for (const c of frontier) {
			for (let j = 0; j < N; j += DIR_STEP) {
				const zb = j * PHI;
				const d = [
					c[0] + ZETA[zb], c[1] + ZETA[zb + 1], c[2] + ZETA[zb + 2], c[3] + ZETA[zb + 3],
					c[4] + ZETA[zb + 4], c[5] + ZETA[zb + 5], c[6] + ZETA[zb + 6], c[7] + ZETA[zb + 7],
				];
				const hi = (((d[0] + 128) << 24) | ((d[1] + 128) << 16) | ((d[2] + 128) << 8) | (d[3] + 128)) >>> 0;
				const lo = (((d[4] + 128) << 24) | ((d[5] + 128) << 16) | ((d[6] + 128) << 8) | (d[7] + 128)) >>> 0;
				if (insert(hi, lo)) {
					next.push(d);
					pushVal(d, t); // t = exact min-unit-24th-root weight (frontier-only BFS, all 24 dirs)
				}
			}
		}
		cumulative += next.length;
		frontier = next;
		log(`  W-BFS level ${t}: +${fmtInt(next.length)} distinct, |W(${t})| = ${fmtInt(cumulative)} (incl. 0), ${((Date.now() - t0) / 1000).toFixed(1)}s`);
		if (DIRS === 24) {
			// The TA |W(s)| table is a 24-direction falsifier — only valid at full ℤ[ζ₂₄].
			if (EXPECTED_W[t] !== undefined && cumulative !== EXPECTED_W[t]) {
				throw new Error(`|W(${t})| = ${cumulative} ≠ expected ${EXPECTED_W[t]} (TA table) — BFS or table WRONG, aborting`);
			}
			if (EXPECTED_W[t] !== undefined) log(`  ✓ |W(${t})| matches the TA exact table (${fmtInt(EXPECTED_W[t])})`);
		} else if (t === 1 && next.length !== DIRS) {
			// 12-dir falsifier: level 1 must be exactly the DIRS even roots (ℤ[ζ₁₂] generators).
			throw new Error(`12-dir BFS: |W(1)\\{0}| = ${next.length} ≠ ${DIRS} (even-power roots) — direction stepping WRONG`);
		}
	}
	// float embeddings
	const xs = new Float64Array(count);
	const ys = new Float64Array(count);
	for (let v = 0; v < count; v++) {
		const o = v * PHI;
		let x = 0, y = 0;
		for (let i = 0; i < PHI; i++) { x += coords[o + i] * COS[i]; y += coords[o + i] * SIN[i]; }
		xs[v] = x; ys[v] = y;
	}
	return { coords, count, xs, ys, wts };
}

// ---------------------------------------------------------------------------------------------
// Integer-exact det quadruple: 4·Im(conj(u)·v) = a + b√2 + c√3 + d√6, a..d ∈ ℤ (safe Numbers).
// sin(2πm/24)·4 over the {1,√2,√3,√6} basis; components verified against Math.sin AND detSurd.
// ---------------------------------------------------------------------------------------------
const S4 = { a: new Int32Array(N), b: new Int32Array(N), c: new Int32Array(N), d: new Int32Array(N) };
{
	// base m=0..6: 0, (√6−√2)/4, 1/2, √2/2, √3/2, (√6+√2)/4, 1 — ×4
	const base: [number, number, number, number][] = [
		[0, 0, 0, 0], [0, -1, 0, 1], [2, 0, 0, 0], [0, 2, 0, 0], [0, 0, 2, 0], [0, 1, 0, 1], [4, 0, 0, 0],
	];
	for (let m = 0; m <= 6; m++) { S4.a[m] = base[m][0]; S4.b[m] = base[m][1]; S4.c[m] = base[m][2]; S4.d[m] = base[m][3]; }
	for (let m = 7; m <= 12; m++) { const r = 12 - m; S4.a[m] = S4.a[r]; S4.b[m] = S4.b[r]; S4.c[m] = S4.c[r]; S4.d[m] = S4.d[r]; }
	for (let m = 13; m < 24; m++) { const r = m - 12; S4.a[m] = -S4.a[r]; S4.b[m] = -S4.b[r]; S4.c[m] = -S4.c[r]; S4.d[m] = -S4.d[r]; }
	for (let m = 0; m < 24; m++) {
		const v = (S4.a[m] + S4.b[m] * Math.SQRT2 + S4.c[m] * Math.sqrt(3) + S4.d[m] * Math.sqrt(6)) / 4;
		if (Math.abs(v - Math.sin((2 * Math.PI * m) / 24)) > 1e-12) throw new Error(`S4 table wrong at m=${m}`);
	}
}
/** 4·det(u,v) as an exact integer quadruple (a,b,c,d) over {1,√2,√3,√6}. Coords ≤ s ≤ 8 ⇒ each
 *  component ≤ 4·64·64 — exact in Number arithmetic. */
function det4(coords: Int8Array, uo: number, vo: number, out: Int32Array): void {
	let A = 0, B = 0, C = 0, D = 0;
	for (let i = 0; i < PHI; i++) {
		const ui = coords[uo + i];
		if (ui === 0) continue;
		for (let j = 0; j < PHI; j++) {
			const vj = coords[vo + j];
			if (vj === 0) continue;
			const p = ui * vj;
			const m = (j - i + 24) % 24;
			A += p * S4.a[m]; B += p * S4.b[m]; C += p * S4.c[m]; D += p * S4.d[m];
		}
	}
	out[0] = A; out[1] = B; out[2] = C; out[3] = D;
}
const q4key = (q: Int32Array | number[]): string => `${q[0]},${q[1]},${q[2]},${q[3]}`;
/** Exact Surd (P+Q√2+R√3+S√6)/D → ×4 integer quadruple key, or null if D ∤ 4. */
function surdToQ4Key(s: Surd): string | null {
	if (4n % s.D !== 0n) return null;
	const m = 4n / s.D;
	return `${s.P * m},${s.Q * m},${s.R * m},${s.S * m}`;
}

// ---------------------------------------------------------------------------------------------
// Exact tile-multiset area ladder ≤ cap (quadruples of 4·area — all integer: tri √3, sq 4,
// hex 6√3, oct 8+8√2, dodec 24+12√3). Tracks min tile count per exact value.
// ---------------------------------------------------------------------------------------------
type Ladder = { exact: Map<string, { f: number; minTiles: number }>; bitmap: Uint8Array; minF: number };
function buildLadder(capF: number): Ladder {
	const tiles: [number, number, number, number][] = [
		[0, 0, 1, 0], [4, 0, 0, 0], [0, 0, 6, 0], [8, 8, 0, 0], [24, 0, 12, 0],
	];
	const fOf = (q: number[]): number => (q[0] + q[1] * Math.SQRT2 + q[2] * Math.sqrt(3) + q[3] * Math.sqrt(6)) / 4;
	const exact = new Map<string, { f: number; minTiles: number }>();
	let queue: { q: [number, number, number, number]; t: number }[] = [{ q: [0, 0, 0, 0], t: 0 }];
	const seenT = new Map<string, number>([['0,0,0,0', 0]]);
	while (queue.length > 0) {
		const next: typeof queue = [];
		for (const { q, t } of queue) {
			for (const tile of tiles) {
				const nq: [number, number, number, number] = [q[0] + tile[0], q[1] + tile[1], q[2] + tile[2], q[3] + tile[3]];
				const f = fOf(nq);
				if (f > capF + 1e-9) continue;
				const key = q4key(nq);
				const prev = seenT.get(key);
				if (prev !== undefined && prev <= t + 1) continue;
				seenT.set(key, t + 1);
				next.push({ q: nq, t: t + 1 });
				const e = exact.get(key);
				if (!e) exact.set(key, { f, minTiles: t + 1 });
				else if (t + 1 < e.minTiles) e.minTiles = t + 1;
			}
		}
		queue = next;
	}
	const bitmap = new Uint8Array(Math.ceil(capF * 1e6) + 8);
	let minF = Infinity;
	for (const { f } of exact.values()) {
		if (f < minF) minF = f;
		const c = Math.round(f * 1e6);
		for (let d = -2; d <= 2; d++) if (c + d >= 0 && c + d < bitmap.length) bitmap[c + d] = 1;
	}
	return { exact, bitmap, minF };
}

// ---------------------------------------------------------------------------------------------
// Lazy Cyclotomic materialization from pool coords
// ---------------------------------------------------------------------------------------------
function cycOf(coords: Int8Array, o: number): Cyclotomic {
	const num: bigint[] = new Array(PHI);
	for (let i = 0; i < PHI; i++) num[i] = BigInt(coords[o + i]);
	return new Cyclotomic(ring, num);
}

// ---------------------------------------------------------------------------------------------
// Stage 1 — pair stage
// ---------------------------------------------------------------------------------------------
type Family = Map<string, { u: Cyclotomic; v: Cyclotomic; detF: number; admissible: boolean; sharp: boolean }>;

function pairStage(pool: Pool, ladder: Ladder): { family: Family; stats: Record<string, number>; aborted: boolean } {
	const n = pool.count;
	const totalPairs = (n * (n - 1)) / 2;
	log(`PAIR stage: ${fmtInt(n)} nonzero pool vectors → ${fmtSci(totalPairs)} unordered pairs; det cap ${PAIR_DET_CAP.toFixed(2)} (= min(s²=${S * S}, 24k·a_max=${AREA_BOUND_F.toFixed(1)})); ladder |exact| = ${fmtInt(ladder.exact.size)}`);
	const { xs, ys, coords } = pool;
	const bitmap = ladder.bitmap;
	const minDet = ladder.minF - 1e-6;
	const maxDet = PAIR_DET_CAP + 1e-6;
	const q = new Int32Array(4);
	const family: Family = new Map();
	let pairs = 0, bitmapHits = 0, exactAdmissible = 0, sharpAdmissible = 0, detInRange = 0;
	const t0 = Date.now();
	let lastLog = t0;
	let aborted = false;
	outer: for (let i = 0; i < n; i++) {
		const xi = xs[i], yi = ys[i], io = i * PHI;
		for (let j = i + 1; j < n; j++) {
			pairs++;
			const det = xi * ys[j] - yi * xs[j];
			const a = det < 0 ? -det : det;
			if (a < minDet || a > maxDet) continue;
			detInRange++;
			if (bitmap[Math.round(a * 1e6)] === 0) continue;
			bitmapHits++;
			det4(coords, io, j * PHI, q);
			if (det < 0) { q[0] = -q[0]; q[1] = -q[1]; q[2] = -q[2]; q[3] = -q[3]; }
			const e = ladder.exact.get(q4key(q));
			if (e === undefined) continue;
			exactAdmissible++;
			const sharp = e.minTiles <= 24 * K;
			if (sharp) sharpAdmissible++;
			const u = cycOf(coords, io);
			const v = cycOf(coords, j * PHI);
			const [ru, rv] = gaussReduceExact(u, v);
			const key = latticeKey(ru, rv);
			const prev = family.get(key);
			if (prev === undefined) family.set(key, { u: ru, v: rv, detF: a, admissible: true, sharp });
			else if (sharp && !prev.sharp) prev.sharp = true;
			if (family.size > FAMILY_GUARD) {
				log(`⚑ ABORT (memory guard): distinct-lattice family exceeded ${fmtInt(FAMILY_GUARD)} at pair ${fmtSci(pairs)} — reporting partials`);
				aborted = true;
				break outer;
			}
		}
		if ((i & 1023) === 0 && Date.now() - lastLog > 30_000) {
			lastLog = Date.now();
			const done = i * n - (i * (i + 1)) / 2;
			const rate = done / ((lastLog - t0) / 1000);
			log(`  pairs: ${fmtSci(done)}/${fmtSci(totalPairs)} (${((done / totalPairs) * 100).toFixed(1)}%), ${fmtSci(rate)}/s, ETA ${fmtDur((totalPairs - done) / rate)} | inRange ${fmtSci(detInRange)}, bitmapHits ${fmtSci(bitmapHits)}, exactAdm ${fmtSci(exactAdmissible)}, distinct ${fmtInt(family.size)}`);
			if (lastLog - t0 > PAIR_BUDGET_MS) {
				log(`⚑ ABORT (pair budget ${fmtDur(PAIR_BUDGET_MS / 1000)}): projecting full stage at measured rate: ${fmtDur(totalPairs / rate)}`);
				aborted = true;
				break outer;
			}
		}
	}
	const secs = (Date.now() - t0) / 1000;
	const stats = { pairs, detInRange, bitmapHits, exactAdmissible, sharpAdmissible, distinct: family.size, secs };
	log(`PAIR stage ${aborted ? '⚑ ABORTED' : 'done'} in ${fmtDur(secs)}: examined ${fmtSci(pairs)} pairs (${fmtSci(pairs / secs)}/s) → det-in-range ${fmtSci(detInRange)} → bitmap ${fmtSci(bitmapHits)} → EXACT-admissible ${fmtSci(exactAdmissible)} (sharp ≤${24 * K}-tile: ${fmtSci(sharpAdmissible)}) → DISTINCT lattices ${fmtInt(family.size)}`);
	return { family, stats, aborted };
}

// ---------------------------------------------------------------------------------------------
// Stage 2 — join closure (cor:box(iv)): L ↦ ⟨L ∪ {w}⟩, w ∈ W(s)
// ---------------------------------------------------------------------------------------------
function joinStage(family: Family, pool: Pool, ladder: Ladder): { rounds: number; joined: number; joinedAdmissible: number; aborted: boolean } {
	const { xs, ys, count: n } = pool;
	let work = [...family.entries()];
	let round = 0, joinedTotal = 0, joinedAdmissible = 0, prefilterHits = 0, exactCalls = 0;
	const t0 = Date.now();
	let aborted = false;
	log(`JOIN stage: closing ${fmtInt(family.size)} lattices under joins with ${fmtInt(n)} pool vectors (index bound per L: det/(√3/2))`);
	while (work.length > 0) {
		round++;
		const fresh: typeof work = [];
		let lastLog = Date.now();
		for (let li = 0; li < work.length; li++) {
			const [, L] = work[li];
			const dmax = Math.floor(L.detF / SQRT3_2 + 1e-9);
			if (dmax < 2) continue;
			const uv = L.u.toVector();
			const vv = L.v.toVector();
			const det = uv.x * vv.y - uv.y * vv.x;
			for (let w = 0; w < n; w++) {
				const wx = xs[w], wy = ys[w];
				const alpha = (wx * vv.y - wy * vv.x) / det;
				const beta = (uv.x * wy - uv.y * wx) / det;
				// w ∈ L (q=1) ⇒ no progress; otherwise find q ≤ dmax with qα, qβ both near-integral
				let hit = 0;
				for (let qd = 1; qd <= dmax; qd++) {
					const fa = alpha * qd;
					const fb = beta * qd;
					if (Math.abs(fa - Math.round(fa)) < 1e-6 && Math.abs(fb - Math.round(fb)) < 1e-6) { hit = qd; break; }
				}
				if (hit <= 1) continue;
				prefilterHits++;
				exactCalls++;
				const j = joinLattice(L.u, L.v, cycOf(pool.coords, w * PHI));
				if (j === null) continue;
				const [ru, rv] = gaussReduceExact(j[0], j[1]);
				const key = latticeKey(ru, rv);
				if (family.has(key)) continue;
				const dS = detSurd(ru, rv).abs();
				const qk = surdToQ4Key(dS);
				const e = qk !== null ? ladder.exact.get(qk) : undefined;
				const entry = { u: ru, v: rv, detF: dS.toFloat(), admissible: e !== undefined, sharp: e !== undefined && e.minTiles <= 24 * K };
				family.set(key, entry);
				fresh.push([key, entry]);
				joinedTotal++;
				if (entry.admissible) joinedAdmissible++;
			}
			if (Date.now() - lastLog > 30_000) {
				lastLog = Date.now();
				log(`  join round ${round}: ${li + 1}/${work.length} lattices scanned, +${fmtInt(fresh.length)} new so far (prefilter ${fmtInt(prefilterHits)}, exact ${fmtInt(exactCalls)}), elapsed ${fmtDur((lastLog - t0) / 1000)}`);
				if (lastLog - t0 > JOIN_BUDGET_MS) {
					const rate = (li + 1 + (round - 1) * family.size) / ((lastLog - t0) / 1000);
					log(`⚑ ABORT (join budget): ~${fmtSci(rate)} lattices/s scanned — closure incomplete, counts are partial`);
					aborted = true;
					break;
				}
			}
		}
		if (aborted) break;
		log(`  join round ${round}: +${fmtInt(fresh.length)} new lattices (admissible ${fmtInt(fresh.filter(([, e]) => e.admissible).length)}), family ${fmtInt(family.size)}, ${fmtDur((Date.now() - t0) / 1000)}`);
		work = fresh;
	}
	log(`JOIN stage ${aborted ? '⚑ ABORTED' : 'done'} in ${fmtDur((Date.now() - t0) / 1000)}: ${round} rounds, +${fmtInt(joinedTotal)} joined lattices (${fmtInt(joinedAdmissible)} admissible-det), family total ${fmtInt(family.size)}`);
	return { rounds: round, joined: joinedTotal, joinedAdmissible, aborted };
}

// ---------------------------------------------------------------------------------------------
// Seed harness (probe-pipeline boilerplate; active ring already = the oracle-match instance)
// ---------------------------------------------------------------------------------------------
function buildSeeds(k: number) {
	const params: GeneratorParameters = { [PolygonType.REGULAR]: { ns: [3, 4, 6, 8, 12] } };
	const pg = new PolygonsGenerator(params, []);
	const vcs = new VCGenerator(pg.polygons).generateVertexConfigurations();
	const adj: Record<string, string[]> = {};
	for (const vc of vcs) adj[vc.name] = [];
	for (let i = 0; i < vcs.length; i++)
		for (let j = i + 1; j < vcs.length; j++)
			if (vcs[i].isCompatible(vcs[j])) { adj[vcs[i].name].push(vcs[j].name); adj[vcs[j].name].push(vcs[i].name); }
	const graph = CompatibilityGraph.fromAdjacencyList(adj, vcs);
	const seedSets = new SeedSetExtractor(graph).findSeedSets(k);
	const seeds = new SeedBuilder().buildSeeds(k, 1, { seedSetLoader: () => seedSets });
	return k >= 2 ? seeds.filter((s) => new Set(s.vertexConfigurations.map((v) => v.name)).size >= 2) : seeds;
}

/** The seed's exact admissible-area machinery — same construction as PeriodSolver.candidateLattices
 *  (regular tiles only here, so the identity token = String(n) byte-matches tileIdToken). */
function seedAreaFilters(seed: ReturnType<typeof buildSeeds>[number], k: number) {
	const vcIncidences = seed.vertexConfigurations.map((vc) => {
		const m = new Map<string, number>();
		for (const p of vc.polygons) { const id = String(p.n); m.set(id, (m.get(id) ?? 0) + 1); }
		return m;
	});
	const tileArea = new Map<string, Surd>();
	const tileCorners = new Map<string, number>();
	for (const p of seed.polygons) {
		const id = String(p.n);
		if (!tileArea.has(id)) { tileArea.set(id, tileAreaSurd(p.n)); tileCorners.set(id, p.n); }
	}
	const aMax = Math.max(...seed.polygons.map((p) => tileAreaSurd(p.n).toFloat()));
	const areaBoundF = 24 * k * aMax;
	const areas = vcAreaSet(vcIncidences, tileArea, tileCorners, areaBoundF);
	const areaKeys = new Set(areas.map(areaKey));
	const minVerts = vcAreaMinVerts(vcIncidences, tileArea, tileCorners, areaBoundF);
	return { areaKeys, minVerts };
}

// ---------------------------------------------------------------------------------------------
// Phase k1 — end-to-end: fills + per-tiling match
// ---------------------------------------------------------------------------------------------
// Certified COMPOSITION-digest anchors per k (eff-pruning work order §3.2). Used only for the
// human-readable reference line + bijection target count — the authoritative check is the per-tiling
// congruence match against the certified snapshot below.
const CERT_REF: Record<number, string> = { 1: '6f9ca9cf2d16c75f/11', 2: 'f3e2e0517191362c/20', 3: '11ee1b1d582811d1/61' };

// End-to-end fills + per-tiling match, k-agnostic (was runK1; generalized 2026-07-08 for TH10_K2_FILL).
// Runs one PeriodSolver fill per admissible lattice, dedupes by congruence, digests, and checks a
// one-to-one bijection against the certified k=K snapshot. The Galebach cross-check is k=1-only
// (its t1xxx reconstruction is wired for k=1). Feasible at k=2 ONLY under the pool prune (Σ fills
// ~1e4 pruned vs the OOM-ing unfiltered stage) — that tractability is itself a measured result.
function runFillMatch(family: Family): void {
	const admissible = [...family.values()].filter((e) => e.admissible);
	// Precompute per-lattice exact area key once (reused across seeds)
	const withAreaKey = admissible.map((e) => ({ ...e, aKey: areaKey(detSurd(e.u, e.v).abs()), hol: holohedry(e.u, e.v) }));
	// Default: cheapest fills first (small det). TH10_FILL_DESC=1 flips to largest-det first so a
	// TRACE-capped run samples the time-dominant expensive tail — for PROFILING only, not a count claim.
	withAreaKey.sort((a, b) => (process.env.TH10_FILL_DESC === '1' ? b.detF - a.detF : a.detF - b.detF));
	const familyAllKeys = new Set([...family.values()].map((e) => latticeKey(e.u, e.v)));
	const familyAreaKeys = new Set(withAreaKey.map((e) => e.aKey));

	const seeds = buildSeeds(K);
	log(`FILL stage (k=${K}, EXAMPLE MODE): ${seeds.length} seeds × per-seed slice of ${fmtInt(withAreaKey.length)} admissible-det lattices; per-seed exact vcAreaSet + P0 filters (the live pipeline's sound filters); maxMs=0 (no cap); budget ${fmtDur(FILL_BUDGET_MS / 1000)}`);

	const extractor = new TranslationalCellExtractor();
	const allCells: PeriodCell[] = [];
	const fillMs: number[] = [];
	let totalFills = 0, rawCells = 0, gateRejected = 0, p0Filtered = 0, areaFiltered = 0;
	const t0 = Date.now();
	let lastLog = t0;
	let aborted = false;
	// total work estimate for ETA: per-seed admissible counts
	const perSeedLists = seeds.map((seed) => {
		const { areaKeys, minVerts } = seedAreaFilters(seed, K);
		const list = withAreaKey.filter((e) => {
			if (!areaKeys.has(e.aKey)) { areaFiltered++; return false; }
			const mv = minVerts.get(e.aKey);
			if (mv !== undefined && mv > K * e.hol) { p0Filtered++; return false; }
			return true;
		});
		return list;
	});
	const totalWork = perSeedLists.reduce((s, l) => s + l.length, 0);
	log(`  per-seed admissible-lattice counts: [${perSeedLists.map((l) => l.length).join(', ')}] — Σ = ${fmtInt(totalWork)} fills (area-filtered ${fmtInt(areaFiltered)}, P0-filtered ${fmtInt(p0Filtered)} across seeds)`);

	fills: for (let si = 0; si < seeds.length; si++) {
		const seed = seeds[si];
		const list = perSeedLists[si];
		const ts = Date.now();
		for (let li = 0; li < list.length; li++) {
			const e = list[li];
			const tf = Date.now();
			// TH10_FILL_MAXMS caps EACH fill (profiling only — a timed-out fill exercises the same DFS
			// code paths, so the internal breakdown stays representative; default 0 = no cap = completeness).
			const fillMaxMs = process.env.TH10_FILL_MAXMS ? parseInt(process.env.TH10_FILL_MAXMS, 10) : 0;
			const { cells, diag } = new PeriodSolver(K).solve(seed, {
				maxMs: fillMaxMs,
				th10Override: { bases: [[e.u, e.v]], allKeys: familyAllKeys, areaKeys: familyAreaKeys },
			});
			const ms = Date.now() - tf;
			fillMs.push(ms);
			totalFills++;
			rawCells += diag.rawCells;
			gateRejected += diag.gateRejected;
			for (const c of cells) allCells.push(c);
			if (process.env.TH10_FILL_TRACE === '1') {
				// Per-fill diagnostic (det → ms → what the solver did). Self-terminating at TH10_FILL_TRACE_N.
				log(`    ⟨trace⟩ #${totalFills} seed=${seed.name.slice(0, 20).padEnd(20)} detF=${e.detF.toFixed(3).padStart(8)} ms=${String(ms).padStart(7)} raw=${diag.rawCells} tried=${diag.latticesTried} timedOut=${diag.timedOut} gateRej=${diag.gateRejected}`);
				if (totalFills >= parseInt(process.env.TH10_FILL_TRACE_N ?? '80', 10)) { log('    ⟨trace⟩ cap reached — stopping'); aborted = true; break fills; }
			}
			if (Date.now() - lastLog > 30_000) {
				lastLog = Date.now();
				const rate = totalFills / ((lastLog - t0) / 1000);
				log(`  fills: ${fmtInt(totalFills)}/${fmtInt(totalWork)} (seed ${si + 1}/${seeds.length} ${seed.name}), ${rate.toFixed(1)}/s, ETA ${fmtDur((totalWork - totalFills) / rate)}, cells so far ${allCells.length}`);
				if (lastLog - t0 > FILL_BUDGET_MS) {
					log(`⚑ ABORT (fill budget): ${fmtInt(totalFills)}/${fmtInt(totalWork)} fills done — projecting full stage at measured rate: ${fmtDur(totalWork / rate)}`);
					aborted = true;
					break fills;
				}
			}
		}
		log(`  seed ${si + 1}/${seeds.length} ${seed.name.padEnd(24)} ${fmtInt(list.length)} fills, ${fmtDur((Date.now() - ts) / 1000)}, cells total ${allCells.length}`);
	}
	const fillSecs = (Date.now() - t0) / 1000;
	fillMs.sort((a, b) => a - b);
	const pct = (p: number) => fillMs[Math.min(fillMs.length - 1, Math.floor((p / 100) * fillMs.length))] ?? 0;
	log(`FILL stage ${aborted ? '⚑ ABORTED' : 'done'} in ${fmtDur(fillSecs)}: ${fmtInt(totalFills)} fills (Σ over seeds), raw cells ${rawCells}, gate-rejected ${gateRejected}`);
	log(`  fill cost distribution (ms/fill): min ${fillMs[0] ?? 0}, p50 ${pct(50)}, p90 ${pct(90)}, p99 ${pct(99)}, max ${fillMs[fillMs.length - 1] ?? 0}, mean ${(fillMs.reduce((s, x) => s + x, 0) / Math.max(1, fillMs.length)).toFixed(2)}`);

	// --- dedup + digest (probe-identical construction) ---
	const reps = dedupeByCongruence(allCells, (c) => extractor.canonicalKey(c.cellPolygons));
	const ids = reps.map((c) => extractor.canonicalKey(c.cellPolygons)).sort();
	let h = 5381n;
	for (const ch of ids.join('|')) h = ((h * 33n) ^ BigInt(ch.codePointAt(0)!)) & 0xffffffffffffffffn;
	log(`RESULT (EXAMPLE MODE — no certified claim): ${reps.length} distinct tilings from ${allCells.length} raw cells; COMPOSITION digest=${h.toString(16)} count=${reps.length} (certified k=${K} reference: ${CERT_REF[K] ?? 'n/a'})`);

	// --- per-tiling match 1: certified snapshot (authoritative) ---
	const snap = loadSnapshot();
	const certified = snap.tilings.filter((t) => t.k === K).map((t) => ({ key: t.canonicalKey, cell: deserializeCell(ring, t.cellCodec) }));
	const target = certified.length;
	const memo = new Map<string, string>();
	let matched = 0;
	for (const c of certified) {
		const hits = reps.filter((r) => cellsCongruent(r, c.cell, memo));
		if (hits.length !== 1) log(`  certified ${c.key.slice(0, 40)}… → ⚑ ${hits.length} matches`);
		if (hits.length === 1) matched++;
	}
	const unmatchedOurs = reps.filter((r) => !certified.some((c) => cellsCongruent(r, c.cell, memo)));
	log(`PER-TILING vs certified snapshot (k=${K}): ${matched}/${target} one-to-one${unmatchedOurs.length > 0 ? `, ⚑ ${unmatchedOurs.length} of ours unmatched` : ''} — ${matched === target && unmatchedOurs.length === 0 && reps.length === target ? '★ BIJECTION PASSED (example mode)' : '⚑ NOT a bijection'}`);

	// --- per-tiling match 2: Galebach reconstruction (k=1 only — t1xxx reconstruction is k=1-wired; t1002 known-broken upstream) ---
	if (K === 1) {
		const oracle = loadOracle();
		let gMatched = 0, gBroken = 0;
		for (let i = 1; i <= 11; i++) {
			const tCode = `t1${String(i).padStart(3, '0')}`;
			const rec = reconstructOracleCell(tCode, oracle[tCode]);
			if ('error' in rec) { gBroken++; log(`  galebach ${tCode}: ⚑ reconstruction failed (${rec.error})${tCode === 't1002' ? ' — KNOWN upstream defect (TA 2026-07-03)' : ''}`); continue; }
			const hits = reps.filter((r) => cellsCongruent(r, rec.cell, memo));
			log(`  galebach ${tCode}: ${hits.length === 1 ? '✓ matched' : `⚑ ${hits.length} matches`}`);
			if (hits.length === 1) gMatched++;
		}
		log(`PER-TILING vs Galebach: ${gMatched}/${11 - gBroken} matched (${gBroken} reconstruction failures)`);
	}
}

// ---------------------------------------------------------------------------------------------
// Phase k2 — pairs + joins + fill projection from the tuned fast-path per-fill cost
// ---------------------------------------------------------------------------------------------
function runK2(family: Family): void {
	const admissible = [...family.values()].filter((e) => e.admissible);
	const withAreaKey = admissible.map((e) => ({ ...e, aKey: areaKey(detSurd(e.u, e.v).abs()), hol: holohedry(e.u, e.v) }));
	const seeds = buildSeeds(K);
	let areaFiltered = 0, p0Filtered = 0;
	const perSeed = seeds.map((seed) => {
		const { areaKeys, minVerts } = seedAreaFilters(seed, K);
		return withAreaKey.filter((e) => {
			if (!areaKeys.has(e.aKey)) { areaFiltered++; return false; }
			const mv = minVerts.get(e.aKey);
			if (mv !== undefined && mv > K * e.hol) { p0Filtered++; return false; }
			return true;
		}).length;
	});
	const totalFillWork = perSeed.reduce((s, x) => s + x, 0);
	log(`k=2 FILL WORK (not executed — projection per spec): ${seeds.length} seeds, per-seed admissible counts min/median/max = ${Math.min(...perSeed)}/${perSeed.slice().sort((a, b) => a - b)[Math.floor(perSeed.length / 2)]}/${Math.max(...perSeed)}, Σ = ${fmtInt(totalFillWork)} fills (area-filtered ${fmtInt(areaFiltered)}, P0-filtered ${fmtInt(p0Filtered)})`);

	// Tuned fast-path per-fill cost: run the standard (tuned-pool) solve over the k=2 seeds with
	// PS_PROFILE and harvest fill-ms / latticesTried. This is the AVAILABLE measured per-fill cost
	// (the spec's "k=2 fast-path per-fill costs"); W(6)-family cells skew larger, so treat as a floor.
	log(`  measuring tuned fast-path per-fill cost (standard pipeline, PS_PROFILE) …`);
	process.env.PS_PROFILE = '1';
	let profFillMs = 0, profTried = 0;
	const origWrite = process.stderr.write.bind(process.stderr);
	(process.stderr as unknown as { write: (s: string) => boolean }).write = (s: string): boolean => {
		const m = /\[PS_PROFILE k=\d+\] cand=\d+ms fill=(\d+)ms/.exec(s);
		if (m) profFillMs += parseInt(m[1], 10);
		return origWrite(s);
	};
	const tp0 = Date.now();
	for (const seed of seeds) {
		const { diag } = new PeriodSolver(K).solve(seed, { maxMs: 120000 });
		profTried += diag.latticesTried;
		if (diag.timedOut) log(`  ⚑ tuned probe seed ${seed.name} timed out at 120s — per-fill mean is an underestimate`);
	}
	(process.stderr as unknown as { write: typeof origWrite }).write = origWrite;
	delete process.env.PS_PROFILE;
	const perFillMs = profFillMs / Math.max(1, profTried);
	log(`  tuned fast path: ${fmtInt(profTried)} lattices filled in ${fmtInt(profFillMs)}ms fill-time (${fmtDur((Date.now() - tp0) / 1000)} wall) → mean ${perFillMs.toFixed(2)} ms/fill`);
	const projSecs = (totalFillWork * perFillMs) / 1000;
	log(`k=2 FILL PROJECTION (EXAMPLE MODE): ${fmtInt(totalFillWork)} fills × ${perFillMs.toFixed(2)} ms ≈ ${fmtDur(projSecs)} single-core, ~${fmtDur(projSecs / 8)} on 8 cores — ⚑ floor estimate (W(6)-family cells can exceed tuned-pool cell sizes; distribution is heavy-tailed)`);
}

// ---------------------------------------------------------------------------------------------
// Phase k3 — pair-stage timing only (sampled), per spec
// ---------------------------------------------------------------------------------------------
function runK3(pool: Pool, ladder: Ladder): void {
	const n = pool.count;
	const totalPairs = (n * (n - 1)) / 2;
	log(`k=3 PAIR TIMING (sampled): |W(8)\\{0}| = ${fmtInt(n)} → ${fmtSci(totalPairs)} unordered pairs; sampling every 719th outer row`);
	const { xs, ys, coords } = pool;
	const bitmap = ladder.bitmap;
	const minDet = ladder.minF - 1e-6;
	const maxDet = PAIR_DET_CAP + 1e-6;
	const q = new Int32Array(4);
	let pairs = 0, inRange = 0, hits = 0, adm = 0, sharp = 0;
	let canonMs = 0, canonCount = 0;
	const seen = new Set<string>();
	const t0 = Date.now();
	let lastLog = t0;
	for (let i = 0; i < n; i += 719) {
		const xi = xs[i], yi = ys[i], io = i * PHI;
		for (let j = i + 1; j < n; j++) {
			pairs++;
			const det = xi * ys[j] - yi * xs[j];
			const a = det < 0 ? -det : det;
			if (a < minDet || a > maxDet) continue;
			inRange++;
			if (bitmap[Math.round(a * 1e6)] === 0) continue;
			hits++;
			det4(coords, io, j * PHI, q);
			if (det < 0) { q[0] = -q[0]; q[1] = -q[1]; q[2] = -q[2]; q[3] = -q[3]; }
			const e = ladder.exact.get(q4key(q));
			if (e === undefined) continue;
			adm++;
			if (e.minTiles <= 24 * K) sharp++;
			const tc = Date.now();
			const [ru, rv] = gaussReduceExact(cycOf(coords, io), cycOf(coords, j * PHI));
			seen.add(latticeKey(ru, rv));
			canonMs += Date.now() - tc;
			canonCount++;
		}
		if (Date.now() - lastLog > 30_000) {
			lastLog = Date.now();
			const rate = pairs / ((lastLog - t0) / 1000);
			log(`  sampled ${fmtSci(pairs)} pairs, ${fmtSci(rate)}/s | inRange ${fmtSci(inRange)}, bitmap ${fmtSci(hits)}, adm ${fmtSci(adm)}, distinct-in-sample ${fmtInt(seen.size)}`);
			if (lastLog - t0 > K3_SAMPLE_BUDGET_MS) { log(`⚑ sample budget reached — projecting from partial sample`); break; }
		}
	}
	const secs = (Date.now() - t0) / 1000;
	const rate = pairs / secs;
	const nsPerPair = 1e9 / rate;
	const canonUs = canonCount > 0 ? (canonMs * 1000) / canonCount : NaN;
	const admFrac = adm / pairs;
	const projAdm = admFrac * totalPairs;
	const projCoreSecs = totalPairs / rate + (projAdm * (isNaN(canonUs) ? 0 : canonUs)) / 1e6;
	log(`k=3 PAIR TIMING done in ${fmtDur(secs)}: sampled ${fmtSci(pairs)} pairs (${((pairs / totalPairs) * 100).toFixed(3)}% of ${fmtSci(totalPairs)})`);
	log(`  per-pair broadphase+bitmap: ${nsPerPair.toFixed(1)} ns/pair (${fmtSci(rate)}/s single core)`);
	log(`  survivor rates: det-in-range ${(inRange / pairs * 100).toFixed(2)}%, bitmap ${(hits / pairs * 100).toFixed(3)}%, EXACT-admissible ${(admFrac * 100).toFixed(4)}% (sharp ${(sharp / pairs * 100).toFixed(4)}%)`);
	log(`  canonicalization+dedup (gaussReduceExact + latticeKey): ${isNaN(canonUs) ? 'n/a' : canonUs.toFixed(1) + ' µs/survivor'} (${fmtInt(canonCount)} in sample, ${fmtInt(seen.size)} distinct)`);
	log(`  PROJECTION full pair stage: ${fmtSci(totalPairs)} pairs → ~${fmtDur(projCoreSecs)} single-core ≈ ${fmtDur(projCoreSecs / 8)} on 8 cores (incl. ~${fmtSci(projAdm)} projected admissible-pair canonicalizations; distinct-lattice count does NOT extrapolate linearly — dedup saturates)`);
	log(`  ⚑ joins + fills NOT measured at k=3 (per spec) — pair stage is the necessary first gate`);
}

// ---------------------------------------------------------------------------------------------
// Phase k3 FILL MEASUREMENT (TH10_K3_FILL=1) — k3-fillcost work order (2026-07-05). The efficiency
// prune makes the k=3 pair→distinct→fill path tractable (it OOM'd unfiltered). Given the full
// distinct family (from pairStage+joinStage), measure the two numbers every k=3 estimate MODELED:
// the REAL distinct-fill count (Σ per-seed sound-filtered lattices) and the REAL per-fill cost
// (distribution over a sample stratified by seed × cell size). Then project the full fill wall-clock.
// EXAMPLE MODE: W(8) pool depth unproven; a timing run, no count/completeness claim.
// ---------------------------------------------------------------------------------------------
function runK3Fill(family: Family): void {
	const admissible = [...family.values()].filter((e) => e.admissible);
	const withAreaKey = admissible.map((e) => ({ ...e, aKey: areaKey(detSurd(e.u, e.v).abs()), hol: holohedry(e.u, e.v) }));
	// detF ∝ cell area. TH10_FILL_DESC=1 surfaces the large-cell monsters first (for the tail hunt).
	withAreaKey.sort((a, b) => (process.env.TH10_FILL_DESC === '1' ? b.detF - a.detF : a.detF - b.detF));
	const familyAllKeys = new Set([...family.values()].map((e) => latticeKey(e.u, e.v)));
	const familyAreaKeys = new Set(withAreaKey.map((e) => e.aKey));

	let seeds = buildSeeds(K);
	// TH10_SEED_ONLY=<substr>: restrict to matching seed(s) and fill ALL their lattices (monster hunt).
	if (process.env.TH10_SEED_ONLY) {
		const sub = process.env.TH10_SEED_ONLY;
		seeds = seeds.filter((s) => s.name.includes(sub));
		log(`⚑ TH10_SEED_ONLY='${sub}': restricted to ${seeds.length} seed(s) — ${seeds.map((s) => s.name).join('  ')}`);
	}
	// Sound per-seed filters (vcAreaSet + P0). TWO STREAMING passes over the admissible list keep
	// memory bounded to the sample — the full 449-seed × millions materialization would OOM at √2.
	const seedFilters = seeds.map((s) => seedAreaFilters(s, K));
	const admits = (e: (typeof withAreaKey)[number], f: (typeof seedFilters)[number]): boolean => {
		if (!f.areaKeys.has(e.aKey)) return false;
		const mv = f.minVerts.get(e.aKey);
		return !(mv !== undefined && mv > K * e.hol);
	};
	// pass 1 — per-seed fill count. Σ = THE REAL k=3 distinct-fill count (replaces the ~1.7e7 model).
	const perSeedCount = seedFilters.map((f) => { let c = 0; for (const e of withAreaKey) if (admits(e, f)) c++; return c; });
	const totalWork = perSeedCount.reduce((s, c) => s + c, 0);
	const nzSeeds = perSeedCount.filter((c) => c > 0).length;
	log(`${'─'.repeat(80)}`);
	log(`FILL MEASUREMENT (k=3, EXAMPLE MODE): distinct lattices ${fmtInt(family.size)}, admissible-det ${fmtInt(withAreaKey.length)}`);
	log(`  Σ per-seed fill work = ${fmtInt(totalWork)} — THE REAL k=3 distinct-fill count at this pool (replaces the ~1.7e7 model)`);
	log(`  ${nzSeeds}/${seeds.length} seeds admit ≥1 lattice; per-seed counts (nonzero): [${perSeedCount.filter((c) => c > 0).join(', ')}]`);
	if (totalWork === 0) { log(`  ⚑ 0 fills — no admissible seed lattice survived the sound filters at this pool`); log(`${'─'.repeat(80)}`); return; }

	// pass 2 — stratified sample: budget per seed ∝ its count; evenly-spaced picks over the seed's
	// detF-sorted admits ⇒ spans small→large cells (the heavy tail the work order flags).
	const SAMPLE_TARGET = parseInt(process.env.TH10_K3_FILL_SAMPLE ?? '4000', 10);
	const fillAll = totalWork <= SAMPLE_TARGET;
	const sample: { seed: (typeof seeds)[number]; e: (typeof withAreaKey)[number] }[] = [];
	for (let si = 0; si < seeds.length; si++) {
		const cnt = perSeedCount[si];
		if (cnt === 0) continue;
		const want = fillAll ? cnt : Math.max(1, Math.round((SAMPLE_TARGET * cnt) / totalWork));
		const stride = cnt / want;
		let idx = 0, picked = 0;
		for (const e of withAreaKey) {
			if (!admits(e, seedFilters[si])) continue;
			if (picked < want && idx >= Math.floor(picked * stride)) { sample.push({ seed: seeds[si], e }); picked++; }
			idx++;
		}
	}
	log(`  ${fillAll ? 'FILLING ALL (full stage)' : `SAMPLING ${fmtInt(sample.length)}`} lattices (stratified by seed × cell size); budget ${fmtDur(FILL_BUDGET_MS / 1000)}`);

	const fillMs: number[] = [];
	const detOf: number[] = [];
	let done = 0, rawCells = 0, gateRejected = 0, cellsProduced = 0;
	const t0 = Date.now();
	let lastLog = t0;
	let aborted = false;
	// TH10_FILL_SLOW_MS: dump the per-fill tree shape (profiler delta) for any fill over the threshold —
	// tells combinatorial (high Δpops) from per-node (few pops, huge Δtime). Needs PS_FILL_PROFILE=1.
	const SLOW_MS = process.env.TH10_FILL_SLOW_MS ? parseInt(process.env.TH10_FILL_SLOW_MS, 10) : 0;
	const SLOW_N = process.env.TH10_FILL_SLOW_N ? parseInt(process.env.TH10_FILL_SLOW_N, 10) : 1e9;
	const prof = SLOW_MS ? getFillProfile() : null;
	if (SLOW_MS && !prof) log(`⚑ TH10_FILL_SLOW_MS set but PS_FILL_PROFILE!=1 — no per-fill tree shape captured`);
	let slowSeen = 0;
	for (const { seed, e } of sample) {
		const snap = prof && { pops: prof.c.pops, contr: prof.c.contradictions, clos: prof.c.closures, places: prof.c.places, pushed: prof.c.pushed,
			setup: prof.t.setup, analyze: prof.t.analyze, certify: prof.t.certify, expand: prof.t.expand, primitive: prof.t.primitive,
			bB: prof.ct.buildBlock, ovl: prof.ct.overlap, jdg: prof.ct.judge };
		const tf = Date.now();
		const { cells, diag } = new PeriodSolver(K).solve(seed, {
			maxMs: 0,
			th10Override: { bases: [[e.u, e.v]], allKeys: familyAllKeys, areaKeys: familyAreaKeys },
		});
		const fms = Date.now() - tf;
		fillMs.push(fms);
		detOf.push(e.detF);
		done++;
		rawCells += diag.rawCells;
		gateRejected += diag.gateRejected;
		cellsProduced += cells.length;
		if (prof && snap && fms >= SLOW_MS) {
			const dp = prof.c.pops - snap.pops, dc = prof.c.contradictions - snap.contr, dcl = prof.c.closures - snap.clos;
			const dpl = prof.c.places - snap.places, dpu = prof.c.pushed - snap.pushed;
			const dtSetup = prof.t.setup - snap.setup, dtAna = prof.t.analyze - snap.analyze, dtCert = prof.t.certify - snap.certify;
			const dtExp = prof.t.expand - snap.expand, dtPrim = prof.t.primitive - snap.primitive;
			const dtBB = prof.ct.buildBlock - snap.bB, dtOvl = prof.ct.overlap - snap.ovl, dtJdg = prof.ct.judge - snap.jdg;
			const timed = dtSetup + dtAna + dtCert + dtExp + dtPrim;
			log(`  ⚑ SLOW FILL ${fms}ms detF=${e.detF.toFixed(2)} cells=${cells.length} seed=${seed.name}`);
			log(`      tree: pops ${fmtInt(dp)}, contradictions ${fmtInt(dc)}, closures ${fmtInt(dcl)}, places ${fmtInt(dpl)}, pushed ${fmtInt(dpu)}, ${dp > 0 ? ((timed / dp).toFixed(2) + ' ms/pop') : 'n/a'}`);
			log(`      time(ms): setup ${dtSetup.toFixed(0)} · analyze ${dtAna.toFixed(0)} · certify ${dtCert.toFixed(0)} (buildBlock ${dtBB.toFixed(0)} / overlap ${dtOvl.toFixed(0)} / judge ${dtJdg.toFixed(0)}) · expand ${dtExp.toFixed(0)} · primitive ${dtPrim.toFixed(0)}`);
			if (++slowSeen >= SLOW_N) { log(`  ⚑ captured ${slowSeen} slow fills (TH10_FILL_SLOW_N=${SLOW_N}) — stopping`); aborted = true; break; }
		}
		if (Date.now() - lastLog > 30_000) {
			lastLog = Date.now();
			const rate = done / ((lastLog - t0) / 1000);
			log(`  fills: ${fmtInt(done)}/${fmtInt(sample.length)}, ${rate.toFixed(1)}/s, ETA ${fmtDur((sample.length - done) / rate)}, cells ${cellsProduced}`);
			if (lastLog - t0 > FILL_BUDGET_MS) { log(`⚑ ABORT (fill budget) — projecting from ${fmtInt(done)} sampled`); aborted = true; break; }
		}
	}
	const secs = (Date.now() - t0) / 1000;
	const sorted = [...fillMs].sort((a, b) => a - b);
	const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
	const mean = fillMs.reduce((s, x) => s + x, 0) / Math.max(1, fillMs.length);
	log(`FILL MEASUREMENT ${aborted ? '⚑ partial' : 'done'} in ${fmtDur(secs)}: ${fmtInt(done)} fills, ${fmtInt(cellsProduced)} cells, raw ${fmtInt(rawCells)}, gate-rejected ${fmtInt(gateRejected)}`);
	log(`  per-fill cost (ms): mean ${mean.toFixed(2)}, p50 ${pct(50)}, p90 ${pct(90)}, p99 ${pct(99)}, max ${sorted[sorted.length - 1] ?? 0} — ⚑ heavy-tailed, the p99/max drive real cost`);
	// per-fill vs cell size (detF) quartiles of the sample — shows the tail IS size-driven
	const bySize = fillMs.map((ms, i) => ({ ms, det: detOf[i] })).sort((a, b) => a.det - b.det);
	const q = (lo: number, hi: number) => { const s = bySize.slice(Math.floor(lo * bySize.length), Math.floor(hi * bySize.length)); return s.length ? s.reduce((a, x) => a + x.ms, 0) / s.length : 0; };
	log(`  per-fill mean by cell-size quartile (small→large det): Q1 ${q(0, 0.25).toFixed(1)} · Q2 ${q(0.25, 0.5).toFixed(1)} · Q3 ${q(0.5, 0.75).toFixed(1)} · Q4 ${q(0.75, 1).toFixed(1)} ms`);
	// projection: full fill wall-clock = totalWork × per-fill, on 1 / 8 / N cores
	const nCores = os.cpus().length;
	const proj = (perFillMs: number, cores: number) => (totalWork * perFillMs) / 1000 / cores;
	log(`  PROJECTION full k=3 fill stage (${fmtInt(totalWork)} fills):`);
	log(`    at MEAN ${mean.toFixed(2)} ms/fill:  ${fmtDur(proj(mean, 1))} (1 core) · ${fmtDur(proj(mean, 8))} (8 cores) · ${fmtDur(proj(mean, nCores))} (${nCores} cores)`);
	log(`    at p99  ${pct(99)} ms/fill (tail-aware): ${fmtDur(proj(pct(99), 8))} (8 cores) — a conservative upper estimate`);
	log(`  ⚑ EXAMPLE MODE: W(8) pool depth (s*≤8) UNPROVEN — this closes the TIMING half; total k=3 feasibility = this per-fill × the pool the proof licenses (s=8 vs s=10).`);
	log(`${'─'.repeat(80)}`);
}

// ---------------------------------------------------------------------------------------------
// Efficiency-pruning pool filter (Experiment A) — keep v iff wt(v)² ≤ c²·|v|², EXACT. wt = the
// pool BFS level (= the true min-unit-24th-root weight; the enumerateW BFS is unpruned all-24-dir),
// |v|² via reSurd (effFilter). Reduces pool → pairs → distinct lattices → fills in one upstream cut.
// ⚑ COMPLETENESS KNOB (CLAUDE.md): a dropped tiling is the DATUM, logged loud, never silent. Unset
// flag ⇒ the identical pool object is returned (byte-identical).
// ---------------------------------------------------------------------------------------------
function applyEffFilter(pool: Pool): Pool {
	if (PRUNE_C2 === null) return pool; // no flag → untouched, byte-identical
	log(`${'⚑'.repeat(60)}`);
	log(`⚑ EFFICIENCY PRUNE ACTIVE — PRUNE_EFF_C2 = ${effC2Label(PRUNE_C2)}. Keep pool vector v iff wt(v)² ≤ c²·|v|² (EXACT ℚ(√2,√3) test). DATA-GATHERING: a dropped tiling is the measured breaking datum, NOT a bug to silence.`);
	const keep: number[] = [];
	for (let v = 0; v < pool.count; v++) {
		if (passesEffFilter(pool.wts[v], cycOf(pool.coords, v * PHI), PRUNE_C2)) keep.push(v);
	}
	const n = keep.length;
	if (n === 0) throw new Error('applyEffFilter: c² pruned the ENTIRE pool — threshold far too small; aborting');
	const coords = new Int8Array(n * PHI);
	const xs = new Float64Array(n);
	const ys = new Float64Array(n);
	const wts = new Int8Array(n);
	for (let a = 0; a < n; a++) {
		const v = keep[a];
		coords.set(pool.coords.subarray(v * PHI, v * PHI + PHI), a * PHI);
		xs[a] = pool.xs[v]; ys[a] = pool.ys[v]; wts[a] = pool.wts[v];
	}
	log(`⚑ POOL PRUNED: ${fmtInt(pool.count)} → ${fmtInt(n)} vectors (${(n / pool.count * 100).toFixed(2)}% kept, ${(pool.count / n).toFixed(2)}× vector-reduction ⇒ ~${((pool.count / n) ** 2).toFixed(2)}× pair-reduction)`);
	// per-weight-shell retained fraction (the extrapolation-to-the-proven-pool number the work
	// order wants — the efficient fraction shrinks with weight, so higher shells prune harder).
	const tot = new Map<number, number>(), kept = new Map<number, number>();
	for (let v = 0; v < pool.count; v++) tot.set(pool.wts[v], (tot.get(pool.wts[v]) ?? 0) + 1);
	for (let a = 0; a < n; a++) kept.set(wts[a], (kept.get(wts[a]) ?? 0) + 1);
	const shells = [...tot.keys()].sort((a, b) => a - b);
	log(`⚑ per-weight-shell kept: ` + shells.map((s) => `wt${s} ${kept.get(s) ?? 0}/${tot.get(s)} (${(((kept.get(s) ?? 0) / tot.get(s)!) * 100).toFixed(0)}%)`).join('  '));
	log(`${'⚑'.repeat(60)}`);
	return { coords, count: n, xs, ys, wts };
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------
function main(): void {
	log(`${'█'.repeat(100)}`);
	log(`██ TH-10 SCOUT — EXAMPLE MODE ██ phase=${PHASE} (k=${K}, s=${S}) — THE WEIGHT-${S} POOL BOUND IS UNPROVEN; no count/completeness claim is made by anything below`);
	if (process.env.TH10_S !== undefined) log(`⚑⚑ TH10_S OVERRIDE: pool weight bound forced to ${S} (staged default ${CFG.s}). ${S < CFG.s ? `TIGHTER than default — this can DROP a certified tiling whose reduced basis exceeds weight ${S} (completeness knob).` : 'looser than default.'} 2k+2 = ${2 * K + 2}.`);
	if (DIRS !== 24) log(`⚑⚑ TH10_DIRS=${DIRS}: pool built from ${DIRS} even-power roots (ℤ[ζ₁₂]) — OCTAGON-BLIND. 4.8.8 (t1002) and every octagon-bearing tiling at every k are UNREACHABLE (odd ζ₂₄ powers absent). Deliberate scope loss, not a bug.`);
	log(`machine: ${os.platform()} ${os.arch()}, ${os.cpus().length} cores, ${(os.totalmem() / 1024 ** 3).toFixed(0)} GB RAM, node ${process.version}`);
	log(`bounds: 24k·a_max = ${AREA_BOUND_F.toFixed(2)}, pair-det cap = ${PAIR_DET_CAP.toFixed(2)}, ladder = exact tile-multiset sums (no tile-count cap at pair stage — see header)`);

	// sanity: det4 vs detSurd on strided sample pairs (exact cross-check of the int quadruple path)
	const sanityPool = enumerateW(Math.min(S, 3));
	const qq = new Int32Array(4);
	for (let i = 0; i < Math.min(40, sanityPool.count); i += 3) {
		for (let j = i + 1; j < Math.min(40, sanityPool.count); j += 5) {
			det4(sanityPool.coords, i * PHI, j * PHI, qq);
			const exact = detSurd(cycOf(sanityPool.coords, i * PHI), cycOf(sanityPool.coords, j * PHI));
			const mine = new Surd(BigInt(qq[0]), BigInt(qq[1]), BigInt(qq[2]), BigInt(qq[3]), 4n);
			if (exact.cmp(mine) !== 0) throw new Error(`det4 SANITY FAIL at pair (${i},${j})`);
		}
	}
	log(`✓ det4 integer-quadruple sanity vs exact detSurd PASSED (strided sample)`);

	const t0 = Date.now();
	const rawPool = enumerateW(S);
	log(`W(${S}) enumerated: ${fmtInt(rawPool.count)} nonzero values (${fmtInt(rawPool.count + 1)} incl. 0) in ${fmtDur((Date.now() - t0) / 1000)}`);
	const pool = applyEffFilter(rawPool); // Experiment A: efficiency prune (byte-identical when PRUNE_EFF_C2 unset)

	const ladder = buildLadder(PAIR_DET_CAP);
	log(`area ladder (cap ${PAIR_DET_CAP.toFixed(2)}): ${fmtInt(ladder.exact.size)} exact tile-sum values, min ${ladder.minF.toFixed(4)}; sharp (≤${24 * K} tiles) subset ${fmtInt([...ladder.exact.values()].filter((e) => e.minTiles <= 24 * K).length)}`);

	// k=3 default path = the pair-timing sample (runK3). TH10_K3_FILL=1 routes k=3 through the FULL
	// pairs→distinct→joins→fill-measurement path (k3-fillcost work order) — feasible under pruning.
	if (PHASE === 'k3' && process.env.TH10_K3_FILL !== '1') {
		runK3(pool, ladder);
	} else {
		const { family, aborted } = pairStage(pool, ladder);
		if (!aborted) {
			const jstats = joinStage(family, pool, ladder);
			const admissibleCount = [...family.values()].filter((e) => e.admissible).length;
			const sharpCount = [...family.values()].filter((e) => e.sharp).length;
			log(`family after joins: ${fmtInt(family.size)} distinct lattices — ${fmtInt(admissibleCount)} admissible-det (fill candidates), ${fmtInt(sharpCount)} sharp (≤${24 * K}-tile); joins ${jstats.aborted ? '⚑ budget-cut' : 'COMPLETED'} (${jstats.rounds} rounds, +${fmtInt(jstats.joined)}, ${fmtInt(jstats.joinedAdmissible)} admissible-det)`);
			// k=2 default = the fill PROJECTION (runK2). TH10_K2_FILL=1 EXECUTES the fills → digest →
			// per-tiling bijection vs the certified k=2 snapshot (feasible only under the pool prune).
			// k=3: TH10_K3_FILL=1 → runK3Fill projection; add TH10_K3_EXEC=1 to EXECUTE fills + bijection
			// vs the certified 61 (runFillMatch) — a multi-hour run even pruned; per-seed lists are bounded
			// by Σ fills, not 449×|admissible|, so memory stays modest.
			if (PHASE === 'k1') runFillMatch(family);
			else if (PHASE === 'k2') { if (process.env.TH10_K2_FILL === '1') runFillMatch(family); else runK2(family); }
			else { if (process.env.TH10_K3_EXEC === '1') runFillMatch(family); else runK3Fill(family); }
		} else {
			log(`⚑ pair stage aborted — downstream stages skipped; partial counts above are the deliverable`);
		}
	}
	log(`██ TH-10 SCOUT phase=${PHASE} finished in ${fmtDur((Date.now() - t0) / 1000)} — ALL numbers above are EXAMPLE MODE (unproven pool bound) ██`);
	log(``);
}

main();
