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
	const [r1, r2] = gaussReduceExact(T1, T2);
	const c1 = v2(r1);
	const c2 = v2(r2);
	return {
		group: "p1",
		latticeShape: "oblique",
		pointGroupOrder: 1,
		axes: [],
		centers: [],
		fd: [{ x: 0, y: 0 }, c1, { x: c1.x + c2.x, y: c1.y + c2.y }, c2],
		cell: [c1, c2],
		cellOrigin: { x: 0, y: 0 },
	};
}
