import { describe, it, expect } from "vitest";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { seedFromCell } from "@/lib/services/cellCodecService";
import { analyzeSymmetry, _inLatticeForTest } from "@/lib/classes/symmetry/WallpaperSymmetry";
import square44 from "./fixtures/cell-44.json";

describe("analyzeSymmetry — cell", () => {
	it("returns the primitive cell as two independent world vectors", () => {
		const ring = CyclotomicRing.create(24);
		setActiveRing(ring);
		const { T1, T2, seed } = seedFromCell(ring, square44);
		const data = analyzeSymmetry(ring, T1, T2, seed);
		const [c1, c2] = data.cell;
		const cross = c1.x * c2.y - c1.y * c2.x;
		expect(Math.abs(cross)).toBeGreaterThan(1e-6); // non-degenerate
	});
});

describe("inLattice", () => {
	it("T1, T1+T2, 2T1-3T2 are in Λ; a half-vector is not", () => {
		const ring = CyclotomicRing.create(24);
		setActiveRing(ring);
		const { T1, T2 } = seedFromCell(ring, square44);
		expect(_inLatticeForTest(T1, T2, T1)).toBe(true);
		expect(_inLatticeForTest(T1, T2, T1.add(T2))).toBe(true);
		expect(_inLatticeForTest(T1, T2, T1.scaleRational(2n, 1n).sub(T2.scaleRational(3n, 1n)))).toBe(true);
		expect(_inLatticeForTest(T1, T2, T1.scaleRational(1n, 2n))).toBe(false);
	});
});
