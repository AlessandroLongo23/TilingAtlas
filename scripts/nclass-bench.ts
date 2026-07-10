/*
 * A/B + timing harness for nClassify (int, dim-4 ℤ[ω]) against the baseline analyzeSymmetry
 * (bigint, dim-8 ℤ[ζ₂₄]). Same cells in; compares (latticeShape, group, orbifold) per tiling and
 * times both. The baseline is ground truth: any label disagreement is printed for investigation.
 *
 *   pnpm tsx scripts/nclass-bench.ts <cells.json> [limit] [mode]
 *     mode = blind (default) | star   — which nClassify candidate strategy to measure
 *
 * Prints per-k mismatch counts (+ examples) and ms/tiling for baseline vs nClassify with the speedup.
 */
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { Cyclotomic, CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { analyzeSymmetry } from "@/lib/classes/symmetry/WallpaperSymmetry";
import { nClassify, type NClassMode } from "@/lib/classes/symmetry/nClassify";

const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const dec = ([a, b, c, d]: number[]): Cyclotomic =>
	Cyclotomic.fromRational(ring, BigInt(a))
		.add(Cyclotomic.zeta(ring, 2).scaleRational(BigInt(b), 1n))
		.add(Cyclotomic.zeta(ring, 4).scaleRational(BigInt(c), 1n))
		.add(Cyclotomic.zeta(ring, 6).scaleRational(BigInt(d), 1n));

type T = { id: string; k: number; T1?: number[]; T2?: number[]; Seed?: number[][] };
const inPath = path.resolve(process.argv[2]);
const limit = process.argv[3] ? Number(process.argv[3]) : Infinity;
const mode = (process.argv[4] as NClassMode) ?? "blind";
const raw = JSON.parse(fs.readFileSync(inPath, "utf8"));
const all: T[] = (Array.isArray(raw) ? raw : raw.tilings).filter((t: T) => t.T1 && t.T2 && t.Seed);
const cells = all.slice(0, Number.isFinite(limit) ? limit : all.length);
console.error(`loaded ${cells.length} cells from ${path.basename(inPath)} (mode=${mode})`);

// ---- baseline (bigint) ----
const gold = new Map<string, string>(); // id -> "lattice|group|orbifold"
let tGold = 0;
{
	const t0 = performance.now();
	for (const t of cells) {
		const d = analyzeSymmetry(ring, dec(t.T1!), dec(t.T2!), t.Seed!.map(dec));
		gold.set(t.id, `${d.latticeShape}|${d.group}|${d.orbifold}`);
	}
	tGold = performance.now() - t0;
}

// ---- nClassify (int) ----
const mine = new Map<string, string>();
let tMine = 0;
{
	const t0 = performance.now();
	for (const t of cells) {
		const d = nClassify(t.T1!, t.T2!, t.Seed!, mode);
		mine.set(t.id, `${d.latticeShape}|${d.group}|${d.orbifold}`);
	}
	tMine = performance.now() - t0;
}

// ---- A/B ----
const byK = new Map<number, { n: number; bad: number; ex: string[] }>();
for (const t of cells) {
	const g = gold.get(t.id)!, m = mine.get(t.id)!;
	const e = byK.get(t.k) ?? { n: 0, bad: 0, ex: [] };
	e.n++;
	if (g !== m) { e.bad++; if (e.ex.length < 6) e.ex.push(`${t.id}: gold[${g}] vs nclass[${m}]`); }
	byK.set(t.k, e);
}
let totBad = 0;
console.log("\n-- correctness A/B (baseline analyzeSymmetry = ground truth) --");
for (const k of [...byK.keys()].sort((a, b) => a - b)) {
	const e = byK.get(k)!;
	totBad += e.bad;
	console.log(`   k=${k}: ${e.n - e.bad}/${e.n} match${e.bad ? `  *** ${e.bad} MISMATCH ***` : ""}`);
	for (const x of e.ex) console.log(`       ${x}`);
}
console.log(`\n   TOTAL: ${cells.length - totBad}/${cells.length} match${totBad ? `  (${totBad} mismatches)` : "  — CLEAN"}`);

// ---- timing ----
const n = cells.length;
console.log("\n-- timing --");
console.log(`   baseline (bigint ζ₂₄) : ${tGold.toFixed(0).padStart(8)} ms   ${(tGold / n).toFixed(3)} ms/tiling`);
console.log(`   nClassify (int  ζ₁₂,${mode}) : ${tMine.toFixed(0).padStart(8)} ms   ${(tMine / n).toFixed(3)} ms/tiling`);
console.log(`   speedup: ${(tGold / tMine).toFixed(1)}×\n`);
