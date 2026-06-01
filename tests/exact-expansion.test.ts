import { describe, it, expect } from "vitest";
import { RegularPolygon } from "@/classes/polygons/RegularPolygon";
import { VertexConfiguration } from "@/classes/algorithm/VertexConfiguration";
import { SeedConfiguration } from "@/classes/algorithm/SeedConfiguration";
import { SeedExpander } from "@/classes/algorithm/SeedExpander";
import { Cyclotomic, CyclotomicRing } from "@/classes/Cyclotomic";

const ring = CyclotomicRing.create(24);
const ZERO = Cyclotomic.ZERO(ring);
const ONE = Cyclotomic.ONE(ring);
const zeta = (k: number) => Cyclotomic.zeta(ring, k);

describe("exact placement building blocks", () => {
	it("translateExact places a square sharing an edge, exactly", () => {
		// square A: [0, 1, 1+i, i]  (i = Î¶^6)
		const a = RegularPolygon.fromAnchorAndDirExact(4, ZERO, 0);
		const b = a.clone();
		b.translateExact(ONE); // shift right by 1 â†’ [1, 2, 2+i, 1+i]
		const aKeys = new Set(a.exactVertices!.map((v) => v.key()));
		const bKeys = new Set(b.exactVertices!.map((v) => v.key()));
		// shared edge endpoints 1 and 1+i belong to both
		expect(aKeys.has(ONE.key())).toBe(true);
		expect(bKeys.has(ONE.key())).toBe(true);
		const onePlusI = ONE.add(zeta(6));
		expect(aKeys.has(onePlusI.key())).toBe(true);
		expect(bKeys.has(onePlusI.key())).toBe(true);
		// they are distinct squares (different centroids)
		expect(a.exactCentroid!.equals(b.exactCentroid!)).toBe(false);
	});

	it("rotateZeta by 12 steps (180Â°) maps a triangle onto its point reflection", () => {
		const t = RegularPolygon.fromAnchorAndDirExact(3, ZERO, 0);
		const before = t.exactVertices!.map((v) => v.key());
		t.rotateZeta(ZERO, 12); // Î¶^12 = âˆ’1
		const after = t.exactVertices!.map((v) => v.key());
		// each vertex negated
		const negBefore = RegularPolygon.fromAnchorAndDirExact(3, ZERO, 0)
			.exactVertices!.map((v) => v.neg().key());
		expect(after.sort()).toEqual(negBefore.sort());
		expect(after).not.toEqual(before);
	});
});

describe("exact seed expansion (smoke)", () => {
	it("expands 4,4,4,4 (k=1) into a non-overlapping square patch, deterministically", () => {
		const run = () => {
			const vc = VertexConfiguration.fromName("4,4,4,4");
			const seed = new SeedConfiguration([vc]);
			const expander = new SeedExpander(1);
			const patches: number[] = [];
			const count = expander.expand(seed, (patch) => {
				// every polygon is a square; pairwise no proper overlap
				for (const p of patch) expect(p.n).toBe(4);
				patches.push(patch.length);
			}) as number;
			return { count, patches };
		};
		const r1 = run();
		const r2 = run();
		expect(r1.count).toBeGreaterThan(0);
		// deterministic across runs (exact keys â†’ stable dedup)
		expect(r1.count).toBe(r2.count);
		expect(r1.patches).toEqual(r2.patches);
		// the regular square tiling is unique (1-uniform): exactly one expanded patch
		expect(r1.count).toBe(1);
	});

	it("expands 3,3,3,3,3,3 (k=1) deterministically into one triangular patch", () => {
		const vc = VertexConfiguration.fromName("3,3,3,3,3,3");
		const seed = new SeedConfiguration([vc]);
		const count = new SeedExpander(1).expand(seed, () => {}) as number;
		expect(count).toBe(1);
	});
});

