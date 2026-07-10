/*
 * Fast per-tiling achievable WEIGHT = Σ|coords| of the Gauss-reduced period basis (max over u,v).
 * This is the minimal ζ₁₂ (12-direction) unit-edge count — EXACT for the striped [m,0,m,0] periods
 * that drive the maximum, and a tight upper bound otherwise (using the 24 ζ₂₄ roots can only lower
 * it, which never happens for these structured vectors). No MIM/A* → instant. For the family trend
 * charts, where the per-(k,family) MAX is dominated by the striped rectangular/cmm family.
 *   pnpm tsx scripts/ctrnact-wtupper.ts <cells.json> <outCsv>
 */
import fs from "node:fs";
import path from "node:path";
import { Cyclotomic, CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { gaussReduceExact } from "@/classes/algorithm/LatticeEnumerator";

const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const dec = ([a, b, c, d]: number[]): Cyclotomic =>
	Cyclotomic.fromRational(ring, BigInt(a))
		.add(Cyclotomic.zeta(ring, 2).scaleRational(BigInt(b), 1n))
		.add(Cyclotomic.zeta(ring, 4).scaleRational(BigInt(c), 1n))
		.add(Cyclotomic.zeta(ring, 6).scaleRational(BigInt(d), 1n));
const sumAbs = (v: Cyclotomic): number => Number(v.num.reduce((s, x) => s + (x < 0n ? -x : x), 0n));

const raw = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), "utf8"));
const tilings = (Array.isArray(raw) ? raw : raw.tilings) as { id: string; k: number; T1?: number[]; T2?: number[] }[];
const out = ["id,k,weight"];
const perKMax: Record<number, number> = {};
for (const t of tilings) {
	if (!t.T1 || !t.T2) continue;
	const [u, v] = gaussReduceExact(dec(t.T1), dec(t.T2));
	const w = Math.max(sumAbs(u), sumAbs(v));
	out.push(`${t.id},${t.k},${w}`);
	perKMax[t.k] = Math.max(perKMax[t.k] ?? 0, w);
}
fs.writeFileSync(path.resolve(process.argv[3]), out.join("\n") + "\n");
console.error("per-k max weight (Σ|coords|): " + Object.keys(perKMax).map(Number).sort((a, b) => a - b).map((k) => `${k}:${perKMax[k]}`).join("  "));
console.error(`→ ${process.argv[3]} (${out.length - 1} rows)`);
