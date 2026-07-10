/*
 * Fast EXACT max (w/v) ratio for a Čtrnáct cells file. Branch-and-bound: the achievable upper bound
 * Σ|coords|/|v| dominates the true ratio wt/|v|, so sort tilings by upper bound and compute exact wt
 * (MIM over W(≤8)) only until the running exact max exceeds the next candidate's upper bound. The
 * striped heavy vectors (wt≈2k+4, ratio 2/√3≈1.155) sink to the bottom and are never touched — which
 * is exactly why the full-MIM sweep was slow and this is not.
 *   pnpm tsx scripts/ctrnact-ratio-fast.ts figures/data/_ctrnact-k9-tmp.json
 */
import fs from "node:fs";
import path from "node:path";
import { Cyclotomic, CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { gaussReduceExact } from "@/classes/algorithm/LatticeEnumerator";

const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const PHI = ring.phi;
const H = 8;
const EXPECTED_W: Record<number, number> = { 1: 25, 2: 289, 3: 2089, 4: 10825, 5: 43777, 6: 146521, 7: 423169 };

const dec = ([a, b, c, d]: number[]): Cyclotomic =>
	Cyclotomic.fromRational(ring, BigInt(a))
		.add(Cyclotomic.zeta(ring, 2).scaleRational(BigInt(b), 1n))
		.add(Cyclotomic.zeta(ring, 4).scaleRational(BigInt(c), 1n))
		.add(Cyclotomic.zeta(ring, 6).scaleRational(BigInt(d), 1n));

function pack(coords: number[]): number { let k = 0; for (let i = 0; i < PHI; i++) { const c = coords[i] + 32; if (c < 0 || c > 63) return -1; k = k * 64 + c; } return k; }
const ZETA: number[][] = [];
for (let j = 0; j < 24; j++) ZETA.push(Cyclotomic.zeta(ring, j).num.map((b) => Number(b)));
const WHmap = new Map<number, number>();
const WC: number[][] = [];
const WW: number[] = [];
{
	const zero = new Array<number>(PHI).fill(0);
	const seen = new Set<number>([pack(zero)]);
	let frontier: number[][] = [zero];
	let cumulative = 1;
	for (let t = 1; t <= H; t++) {
		const next: number[][] = [];
		for (const c of frontier) for (let j = 0; j < 24; j++) {
			const d = new Array<number>(PHI);
			for (let i = 0; i < PHI; i++) d[i] = c[i] + ZETA[j][i];
			const k = pack(d);
			if (k < 0 || seen.has(k)) continue;
			seen.add(k); next.push(d); WHmap.set(k, t); WC.push(d); WW.push(t);
		}
		cumulative += next.length;
		if (EXPECTED_W[t] !== undefined && cumulative !== EXPECTED_W[t]) throw new Error(`|W(${t})|=${cumulative}≠${EXPECTED_W[t]}`);
		frontier = next;
	}
	// sort WC/WW ascending by wt for the MIM early-break
	const idx = WC.map((_, i) => i).sort((a, b) => WW[a] - WW[b]);
	const sc = idx.map((i) => WC[i]), sw = idx.map((i) => WW[i]);
	WC.length = 0; WW.length = 0;
	for (let i = 0; i < sc.length; i++) { WC.push(sc[i]); WW.push(sw[i]); }
	console.error(`W(≤${H}) built: ${cumulative} vectors`);
}
const _b = new Array<number>(PHI);
function wtMIM(v: Cyclotomic): number {
	const vc = v.num.map((b) => Number(b));
	const direct = WHmap.get(pack(vc));
	if (direct !== undefined) return direct;
	let best = Infinity;
	for (let i = 0; i < WC.length; i++) {
		if (WW[i] >= best) break;
		for (let j = 0; j < PHI; j++) _b[j] = vc[j] - WC[i][j];
		const wb = WHmap.get(pack(_b));
		if (wb !== undefined && WW[i] + wb < best) best = WW[i] + wb;
	}
	if (!isFinite(best)) throw new Error("wt>16");
	return best;
}
const OMEGA = Array.from({ length: PHI }, (_, i) => [Math.cos((Math.PI * i) / 12), Math.sin((Math.PI * i) / 12)]);
const normF = (c: number[]): number => { let re = 0, im = 0; for (let i = 0; i < PHI; i++) { re += c[i] * OMEGA[i][0]; im += c[i] * OMEGA[i][1]; } return Math.hypot(re, im); };
const sumAbs = (c: number[]): number => c.reduce((s, x) => s + Math.abs(x), 0);

const ds = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), "utf8")) as { tilings: { id: string; k: number; family: string; T1?: number[]; T2?: number[] }[] };
type Cand = { id: string; k: number; family: string; u: Cyclotomic; v: Cyclotomic; lu: number; lv: number; upper: number };
const cands: Cand[] = [];
for (const t of ds.tilings) {
	if (!t.T1 || !t.T2) continue;
	const [u, v] = gaussReduceExact(dec(t.T1), dec(t.T2));
	const uc = u.num.map(Number), vc = v.num.map(Number);
	const lu = normF(uc), lv = normF(vc);
	const upper = Math.max(sumAbs(uc) / lu, sumAbs(vc) / lv);
	cands.push({ id: t.id, k: t.k, family: t.family, u, v, lu, lv, upper });
}
cands.sort((a, b) => b.upper - a.upper);

let best = 0, bestT: Cand | null = null, exactDone = 0;
for (const c of cands) {
	if (c.upper <= best) break; // exact ≤ upper; no later candidate can beat `best`
	let wu: number, wv: number;
	try { wu = wtMIM(c.u); wv = wtMIM(c.v); } catch { continue; } // wt>16 ⇒ heavy/striped, ratio low
	exactDone++;
	const r = Math.max(wu / c.lu, wv / c.lv);
	if (r > best) { best = r; bestT = c; }
}

// max WEIGHT candidate: Σ|coords| of the heavier reduced vector (= exact wt for striped [m,0,m,0];
// an upper bound otherwise, so max over all is an upper bound on the true max reduced-basis weight).
let mw = 0, mwId = "", mwStriped = false;
for (const c of cands) {
	const su = c.u.num.reduce((s, x) => s + (x < 0n ? -x : x), 0n);
	const sv = c.v.num.reduce((s, x) => s + (x < 0n ? -x : x), 0n);
	const w = Number(su > sv ? su : sv);
	if (w > mw) { mw = w; mwId = c.id;
		const nz = (c.u.num.reduce((s, x) => s + (x !== 0n ? 1 : 0), 0) === 2 || c.v.num.reduce((s, x) => s + (x !== 0n ? 1 : 0), 0) === 2);
		mwStriped = nz; }
}

const SQRT2 = Math.SQRT2;
const K = cands[0]?.k ?? "?";
console.log(`\nk=${K} max (w/v) ratio (EXACT, branch-and-bound; ${exactDone} exact wt evals of ${cands.length} tilings):`);
console.log(`  max ratio = ${best.toFixed(4)}  ← ${bestT?.id} (${bestT?.family})`);
console.log(`  √2 = ${SQRT2.toFixed(4)}  ⇒ ${best <= SQRT2 ? "≤ √2  ✓ bound HOLDS" : "⚑ EXCEEDS √2"}`);
console.log(`  max upper-bound ratio over all = ${cands[0].upper.toFixed(4)} (${cands[0].id})`);
console.log(`\nk=${K} max reduced-basis WEIGHT (Σ|coords| upper bound; exact for striped):`);
console.log(`  max weight ≤ ${mw}  ← ${mwId}${mwStriped ? "  (striped [m,0,m,0]: Σ|coords| = wt EXACT)" : "  (⚑ non-striped: Σ is an upper bound, needs exact check)"}`);
console.log(`  2k+2=${2 * Number(K) + 2}  2k+4=${2 * Number(K) + 4}  2k+6=${2 * Number(K) + 6}`);
