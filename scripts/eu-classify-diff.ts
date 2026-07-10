/* Independent differential: C++ eu_classify vs TS nClassify (blind) over the full k≤11 catalogue.
 * Reproduces the commit's "0 mismatches" claim without trusting it. Also times TS for the 7.9× ratio.
 *   pnpm tsx scripts/eu-classify-diff.ts <eu.csv> [cells.json=figures/data/ctrnact.json]
 * exit 1 on any mismatch.
 */
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { nClassify } from "@/lib/classes/symmetry/nClassify";

const euPath = process.argv[2];
const inPath = path.resolve(process.argv[3] ?? "figures/data/ctrnact.json");
if (!euPath) { console.error("usage: eu-classify-diff.ts <eu.csv> [cells.json]"); process.exit(2); }

type T = { id: string; k: number; T1?: number[]; T2?: number[]; Seed?: number[][] };
const raw = JSON.parse(fs.readFileSync(inPath, "utf8"));
const cells: T[] = (Array.isArray(raw) ? raw : raw.tilings).filter((t: T) => t.T1 && t.T2 && t.Seed);

// C++ labels: id -> "lattice|group|orbifold"
const euLines = fs.readFileSync(euPath, "utf8").trim().split("\n").slice(1);
const eu = new Map<string, string>();
for (const ln of euLines) { const p = ln.split(","); eu.set(p[0], `${p[2]}|${p[3]}|${p[4]}`); }

let tTS = 0, bad = 0, missing = 0;
const byK = new Map<number, { n: number; bad: number; ex: string[] }>();
const t0 = performance.now();
for (const t of cells) {
	const d = nClassify(t.T1!, t.T2!, t.Seed!, "blind");
	const tsLabel = `${d.latticeShape}|${d.group}|${d.orbifold}`;
	const e = byK.get(t.k) ?? { n: 0, bad: 0, ex: [] };
	e.n++;
	const cpp = eu.get(t.id);
	if (cpp === undefined) { missing++; }
	else if (cpp !== tsLabel) { bad++; e.bad++; if (e.ex.length < 8) e.ex.push(`${t.id}: TS[${tsLabel}] vs C++[${cpp}]`); }
	byK.set(t.k, e);
}
tTS = performance.now() - t0;

for (const k of [...byK.keys()].sort((a, b) => a - b)) {
	const e = byK.get(k)!;
	console.log(`   k=${String(k).padStart(2)}: ${e.n - e.bad}/${e.n} identical${e.bad ? `  *** ${e.bad} MISMATCH ***` : ""}`);
	for (const x of e.ex) console.log(`       ${x}`);
}
console.log(`\n   TOTAL: ${cells.length - bad}/${cells.length} identical${bad ? `  *** ${bad} MISMATCH ***` : "  — C++ eu_classify == TS nClassify"}`);
if (missing) console.log(`   *** ${missing} ids present in JSON but MISSING from C++ CSV ***`);
console.log(`\n   TS nClassify: ${tTS.toFixed(0)} ms (${(tTS / cells.length).toFixed(3)} ms/tiling) over ${cells.length} cells`);
process.exit(bad || missing ? 1 : 0);
