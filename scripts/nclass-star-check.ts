/* star vs blind differential for nClassify over the full catalogue: the star-stabilizer prune must
 * give BYTE-IDENTICAL (latticeShape, group, orbifold) labels as blind (it's a superset of the true
 * symmetries, so it cannot change the result) — and be faster. One mismatch means the prune is unsound.
 *   pnpm tsx scripts/nclass-star-check.ts [cells.json=figures/data/ctrnact.json]
 */
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { nClassify } from "@/lib/classes/symmetry/nClassify";

type T = { id: string; k: number; T1?: number[]; T2?: number[]; Seed?: number[][] };
const inPath = path.resolve(process.argv[2] ?? "figures/data/ctrnact.json");
const raw = JSON.parse(fs.readFileSync(inPath, "utf8"));
const cells: T[] = (Array.isArray(raw) ? raw : raw.tilings).filter((t: T) => t.T1 && t.T2 && t.Seed);
console.log(`\nstar vs blind on ${cells.length} cells (${path.basename(inPath)})\n`);

const label = (mode: "blind" | "star") => (t: T) => {
	const d = nClassify(t.T1!, t.T2!, t.Seed!, mode);
	return `${d.latticeShape}|${d.group}|${d.orbifold}`;
};

// timing (whole catalogue, once each)
let tBlind = 0, tStar = 0;
const blind = new Map<string, string>(), star = new Map<string, string>();
{ const f = label("blind"); const t0 = performance.now(); for (const t of cells) blind.set(t.id, f(t)); tBlind = performance.now() - t0; }
{ const f = label("star"); const t0 = performance.now(); for (const t of cells) star.set(t.id, f(t)); tStar = performance.now() - t0; }

// differential
const byK = new Map<number, { n: number; bad: number; ex: string[] }>();
for (const t of cells) {
	const e = byK.get(t.k) ?? { n: 0, bad: 0, ex: [] };
	e.n++;
	if (blind.get(t.id) !== star.get(t.id)) { e.bad++; if (e.ex.length < 6) e.ex.push(`${t.id}: blind[${blind.get(t.id)}] vs star[${star.get(t.id)}]`); }
	byK.set(t.k, e);
}
let totBad = 0;
for (const k of [...byK.keys()].sort((a, b) => a - b)) {
	const e = byK.get(k)!; totBad += e.bad;
	console.log(`   k=${String(k).padStart(2)}: ${e.n - e.bad}/${e.n} identical${e.bad ? `  *** ${e.bad} MISMATCH ***` : ""}`);
	for (const x of e.ex) console.log(`       ${x}`);
}
const n = cells.length;
console.log(`\n   TOTAL: ${n - totBad}/${n} identical${totBad ? `  *** ${totBad} MISMATCH — star prune is UNSOUND ***` : "  — star == blind, prune is SOUND"}`);
console.log(`\n   blind: ${tBlind.toFixed(0)} ms (${(tBlind / n).toFixed(3)} ms/tiling)`);
console.log(`   star : ${tStar.toFixed(0)} ms (${(tStar / n).toFixed(3)} ms/tiling)`);
console.log(`   star vs blind: ${(tBlind / tStar).toFixed(2)}× faster\n`);
process.exit(totBad ? 1 : 0);
