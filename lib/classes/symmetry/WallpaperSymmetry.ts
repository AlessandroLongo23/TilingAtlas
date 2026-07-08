import { Cyclotomic, type CyclotomicRing } from "@/classes/Cyclotomic";
import { gaussReduceExact } from "@/classes/algorithm/LatticeEnumerator";
import type { SymmetryData, Vec2 } from "./types";

const v2 = (z: Cyclotomic): Vec2 => {
	const v = z.toVector();
	return { x: v.x, y: v.y };
};

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
