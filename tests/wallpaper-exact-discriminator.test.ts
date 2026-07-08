/**
 * Exact-decision upgrade (Soto-Sánchez review, Workstream A): the group-deciding discriminator
 * `allTopCentersOnMirror` (the p4m/p4g and p3m1/p31m split) must be decided in EXACT ℤ[ζ₂₄], not by a
 * float `0.03·cellSize` distance on float-placed centers. Both branches are pinned here: 4.4.4.4 is
 * p4m (every 4-fold centre lies on a mirror ⇒ true); the snub-square t1009 is p4g (the 4-fold centres
 * sit at glide crossings, off every mirror ⇒ false). The float classifier gets both right on these
 * well-separated cases; this asserts the EXACT path agrees, with no tolerance in the decision.
 */
import { describe, it, expect } from "vitest";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { seedFromCell } from "@/lib/services/cellCodecService";
import { analyzeSymmetry, _allTopOnMirrorExactForTest } from "@/lib/classes/symmetry/WallpaperSymmetry";
import square44 from "./fixtures/cell-44.json";
import cellP4g from "./fixtures/cell-p4g.json"; // snub square t1009, full cell vertex set

const ring = CyclotomicRing.create(24);
setActiveRing(ring);

describe("exact allTopCentersOnMirror discriminator", () => {
	it("is TRUE for 4.4.4.4 (p4m): every 4-fold centre lies on a mirror", () => {
		const s = seedFromCell(ring, square44 as Parameters<typeof seedFromCell>[1]);
		expect(_allTopOnMirrorExactForTest(ring, s.T1, s.T2, s.seed)).toBe(true);
	});

	it("is FALSE for the snub square t1009 (p4g): 4-fold centres off every mirror", () => {
		const s = seedFromCell(ring, cellP4g as Parameters<typeof seedFromCell>[1]);
		expect(_allTopOnMirrorExactForTest(ring, s.T1, s.T2, s.seed)).toBe(false);
	});

	it("end-to-end: t1009 classifies as p4g, 4.4.4.4 as p4m", () => {
		const p4g = seedFromCell(ring, cellP4g as Parameters<typeof seedFromCell>[1]);
		expect(analyzeSymmetry(ring, p4g.T1, p4g.T2, p4g.seed).group).toBe("p4g");
		const p4m = seedFromCell(ring, square44 as Parameters<typeof seedFromCell>[1]);
		expect(analyzeSymmetry(ring, p4m.T1, p4m.T2, p4m.seed).group).toBe("p4m");
	});
});
