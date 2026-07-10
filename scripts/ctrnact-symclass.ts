/*
 * Classify Čtrnáct cells by 2D Bravais lattice shape (5) and wallpaper group (17), via the repo's
 * exact analyzeSymmetry. Input: a ctrnact.json-shaped file whose tilings carry T1,T2,Seed (integer
 * [a,b,c,d] in the ζ₁₂ power basis). Output CSV: id,k,lattice,group,orbifold.
 *   pnpm tsx scripts/ctrnact-symclass.ts <cells.json> [outCsv] [limit]
 */
import fs from "node:fs";
import path from "node:path";
import { Cyclotomic, CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { analyzeSymmetry } from "@/lib/classes/symmetry/WallpaperSymmetry";

const ring = CyclotomicRing.create(24);
setActiveRing(ring);

const dec = ([a, b, c, d]: number[]): Cyclotomic =>
	Cyclotomic.fromRational(ring, BigInt(a))
		.add(Cyclotomic.zeta(ring, 2).scaleRational(BigInt(b), 1n))
		.add(Cyclotomic.zeta(ring, 4).scaleRational(BigInt(c), 1n))
		.add(Cyclotomic.zeta(ring, 6).scaleRational(BigInt(d), 1n));

const inPath = path.resolve(process.argv[2]);
const outPath = process.argv[3] ? path.resolve(process.argv[3]) : null;
const limit = process.argv[4] ? Number(process.argv[4]) : Infinity;
const raw = JSON.parse(fs.readFileSync(inPath, "utf8"));
const ds = { tilings: (Array.isArray(raw) ? raw : raw.tilings) as { id: string; k: number; T1?: number[]; T2?: number[]; Seed?: number[][] }[] };

const rows = ["id,k,lattice,group,orbifold"];
let n = 0, fail = 0;
const t0 = Date.now();
for (const t of ds.tilings) {
	if (n >= limit) break;
	if (!t.T1 || !t.T2 || !t.Seed) continue;
	try {
		const d = analyzeSymmetry(ring, dec(t.T1), dec(t.T2), t.Seed.map(dec));
		rows.push(`${t.id},${t.k},${d.latticeShape},${d.group},${d.orbifold}`);
	} catch (e) {
		fail++;
		rows.push(`${t.id},${t.k},ERROR,ERROR,${(e as Error).message.slice(0, 30)}`);
	}
	n++;
	if (n % 500 === 0) console.error(`  …${n} classified (${((Date.now() - t0) / n).toFixed(1)} ms/tiling)`);
}
console.error(`classified ${n} tilings, ${fail} failed, in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (outPath) { fs.writeFileSync(outPath, rows.join("\n") + "\n"); console.error(`→ ${outPath}`); }
else console.log(rows.slice(0, 20).join("\n"));
