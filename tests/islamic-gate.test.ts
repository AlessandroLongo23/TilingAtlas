import { describe, it, expect } from "vitest";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { polygonClassSupportsIslamic } from "@/lib/utils/tilingLabel";

// The gate feeds three UI sites: the sidebar checkbox, the force-off effect, and the `I` shortcut.
//
// ⚑ It is keyed on the SURFACE, not the class (2026-08-21). The old source-based reading admitted four
// shelves whose canvas has no Islamic path, so the checkbox and its parameter block rendered over
// renderers that ignore the flag. The three surfaces below are the ones that read `isIslamic` and draw
// something; the cases under them are the shelves that used to slip through.
//
// A record's surface comes from its payload field (lib/services/shelfRegistry.ts), so the stubs carry an
// empty payload and nothing else — `shelfOf` only tests the field for truthiness.
const stub = (payload: Partial<CatalogueTiling> = {}): CatalogueTiling =>
	({ family: "x", ...payload }) as CatalogueTiling;

describe("polygonClassSupportsIslamic — the renderers that draw the construction", () => {
	it("enables it on the flat canvas, which is every plain Euclidean class", () => {
		// No shelf payload at all is the plain-tiling case, and it covers regular, star, convex, isotoxal,
		// mixed, scaled, polyomino and the Islamic systems: they all render on the same flat canvas.
		expect(polygonClassSupportsIslamic(stub())).toBe(true);
	});

	it("enables it in the Poincaré disk, where the Hankin rays are geodesics", () => {
		expect(polygonClassSupportsIslamic(stub({ developed: {} as CatalogueTiling["developed"] }))).toBe(true);
	});

	it("enables it on the tiling sphere, where the construction is great-circle ribbons", () => {
		expect(polygonClassSupportsIslamic(stub({ spherical: {} as CatalogueTiling["spherical"] }))).toBe(true);
	});

	// Each of these rendered the checkbox before the gate moved to the surface.
	const dead: Array<[string, Partial<CatalogueTiling>]> = [
		["star polyhedra (ico-freedraw canvas)", { sphStar: {} as CatalogueTiling["sphStar"] }],
		["the 3.4.n.4 solids (same canvas)", { sphPoly: {} as CatalogueTiling["sphPoly"] }],
		["the 3.4.n.4 hyperbolic tilings (colors shader)", { hypPoly: {} as CatalogueTiling["hypPoly"] }],
		["hollow tilings (canvas.tsx blanks the flat layer)", { hollow: {} as CatalogueTiling["hollow"] }],
	];
	for (const [name, payload] of dead) {
		it(`excludes ${name}`, () => {
			expect(polygonClassSupportsIslamic(stub(payload))).toBe(false);
		});
	}

	// Unchanged by the move, and for the same reason as before: the Hankin construction needs a tile with
	// vertices, edge midpoints, a centroid and inward normals, and a freedraw face can be an infinite strip
	// or an annulus with none of those.
	it("excludes freedraw (its faces are not tiles)", () => {
		expect(polygonClassSupportsIslamic(stub({ freedraw: {} as CatalogueTiling["freedraw"] }))).toBe(false);
	});

	it("excludes the colorings, on every geometry", () => {
		expect(polygonClassSupportsIslamic(stub({ colors: {} as CatalogueTiling["colors"] }))).toBe(false);
		expect(polygonClassSupportsIslamic(stub({ sphColors: {} as CatalogueTiling["sphColors"] }))).toBe(false);
		expect(polygonClassSupportsIslamic(stub({ hypColors: {} as CatalogueTiling["hypColors"] }))).toBe(false);
	});
});
