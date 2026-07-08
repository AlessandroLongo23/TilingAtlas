import { describe, it, expect } from "vitest";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { seedFromCell } from "@/lib/services/cellCodecService";
import {
	analyzeSymmetry,
	_inLatticeForTest,
	_rotationsForTest,
	_polyAreaForTest,
} from "@/lib/classes/symmetry/WallpaperSymmetry";
import { galebachToInput } from "@/lib/services/galebachInput";
import square44 from "./fixtures/cell-44.json";
import hex666 from "./fixtures/cell-666.json";
import tsp4m from "./fixtures/cell-488.json";
import triangular from "./fixtures/cell-tri.json";
import p6m4612 from "./fixtures/cell-4612.json";
import galCmm from "./fixtures/gal-t5125.json";
import galPgg from "./fixtures/gal-t6364.json";
import galP2 from "./fixtures/gal-t3055.json";

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

describe("group identification", () => {
	const ring = CyclotomicRing.create(24);
	setActiveRing(ring);
	const cellCases: [string, unknown, string][] = [
		["4.4.4.4", square44, "p4m"],
		["6.6.6", hex666, "p6m"],
		["4.8.8", tsp4m, "p4m"],
		["4.6.12 (t1003 — the prototype gets this WRONG)", p6m4612, "p6m"],
		["triangular", triangular, "p6m"],
	];
	it.each(cellCases)("identifies %s as %s", (_name, fixture, group) => {
		const s = seedFromCell(ring, fixture as Parameters<typeof seedFromCell>[1]);
		expect(analyzeSymmetry(ring, s.T1, s.T2, s.seed).group).toBe(group);
	});

	const galCases: [string, unknown, string][] = [
		["t5125", galCmm, "cmm"],
		["t6364", galPgg, "pgg"],
		["t3055", galP2, "p2"],
	];
	it.each(galCases)("identifies %s as %s", (_name, fixture, group) => {
		const s = galebachToInput(ring, fixture as Parameters<typeof galebachToInput>[1]);
		expect(analyzeSymmetry(ring, s.T1, s.T2, s.seed).group).toBe(group);
	});
});

describe("fundamental domain", () => {
	const ring = CyclotomicRing.create(24);
	setActiveRing(ring);
	const cellFx = [square44, hex666, tsp4m, p6m4612, triangular];
	const galFx = [galCmm, galPgg, galP2];

	it("FD area equals cell area / |point group| for every spot case", () => {
		const check = (d: ReturnType<typeof analyzeSymmetry>) => {
			const [c1, c2] = d.cell;
			const cellArea = Math.abs(c1.x * c2.y - c1.y * c2.x);
			expect(_polyAreaForTest(d.fd)).toBeCloseTo(cellArea / d.pointGroupOrder, 4);
		};
		for (const fx of cellFx) {
			const s = seedFromCell(ring, fx as Parameters<typeof seedFromCell>[1]);
			check(analyzeSymmetry(ring, s.T1, s.T2, s.seed));
		}
		for (const fx of galFx) {
			const s = galebachToInput(ring, fx as Parameters<typeof galebachToInput>[1]);
			check(analyzeSymmetry(ring, s.T1, s.T2, s.seed));
		}
	});

	it("reflection groups get a triangular chamber, no-mirror groups a parallelogram", () => {
		const p4m = seedFromCell(ring, tsp4m as Parameters<typeof seedFromCell>[1]);
		expect(analyzeSymmetry(ring, p4m.T1, p4m.T2, p4m.seed).fd.length).toBe(3);
		const p2 = galebachToInput(ring, galP2 as Parameters<typeof galebachToInput>[1]);
		expect(analyzeSymmetry(ring, p2.T1, p2.T2, p2.seed).fd.length).toBe(4);
	});
});
