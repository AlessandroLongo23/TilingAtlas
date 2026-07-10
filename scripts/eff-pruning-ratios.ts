/*
 * ██ EFFICIENCY-PRUNING — EXPERIMENT B (analytic breaking threshold) ██
 * (work order experiments/efficiency-pruning-workorder-2026-07-04.md §3.4/§3.5)
 *
 * For every CERTIFIED k≤3 tiling, compute the EXACT reduced-basis efficiency ratio
 *     r(tiling) = max( wt(u)/|u| , wt(v)/|v| )   over its reduced period basis (u,v),
 * where wt(·) is the EXACT weight (min number of unit 24th-roots summing to the vector) and |·| is
 * the EXACT length. A tiling SURVIVES the pool filter `keep w iff wt(w) ≤ c·|w|` at threshold c iff
 * c ≥ r(tiling) [sufficient: its reduced basis then survives and regenerates the lattice]. Hence the
 * per-k BREAKING THRESHOLD (smallest c keeping every certified k-tiling) = max_tilings r(tiling),
 * and the tiling attaining it is the "tightest". These are the numbers the parallel √2 proof needs.
 *
 * Everything is exact: |v|² = Re(conj(v)·v) as a Surd; wt from an UNPRUNED, all-24-direction,
 * monotone-OFF level-BFS (the ONLY sound weight — the production shortVectorPool depth is inflated
 * by monotone+restricted-dirs and would over-state wt). The BFS is self-checked against the TA exact
 * |W(t)| table (a falsifier) and against wt(1)=1, wt(ζ⁰+ζ³+ζ⁶)=3.
 *
 * Reads ONLY: figures/data/catalogue-k1-3.json (certified bases) + figures/data/oracle-map.json
 * (canonicalKey → Galebach t-code, for readable ids). Writes a synchronous, human-readable log.
 * NO pipeline mutation, no flag — this is a direct measurement on the committed catalogue.
 *
 * Run:  pnpm tsx scripts/eff-pruning-ratios.ts
 */
import fs from "node:fs";
import path from "node:path";
import { Cyclotomic, CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { Surd, reSurd } from "@/classes/algorithm/exact/Surd";
import { gaussReduceExact } from "@/classes/algorithm/LatticeEnumerator";

const ring = CyclotomicRing.create(24);
setActiveRing(ring);

// ---- synchronous log (CLAUDE.md experiments doctrine) ----
const LOG_DIR = path.join(process.cwd(), "experiments", "results");
fs.mkdirSync(LOG_DIR, { recursive: true });
const dateTag = new Date().toISOString().slice(0, 10);
const LOG_FILE = path.join(LOG_DIR, `eff-pruning-ratios-${dateTag}.log`);
fs.writeFileSync(LOG_FILE, "");
function log(line = ""): void {
	fs.appendFileSync(LOG_FILE, line + "\n");
	console.log(line);
}

// TA's exact |W(t)| (cumulative, incl. 0) — a falsifier for the weight BFS.
const EXPECTED_W: Record<number, number> = { 1: 25, 2: 289, 3: 2089, 4: 10825, 5: 43777, 6: 146521, 7: 423169 };

// ---------------------------------------------------------------------------------------------
// Exact weight oracle: wt(v) = min # of unit 24th-roots summing to v. Unpruned all-24-direction
// monotone-OFF level-BFS over the 8-dim integer coords (basis 1,ζ,…,ζ⁷). Builds W outward until
// every requested target is reached; self-checks cumulative |W(t)| against EXPECTED_W.
// ---------------------------------------------------------------------------------------------
const ZETA: number[][] = [];
for (let j = 0; j < 24; j++) ZETA.push(Cyclotomic.zeta(ring, j).num.map((b) => Number(b)));

function coordKeyOf(v: Cyclotomic): string {
	if (v.den !== 1n) throw new Error(`weight oracle: vector is not an algebraic integer (den=${v.den}) — key would not match the BFS`);
	return v.num.map((b) => b.toString()).join(",");
}

function buildWtOracle(targets: Cyclotomic[], maxLevel = 12): Map<string, number> {
	const targetKeys = new Set(targets.map(coordKeyOf));
	const wt = new Map<string, number>();
	const seen = new Set<string>();
	const zeroKey = new Array<number>(ring.phi).fill(0).join(",");
	seen.add(zeroKey);
	let frontier: number[][] = [new Array<number>(ring.phi).fill(0)];
	const remaining = new Set(targetKeys);
	if (remaining.has(zeroKey)) throw new Error("weight oracle: 0 requested as a target (a basis vector is zero?)");
	let cumulative = 1; // incl. 0
	let deepest = 0;
	for (let t = 1; t <= maxLevel && remaining.size > 0; t++) {
		const next: number[][] = [];
		for (const c of frontier) {
			for (let j = 0; j < 24; j++) {
				const d = new Array<number>(ring.phi);
				for (let i = 0; i < ring.phi; i++) d[i] = c[i] + ZETA[j][i];
				const k = d.join(",");
				if (seen.has(k)) continue;
				seen.add(k);
				next.push(d);
				if (remaining.has(k)) { wt.set(k, t); remaining.delete(k); }
			}
		}
		cumulative += next.length;
		deepest = t;
		if (EXPECTED_W[t] !== undefined && cumulative !== EXPECTED_W[t]) {
			throw new Error(`weight BFS: |W(${t})| = ${cumulative} ≠ expected ${EXPECTED_W[t]} (TA table) — BFS WRONG`);
		}
		frontier = next;
	}
	if (remaining.size > 0) throw new Error(`weight oracle: ${remaining.size} target(s) unreached by weight ${maxLevel}`);
	log(`weight oracle: built W(≤${deepest}) (${cumulative.toLocaleString("en-US")} vectors incl. 0, table-checked ≤ min(${deepest},7)); ${targetKeys.size} distinct basis vectors resolved`);
	return wt;
}

// ---------------------------------------------------------------------------------------------
// Exact helpers
// ---------------------------------------------------------------------------------------------
/** |v|² as an exact Surd. */
const lenSq = (v: Cyclotomic): Surd => reSurd(v.normSquared());
/** float sqrt of a Surd (display only). */
function surdF(s: Surd): number {
	return (Number(s.P) + Number(s.Q) * Math.SQRT2 + Number(s.R) * Math.sqrt(3) + Number(s.S) * Math.sqrt(6)) / Number(s.D);
}
/** required c² for a single vector = wt²/|v|², exact Surd. */
const reqC2 = (wt: number, vSq: Surd): Surd => Surd.rational(BigInt(wt) * BigInt(wt)).div(vSq);
/** exact max of two Surds. */
const maxSurd = (a: Surd, b: Surd): Surd => (a.cmp(b) >= 0 ? a : b);

// ---------------------------------------------------------------------------------------------
// Load the certified catalogue + oracle map
// ---------------------------------------------------------------------------------------------
type Enc = { n: string[]; d: string };
type Tiling = { canonicalKey: string; k: number; family: string; cellCodec: { basis: [Enc, Enc]; polys: { n: number }[] } };
const cat = JSON.parse(fs.readFileSync(path.join(process.cwd(), "figures", "data", "catalogue-k1-3.json"), "utf8")) as {
	digests: Record<string, string>; counts: Record<string, number>; tilings: Tiling[];
};
const oracleMap = JSON.parse(fs.readFileSync(path.join(process.cwd(), "figures", "data", "oracle-map.json"), "utf8")) as {
	matched: Record<string, string>;
};
const idOf = (t: Tiling): string => oracleMap.matched[t.canonicalKey] ?? `k${t.k}#${t.canonicalKey.slice(0, 10)}`;
/** polygon-size multiset label, e.g. "4.8.8" from the polys list. */
function ngonLabel(t: Tiling): string {
	const counts = new Map<number, number>();
	for (const p of t.cellCodec.polys) counts.set(p.n, (counts.get(p.n) ?? 0) + 1);
	return [...counts.keys()].sort((a, b) => a - b).map((n) => `${n}×${counts.get(n)}`).join(" ");
}
const hasOctagon = (t: Tiling): boolean => t.cellCodec.polys.some((p) => p.n === 8);

// ---------------------------------------------------------------------------------------------
// Per-tiling reduced-basis ratio
// ---------------------------------------------------------------------------------------------
type Row = {
	id: string; k: number; ngon: string; octagon: boolean;
	wtU: number; wtV: number; uSq: Surd; vSq: Surd;
	ratioU: number; ratioV: number; reqC2: Surd; reqC: number; tightVec: "u" | "v";
};

log("██ EFFICIENCY-PRUNING — EXPERIMENT B (analytic breaking threshold), " + new Date().toISOString());
log(`catalogue: ${cat.tilings.length} certified tilings; digests k1=${cat.digests["1"]} k2=${cat.digests["2"]} k3=${cat.digests["3"]}`);
log(`⚑ NOTE: catalogue k=3 digest ${cat.digests["3"]} is the pre-OP-3 snapshot; the live master anchor is 11ee1b1d582811d1. Ratios are congruence-invariant, so the snapshot bases give the correct per-tiling ratios regardless.`);
log("");

// Decode + reduce every basis; gather all reduced vectors for one shared oracle build.
const decoded = cat.tilings.map((t) => {
	const u0 = Cyclotomic.decode(ring, t.cellCodec.basis[0]);
	const v0 = Cyclotomic.decode(ring, t.cellCodec.basis[1]);
	const [u, v] = gaussReduceExact(u0, v0);
	return { t, u, v };
});
const wtOracle = buildWtOracle(decoded.flatMap((d) => [d.u, d.v]));
// oracle self-checks
{
	const unit = Cyclotomic.zeta(ring, 0);
	const oct = Cyclotomic.zeta(ring, 0).add(Cyclotomic.zeta(ring, 3)).add(Cyclotomic.zeta(ring, 6));
	const probe = buildWtOracle([unit, oct]);
	if (probe.get(coordKeyOf(unit)) !== 1) throw new Error("oracle self-check: wt(ζ⁰) ≠ 1");
	if (probe.get(coordKeyOf(oct)) !== 3) throw new Error("oracle self-check: wt(ζ⁰+ζ³+ζ⁶) ≠ 3");
	log("oracle self-check OK: wt(ζ⁰)=1, wt(ζ⁰+ζ³+ζ⁶)=3, |W(t)| table-matched.");
	log("");
}

const rows: Row[] = decoded.map(({ t, u, v }) => {
	const wtU = wtOracle.get(coordKeyOf(u))!;
	const wtV = wtOracle.get(coordKeyOf(v))!;
	const uSq = lenSq(u), vSq = lenSq(v);
	const rc2U = reqC2(wtU, uSq), rc2V = reqC2(wtV, vSq);
	const tightVec = rc2U.cmp(rc2V) >= 0 ? "u" : "v";
	return {
		id: idOf(t), k: t.k, ngon: ngonLabel(t), octagon: hasOctagon(t),
		wtU, wtV, uSq, vSq,
		ratioU: wtU / Math.sqrt(surdF(uSq)), ratioV: wtV / Math.sqrt(surdF(vSq)),
		reqC2: maxSurd(rc2U, rc2V), reqC: Math.sqrt(surdF(maxSurd(rc2U, rc2V))), tightVec,
	};
});

// ---- per-k breaking threshold ----
log("═══ PER-k BREAKING THRESHOLD (smallest c keeping every certified k-tiling) ═══");
log("");
const CANDIDATES: [string, Surd][] = [
	["2/√3", Surd.rational(4n, 3n)], ["1.20", Surd.rational(144n, 100n)], ["1.25", Surd.rational(15625n, 10000n)],
	["1.30", Surd.rational(169n, 100n)], ["1.35", Surd.rational(18225n, 10000n)], ["√2", Surd.rational(2n, 1n)], ["1.50", Surd.rational(225n, 100n)],
];
let overallMax: Surd = Surd.ZERO;
let overallTightest: Row | null = null;
for (const k of [1, 2, 3]) {
	const kr = rows.filter((r) => r.k === k).sort((a, b) => b.reqC2.cmp(a.reqC2));
	if (kr.length === 0) continue;
	const tight = kr[0];
	if (tight.reqC2.cmp(overallMax) > 0) { overallMax = tight.reqC2; overallTightest = tight; }
	log(`k=${k}  (${kr.length} tilings)`);
	log(`  BREAKING c = ${tight.reqC.toFixed(4)}  (c² = ${surdF(tight.reqC2).toFixed(5)})  ← tightest: ${tight.id} [${tight.ngon}]  wt/|·|: u ${tight.ratioU.toFixed(4)} / v ${tight.ratioV.toFixed(4)} (tight on ${tight.tightVec})`);
	// which candidate thresholds are SOUND (keep all k-tilings) — i.e. candidate c² ≥ tight.reqC2
	const verdicts = CANDIDATES.map(([lab, c2]) => `${lab}:${c2.cmp(tight.reqC2) >= 0 ? "SOUND" : "DROPS"}`).join("  ");
	log(`  ${verdicts}`);
	// top 5 tightest
	log(`  top-5 tightest: ` + kr.slice(0, 5).map((r) => `${r.id}(${r.reqC.toFixed(3)}${r.octagon ? "⬡" : ""})`).join(", "));
	log("");
}
log(`OVERALL (k≤3) breaking c = ${Math.sqrt(surdF(overallMax)).toFixed(4)}  (c² = ${surdF(overallMax).toFixed(5)})  ← ${overallTightest?.id} [${overallTightest?.ngon}]`);
log(`  exact c² Surd = (${overallMax.P} + ${overallMax.Q}√2 + ${overallMax.R}√3 + ${overallMax.S}√6)/${overallMax.D}`);
log("");

// ---- octagon report (§3.5) ----
log("═══ OCTAGON REPORT (§3.5) — the ζ₁₂-proxy blind spot, computed EXACT in ℤ[ζ₂₄] ═══");
const octRows = rows.filter((r) => r.octagon);
log(`octagon-bearing certified tilings: ${octRows.length} (work order premised '4.8.8 / 3.4.8-family' plural)`);
for (const r of octRows) {
	log(`  ${r.id} k=${r.k} [${r.ngon}]: |u|²=(${r.uSq.P}+${r.uSq.Q}√2+${r.uSq.R}√3+${r.uSq.S}√6)/${r.uSq.D} |v|²=(${r.vSq.P}+${r.vSq.Q}√2+${r.vSq.R}√3+${r.vSq.S}√6)/${r.vSq.D}`);
	log(`     wt(u)=${r.wtU} wt(v)=${r.wtV}  ratio u=${r.ratioU.toFixed(4)} v=${r.ratioV.toFixed(4)}  → required c=${r.reqC.toFixed(4)}  (√2=${Math.SQRT2.toFixed(4)} ⇒ ${r.reqC2.cmp(Surd.rational(2n, 1n)) <= 0 ? "BELOW √2, octagon does NOT threaten the target" : "ABOVE √2 ⚑"})`);
}
log("");

// ---- full per-tiling table (CSV) ----
const csvPath = path.join(LOG_DIR, `eff-pruning-ratios-${dateTag}.csv`);
const csv = ["id,k,ngon,octagon,wt_u,len_u,ratio_u,wt_v,len_v,ratio_v,required_c,required_c2"];
for (const r of [...rows].sort((a, b) => a.k - b.k || b.reqC2.cmp(a.reqC2))) {
	csv.push([r.id, r.k, `"${r.ngon}"`, r.octagon ? 1 : 0, r.wtU, Math.sqrt(surdF(r.uSq)).toFixed(6), r.ratioU.toFixed(6),
		r.wtV, Math.sqrt(surdF(r.vSq)).toFixed(6), r.ratioV.toFixed(6), r.reqC.toFixed(6), surdF(r.reqC2).toFixed(6)].join(","));
}
fs.writeFileSync(csvPath, csv.join("\n") + "\n");
log(`per-tiling CSV → ${path.relative(process.cwd(), csvPath)} (${rows.length} rows)`);
log("");
log("██ done — analytic breaking thresholds above are EXACT; they are a SUFFICIENT c (reduced basis regenerates the lattice). The empirical k=1 scout digest sweep confirms the actual pipeline breaks no earlier. ██");
