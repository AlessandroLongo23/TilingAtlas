import { Cyclotomic, type CyclotomicRing } from "@/classes/Cyclotomic";
import { gaussReduceExact } from "@/classes/algorithm/LatticeEnumerator";
import type { SymmetryData, Vec2 } from "./types";

const v2 = (z: Cyclotomic): Vec2 => {
	const v = z.toVector();
	return { x: v.x, y: v.y };
};

function bgcd(a: bigint, b: bigint): bigint {
	a = a < 0n ? -a : a;
	b = b < 0n ? -b : b;
	while (b) [a, b] = [b, a % b];
	return a;
}
const blcm = (a: bigint, b: bigint) => (a === 0n || b === 0n ? 0n : (a / bgcd(a, b)) * b);

// Exact lattice membership: is w = a·T1 + b·T2 for integers a,b? A Cyclotomic is (num: bigint[φ],
// den: bigint) over the ζ_N power basis, so the question is whether the φ×2 integer system [T1|T2]·(a,b)ᵀ
// = w has an integer solution consistent in ALL φ coordinates. Solve two independent rows by Cramer,
// check integrality, then verify every row. Fully exact — no floats, so no boundary tolerance traps.
function inLattice(T1: Cyclotomic, T2: Cyclotomic, w: Cyclotomic): boolean {
	const D = blcm(blcm(T1.den, T2.den), w.den);
	const col = (z: Cyclotomic) => z.num.map((c) => (c * D) / z.den); // length-φ integer vector
	const A = col(T1), B = col(T2), W = col(w);
	const dim = A.length;
	for (let i = 0; i < dim; i++) {
		for (let j = i + 1; j < dim; j++) {
			const det = A[i] * B[j] - A[j] * B[i];
			if (det === 0n) continue;
			const aNum = W[i] * B[j] - W[j] * B[i];
			const bNum = A[i] * W[j] - A[j] * W[i];
			if (aNum % det !== 0n || bNum % det !== 0n) return false; // non-integer ⇒ not in Λ
			const a = aNum / det, b = bNum / det;
			for (let r = 0; r < dim; r++) if (a * A[r] + b * B[r] !== W[r]) return false; // consistency
			return true;
		}
	}
	return false; // T1,T2 dependent over the basis ⇒ degenerate cell (shouldn't happen)
}
export const _inLatticeForTest = inLattice;

// The two isometry families that can preserve a ℤ[ζ_N] tiling: rotation z↦ζ^j·z + t and
// reflection/glide z↦ζ^j·z̄ + t (z̄ = Cyclotomic.conj, the exact ζ↦ζ⁻¹ automorphism).
const applyRot = (j: number, t: Cyclotomic, z: Cyclotomic) => z.mulZeta(j).add(t);
const applyRef = (j: number, t: Cyclotomic, z: Cyclotomic) => z.conj().mulZeta(j).add(t);

// g preserves the tiling iff every seed vertex maps into (seed + Λ): g(v) ≡ some seed w (mod Λ).
// This is THE decisive test — exact, congruence-closed (mod the translation lattice), no tolerance.
function preserves(
	T1: Cyclotomic,
	T2: Cyclotomic,
	seed: Cyclotomic[],
	g: (z: Cyclotomic) => Cyclotomic,
): boolean {
	for (const v of seed) {
		const gv = g(v);
		if (!seed.some((w) => inLattice(T1, T2, gv.sub(w)))) return false;
	}
	return true;
}

const CRYSTALLOGRAPHIC = new Set([1, 2, 3, 4, 6]);
function ngcd(x: number, y: number): number {
	return y ? ngcd(y, x % y) : x;
}
// Order of the rotation z↦ζ_N^j·z. Only crystallographic orders {2,3,4,6} can occur (Barlow).
const rotOrderOf = (j: number, N = 24) => N / ngcd(j, N);

export interface DetectedRotation {
	j: number;
	t: Cyclotomic;
	order: 2 | 3 | 4 | 6;
}

// One representative rotation per power j that is an actual symmetry. t is found by requiring
// ζ^j·seed[0] + t ≡ some seed vertex (mod Λ); we then verify the whole seed closes. Centers (there are
// several per order, related by Λ/order) are derived from these representatives in a later step.
function rotations(T1: Cyclotomic, T2: Cyclotomic, seed: Cyclotomic[]): DetectedRotation[] {
	const out: DetectedRotation[] = [];
	const v0 = seed[0];
	for (let j = 1; j < 24; j++) {
		const order = rotOrderOf(j);
		if (!CRYSTALLOGRAPHIC.has(order) || order === 1) continue;
		for (const w of seed) {
			const t = w.sub(v0.mulZeta(j));
			if (preserves(T1, T2, seed, (z) => applyRot(j, t, z))) {
				out.push({ j, t, order: order as 2 | 3 | 4 | 6 });
				break; // one representative t per power j
			}
		}
	}
	return out;
}
export const _rotationsForTest = (
	_ring: CyclotomicRing,
	T1: Cyclotomic,
	T2: Cyclotomic,
	seed: Cyclotomic[],
) => rotations(T1, T2, seed);

const CENTER_TOL = 0.02; // frac-coordinate dedup tolerance (spec §8.5)

// Complex division num/den in float (for the rotation fixed point c = t/(1−ω)). Division isn't a
// decision — the rotation was already accepted exactly; this only places the marker for rendering.
function cdiv(num: Vec2, den: Vec2): Vec2 {
	const d = den.x * den.x + den.y * den.y;
	return { x: (num.x * den.x + num.y * den.y) / d, y: (num.y * den.x - num.x * den.y) / d };
}

// Fractional lattice coordinates of p in basis (r1,r2), reduced into [0,1)².
function fracInCell(p: Vec2, r1: Vec2, r2: Vec2): { fa: number; fb: number } {
	const det = r1.x * r2.y - r1.y * r2.x;
	let fa = (p.x * r2.y - p.y * r2.x) / det;
	let fb = (-p.x * r1.y + p.y * r1.x) / det;
	fa -= Math.floor(fa);
	fb -= Math.floor(fb);
	return { fa, fb };
}

// All rotation centers, deduped into one primitive cell, each tagged with its MAXIMUM order. For a
// detected order-n rotation z↦ωz+t, composing with every lattice translation T_λ yields a rotation of
// the same order about (t+λ)/(1−ω); enumerating λ over a small Λ window and reducing mod Λ recovers all
// center orbits of that order (Λ/(1−ω) has index |1−ω|² over Λ, e.g. 2 four-fold orbits for a square).
function rotationCenters(
	ring: CyclotomicRing,
	r1: Vec2,
	r2: Vec2,
	rots: DetectedRotation[],
): Center[] {
	const K = Math.round(1 / CENTER_TOL);
	const byKey = new Map<string, Center>();
	for (const rot of rots) {
		const w = Cyclotomic.zeta(ring, rot.j).toVector(); // ω
		const oneMinus = { x: 1 - w.x, y: -w.y };
		const tv = rot.t.toVector();
		for (let a = -2; a <= 2; a++) {
			for (let b = -2; b <= 2; b++) {
				const numv = { x: tv.x + a * r1.x + b * r2.x, y: tv.y + a * r1.y + b * r2.y };
				const { fa, fb } = fracInCell(cdiv(numv, oneMinus), r1, r2);
				const world = { x: fa * r1.x + fb * r2.x, y: fa * r1.y + fb * r2.y };
				const ka = ((Math.round(fa * K) % K) + K) % K;
				const kb = ((Math.round(fb * K) % K) + K) % K;
				const key = `${ka},${kb}`;
				const existing = byKey.get(key);
				if (!existing || rot.order > existing.order) byKey.set(key, { z: world, order: rot.order });
			}
		}
	}
	return Array.from(byKey.values());
}

// Exact wallpaper-symmetry analysis of a periodic tiling. T1,T2 = exact lattice basis; seed = the
// deduped exact vertex set of one primitive cell (all Cyclotomic). The returned SymmetryData carries
// FLOAT geometry for rendering, but every symmetry decision behind it is made in exact ℤ[ζ_N].
//
// This is the Phase-0 skeleton: it returns only the primitive cell parallelogram. Rotations, mirrors,
// glides, group identification, and the fundamental domain are layered in by later phases.
export function analyzeSymmetry(
	ring: CyclotomicRing,
	T1: Cyclotomic,
	T2: Cyclotomic,
	seed: Cyclotomic[],
): SymmetryData {
	// Gauss-reduce so the drawn cell is the compact parallelogram (matches oracle-characterize.ts).
	const [gr1, gr2] = gaussReduceExact(T1, T2);
	const c1 = v2(gr1);
	const c2 = v2(gr2);

	const rots = rotations(T1, T2, seed);
	const centers = rotationCenters(ring, c1, c2, rots);
	const maxOrder = centers.length ? Math.max(...centers.map((c) => c.order)) : 1;

	return {
		group: "p1",
		latticeShape: "oblique",
		pointGroupOrder: maxOrder, // refined to the true |point group| once mirrors are known (Phase 3)
		axes: [],
		centers,
		fd: [{ x: 0, y: 0 }, c1, { x: c1.x + c2.x, y: c1.y + c2.y }, c2],
		cell: [c1, c2],
		cellOrigin: { x: 0, y: 0 },
	};
}
