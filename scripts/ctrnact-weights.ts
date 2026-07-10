/*
 * ██ Čtrnáct reference: EXACT reduced-basis weight / (w/v) ratios, k=1..8 ██
 *
 * The Čtrnáct catalogue (figures/data/ctrnact.json) reproduced here extends Galebach beyond k=6. This
 * script computes, for every reproduced tiling that carries geometry, the EXACT efficiency ratio
 *     r(tiling) = max( wt(u)/|u| , wt(v)/|v| )   over its gauss-reduced period basis (u,v),
 * where wt(·) = min # of unit 24th-roots summing to the vector (exact, meet-in-the-middle) and |·| is
 * the exact length. This is the same metric eff-pruning-{ratios,galebach}.ts use for the √2 argument;
 * these are the extra data points (k=7,8) for the weight / (w/v) bound.
 *
 * ⚑ OCTAGON-BLIND: Čtrnáct's alphabet is {3,4,6,12} (ζ₁₂ = even ζ₂₄ powers), like Galebach k≤6. So these
 * ratios are a ζ₁₂ reference (a lower bound on the octagon-complete sup); consistent with the Galebach
 * reference in eff-pruning-galebach.ts. Everything decisive is exact ℚ(ζ₂₄); float is display only.
 *
 * Reads figures/data/ctrnact.json. Writes a synchronous log + per-tiling CSV to experiments/results/.
 * Run:  pnpm tsx scripts/ctrnact-weights.ts
 */
import fs from "node:fs";
import path from "node:path";
import { Cyclotomic, CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { Surd, reSurd } from "@/classes/algorithm/exact/Surd";
import { gaussReduceExact } from "@/classes/algorithm/LatticeEnumerator";

const ring = CyclotomicRing.create(24);
setActiveRing(ring);

const LOG_DIR = path.join(process.cwd(), "experiments", "results");
fs.mkdirSync(LOG_DIR, { recursive: true });
const dateTag = new Date().toISOString().slice(0, 10);
const LOG_FILE = path.join(LOG_DIR, `ctrnact-weights-${dateTag}.log`);
fs.writeFileSync(LOG_FILE, "");
const log = (s = ""): void => {
	fs.appendFileSync(LOG_FILE, s + "\n");
	console.log(s);
};

const EXPECTED_W: Record<number, number> = { 1: 25, 2: 289, 3: 2089, 4: 10825, 5: 43777, 6: 146521, 7: 423169 };
const H = 8; // MIM covers wt ≤ 2H = 16 (Galebach reduced bases reach 14; k=7,8 periods can be longer)

// [a,b,c,d] = a + b·ζ₁₂ + c·ζ₁₂² + d·ζ₁₂³ (ζ₁₂ = ζ₂₄²) — the galebach.json / ctrnact.json encoding.
const dec = ([a, b, c, d]: number[]): Cyclotomic =>
	Cyclotomic.fromRational(ring, BigInt(a))
		.add(Cyclotomic.zeta(ring, 2).scaleRational(BigInt(b), 1n))
		.add(Cyclotomic.zeta(ring, 4).scaleRational(BigInt(c), 1n))
		.add(Cyclotomic.zeta(ring, 6).scaleRational(BigInt(d), 1n));

// ---- packed integer key: base-64 Horner over the 8 coords (each in ±31 for wt≤16 vectors). One JS
//      number (≤ 64^8 = 2^48 < 2^53, exact) — ~10× faster than a "a,b,…" string key in the hot MIM. ----
const PHI = ring.phi;
function pack(coords: number[]): number {
	let k = 0;
	for (let i = 0; i < PHI; i++) {
		const c = coords[i] + 32;
		if (c < 0 || c > 63) throw new Error(`pack: coord ${coords[i]} out of ±31 range (wt>16?)`);
		k = k * 64 + c;
	}
	return k;
}

// ---- build W(≤H): all-24-direction level-BFS, table-checked (falsifier) ----
const ZETA: number[][] = [];
for (let j = 0; j < 24; j++) ZETA.push(Cyclotomic.zeta(ring, j).num.map((b) => Number(b)));
type WVec = { coords: number[]; wt: number };
function buildWH(): { list: WVec[]; map: Map<number, number> } {
	const map = new Map<number, number>();
	const list: WVec[] = [];
	const zero = new Array<number>(PHI).fill(0);
	const seen = new Set<number>([pack(zero)]);
	let frontier: number[][] = [zero];
	let cumulative = 1;
	for (let t = 1; t <= H; t++) {
		const next: number[][] = [];
		for (const c of frontier) {
			for (let j = 0; j < 24; j++) {
				const d = new Array<number>(PHI);
				for (let i = 0; i < PHI; i++) d[i] = c[i] + ZETA[j][i];
				const k = pack(d);
				if (seen.has(k)) continue;
				seen.add(k);
				next.push(d);
				map.set(k, t);
				list.push({ coords: d, wt: t });
			}
		}
		cumulative += next.length;
		if (EXPECTED_W[t] !== undefined && cumulative !== EXPECTED_W[t]) throw new Error(`|W(${t})|=${cumulative} ≠ ${EXPECTED_W[t]} (BFS wrong)`);
		frontier = next;
	}
	list.sort((a, b) => a.wt - b.wt);
	log(`W(≤${H}) built: ${cumulative.toLocaleString("en-US")} vectors (incl. 0), table-checked ≤7; MIM covers wt ≤ ${2 * H}`);
	return { list, map };
}
const { list: WH, map: WHmap } = buildWH();
// flatten W into typed arrays for a tight MIM inner loop (coords[8*i..], wts[i])
const WN = WH.length;
const WC = new Int8Array(WN * PHI);
const WW = new Uint8Array(WN);
for (let i = 0; i < WN; i++) {
	WW[i] = WH[i].wt;
	for (let j = 0; j < PHI; j++) WC[i * PHI + j] = WH[i].coords[j];
}

/** exact wt(v) via meet-in-the-middle over W(≤H). Throws (loudly) if wt(v) > 2H. */
const _b = new Array<number>(PHI);
function wtMIM(v: Cyclotomic): number {
	if (v.den !== 1n) throw new Error(`wtMIM: non-integer vector (den=${v.den})`);
	const vc = v.num.map((b) => Number(b));
	const direct = WHmap.get(pack(vc));
	if (direct !== undefined) return direct; // BFS level = exact min weight; no MIM scan needed
	let best = Infinity; // only the rare wt>H vectors reach here
	for (let i = 0; i < WN; i++) {
		if (WW[i] >= best) break; // list sorted asc by wt
		const off = i * PHI;
		for (let j = 0; j < PHI; j++) _b[j] = vc[j] - WC[off + j];
		const wb = WHmap.get(pack(_b));
		if (wb !== undefined && WW[i] + wb < best) best = WW[i] + wb;
	}
	if (!isFinite(best)) throw new Error(`wtMIM: wt(v) > ${2 * H}`);
	return best;
}

// Trivial achievable upper bound Σ|cᵢ| (ζ^i and −ζ^i=ζ^{i+12} are unit roots) — the A* init bound / net.
function wtUpper(v: Cyclotomic): number {
	let s = 0n;
	for (const b of v.num) s += b < 0n ? -b : b;
	return Number(s);
}

// EXACT wt for the rare wt > 2H vectors (long striped k=7/8 periods), via A* from v → 0: each move
// subtracts a unit 24th-root (cost 1); admissible heuristic h(x)=|x| (any decomposition needs ≥ |x|
// roots, by the triangle inequality). Terminates early the moment it reaches the known W(≤H) ball
// (add that vector's exact weight), so it only searches the ~(wt−H) shell around v. Deterministic;
// float is used ONLY for the heuristic ordering, positions stay exact (integer coords). Memoized.
const OMEGA = Array.from({ length: PHI }, (_, i) => [Math.cos((Math.PI * i) / 12), Math.sin((Math.PI * i) / 12)]);
function normF(c: number[]): number {
	let re = 0, im = 0;
	for (let i = 0; i < PHI; i++) { re += c[i] * OMEGA[i][0]; im += c[i] * OMEGA[i][1]; }
	return Math.sqrt(re * re + im * im);
}
const deepCache = new Map<number, number>();
const NODE_BUDGET = 4_000_000;
function wtExactDeep(v: Cyclotomic): number | null {
	const vc = v.num.map((b) => Number(b));
	const startKey = pack(vc);
	const cached = deepCache.get(startKey);
	if (cached !== undefined) return cached;
	let best = wtUpper(v); // finite upper bound (prunes)
	// simple binary min-heap on f = g + h
	const hf: number[] = [], hg: number[] = [], hc: number[][] = [];
	const push = (f: number, g: number, c: number[]) => {
		hf.push(f); hg.push(g); hc.push(c);
		let i = hf.length - 1;
		while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; [hf[p], hf[i]] = [hf[i], hf[p]]; [hg[p], hg[i]] = [hg[i], hg[p]]; [hc[p], hc[i]] = [hc[i], hc[p]]; i = p; }
	};
	const pop = () => {
		const f = hf[0], g = hg[0], c = hc[0], n = hf.length - 1;
		hf[0] = hf[n]; hg[0] = hg[n]; hc[0] = hc[n]; hf.pop(); hg.pop(); hc.pop();
		let i = 0; while (true) { let s = i; const l = 2 * i + 1, r = 2 * i + 2; if (l < n && hf[l] < hf[s]) s = l; if (r < n && hf[r] < hf[s]) s = r; if (s === i) break; [hf[s], hf[i]] = [hf[i], hf[s]]; [hg[s], hg[i]] = [hg[i], hg[s]]; [hc[s], hc[i]] = [hc[i], hc[s]]; i = s; }
		return { f, g, c };
	};
	const gseen = new Map<number, number>([[startKey, 0]]);
	push(Math.floor(normF(vc)), 0, vc);
	let nodes = 0;
	while (hf.length > 0) {
		const { f, g, c } = pop();
		if (f >= best) break; // A*: no remaining node can beat `best`
		if (++nodes > NODE_BUDGET) return null; // give up (fall back to Σ|cᵢ|)
		for (let j = 0; j < 24; j++) {
			const nc = new Array<number>(PHI);
			let zero = true;
			for (let i = 0; i < PHI; i++) { nc[i] = c[i] - ZETA[j][i]; if (nc[i] !== 0) zero = false; }
			const ng = g + 1;
			if (zero) { if (ng < best) best = ng; continue; }
			const nk = pack(nc);
			const hb = WHmap.get(nk); // reached the W(≤H) ball ⇒ complete exactly
			if (hb !== undefined && ng + hb < best) best = ng + hb;
			const h = normF(nc);
			if (ng + h >= best) continue; // prune
			const prev = gseen.get(nk);
			if (prev === undefined || ng < prev) { gseen.set(nk, ng); push(ng + Math.floor(h), ng, nc); }
		}
	}
	deepCache.set(startKey, best);
	return best;
}

/** wt with fallback ladder: MIM (≤2H) → exact A* → Σ|cᵢ|. Returns [wt, exact]. */
function wtOf(v: Cyclotomic): [number, boolean] {
	try {
		return [wtMIM(v), true];
	} catch (err) {
		if (!(err as Error).message.startsWith("wtMIM: wt(v) >")) throw err;
		// SKIP_DEEP: for k=9 the wt>16 vectors are striped [m,0,m,0] (wtUpper = 2m is EXACT) or otherwise
		// low-ratio; skipping the (very slow at wt≈22) A* keeps the max-ratio answer intact.
		if (process.env.SKIP_DEEP) return [wtUpper(v), false];
		const deep = wtExactDeep(v);
		return deep !== null ? [deep, true] : [wtUpper(v), false];
	}
}

const lenSq = (v: Cyclotomic): Surd => reSurd(v.normSquared());
const surdF = (s: Surd): number => (Number(s.P) + Number(s.Q) * Math.SQRT2 + Number(s.R) * Math.sqrt(3) + Number(s.S) * Math.sqrt(6)) / Number(s.D);
const reqC2 = (wt: number, vSq: Surd): Surd => Surd.rational(BigInt(wt) * BigInt(wt)).div(vSq);
const maxSurd = (a: Surd, b: Surd): Surd => (a.cmp(b) >= 0 ? a : b);

// ---- sweep the reproduced catalogue ----
log("██ Čtrnáct reference — EXACT reduced-basis weight/(w/v) ratios, k=1..8 (⚑ octagon-blind ζ₁₂ reference) " + new Date().toISOString());
log("metric r = max(wt(u)/|u|, wt(v)/|v|) over the gauss-reduced period basis; same as eff-pruning-{ratios,galebach}.");
log("");

type Row = { id: string; k: number; family: string; reqC2: Surd; reqC: number; wtU: number; wtV: number; ratioU: number; ratioV: number; exact: boolean };
const dsPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(process.cwd(), "figures", "data", "ctrnact.json");
const ds = JSON.parse(fs.readFileSync(dsPath, "utf8")) as {
	tilings: { id: string; k: number; family: string; T1?: number[]; T2?: number[] }[];
};
const rows: Row[] = [];
const kMax: Record<number, Row | undefined> = {}; // rigorous sup: EXACT rows only
let processed = 0, noGeom = 0, failed = 0, approx = 0;
for (const t of ds.tilings) {
	if (!t.T1 || !t.T2) { noGeom++; continue; }
	try {
		const [u, v] = gaussReduceExact(dec(t.T1), dec(t.T2));
		const [wtU, exU] = wtOf(u), [wtV, exV] = wtOf(v);
		const exact = exU && exV;
		if (!exact) approx++;
		const uSq = lenSq(u), vSq = lenSq(v);
		const rc2 = maxSurd(reqC2(wtU, uSq), reqC2(wtV, vSq));
		const row: Row = { id: t.id, k: t.k, family: t.family, reqC2: rc2, reqC: Math.sqrt(surdF(rc2)), wtU, wtV, ratioU: wtU / Math.sqrt(surdF(uSq)), ratioV: wtV / Math.sqrt(surdF(vSq)), exact };
		rows.push(row);
		if (exact && (!kMax[t.k] || row.reqC2.cmp(kMax[t.k]!.reqC2) > 0)) kMax[t.k] = row;
		processed++;
		if (processed % 500 === 0) console.error(`  …${processed} tilings processed`);
	} catch (err) {
		failed++;
		log(`  ⚑ FAIL ${t.id} (k=${t.k}): ${(err as Error).message}`);
	}
}

log("");
log("═══ EXACT per-k max reduced-basis ratio (Čtrnáct reproduced, octagon-blind ζ₁₂) ═══");
let overall: Row | undefined;
for (let k = 1; k <= 9; k++) {
	const r = kMax[k];
	if (!r) continue;
	if (!overall || r.reqC2.cmp(overall.reqC2) > 0) overall = r;
	const le2 = r.reqC2.cmp(Surd.rational(2n, 1n)) <= 0 ? "≤√2" : "⚑ >√2";
	log(`  k=${k}: max ratio ${r.reqC.toFixed(4)}  ← ${r.id} (${r.family})  wt u=${r.wtU} v=${r.wtV}  ${le2}`);
}
if (overall) {
	log("");
	log(`OVERALL (k≤8, EXACT wt, octagon-blind ζ₁₂): max ratio ${overall.reqC.toFixed(4)}  ← ${overall.id} (k=${overall.k}, ${overall.family})`);
	log(`  exact c² = (${overall.reqC2.P}+${overall.reqC2.Q}√2+${overall.reqC2.R}√3+${overall.reqC2.S}√6)/${overall.reqC2.D}  ${overall.reqC2.cmp(Surd.rational(2n, 1n)) <= 0 ? "≤ √2 ✓" : "⚑ EXCEEDS √2"}`);
	log("  ⚑ ζ₁₂ LOWER BOUND: an octagon tiling (absent from Čtrnáct's alphabet) could exceed it — same caveat as eff-pruning-galebach.");
}
// The `approx` rows use a greedy UPPER BOUND on wt (long striped k=7/8 periods, wt > 2H=16). Verify each
// stays below the exact sup — if so, they cannot be the true max and the sup above is complete.
if (overall) {
	const supC2 = overall.reqC2;
	const overCap = rows.filter((r) => !r.exact && r.reqC2.cmp(supC2) > 0);
	if (approx > 0) log(`\n${approx} tilings used a greedy wt UPPER BOUND (wt > 16, long periods); all ${approx} have ratio (upper bound) ≤ sup: ${overCap.length === 0 ? "✓ sup complete" : `⚑ ${overCap.length} EXCEED — re-check with a deeper MIM`}`);
}
log("");
log(`processed ${processed} tilings (${approx} via greedy upper bound), ${noGeom} without geometry, ${failed} failed.`);

// per-tiling CSV (bounds data). exact=0 ⇒ wt is a greedy upper bound (ratio is an upper bound too).
const csv = ["id,k,family,wt_u,ratio_u,wt_v,ratio_v,required_c,required_c2,exact"];
for (const r of [...rows].sort((a, b) => a.k - b.k || b.reqC2.cmp(a.reqC2)))
	csv.push([r.id, r.k, r.family, r.wtU, r.ratioU.toFixed(6), r.wtV, r.ratioV.toFixed(6), r.reqC.toFixed(6), surdF(r.reqC2).toFixed(6), r.exact ? 1 : 0].join(","));
const csvPath = path.join(LOG_DIR, `ctrnact-weights-${dateTag}.csv`);
fs.writeFileSync(csvPath, csv.join("\n") + "\n");
log(`per-tiling CSV → ${path.relative(process.cwd(), csvPath)} (${rows.length} rows)`);
log(`log → ${path.relative(process.cwd(), LOG_FILE)}`);
