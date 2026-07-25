import { describe, it, expect } from "vitest";
import {
	compareCatalogueDisplayOrder,
	decorationOf,
	tileClassOf,
	DECORATION_ORDER,
	TILE_CLASS_ORDER,
	type TileClass,
} from "./referenceAtlas";
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

	// The colored-tiling class sits between freedraw and hyperbolic in TILE_CLASS_ORDER.
	it("orders the colors class after freedraw", () => {
		const colK1 = T({ canonicalKey: "col-1-00001", k: 1, source: "colors" });
		const fdK5 = T({ canonicalKey: "fd-5-0001", k: 5, source: "freedraw" });
		expect(keys([colK1, fdK5])).toEqual(["fd-5-0001", "col-1-00001"]);
	});

	// Colors carries the same grid sub-axis as planar freedraw (SUB_ORDER: square < triangle < ts),
	// sitting between class and k — a square coloring at k=6 precedes a triangle coloring at k=1.
	it("orders the colors grid sub-axis before k", () => {
		const sq = { cells: [0], orbit: [0], vcs: [], tileOrbits: 1, edgeOrbits: 1, a: 1, b: 0, d: 1 };
		const sqK6 = T({
			canonicalKey: "col-6-00001",
			k: 6,
			source: "colors",
			colors: { ...sq, id: "col-6-00001", k: 6 },
		});
		const triK1 = T({
			canonicalKey: "colt-1-00001",
			k: 1,
			source: "colors",
			colors: { ...sq, id: "colt-1-00001", k: 1, grid: "triangle" },
		});
		expect(keys([triK1, sqK6])).toEqual(["col-6-00001", "colt-1-00001"]);
	});

	// Decoration is the FIRST sort key, above tile class. In Euclidean this is a no-op (TILE_CLASS_ORDER
	// already runs the shape classes before freedraw and colors), so the case that proves it is hyperbolic:
	// "hyperbolic" sorts LAST in TILE_CLASS_ORDER, so before the decoration key the developed patches
	// trailed the edge patterns and colorings that decorate them.
	it("puts a geometry's plain tilings before its edge patterns and colorings", () => {
		const developed = T({
			canonicalKey: "hyp-73",
			k: 1,
			source: "hyperbolic",
			developed: { patch: "p73" } as never,
		});
		const edges = T({
			canonicalKey: "he-73-1",
			k: 1,
			source: "freedraw",
			hypEdges: { base: "b73" } as never,
		});
		const colorings = T({
			canonicalKey: "hc-73-1",
			k: 1,
			source: "colors",
			hypColors: { base: "b73" } as never,
		});
		expect(keys([colorings, edges, developed])).toEqual(["hyp-73", "he-73-1", "hc-73-1"]);
	});
});

// Every TileClass must land in exactly one decoration segment. The mapping is total by construction
// (decorationOf falls through to "tilings"), so what this really guards is the fall-through staying
// DELIBERATE: a new decoration-like class added to TILE_CLASS_ORDER without a decorationOf branch would
// silently join the shape shelves, which is the flattening this axis exists to undo.
describe("decorationOf", () => {
	// One representative row per class, built the way tileClassOf reads them: `source` where the atlas
	// carries it, family tokens for the source-less Supabase rows.
	const BY_CLASS: Record<TileClass, CatalogueTiling> = {
		regular: T({ canonicalKey: "r", k: 1 }),
		star: T({ canonicalKey: "s", k: 1, family: "5*2" }),
		convex: T({ canonicalKey: "c", k: 1, source: "composable" }),
		isotoxal: T({ canonicalKey: "i", k: 1, source: "isotoxal" }),
		mixed: T({ canonicalKey: "m", k: 1, source: "mixed" }),
		scaled: T({ canonicalKey: "sc", k: 1, source: "scaled" }),
		polyomino: T({ canonicalKey: "p", k: 1, source: "polyomino" }),
		islamic: T({ canonicalKey: "is", k: 1, source: "islamic" }),
		freedraw: T({ canonicalKey: "fd", k: 1, source: "freedraw" }),
		colors: T({ canonicalKey: "co", k: 1, source: "colors" }),
		hyperbolic: T({ canonicalKey: "hy", k: 1, source: "hyperbolic" }),
		spherical: T({ canonicalKey: "sp", k: 1, source: "spherical" }),
	};

	it("covers every tile class, each landing in exactly one segment", () => {
		for (const cls of TILE_CLASS_ORDER) {
			const row = BY_CLASS[cls];
			expect(tileClassOf(row), `fixture for "${cls}" classifies as something else`).toBe(cls);
			expect(DECORATION_ORDER).toContain(decorationOf(row));
		}
	});

	// The two decoration classes are the ONLY ones outside Tilings. Stated positively so that adding a
	// class here is a deliberate edit rather than a silent default.
	it("routes freedraw to edges, colors to colorings, everything else to tilings", () => {
		expect(decorationOf(BY_CLASS.freedraw)).toBe("edges");
		expect(decorationOf(BY_CLASS.colors)).toBe("colorings");
		for (const cls of TILE_CLASS_ORDER) {
			if (cls === "freedraw" || cls === "colors") continue;
			expect(decorationOf(BY_CLASS[cls]), `class "${cls}" left the Tilings segment`).toBe("tilings");
		}
	});
});
