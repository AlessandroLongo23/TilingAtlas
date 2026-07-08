import { describe, it, expect } from "vitest";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { seedFromCell } from "@/lib/services/cellCodecService";
import { analyzeSymmetry, _inLatticeForTest, _rotationsForTest } from "@/lib/classes/symmetry/WallpaperSymmetry";
import { galebachToInput } from "@/lib/services/galebachInput";
import square44 from "./fixtures/cell-44.json";
import hex666 from "./fixtures/cell-666.json";
import tsp4m from "./fixtures/cell-488.json";
import galCmm from "./fixtures/gal-t5125.json";
import galPgg from "./fixtures/gal-t6364.json";

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

describe("rotations", () => {
	it("max rotation order: 4.4.4.4 ⇒ 4, 6.6.6 ⇒ 6", () => {
		const ring = CyclotomicRing.create(24);
		setActiveRing(ring);
		const sq = seedFromCell(ring, square44);
		const sqRots = _rotationsForTest(ring, sq.T1, sq.T2, sq.seed);
		expect(Math.max(...sqRots.map((r) => r.order))).toBe(4);

		const hx = seedFromCell(ring, hex666);
		const hxRots = _rotationsForTest(ring, hx.T1, hx.T2, hx.seed);
		expect(Math.max(...hxRots.map((r) => r.order))).toBe(6);
	});
});

describe("rotation centers", () => {
	it("square tiling emits order-4 centers, deduped in the cell", () => {
		const ring = CyclotomicRing.create(24);
		setActiveRing(ring);
		const s = seedFromCell(ring, square44);
		const data = analyzeSymmetry(ring, s.T1, s.T2, s.seed);
		expect(data.centers.some((c) => c.order === 4)).toBe(true);
		const keys = new Set(data.centers.map((c) => `${c.z.x.toFixed(4)},${c.z.y.toFixed(4)}`));
		expect(keys.size).toBe(data.centers.length);
	});
});

describe("mirrors and glides", () => {
	it("4.8.8 (p4m) reports both mirror and glide axes", () => {
		const ring = CyclotomicRing.create(24);
		setActiveRing(ring);
		const s = seedFromCell(ring, tsp4m);
		const data = analyzeSymmetry(ring, s.T1, s.T2, s.seed);
		expect(data.axes.some((a) => a.kind === "mirror")).toBe(true);
		expect(data.axes.some((a) => a.kind === "glide")).toBe(true);
	});

	it("cmm (t5125) reports BOTH mirror and glide axes — the centered-lattice glide regression", () => {
		const ring = CyclotomicRing.create(24);
		setActiveRing(ring);
		const { T1, T2, seed } = galebachToInput(ring, galCmm);
		const data = analyzeSymmetry(ring, T1, T2, seed);
		expect(data.axes.some((a) => a.kind === "mirror")).toBe(true);
		expect(data.axes.some((a) => a.kind === "glide")).toBe(true);
	});

	it("pgg (t6364) reports glides and NO mirrors", () => {
		const ring = CyclotomicRing.create(24);
		setActiveRing(ring);
		const { T1, T2, seed } = galebachToInput(ring, galPgg);
		const data = analyzeSymmetry(ring, T1, T2, seed);
		expect(data.axes.some((a) => a.kind === "glide")).toBe(true);
		expect(data.axes.some((a) => a.kind === "mirror")).toBe(false);
	});
});

describe("lattice shape", () => {
	it("square⇒square, hex⇒hexagonal, cmm⇒rhombic", () => {
		const ring = CyclotomicRing.create(24);
		setActiveRing(ring);
		const sq = seedFromCell(ring, square44);
		expect(analyzeSymmetry(ring, sq.T1, sq.T2, sq.seed).latticeShape).toBe("square");
		const hx = seedFromCell(ring, hex666);
		expect(analyzeSymmetry(ring, hx.T1, hx.T2, hx.seed).latticeShape).toBe("hexagonal");
		const cm = galebachToInput(ring, galCmm);
		expect(analyzeSymmetry(ring, cm.T1, cm.T2, cm.seed).latticeShape).toBe("rhombic");
	});
});
