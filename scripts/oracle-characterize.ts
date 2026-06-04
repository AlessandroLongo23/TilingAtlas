/* Characterize the Soto-Sánchez oracle tilings for a given k, to set up / validate a k-run.
 * Reports per-lattice Bravais class (symmetry-based — the oblique ceiling), cell vector/area ranges
 * (for pool-parameter scaling), and small cells (the t2014-style fan-heuristic risk).
 * Run: pnpm tsx scripts/oracle-characterize.ts [k]   (default k=3)
 *
 * NB: oblique = NO symmetry beyond the universal ±1, tested EXACTLY via lattice automorphisms (rotation
 * ζ^r or reflection conj∘ζ^r). Do NOT classify on the primitive-basis angle/length — a long-thin cmm's
 * primitive basis is a generic parallelogram and gets mislabeled oblique (DEVELOPMENT_NOTES §11.1).
 * Validated against the known oblique census (0,0,2,5 at k=1..4) printed as controls.
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { Cyclotomic, setActiveRing, CyclotomicRing } from '@/classes/Cyclotomic';
import { gaussReduceExact, sameLattice } from '@/classes/algorithm/LatticeEnumerator';
import { detSurd } from '@/classes/algorithm/exact/Surd';

const k = parseInt(process.argv[2] ?? '3', 10);
const ring = CyclotomicRing.create(24); // the oracle vectors embed in ℤ[ζ₂₄]; the Surd layer requires N=24
setActiveRing(ring);

if (!fs.existsSync('/tmp/galebach.json'))
	execSync("curl -s --max-time 30 'https://chequesoto.info/tiling/JSON_Galebach.json' -o /tmp/galebach.json");
const raw = fs.readFileSync('/tmp/galebach.json', 'utf8').replace(/^Galebach=/, '').replace(/,(\s*[}\]])/g, '$1');
const oracle: Record<string, { T1: number[]; T2: number[]; Seed: number[][] }> = JSON.parse(raw);
// oracle T = [a,b,c,d] = a + b·ζ₁₂ + c·ζ₁₂² + d·ζ₁₂³, ζ₁₂ = ζ₂₄² ⇒ even powers in ℤ[ζ₂₄].
const dec = ([a, b, c, d]: number[]) =>
	Cyclotomic.fromRational(ring, BigInt(a))
		.add(Cyclotomic.zeta(ring, 2).scaleRational(BigInt(b), 1n))
		.add(Cyclotomic.zeta(ring, 4).scaleRational(BigInt(c), 1n))
		.add(Cyclotomic.zeta(ring, 6).scaleRational(BigInt(d), 1n));

const len = (z: Cyclotomic) => { const v = z.toVector(); return Math.hypot(v.x, v.y); };
const ang = (a: Cyclotomic, b: Cyclotomic) => {
	const u = a.toVector(), v = b.toVector();
	return (Math.acos((u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))) * 180) / Math.PI;
};
const isOblique = (u: Cyclotomic, v: Cyclotomic): boolean => {
	for (let r = 1; r < ring.N; r++) {
		if (r === ring.N / 2) continue; // ζ^12 = −1 (universal 2-fold); not distinguishing
		if (sameLattice(u, v, u.mulZeta(r), v.mulZeta(r))) return false; // rotational symmetry
	}
	for (let r = 0; r < ring.N; r++) if (sameLattice(u, v, u.conj().mulZeta(r), v.conj().mulZeta(r))) return false; // reflection
	return true;
};
const classify = (u: Cyclotomic, v: Cyclotomic): string => {
	if (isOblique(u, v)) return 'OBLIQUE';
	const [ru, rv] = gaussReduceExact(u, v);
	const lu = len(ru), lv = len(rv), a = ang(ru, rv);
	const eqLen = Math.abs(lu - lv) < 1e-6, a90 = Math.abs(a - 90) < 1e-6, a60 = Math.abs(a - 60) < 1e-6 || Math.abs(a - 120) < 1e-6;
	if (eqLen && a60) return 'hexagonal';
	if (eqLen && a90) return 'square';
	if (eqLen) return 'rhombic(cmm)';
	if (a90) return 'rectangular';
	return 'cmm/rect(conventional)';
};

// Controls: the known oblique census is 0,0,2,5 at k=1..4. If these match, the classifier is trustworthy.
for (const kk of [1, 2, 3, 4]) {
	const ents = Object.entries(oracle).filter(([key]) => new RegExp(`^t${kk}\\d\\d\\d$`).test(key));
	const cc: Record<string, number> = {};
	for (const [, o] of ents) {
		const u0 = dec(o.T1), v0 = dec(o.T2);
		if (detSurd(u0, v0).isZero()) continue;
		cc[classify(u0, v0)] = (cc[classify(u0, v0)] ?? 0) + 1;
	}
	console.log(`k=${kk}: ${ents.length} tilings, oblique=${cc['OBLIQUE'] ?? 0}  ${JSON.stringify(cc)}`);
}

const ents = Object.entries(oracle).filter(([key]) => new RegExp(`^t${k}\\d\\d\\d$`).test(key));
const rows = ents.flatMap(([key, o]) => {
	const u0 = dec(o.T1), v0 = dec(o.T2);
	if (detSurd(u0, v0).isZero()) return [];
	const [u, v] = gaussReduceExact(u0, v0);
	return [{ key, lu: Math.min(len(u), len(v)), lv: Math.max(len(u), len(v)), area: detSurd(u, v).abs().toFloat(), cls: classify(u0, v0) }];
});

const byClass: Record<string, number> = {};
for (const r of rows) byClass[r.cls] = (byClass[r.cls] ?? 0) + 1;
const oblique = rows.filter((r) => r.cls === 'OBLIQUE');
console.log(`\n=== k=${k}: ${rows.length} tilings ===`);
console.log(`Bravais classes:`, byClass);
console.log(`reachable (non-oblique) ceiling: ${rows.length - oblique.length}/${rows.length}`);
console.log(`OBLIQUE (NOT in candidate set — hard ceiling): ${oblique.length} → ${oblique.map((r) => r.key).join(', ')}`);

// Pool-parameter coverage: PeriodSolver uses poolLmax = (k≤2 ? 5.6 : √(22k)), areaBound = 16k.
const poolLmax = k <= 2 ? 5.6 : Math.sqrt(22 * k);
const maxLong = Math.max(...rows.map((r) => r.lv)), maxArea = Math.max(...rows.map((r) => r.area));
console.log(`\n--- PARAM COVERAGE (poolLmax=${poolLmax.toFixed(2)}, areaBound=${16 * k}) ---`);
console.log(`longest cell vector: ${maxLong.toFixed(3)}  ${maxLong <= poolLmax ? '✓ ≤ poolLmax' : '✗ EXCEEDS poolLmax → bump'}`);
console.log(`max cell area: ${maxArea.toFixed(3)}  ${maxArea <= 16 * k ? '✓ ≤ areaBound' : '✗ EXCEEDS areaBound → bump'}`);
const tiny = rows.filter((r) => r.area < 4).sort((a, b) => a.area - b.area);
console.log(`small cells (area<4, fan-heuristic risk): ${tiny.length} → ${tiny.map((r) => `${r.key}(${r.area.toFixed(2)})`).join(', ')}`);
