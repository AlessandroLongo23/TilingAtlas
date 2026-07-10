/*
 * Precise minimal-WEIGHT basis for the 2k+2 question. For each tiling, u = shortest reduced period; the
 * basis-completing second vectors are exactly {v + n·u} (det unchanged ⇔ b-coefficient ±1). So the
 * minimal second-period weight = min_n wt(v + n·u). Reports it for the k=7/8 violators (and the per-k
 * min-weight max), distinguishing "tight at 2k+2" from "exceeded". Same exact weight as ctrnact-weights.
 * Run: pnpm tsx scripts/ctrnact-minweight.ts
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

function pack(coords: number[]): number { let k = 0; for (let i = 0; i < PHI; i++) { const c = coords[i] + 40; if (c < 0 || c > 79) return -1; k = k * 80 + c; } return k; } // -1 = out of range (long vector, pruned upstream)
const ZETA: number[][] = [];
for (let j = 0; j < 24; j++) ZETA.push(Cyclotomic.zeta(ring, j).num.map((b) => Number(b)));
type WVec = { coords: number[]; wt: number };
const WH: WVec[] = [];
const WHmap = new Map<number, number>();
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
			if (seen.has(k)) continue;
			seen.add(k); next.push(d); WHmap.set(k, t); WH.push({ coords: d, wt: t });
		}
		cumulative += next.length;
		if (EXPECTED_W[t] !== undefined && cumulative !== EXPECTED_W[t]) throw new Error(`|W(${t})|=${cumulative}≠${EXPECTED_W[t]}`);
		frontier = next;
	}
	WH.sort((a, b) => a.wt - b.wt);
	console.error(`W(≤${H}) built: ${cumulative} vectors`);
}
const _b = new Array<number>(PHI);
function wtMIM(v: Cyclotomic): number {
	if (v.den !== 1n) throw new Error(`non-integer`);
	const vc = v.num.map((b) => Number(b));
	const direct = WHmap.get(pack(vc));
	if (direct !== undefined) return direct;
	let best = Infinity;
	for (const a of WH) { if (a.wt >= best) break; for (let i = 0; i < PHI; i++) _b[i] = vc[i] - a.coords[i]; const wb = WHmap.get(pack(_b)); if (wb !== undefined && a.wt + wb < best) best = a.wt + wb; }
	if (!isFinite(best)) throw new Error(`wt>${2 * H}`);
	return best;
}
const OMEGA = Array.from({ length: PHI }, (_, i) => [Math.cos((Math.PI * i) / 12), Math.sin((Math.PI * i) / 12)]);
const normF = (c: number[]): number => { let re = 0, im = 0; for (let i = 0; i < PHI; i++) { re += c[i] * OMEGA[i][0]; im += c[i] * OMEGA[i][1]; } return Math.sqrt(re * re + im * im); };
const deepCache = new Map<number, number>();
function wtExactDeep(v: Cyclotomic): number | null {
	const vc = v.num.map((b) => Number(b));
	const sk = pack(vc); const cc = deepCache.get(sk); if (cc !== undefined) return cc;
	let best = 0n; for (const b of v.num) best += b < 0n ? -b : b; let bestN = Number(best);
	const hf: number[] = [], hg: number[] = [], hc: number[][] = [];
	const push = (f: number, g: number, c: number[]) => { hf.push(f); hg.push(g); hc.push(c); let i = hf.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break;[hf[p], hf[i]] = [hf[i], hf[p]];[hg[p], hg[i]] = [hg[i], hg[p]];[hc[p], hc[i]] = [hc[i], hc[p]]; i = p; } };
	const pop = () => { const f = hf[0], g = hg[0], c = hc[0], n = hf.length - 1; hf[0] = hf[n]; hg[0] = hg[n]; hc[0] = hc[n]; hf.pop(); hg.pop(); hc.pop(); let i = 0; while (true) { let s = i; const l = 2 * i + 1, r = 2 * i + 2; if (l < n && hf[l] < hf[s]) s = l; if (r < n && hf[r] < hf[s]) s = r; if (s === i) break;[hf[s], hf[i]] = [hf[i], hf[s]];[hg[s], hg[i]] = [hg[i], hg[s]];[hc[s], hc[i]] = [hc[i], hc[s]]; i = s; } return { f, g, c }; };
	const gseen = new Map<number, number>([[sk, 0]]); push(Math.floor(normF(vc)), 0, vc); let nodes = 0;
	while (hf.length > 0) {
		const { f, g, c } = pop(); if (f >= bestN) break; if (++nodes > 4_000_000) return null;
		for (let j = 0; j < 24; j++) {
			const nc = new Array<number>(PHI); let zero = true;
			for (let i = 0; i < PHI; i++) { nc[i] = c[i] - ZETA[j][i]; if (nc[i] !== 0) zero = false; }
			const ng = g + 1; if (zero) { if (ng < bestN) bestN = ng; continue; }
			const nk = pack(nc); const hb = WHmap.get(nk); if (hb !== undefined && ng + hb < bestN) bestN = ng + hb;
			const h = normF(nc); if (ng + h >= bestN) continue; const prev = gseen.get(nk);
			if (prev === undefined || ng < prev) { gseen.set(nk, ng); push(ng + Math.floor(h), ng, nc); }
		}
	}
	deepCache.set(sk, bestN); return bestN;
}
const wt = (v: Cyclotomic): number => { try { return wtMIM(v); } catch (e) { if (!(e as Error).message.startsWith("wt>")) throw e; const d = wtExactDeep(v); if (d === null) throw new Error("deep budget"); return d; } };

// ---- the violators: read ids straight from the weights CSV (max(wt_u,wt_v) > 2k+2) ----
const ds = JSON.parse(fs.readFileSync(path.join(process.cwd(), "figures", "data", "ctrnact.json"), "utf8")) as { tilings: { id: string; k: number; family: string; T1?: number[]; T2?: number[] }[] };
const byId = new Map(ds.tilings.map((t) => [t.id, t]));
const csvPath = path.join(process.cwd(), "experiments", "results", "ctrnact-weights-2026-07-08.csv");
const violators = fs.readFileSync(csvPath, "utf8").split("\n").slice(1).filter(Boolean)
	.map((l) => l.split(","))
	.filter((c) => Math.max(Number(c[3]), Number(c[5])) > 2 * Number(c[1]) + 2)
	.map((c) => byId.get(c[0])!)
	.filter((t) => t && t.T1 && t.T2);
console.log(`\n${violators.length} length-reduced violators. Minimal-weight basis (min_n wt(v + n·u)):\n`);
console.log("id                                    k  wt(u)  len-reduced wt(v)  MIN-WEIGHT 2nd  argmin n   2k+2   verdict");
const perKMin: Record<number, number> = {};
for (const t of violators) {
	let [u, v] = gaussReduceExact(dec(t.T1!), dec(t.T2!));
	if (wt(u) > wt(v)) [u, v] = [v, u]; // u = lighter (the short one)
	const lrwt = wt(v);
	let minWt = lrwt, argmin = 0;
	for (let n = -6; n <= 6; n++) {
		const b = v.add(u.scaleRational(BigInt(n), 1n));
		if (normF(b.num.map(Number)) >= minWt) continue; // wt(b) ≥ |b| ≥ minWt ⇒ can't improve; skip (no A*)
		let w: number;
		try { w = wt(b); } catch { continue; }
		if (w < minWt) { minWt = w; argmin = n; }
	}
	const bound = 2 * t.k + 2;
	perKMin[t.k] = Math.max(perKMin[t.k] ?? 0, minWt);
	console.log(`${t.id.padEnd(37)} ${t.k}   ${wt(u)}      ${lrwt}                ${minWt}             ${argmin >= 0 ? "+" : ""}${argmin}        ${bound}    ${minWt <= bound ? (minWt === bound ? "TIGHT (=2k+2)" : "under") : "EXCEEDS 2k+2"}`);
}
console.log("\n═══ per-k MINIMAL-WEIGHT-basis max (over violators; non-violators are ≤ their length-reduced wt ≤ 2k+2) ═══");
for (const k of Object.keys(perKMin).map(Number).sort((a, b) => a - b))
	console.log(`  k=${k}: min-weight max = ${perKMin[k]}   2k+2 = ${2 * k + 2}   ⇒ ${perKMin[k] <= 2 * k + 2 ? (perKMin[k] === 2 * k + 2 ? "bound holds, TIGHT" : "bound holds") : "BOUND VIOLATED even under min-weight"}`);
