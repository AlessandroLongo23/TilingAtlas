/*
 * DG-1 (docs/review-2026-06-09/00-decision-gate.md) — measure whether the PROVEN candidate-pool
 * configuration (thesis thm:weight / cor:box, correctness.tex:407-459) is computationally enumerable
 * at k=1.
 *
 * The proven bound: period-lattice generators have weight <= s = 24k-1, i.e. they are sums of <= s
 * unit 24th-roots of unity. W(s) = { w in Z[zeta_24] : wt(w) <= s }. At k=1, s = 23. The tuned pool
 * actually used by every certified run is poolSteps = 2k+2 (PeriodSolver.ts:407) — this script
 * measures the PROVEN pool instead, level-by-level (weight 0,1,...,23), over DISTINCT values.
 *
 * Representation: Z[zeta_24] has rank phi(24) = 8 with basis 1, z, ..., z^7 and minimal polynomial
 * Phi_24(x) = x^8 - x^4 + 1, so z^8 = z^4 - 1 (and z^12 = -1). Every element is 8 integer coords.
 *
 * BFS correctness (frontier-only expansion): if v has minimal weight t+1 and v = r_1 + ... + r_{t+1}
 * is a minimal representation, then u = v - r_{t+1} has weight <= t by this representation, and
 * wt(u) < t would give wt(v) <= wt(u)+1 <= t, a contradiction — so wt(u) = t exactly and u is in the
 * level-t frontier. Hence new values at level t+1 = (frontier(t) + {z^j}) \ seen, and the per-level
 * "new distinct" counts are exactly #{ v : wt(v) = t }.
 *
 * PRUNING: none during the BFS (proven-sound only — there is none to apply at k=1):
 *   - cor:box(iii) |v| <= (2/sqrt3)*24k*a_max ~ 310.28 never binds (weight 23 => |w| <= 23 < 310).
 *   - the |u| bound sqrt((2/sqrt3)*24k*a_max) ~ 17.61 must NOT prune (a long vector can still be the
 *     second generator v); the u-eligible subset (float |w| <= 17.61) is REPORTED per level only.
 *     Float length is for reporting, never a decision.
 *
 * Budgets (loud abort, this is a measurement not a certified run): RSS > 6 GiB OR elapsed > 25 min
 * OR |seen| > 1.5e8.
 *
 * Logging: synchronous (fs.appendFileSync) per-level lines with progress + ETA to
 * experiments/results/dg1-proven-pool-k1.log, per the experiments doctrine in CLAUDE.md.
 *
 * Run from the repo root:  pnpm tsx scripts/measure-proven-pool.ts
 *
 * Standalone: zero imports from lib/, zero pipeline integration, modifies no existing file.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ---------------------------------------------------------------------------------------------
// Constants — k = 1
// ---------------------------------------------------------------------------------------------
const K = 1;
const S = 24 * K - 1; // 23
const N = 24;
const PHI = 8; // phi(24)

const A_MAX = 3 * (2 + Math.sqrt(3)); // unit-edge 12-gon area = 11.196152...
const DET_MAX = 24 * K * A_MAX; // cor:box(ii)  = 268.7077...
const V_BOUND = (2 / Math.sqrt(3)) * DET_MAX; // cor:box(iii) |v| bound = 310.2766...
const U_BOUND = Math.sqrt(V_BOUND); // cor:box(iii) |u| bound = 17.6147...
const U_BOUND2 = U_BOUND * U_BOUND;

// Budgets
const RSS_LIMIT = 6 * 1024 ** 3; // 6 GiB
const TIME_LIMIT_MS = 25 * 60 * 1000; // 25 min
const SEEN_LIMIT = 1.5e8;

// ---------------------------------------------------------------------------------------------
// Logging — synchronous, mirrored to stdout
// ---------------------------------------------------------------------------------------------
const LOG_DIR = path.join(process.cwd(), 'experiments', 'results');
const LOG_FILE = path.join(LOG_DIR, 'dg1-proven-pool-k1.log');
fs.mkdirSync(LOG_DIR, { recursive: true });

function log(line: string): void {
	fs.appendFileSync(LOG_FILE, line + '\n');
	console.log(line);
}

const fmtInt = (n: number): string => Math.round(n).toLocaleString('en-US');
const fmtSci = (n: number): string => n.toExponential(2);
const gb = (bytes: number): string => (bytes / 1024 ** 3).toFixed(2) + 'GB';
let peakRss = 0;
const rssNow = (): number => {
	const r = process.memoryUsage().rss;
	if (r > peakRss) peakRss = r;
	return r;
};

function fmtDur(sec: number): string {
	if (!isFinite(sec)) return 'inf';
	if (sec < 120) return sec.toFixed(1) + 's';
	if (sec < 7200) return (sec / 60).toFixed(1) + 'min';
	if (sec < 48 * 3600) return (sec / 3600).toFixed(1) + 'h';
	if (sec < 365 * 86400) return (sec / 86400).toFixed(1) + 'd';
	return (sec / (365 * 86400)).toFixed(1) + 'y';
}

// ---------------------------------------------------------------------------------------------
// 1. zeta^j coordinate vectors, j = 0..23, by shift-and-reduce with z^8 = z^4 - 1
// ---------------------------------------------------------------------------------------------
function buildZetaTable(): Int8Array {
	const table = new Int8Array(N * PHI);
	const cur = new Array<number>(PHI).fill(0);
	cur[0] = 1; // zeta^0 = 1
	for (let j = 0; j < N; j++) {
		for (let i = 0; i < PHI; i++) table[j * PHI + i] = cur[i];
		// multiply by zeta: shift up; overflow c7 -> z^8 = z^4 - 1
		const c7 = cur[PHI - 1];
		for (let i = PHI - 1; i >= 1; i--) cur[i] = cur[i - 1];
		cur[0] = 0;
		cur[4] += c7;
		cur[0] -= c7;
	}
	return table;
}

const ZETA = buildZetaTable();

// Float embedding tables (reporting only)
const COS = new Float64Array(PHI);
const SIN = new Float64Array(PHI);
for (let i = 0; i < PHI; i++) {
	COS[i] = Math.cos((2 * Math.PI * i) / N);
	SIN[i] = Math.sin((2 * Math.PI * i) / N);
}

function sanityChecks(): void {
	// zeta^12 must be exactly (-1,0,0,0,0,0,0,0)
	const z12 = ZETA.subarray(12 * PHI, 13 * PHI);
	const expected = [-1, 0, 0, 0, 0, 0, 0, 0];
	for (let i = 0; i < PHI; i++) {
		if (z12[i] !== expected[i]) {
			throw new Error(`SANITY FAIL: zeta^12 coords = [${Array.from(z12)}], expected [${expected}]`);
		}
	}
	// float cross-check: coords of zeta^j must embed to e^{2*pi*i*j/24} within 1e-9
	for (let j = 0; j < N; j++) {
		let x = 0;
		let y = 0;
		for (let i = 0; i < PHI; i++) {
			x += ZETA[j * PHI + i] * COS[i];
			y += ZETA[j * PHI + i] * SIN[i];
		}
		const ex = Math.cos((2 * Math.PI * j) / N);
		const ey = Math.sin((2 * Math.PI * j) / N);
		if (Math.abs(x - ex) > 1e-9 || Math.abs(y - ey) > 1e-9) {
			throw new Error(`SANITY FAIL: zeta^${j} embeds to (${x},${y}), expected (${ex},${ey})`);
		}
	}
	// algebraic identity: 1 + zeta^8 = zeta^4
	for (let i = 0; i < PHI; i++) {
		const lhs = ZETA[0 * PHI + i] + ZETA[8 * PHI + i];
		if (lhs !== ZETA[4 * PHI + i]) throw new Error('SANITY FAIL: 1 + zeta^8 != zeta^4');
	}
}

// ---------------------------------------------------------------------------------------------
// 2. Seen-set: open-addressing hash set on two Uint32Arrays.
//    Key = 8 signed coords, each offset by +128 into one byte; coords stay in [-23, 23] at s = 23,
//    so every byte is in [105, 151] and the hi word is never 0 -> hi === 0 marks an empty slot.
//    2^28 slots * 8 bytes = 2.15 GB, load factor <= 0.56 at the 1.5e8 seen budget.
// ---------------------------------------------------------------------------------------------
const SLOTS = 1 << 28;
const MASK = SLOTS - 1;
const hiA = new Uint32Array(SLOTS);
const loA = new Uint32Array(SLOTS);
let seenCount = 0;

/** Insert packed key (hi, lo); returns true iff newly inserted. Linear probing. */
function insert(hi: number, lo: number): boolean {
	let h = Math.imul(hi, 0x9e3779b1);
	h ^= Math.imul(lo, 0x85ebca77);
	h ^= h >>> 15;
	h = Math.imul(h, 0xc2b2ae3d);
	let i = (h >>> 0) & MASK;
	for (;;) {
		const sh = hiA[i];
		if (sh === 0) {
			hiA[i] = hi;
			loA[i] = lo;
			seenCount++;
			return true;
		}
		if (sh === hi && loA[i] === lo) return false;
		i = (i + 1) & MASK;
	}
}

// ---------------------------------------------------------------------------------------------
// Frontier storage: chunked Int8Array (8 bytes per entry), append-only, no doubling copies.
// ---------------------------------------------------------------------------------------------
const CHUNK_ENTRIES = 1 << 20; // 1M entries = 8 MB per chunk

class FrontierStore {
	chunks: Int8Array[] = [];
	count = 0;

	push(d0: number, d1: number, d2: number, d3: number, d4: number, d5: number, d6: number, d7: number): void {
		const idx = this.count & (CHUNK_ENTRIES - 1);
		if (idx === 0) this.chunks.push(new Int8Array(CHUNK_ENTRIES * PHI));
		const c = this.chunks[this.chunks.length - 1];
		const o = idx * PHI;
		c[o] = d0;
		c[o + 1] = d1;
		c[o + 2] = d2;
		c[o + 3] = d3;
		c[o + 4] = d4;
		c[o + 5] = d5;
		c[o + 6] = d6;
		c[o + 7] = d7;
		this.count++;
	}
}

// ---------------------------------------------------------------------------------------------
// Extrapolation helpers
// ---------------------------------------------------------------------------------------------
/** Fit a growth exponent d from the last (up to) 3 ratios r_t = new(t)/new(t-1) via
 *  d_t = ln(r_t) / ln(t/(t-1)) (polynomial model new(t) ~ c*t^d), then project new(j) for j > t. */
function projectRemaining(
	newPerLevel: number[],
	lastLevel: number
): { dHat: number; projNew: number[]; projTotal: number } {
	const ds: number[] = [];
	for (let t = lastLevel; t >= 2 && ds.length < 3; t--) {
		const a = newPerLevel[t];
		const b = newPerLevel[t - 1];
		if (a > 0 && b > 0) ds.push(Math.log(a / b) / Math.log(t / (t - 1)));
	}
	const dHat = ds.length ? ds.reduce((s, x) => s + x, 0) / ds.length : 7;
	const projNew: number[] = [];
	let cur = newPerLevel[lastLevel];
	let total = 0;
	for (let j = lastLevel + 1; j <= S; j++) {
		cur *= Math.pow(j / (j - 1), dHat);
		projNew.push(cur);
		total += cur;
	}
	return { dHat, projNew, projTotal: total };
}

/** Binomial C(n, k) as BigInt (the cor:box(iv) multiset cap, for the header). */
function binom(n: number, k: number): bigint {
	let r = 1n;
	for (let i = 1; i <= k; i++) r = (r * BigInt(n - k + i)) / BigInt(i);
	return r;
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------
function main(): void {
	sanityChecks();

	const t0 = Date.now();
	const binomCap = binom(S + N, N); // C(47,24)

	fs.writeFileSync(LOG_FILE, ''); // fresh log for this run
	log(`# DG-1 proven-pool measurement — k=${K}, s=${S} (thm:weight / cor:box, correctness.tex:407-459)`);
	log(`# date: ${new Date().toISOString()}   machine: ${os.platform()} ${os.arch()}, ${os.cpus().length} cores, ${(os.totalmem() / 1024 ** 3).toFixed(0)} GB RAM, node ${process.version}`);
	log(`# basis: Z[zeta_24] = 8 int coords over 1,z,...,z^7; Phi_24(x) = x^8 - x^4 + 1 => z^8 = z^4 - 1; sanity zeta^12 = -1 PASSED, float cross-check 24/24 PASSED (<=1e-9)`);
	log(`# bounds: a_max = 3(2+sqrt3) = ${A_MAX.toFixed(6)}; |det| <= 24k*a_max = ${DET_MAX.toFixed(4)}; |v| <= (2/sqrt3)*24k*a_max = ${V_BOUND.toFixed(4)} (NEVER binds at s=23: weight 23 => |w| <= 23)`);
	log(`# |u| <= sqrt((2/sqrt3)*24k*a_max) = ${U_BOUND.toFixed(4)} — u-eligible subset REPORTED per level (cumulative, nonzero), float, NO pruning on it during BFS`);
	log(`# pruning during BFS: NONE (no proven-sound prune applies at k=1; see header of scripts/measure-proven-pool.ts)`);
	log(`# budgets (loud abort): RSS > 6 GiB | elapsed > 25 min | |seen| > 1.5e8`);
	log(`# cor:box(iv) multiset cap C(${S + N},${N}) = ${binomCap.toLocaleString('en-US')} (~${Number(binomCap).toExponential(2)}) — an upper bound on |W(23)|, not the distinct count`);
	log(`# seen-set: open-addressing, 2^28 slots * 8 B = ${gb(SLOTS * 8)} preallocated`);
	log(`#`);

	// Level 0: {0}
	let frontier = new FrontierStore();
	frontier.push(0, 0, 0, 0, 0, 0, 0, 0);
	insert(128 << 24 | 128 << 16 | 128 << 8 | 128, 128 << 24 | 128 << 16 | 128 << 8 | 128); // packed zero
	let cumulative = 1;
	let uEligCum = 0; // 0 is excluded (a generator is nonzero; cor:box(iii) gives |u| >= 1)
	const newPerLevel: number[] = [1]; // newPerLevel[t] = #{v : wt(v) = t}
	const levelMs: number[] = [0];
	log(`level 0: +1 distinct (the zero element), cumulative 1, u-eligible(<=17.6): 0, growth n/a, elapsed 0.0s, RSS ${gb(rssNow())}, ETA-to-23: n/a`);

	let aborted = false;
	let abortReason = '';
	let lastCompletedLevel = 0;
	let partialNewAtAbort = 0;
	let abortLevel = -1;

	const BUDGET_CHECK_EVERY = 1 << 22; // attempts between budget checks
	let lastProgressLog = Date.now();

	levels: for (let t = 1; t <= S; t++) {
		const levelStart = Date.now();
		const next = new FrontierStore();
		let newCount = 0;
		let uEligNew = 0;
		let attempts = 0;
		const frontierTotal = frontier.count;
		let processed = 0;

		for (let ci = 0; ci < frontier.chunks.length; ci++) {
			const chunk = frontier.chunks[ci];
			const entries = Math.min(CHUNK_ENTRIES, frontierTotal - ci * CHUNK_ENTRIES);
			for (let e = 0; e < entries; e++) {
				const o = e * PHI;
				const c0 = chunk[o], c1 = chunk[o + 1], c2 = chunk[o + 2], c3 = chunk[o + 3];
				const c4 = chunk[o + 4], c5 = chunk[o + 5], c6 = chunk[o + 6], c7 = chunk[o + 7];
				for (let j = 0; j < N; j++) {
					const zb = j * PHI;
					const d0 = c0 + ZETA[zb], d1 = c1 + ZETA[zb + 1], d2 = c2 + ZETA[zb + 2], d3 = c3 + ZETA[zb + 3];
					const d4 = c4 + ZETA[zb + 4], d5 = c5 + ZETA[zb + 5], d6 = c6 + ZETA[zb + 6], d7 = c7 + ZETA[zb + 7];
					const hi = (((d0 + 128) << 24) | ((d1 + 128) << 16) | ((d2 + 128) << 8) | (d3 + 128)) >>> 0;
					const lo = (((d4 + 128) << 24) | ((d5 + 128) << 16) | ((d6 + 128) << 8) | (d7 + 128)) >>> 0;
					if (insert(hi, lo)) {
						next.push(d0, d1, d2, d3, d4, d5, d6, d7);
						newCount++;
						// float length, REPORTING ONLY (u-eligibility); new values at t >= 1 are nonzero
						const x = d0 + d1 * COS[1] + d2 * COS[2] + d3 * COS[3] + d4 * COS[4] + d5 * COS[5] + d6 * COS[6] + d7 * COS[7];
						const y = d1 * SIN[1] + d2 * SIN[2] + d3 * SIN[3] + d4 * SIN[4] + d5 * SIN[5] + d6 * SIN[6] + d7 * SIN[7];
						if (x * x + y * y <= U_BOUND2) uEligNew++;
					}
					attempts++;
				}
				processed++;
				if ((attempts & (BUDGET_CHECK_EVERY - 1)) < N && attempts >= BUDGET_CHECK_EVERY) {
					// budget checks (cheap, every ~4.2M attempts)
					const elapsed = Date.now() - t0;
					const rss = rssNow();
					if (rss > RSS_LIMIT) { aborted = true; abortReason = `RSS ${gb(rss)} > 6 GiB`; }
					else if (elapsed > TIME_LIMIT_MS) { aborted = true; abortReason = `elapsed ${fmtDur(elapsed / 1000)} > 25 min`; }
					else if (seenCount > SEEN_LIMIT) { aborted = true; abortReason = `|seen| ${fmtInt(seenCount)} > 1.5e8`; }
					if (aborted) {
						abortLevel = t;
						partialNewAtAbort = newCount;
						lastCompletedLevel = t - 1;
						log(`ABORT during level ${t} (${((processed / frontierTotal) * 100).toFixed(1)}% of frontier expanded): ${abortReason}`);
						break levels;
					}
					if (Date.now() - lastProgressLog > 20_000) {
						lastProgressLog = Date.now();
						log(`  ... level ${t} in progress: ${((processed / frontierTotal) * 100).toFixed(1)}% of frontier, +${fmtInt(newCount)} new so far, |seen| ${fmtInt(seenCount)}, elapsed ${fmtDur(elapsed / 1000)}, RSS ${gb(rss)}`);
					}
				}
			}
		}

		// level complete
		cumulative += newCount;
		uEligCum += uEligNew;
		newPerLevel[t] = newCount;
		const ms = Date.now() - levelStart;
		levelMs[t] = ms;
		const growth = t >= 2 && newPerLevel[t - 1] > 0 ? newCount / newPerLevel[t - 1] : NaN;
		const elapsedS = (Date.now() - t0) / 1000;
		const rss = rssNow();

		// ETA-to-23 from the last growth ratio (constant-ratio projection) + values/s of this level
		let eta = 'n/a';
		if (t < S && !isNaN(growth) && newCount > 0 && ms > 0) {
			let remaining = 0;
			let proj = newCount;
			for (let i = t + 1; i <= S; i++) {
				proj *= growth;
				remaining += proj;
			}
			const perSec = newCount / (ms / 1000);
			eta = `~${fmtSci(remaining)} more values, ~${fmtDur(remaining / perSec)} (from last growth ratio x${growth.toFixed(2)})`;
		} else if (t === S) {
			eta = 'done';
		}
		log(`level ${t}: +${fmtInt(newCount)} distinct, cumulative ${fmtInt(cumulative)}, u-eligible(<=17.6): ${fmtInt(uEligCum)}, growth x${isNaN(growth) ? 'n/a' : growth.toFixed(2)}, elapsed ${elapsedS.toFixed(1)}s, RSS ${gb(rss)}, ETA-to-23: ${eta}`);

		lastCompletedLevel = t;
		frontier = next;

		// between-level budget check
		const elapsed = Date.now() - t0;
		if (rss > RSS_LIMIT) { aborted = true; abortReason = `RSS ${gb(rss)} > 6 GiB`; }
		else if (elapsed > TIME_LIMIT_MS) { aborted = true; abortReason = `elapsed ${fmtDur(elapsed / 1000)} > 25 min`; }
		else if (seenCount > SEEN_LIMIT) { aborted = true; abortReason = `|seen| ${fmtInt(seenCount)} > 1.5e8`; }
		if (aborted) {
			abortLevel = t + 1;
			partialNewAtAbort = 0;
			log(`ABORT before level ${t + 1}: ${abortReason}`);
			break;
		}
	}

	// -----------------------------------------------------------------------------------------
	// Final block — extrapolation + DG-1 decision input
	// -----------------------------------------------------------------------------------------
	const totalS = (Date.now() - t0) / 1000;
	log(`#`);
	rssNow();
	log(`# ---- run finished: ${aborted ? 'BUDGET ABORT' : 'COMPLETE'} after ${fmtDur(totalS)}, peak RSS (sampled) ${gb(peakRss)} ----`);

	if (!aborted) {
		const pairBound = uEligCum * cumulative;
		log(`COMPLETE: |W(23)| = ${fmtInt(cumulative)} distinct values`);
		log(`u-eligible subset (0 < |w| <= ${U_BOUND.toFixed(4)}, float): ${fmtInt(uEligCum)}`);
		log(`PAIR-STAGE naive independent-pair upper bound: u-eligible x |W(23)| = ${fmtInt(uEligCum)} x ${fmtInt(cumulative)} = ${fmtSci(pairBound)} pairs (not enumerated)`);
		log(`#`);
		log(`# ==== DECISION INPUT FOR DG-1 ====`);
		log(`# k=1 value enumeration: COMPLETE within budget (${fmtDur(totalS)}, peak RSS ${gb(peakRss)}).`);
		log(`# |W(23)| = ${fmtInt(cumulative)}; u-eligible = ${fmtInt(uEligCum)}; naive pair bound = ${fmtSci(pairBound)}.`);
		const pairsPerDay8c = 8 * 86400 * 1e6; // assumption: ~1e6 exact pair-validations/s/core
		const pairDays = pairBound / pairsPerDay8c;
		log(`# Pair stage at an assumed ~1e6 exact pair-checks/s/core on 8 cores: ~${fmtDur(pairDays * 86400)} (${fmtSci(pairBound)} pairs / ${fmtSci(pairsPerDay8c)} per day).`);
		log(`# Implied DG-1 verdict: value enumeration FEASIBLE at k=1; pair stage ${pairDays <= 3 ? 'FEASIBLE (days on 8 cores)' : 'INFEASIBLE without further proven filters (TH-10 territory)'} under the naive bound.`);
	} else {
		log(`ABORTED AT BUDGET — proven pool NOT enumerated to s=23`);
		log(`reason: ${abortReason}`);
		log(`last completed level: ${lastCompletedLevel}  (abort happened ${partialNewAtAbort > 0 ? `during level ${abortLevel}, +${fmtInt(partialNewAtAbort)} partial new values found there (not counted below)` : `before level ${abortLevel}`})`);
		log(`cumulative |W(${lastCompletedLevel})| = ${fmtInt(cumulative)} distinct values; u-eligible(<=17.6) = ${fmtInt(uEligCum)}`);
		const ratios: string[] = [];
		for (let t = Math.max(2, lastCompletedLevel - 4); t <= lastCompletedLevel; t++) {
			if (newPerLevel[t - 1] > 0) ratios.push(`r(${t})=${(newPerLevel[t] / newPerLevel[t - 1]).toFixed(3)}`);
		}
		log(`last growth ratios: ${ratios.join(', ')}`);

		const { dHat, projTotal } = projectRemaining(newPerLevel, lastCompletedLevel);
		const projW23 = cumulative + projTotal;
		log(`#`);
		log(`# ---- honest extrapolation (polynomial fit new(t) ~ c*t^d on the last 3 growth ratios) ----`);
		log(`# fitted growth exponent d = ${dHat.toFixed(2)} (rank-8 lattice predicts frontier ~ t^7)`);
		log(`# projected |W(23)| ~ ${fmtSci(projW23)} distinct values (cumulative ${fmtSci(cumulative)} + projected ${fmtSci(projTotal)} for levels ${lastCompletedLevel + 1}..23)`);
		log(`# cor:box(iv) cap for reference: C(47,24) ~ ${Number(binomCap).toExponential(2)}`);
		const lastMs = levelMs[lastCompletedLevel] ?? 0;
		const lastNew = newPerLevel[lastCompletedLevel] ?? 0;
		const perSec = lastMs > 0 && lastNew > 0 ? lastNew / (lastMs / 1000) : NaN;
		const projTimeS = perSec > 0 ? projTotal / perSec : NaN;
		const projMem = projW23 * 8 * (1 / 0.7) + projW23 * 8; // hash slots at 0.7 load + final-frontier coords
		log(`# projected cost to finish enumeration at the measured rate (${isNaN(perSec) ? 'n/a' : fmtSci(perSec)} values/s, single core): ~${fmtDur(projTimeS)}; memory for the seen-set alone: ~${gb(projMem)}`);
		log(`# u-eligible note: every value of weight <= 17 has |w| <= 17 < ${U_BOUND.toFixed(2)} (triangle inequality), so the u-eligible subset tracks |W(t)| up to level 17 — the |u| filter does NOT tame the pool at k=1.`);
		const pairLower = uEligCum * projW23;
		log(`# PAIR-STAGE lower bound (observed u-eligible x projected |W(23)|): >= ${fmtSci(pairLower)} naive pairs.`);
		log(`#`);
		log(`# ==== DECISION INPUT FOR DG-1 ====`);
		log(`# k=1, s=23, proven configuration (cor:box, no unproven filters): NOT enumerable within 6 GiB / 25 min / 1.5e8 values.`);
		log(`# Reached level ${lastCompletedLevel}/23 with |W(${lastCompletedLevel})| = ${fmtInt(cumulative)}; projected |W(23)| ~ ${fmtSci(projW23)} (fit d=${dHat.toFixed(2)}).`);
		log(`# The proven in-search prunes available at k=1 prune NOTHING (|v|~310 never binds; |u| must not prune the BFS).`);
		log(`# Implied DG-1 table verdict: k=1 proven-pool enumeration INFEASIBLE at this scale => per the decision table, the honest rewrite (TX-1 option b) is mandatory and TH-10 (tighter weight bound) is the route back.`);
		log(`# (Caveat: this measures the VALUE enumeration of W(23) itself. Any feasible proven path needs a filter with a proof that cuts BEFORE materializing W(23) — the registry pattern applies.)`);
	}

	log(`# log file: ${LOG_FILE}`);
}

main();
