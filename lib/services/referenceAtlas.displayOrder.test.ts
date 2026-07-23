import { describe, it, expect } from "vitest";
import { compareCatalogueDisplayOrder } from "./referenceAtlas";
import type { CatalogueTiling } from "@/lib/services/catalogueService";

// Bare catalogue rows carrying only the fields the display-order comparator reads.
const T = (over: Partial<CatalogueTiling> & { canonicalKey: string; k: number }): CatalogueTiling => ({
	family: "3.3.3.3.3.3",
	renderCell: null,
	certified: true,
	runIds: [],
	...over,
});

const keys = (list: CatalogueTiling[]) => [...list].sort(compareCatalogueDisplayOrder).map((t) => t.canonicalKey);

describe("compareCatalogueDisplayOrder", () => {
	// The bug: arrow-key nav interleaved classes because it walked a (k, key)-sorted list, while the sidebar
	// groups class-first. The comparator must reproduce the sidebar's class-major order.
	it("groups by tile class before k (no cross-class interleave)", () => {
		const reg1 = T({ canonicalKey: "r1", k: 1, family: "3.3.3.3.3.3" });
		const reg2a = T({ canonicalKey: "r2a", k: 2, family: "3.3.3.3.3.3" });
		const reg2b = T({ canonicalKey: "r2b", k: 2, family: "3.3.3.3.3.3" });
		const star1 = T({ canonicalKey: "s1", k: 1, family: "5*2" });
		const star2 = T({ canonicalKey: "s2", k: 2, family: "5*2" });
		const convex1 = T({ canonicalKey: "c1", k: 1, family: "cx4" });
		// Shuffled input; (k, key) sorting would interleave (c1, r1, s1, r2a, r2b, s2).
		expect(keys([star2, reg2b, convex1, reg1, star1, reg2a])).toEqual([
			"r1",
			"r2a",
			"r2b",
			"s1",
			"s2",
			"c1",
		]);
	});

	// Within one class the order is k ascending, then canonicalKey — matching the sidebar's within-k order.
	it("orders k ascending then canonicalKey within a class", () => {
		const a = T({ canonicalKey: "z", k: 1 });
		const b = T({ canonicalKey: "a", k: 2 });
		const c = T({ canonicalKey: "b", k: 2 });
		expect(keys([c, b, a])).toEqual(["z", "a", "b"]);
	});

	// The freedraw sub-axis (solid / grid) sits between class and k, so it dominates k — exactly as the
	// sidebar nests it (SUB_ORDER puts octahedron before cube).
	it("orders the freedraw sub-axis before k", () => {
		const cubeK2 = T({
			canonicalKey: "fd-cube-2",
			k: 2,
			source: "freedraw",
			sphericalFreedraw: { solid: "cube", k: 2, pattern: {} as never },
		});
		const octaK3 = T({
			canonicalKey: "fd-octa-3",
			k: 3,
			source: "freedraw",
			sphericalFreedraw: { solid: "octahedron", k: 3, pattern: {} as never },
		});
		expect(keys([cubeK2, octaK3])).toEqual(["fd-octa-3", "fd-cube-2"]);
	});
});
