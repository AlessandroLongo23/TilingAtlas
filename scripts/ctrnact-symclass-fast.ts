/*
 * FAST wallpaper + Bravais classification of Čtrnáct cells via nClassify (rank-4 machine-int ℤ[ω]),
 * ~50-64× the ζ₂₄-bigint analyzeSymmetry path and validated label-for-label against it (nclass-bench.ts).
 * Input: a ctrnact.json-shaped file (tilings carry T1,T2,Seed as ζ₁₂ [a,b,c,d] vectors). Output CSV:
 * id,k,lattice,group,orbifold.
 *   pnpm tsx scripts/ctrnact-symclass-fast.ts <cells.json> [outCsv] [limit]
 */
import fs from "node:fs";
import path from "node:path";
import { nClassify } from "@/lib/classes/symmetry/nClassify";

const inPath = path.resolve(process.argv[2]);
const outPath = process.argv[3] ? path.resolve(process.argv[3]) : null;
const limit = process.argv[4] ? Number(process.argv[4]) : Infinity;
const raw = JSON.parse(fs.readFileSync(inPath, "utf8"));
const tilings = (Array.isArray(raw) ? raw : raw.tilings) as { id: string; k: number; T1?: number[]; T2?: number[]; Seed?: number[][] }[];

const rows = ["id,k,lattice,group,orbifold"];
const perK: Record<number, number> = {};
let n = 0, fail = 0;
const t0 = Date.now();
for (const t of tilings) {
	if (n >= limit) break;
	if (!t.T1 || !t.T2 || !t.Seed) continue;
	try {
		const d = nClassify(t.T1, t.T2, t.Seed);
		rows.push(`${t.id},${t.k},${d.latticeShape},${d.group},${d.orbifold}`);
	} catch (e) {
		fail++;
		rows.push(`${t.id},${t.k},ERROR,ERROR,${(e as Error).message.slice(0, 30)}`);
	}
	perK[t.k] = (perK[t.k] ?? 0) + 1;
	n++;
}
console.error(`classified ${n} tilings, ${fail} failed, in ${((Date.now() - t0) / 1000).toFixed(2)}s`);
console.error("per-k counts: " + Object.keys(perK).map(Number).sort((a, b) => a - b).map((k) => `${k}:${perK[k]}`).join("  "));
if (outPath) { fs.writeFileSync(outPath, rows.join("\n") + "\n"); console.error(`→ ${outPath}`); }
else console.log(rows.slice(0, 20).join("\n"));
