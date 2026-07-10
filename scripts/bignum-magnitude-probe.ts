/*
 * THROWAWAY measurement: how large do Cyclotomic num[]/den ACTUALLY get in the decisive
 * exact arithmetic? Monkeypatches every Cyclotomic arith op to record the global max |num[i]|
 * and max den across a full analyzeSymmetry() pass over the real k=10 catalogue (the heaviest
 * exact-arithmetic path: full wallpaper-group detection incl. glides + FD). Answers empirically
 * whether int64 (|x|<9.2e18) — or even int32 (<2.1e9) — suffices in place of bigint.
 *   pnpm tsx scripts/bignum-magnitude-probe.ts <cells-k10.json>
 */
import fs from "node:fs";
import path from "node:path";
import { Cyclotomic, CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { analyzeSymmetry } from "@/lib/classes/symmetry/WallpaperSymmetry";
import { gaussReduceExact } from "@/classes/algorithm/LatticeEnumerator";

let maxNum = 0n, maxDen = 1n, ops = 0n, denGt1 = 0n;
const sample = (c: any) => {
	if (!c || !c.num) return;
	for (const x of c.num as bigint[]) { const a = x < 0n ? -x : x; if (a > maxNum) maxNum = a; }
	if (c.den > maxDen) maxDen = c.den;
	if (c.den > 1n) denGt1++;
	ops++;
};
const proto = Cyclotomic.prototype as any;
for (const m of ["add", "sub", "neg", "mul", "mulZeta", "conj", "scaleRational", "normSquared"]) {
	const orig = proto[m];
	if (typeof orig !== "function") continue;
	proto[m] = function (...args: any[]) { const r = orig.apply(this, args); sample(r); return r; };
}

const ring = CyclotomicRing.create(24);
setActiveRing(ring);
const dec = ([a, b, c, d]: number[]): Cyclotomic =>
	Cyclotomic.fromRational(ring, BigInt(a))
		.add(Cyclotomic.zeta(ring, 2).scaleRational(BigInt(b), 1n))
		.add(Cyclotomic.zeta(ring, 4).scaleRational(BigInt(c), 1n))
		.add(Cyclotomic.zeta(ring, 6).scaleRational(BigInt(d), 1n));

const raw = JSON.parse(fs.readFileSync(path.resolve(process.argv[2]), "utf8"));
const LIMIT = Number(process.argv[3] ?? "800");
const cells = ((Array.isArray(raw) ? raw : raw.tilings) as { id: string; k: number; T1?: number[]; T2?: number[]; Seed?: number[][] }[]).slice(0, LIMIT);
let ran = 0, failed = 0;
const t0 = Date.now();
for (const t of cells) {
	if (!t.T1 || !t.T2 || !t.Seed) continue;
	try {
		const [u, v] = gaussReduceExact(dec(t.T1), dec(t.T2)); void u; void v;
		analyzeSymmetry(ring, dec(t.T1), dec(t.T2), t.Seed.map(dec));
		ran++;
	} catch { failed++; }
}
const INT32 = (1n << 31n) - 1n, INT64 = (1n << 63n) - 1n;
console.log(`ran analyzeSymmetry on ${ran} k=10 tilings (${failed} failed) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`arith results sampled: ${ops}`);
console.log(`MAX |num[i]|  = ${maxNum}   (int32 max ${INT32}, int64 max ${INT64})`);
console.log(`MAX den       = ${maxDen}   ; results with den>1: ${denGt1} / ${ops}`);
console.log(`fits int32? num=${maxNum <= INT32}  ; fits int64? num=${maxNum <= INT64}, den=${maxDen <= INT64}`);
console.log(`worst-case multiply intermediate ~ phi*(maxNum)^2 = ${8n * maxNum * maxNum}  (int64 headroom: ${(INT64 / (8n * maxNum * maxNum + 1n))}x)`);
