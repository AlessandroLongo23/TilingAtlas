import { Cyclotomic, type CyclotomicRing } from "@/classes/Cyclotomic";

// The Soto-Sánchez / Galebach oracle stores each vector as [a,b,c,d] = a + b·ζ₁₂ + c·ζ₁₂² + d·ζ₁₂³,
// with ζ₁₂ = ζ₂₄² (the even powers of ζ₂₄). Same decoding as scripts/oracle-characterize.ts. Used to
// feed reference (oracle) tilings into the exact wallpaper classifier.
export interface GalebachEntry {
	T1: number[];
	T2: number[];
	Seed: number[][];
}

export function galebachVec(ring: CyclotomicRing, [a, b, c, d]: number[]): Cyclotomic {
	return Cyclotomic.fromRational(ring, BigInt(a))
		.add(Cyclotomic.zeta(ring, 2).scaleRational(BigInt(b), 1n))
		.add(Cyclotomic.zeta(ring, 4).scaleRational(BigInt(c), 1n))
		.add(Cyclotomic.zeta(ring, 6).scaleRational(BigInt(d), 1n));
}

export function galebachToInput(
	ring: CyclotomicRing,
	e: GalebachEntry,
): { T1: Cyclotomic; T2: Cyclotomic; seed: Cyclotomic[] } {
	return {
		T1: galebachVec(ring, e.T1),
		T2: galebachVec(ring, e.T2),
		seed: e.Seed.map((s) => galebachVec(ring, s)),
	};
}
