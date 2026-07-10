/*
 * FAST EXACT per-tiling weight via the closed form wt([a,b,c,d]) = F(a,c)+F(b,d),
 * F(p,q)=min_{t∈{-p,0,q}} |p+t|+|q-t|+|t|  (the separable form the verify-workflow's 3rd-method agent
 * derived and validated against a 24-root A*). [a,b,c,d] are the ζ₁₂ coords of the Gauss-reduced basis
 * vector = its ζ₂₄ 8-vec even positions (num[0],num[2],num[4],num[6]). O(1) per vector — no MIM/A*.
 *   pnpm tsx scripts/ctrnact-wtF.ts <cells.json> <outCsv>
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

const F = (p: number, q: number): number => {
	let best = Infinity;
	for (const t of [-p, 0, q]) best = Math.min(best, Math.abs(p + t) + Math.abs(q - t) + Math.abs(t));
	return best;
};
function wt(v: Cyclotomic): number {
	const n = v.num.map(Number);
	// ζ₁₂ element ⇒ odd positions must vanish
	if (n[1] || n[3] || n[5] || n[7]) throw new Error(`non-ζ₁₂ vector: ${JSON.stringify(n)}`);
	return F(n[0], n[4]) + F(n[2], n[6]);
}

const raw = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), "utf8"));
const tilings = (Array.isArray(raw) ? raw : raw.tilings) as { id: string; k: number; T1?: number[]; T2?: number[] }[];
const out = ["id,k,weight"];
const perKMax: Record<number, number> = {};
let fail = 0;
for (const t of tilings) {
	if (!t.T1 || !t.T2) continue;
	try {
		const [u, v] = gaussReduceExact(dec(t.T1), dec(t.T2));
		const w = Math.max(wt(u), wt(v));
		out.push(`${t.id},${t.k},${w}`);
		perKMax[t.k] = Math.max(perKMax[t.k] ?? 0, w);
	} catch (e) { fail++; }
}
fs.writeFileSync(path.resolve(process.argv[3]), out.join("\n") + "\n");
console.error("per-k max weight (F-formula EXACT): " + Object.keys(perKMax).map(Number).sort((a, b) => a - b).map((k) => `${k}:${perKMax[k]}`).join("  "));
console.error(`→ ${process.argv[3]} (${out.length - 1} rows, ${fail} failed)`);
