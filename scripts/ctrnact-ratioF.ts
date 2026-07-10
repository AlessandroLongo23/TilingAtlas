/*
 * Exact max (w/v) ratio per k, using the O(1) closed-form weight F(a,c)+F(b,d) — no MIM/A*, instant.
 * ratio = max(wt(u)/|u|, wt(v)/|v|) over the Gauss-reduced basis. Reports per-k max vs √2.
 *   pnpm tsx scripts/ctrnact-ratioF.ts <cells.json> [<cells2> ...]
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
	let b = Infinity;
	for (const t of [-p, 0, q]) b = Math.min(b, Math.abs(p + t) + Math.abs(q - t) + Math.abs(t));
	return b;
};
const wt = (v: Cyclotomic): number => { const n = v.num.map(Number); return F(n[0], n[4]) + F(n[2], n[6]); };
const PHI = ring.phi;
const OMEGA = Array.from({ length: PHI }, (_, i) => [Math.cos((Math.PI * i) / 12), Math.sin((Math.PI * i) / 12)]);
const len = (v: Cyclotomic): number => { const n = v.num.map(Number); let re = 0, im = 0; for (let i = 0; i < PHI; i++) { re += n[i] * OMEGA[i][0]; im += n[i] * OMEGA[i][1]; } return Math.hypot(re, im); };

type Best = { r: number; id: string; wtU: number; wtV: number };
const kMax: Record<number, Best> = {};
for (const f of process.argv.slice(2)) {
	const raw = JSON.parse(fs.readFileSync(path.resolve(f), "utf8"));
	const tilings = (Array.isArray(raw) ? raw : raw.tilings) as { id: string; k: number; T1?: number[]; T2?: number[] }[];
	for (const t of tilings) {
		if (!t.T1 || !t.T2) continue;
		const [u, v] = gaussReduceExact(dec(t.T1), dec(t.T2));
		const wu = wt(u), wv = wt(v);
		const r = Math.max(wu / len(u), wv / len(v));
		if (!kMax[t.k] || r > kMax[t.k].r) kMax[t.k] = { r, id: t.id, wtU: wu, wtV: wv };
	}
}
const SQRT2 = Math.SQRT2;
console.log("k   max ratio   holder                                      wt(u,v)   vs √2");
for (const k of Object.keys(kMax).map(Number).sort((a, b) => a - b)) {
	const b = kMax[k];
	console.log(`${String(k).padStart(2)}  ${b.r.toFixed(4)}     ${b.id.padEnd(42)} (${b.wtU},${b.wtV})   ${b.r <= SQRT2 ? "≤√2 ✓" : "⚑ >√2"}`);
}
