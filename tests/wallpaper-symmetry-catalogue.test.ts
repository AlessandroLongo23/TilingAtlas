import { describe, it, expect } from "vitest";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { seedFromCell, type SerializedCell } from "@/lib/services/cellCodecService";
import { analyzeSymmetry, _polyAreaForTest } from "@/lib/classes/symmetry/WallpaperSymmetry";
import { WALLPAPER_GROUPS, ORBIFOLD_SIGNATURE } from "@/lib/classes/symmetry/types";
import catalogue from "../figures/data/catalogue-k1-3.json";

// Catalogue-wide validation (spec §7): the exact classifier must land every certified k≤3 tiling on
// one of the 17 groups with an area-exact fundamental domain. This is the regression guard for the
// whole detection + FD pipeline — a real classifier bug (wrong group, degenerate FD, wrong area) fails
// here, and the fix belongs in WallpaperSymmetry.ts, never in a loosened assertion.
describe("wallpaper classifier — full certified catalogue", () => {
	const ring = CyclotomicRing.create(24);
	setActiveRing(ring);
	const tilings = (catalogue as unknown as { tilings: { cellCodec: SerializedCell | null }[] }).tilings.filter(
		(t) => t.cellCodec,
	);

	it("has the expected 92 certified tilings with cell codecs", () => {
		expect(tilings.length).toBe(92);
	});

	it("classifies every tiling to one of the 17 groups with area(FD) = area(cell)/|G|", () => {
		for (const t of tilings) {
			const s = seedFromCell(ring, t.cellCodec as SerializedCell);
			const d = analyzeSymmetry(ring, s.T1, s.T2, s.seed);

			expect(WALLPAPER_GROUPS).toContain(d.group);
			expect(d.orbifold).toBe(ORBIFOLD_SIGNATURE[d.group]);
			expect(d.fd.length).toBeGreaterThanOrEqual(3);

			const [c1, c2] = d.cell;
			const cellArea = Math.abs(c1.x * c2.y - c1.y * c2.x);
			expect(Math.abs(_polyAreaForTest(d.fd) - cellArea / d.pointGroupOrder)).toBeLessThan(
				1e-3 * Math.max(1, cellArea),
			);
		}
	});

	it("gives reflection groups a triangular chamber (spot: >=40 triangles across p4m/p6m/cmm/…)", () => {
		let triangles = 0;
		for (const t of tilings) {
			const s = seedFromCell(ring, t.cellCodec as SerializedCell);
			if (analyzeSymmetry(ring, s.T1, s.T2, s.seed).fd.length === 3) triangles++;
		}
		expect(triangles).toBeGreaterThanOrEqual(40); // p4m+p4g+p3m1+p6m (~41) + most cmm (~25)
	});
});
