/*
 * ██ EFFICIENCY-PRUNING — EXPERIMENT B extension: exact ratios over the Galebach k≤6 reference ██
 * (work order §6: "the 1.296 empirical max … may move once octagons and the exact ζ₂₄ wt are in —
 * do not round the reported sup down toward √2").
 *
 * The proxy's max reduced-basis ratio "1.2957 @ t6268, k=6" used a FLOAT weight. Here we recompute
 * it EXACT: for every Galebach oracle tiling (k=1..6, A068599 counts 11/20/61/151/332/673), lift the
 * period basis to ℤ[ζ₂₄], gauss-reduce, and take max(wt(u)/|u|, wt(v)/|v|) with the EXACT weight
 * (min unit-24th-root count) and exact |·|.
 *
 * ⚑⚑ OCTAGON-BLIND. Galebach periods live in ℤ[ζ₁₂] (even ζ₂₄ powers only — dec: a+bζ₁₂+cζ₁₂²+dζ₁₂³,
 * ζ₁₂=ζ₂₄²), so octagon (4.8.8-type) tilings whose periods need ODD powers of ζ₂₄ are ABSENT. Hence
 * every sup below is a LOWER BOUND on the true octagon-complete sup, and CANNOT establish √2-safety
 * for k≥4. The octagon-complete answer exists only for the certified k≤3 set (eff-pruning-ratios.ts).
 *
 * wt oracle: MEET-IN-THE-MIDDLE. Galebach reduced bases reach weight 12 (join-necessity 2026-07-04),
 * beyond a plain W(≤8) BFS. Build W(≤6) (all-24-dir, table-checked); wt(v)=min_{a∈W6, v−a∈W6}
 * [wt(a)+wt(v−a)] — exact for wt ≤ 12 (any minimal rep splits into two ≤6 halves).
 *
 * Run:  pnpm tsx scripts/eff-pruning-galebach.ts
 */
import fs from "node:fs";
import path from "node:path";
import { loadOracle } from "./oracle-match"; // module scope creates + sets THE N=24 ring (ring discipline)
import { Cyclotomic, getActiveRing } from "@/classes/Cyclotomic";
import { Surd, reSurd } from "@/classes/algorithm/exact/Surd";
import { gaussReduceExact } from "@/classes/algorithm/LatticeEnumerator";

const ring = getActiveRing();
if (ring.N !== 24) throw new Error(`ring N=${ring.N}, expected 24`);

const LOG_DIR = path.join(process.cwd(), "experiments", "results");
const dateTag = new Date().toISOString().slice(0, 10);
const LOG_FILE = path.join(LOG_DIR, `eff-pruning-galebach-${dateTag}.log`);
fs.writeFileSync(LOG_FILE, "");
const log = (s = "") => { fs.appendFileSync(LOG_FILE, s + "\n"); console.log(s); };

const EXPECTED_W: Record<number, number> = { 1: 25, 2: 289, 3: 2089, 4: 10825, 5: 43777, 6: 146521, 7: 423169 };
const H = 7; // MIM covers wt ≤ 2H = 14 (galebach reduced bases reach wt 14 — join-necessity 2026-07-04)

// galebach period decode: [a,b,c,d] = a + b·ζ₁₂ + c·ζ₁₂² + d·ζ₁₂³ (ζ₁₂ = ζ₂₄²). (oracle-match dec)
const dec = ([a, b, c, d]: number[]): Cyclotomic =>
	Cyclotomic.fromRational(ring, BigInt(a))
		.add(Cyclotomic.zeta(ring, 2).scaleRational(BigInt(b), 1n))
		.add(Cyclotomic.zeta(ring, 4).scaleRational(BigInt(c), 1n))
		.add(Cyclotomic.zeta(ring, 6).scaleRational(BigInt(d), 1n));

const coordKey = (v: Cyclotomic): string => {
	if (v.den !== 1n) throw new Error(`galebach: non-integer vector (den=${v.den})`);
	return v.num.map((b) => b.toString()).join(",");
};

// ---- build W(≤H): all-24-direction level-BFS, table-checked ----
const ZETA: number[][] = [];
for (let j = 0; j < 24; j++) ZETA.push(Cyclotomic.zeta(ring, j).num.map((b) => Number(b)));
type WVec = { coords: number[]; wt: number };
function buildWH(): { list: WVec[]; map: Map<string, number> } {
	const map = new Map<string, number>();
	const list: WVec[] = [];
	const zero = new Array<number>(ring.phi).fill(0);
	const seen = new Set<string>([zero.join(",")]);
	let frontier: number[][] = [zero];
	let cumulative = 1;
	for (let t = 1; t <= H; t++) {
		const next: number[][] = [];
		for (const c of frontier) {
			for (let j = 0; j < 24; j++) {
				const d = new Array<number>(ring.phi);
				for (let i = 0; i < ring.phi; i++) d[i] = c[i] + ZETA[j][i];
				const k = d.join(",");
				if (seen.has(k)) continue;
				seen.add(k); next.push(d);
				map.set(k, t); list.push({ coords: d, wt: t });
			}
		}
		cumulative += next.length;
		if (EXPECTED_W[t] !== undefined && cumulative !== EXPECTED_W[t]) throw new Error(`|W(${t})|=${cumulative} ≠ ${EXPECTED_W[t]}`);
		frontier = next;
	}
	list.sort((a, b) => a.wt - b.wt); // ascending wt → early-break in the MIM min
	log(`W(≤${H}) built: ${cumulative.toLocaleString()} vectors (incl. 0), table-checked; MIM covers wt ≤ ${2 * H}`);
	return { list, map };
}
const { list: W6, map: W6map } = buildWH();

/** exact wt(v) via meet-in-the-middle over W(≤H). Throws if wt(v) > 2H (bump H). */
function wtMIM(v: Cyclotomic): number {
	const vc = v.num.map((b) => Number(b));
	// direct hit (wt ≤ H)?
	const direct = W6map.get(vc.join(","));
	let best = direct ?? Infinity;
	if (best === 1) return 1;
	for (const a of W6) {
		if (a.wt >= best) break; // sorted asc ⇒ no a beyond here can improve
		const b = new Array<number>(ring.phi);
		for (let i = 0; i < ring.phi; i++) b[i] = vc[i] - a.coords[i];
		const wb = W6map.get(b.join(","));
		if (wb !== undefined && a.wt + wb < best) best = a.wt + wb;
	}
	if (!isFinite(best)) throw new Error(`wtMIM: wt(v) > ${2 * H} — bump H (coords ${vc.join(",")})`);
	return best;
}

// ---- exact helpers (mirror eff-pruning-ratios) ----
const lenSq = (v: Cyclotomic): Surd => reSurd(v.normSquared());
const surdF = (s: Surd) => (Number(s.P) + Number(s.Q) * Math.SQRT2 + Number(s.R) * Math.sqrt(3) + Number(s.S) * Math.sqrt(6)) / Number(s.D);
const reqC2 = (wt: number, vSq: Surd) => Surd.rational(BigInt(wt) * BigInt(wt)).div(vSq);
const maxSurd = (a: Surd, b: Surd) => (a.cmp(b) >= 0 ? a : b);

// ---- sweep the oracle ----
log("██ EFFICIENCY-PRUNING — EXP B extension: EXACT ratios over Galebach k≤6 (⚑ OCTAGON-BLIND ℤ[ζ₁₂] reference) " + new Date().toISOString());
log("proxy claim to correct: max reduced-basis ratio ≈ 1.2957 @ t6268 (k=6), computed with a FLOAT weight.");
log("");
const oracle = loadOracle();
type GRow = { id: string; k: number; reqC2: Surd; reqC: number; wtU: number; wtV: number; ratioU: number; ratioV: number };
const rows: GRow[] = [];
let processed = 0, failed = 0;
const kMax: Record<number, GRow | undefined> = {};
for (const [tCode, o] of Object.entries(oracle)) {
	const k = Number(tCode[1]);
	if (!(k >= 1 && k <= 6)) continue;
	try {
		const [u, v] = gaussReduceExact(dec(o.T1), dec(o.T2));
		const wtU = wtMIM(u), wtV = wtMIM(v);
		const uSq = lenSq(u), vSq = lenSq(v);
		const rc2 = maxSurd(reqC2(wtU, uSq), reqC2(wtV, vSq));
		const row: GRow = { id: tCode, k, reqC2: rc2, reqC: Math.sqrt(surdF(rc2)), wtU, wtV, ratioU: wtU / Math.sqrt(surdF(uSq)), ratioV: wtV / Math.sqrt(surdF(vSq)) };
		rows.push(row);
		if (!kMax[k] || row.reqC2.cmp(kMax[k]!.reqC2) > 0) kMax[k] = row;
		processed++;
	} catch (e) {
		failed++;
		if (failed <= 5) log(`  ⚑ ${tCode}: ${(e as Error).message}`);
	}
}
log(`processed ${processed} oracle tilings (${failed} decode/weight failures)`);
log("");
log("═══ EXACT per-k max reduced-basis ratio (Galebach reference, octagon-blind) ═══");
let overall: GRow | undefined;
for (const k of [1, 2, 3, 4, 5, 6]) {
	const r = kMax[k];
	if (!r) continue;
	if (!overall || r.reqC2.cmp(overall.reqC2) > 0) overall = r;
	log(`  k=${k}: max ratio ${r.reqC.toFixed(4)}  ← ${r.id}  (wt u=${r.wtU} v=${r.wtV}, ratio u=${r.ratioU.toFixed(4)} v=${r.ratioV.toFixed(4)})  ${r.reqC2.cmp(Surd.rational(2n, 1n)) <= 0 ? "≤√2" : "⚑ >√2"}`);
}
if (overall) {
	log("");
	log(`OVERALL (Galebach k≤6, EXACT wt, octagon-blind): max ratio ${overall.reqC.toFixed(4)}  ← ${overall.id}  exact c² = (${overall.reqC2.P}+${overall.reqC2.Q}√2+${overall.reqC2.R}√3+${overall.reqC2.S}√6)/${overall.reqC2.D}`);
	log(`  proxy said 1.2957 @ t6268 (float wt). Exact vs proxy: ${overall.reqC > 1.2957 ? "HIGHER" : overall.reqC < 1.2957 ? "LOWER" : "equal"} — √2 (1.4142) margin: ${(Math.SQRT2 - overall.reqC).toFixed(4)}`);
	log(`  ⚑ this is a ζ₁₂ LOWER BOUND: an octagon tiling at k≥4 (absent here) could exceed it. Octagon-complete sup is available only at certified k≤3 = 1.2426 (eff-pruning-ratios).`);
}
// CSV
const csv = ["id,k,wt_u,ratio_u,wt_v,ratio_v,required_c,required_c2"];
for (const r of [...rows].sort((a, b) => a.k - b.k || b.reqC2.cmp(a.reqC2))) csv.push([r.id, r.k, r.wtU, r.ratioU.toFixed(6), r.wtV, r.ratioV.toFixed(6), r.reqC.toFixed(6), surdF(r.reqC2).toFixed(6)].join(","));
fs.writeFileSync(path.join(LOG_DIR, `eff-pruning-galebach-${dateTag}.csv`), csv.join("\n") + "\n");
log("");
log(`per-tiling CSV → experiments/results/eff-pruning-galebach-${dateTag}.csv (${rows.length} rows)`);
log("██ done ██");
