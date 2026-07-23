import { describe, it, expect } from "vitest";
import { polygonClassSupportsIslamic } from "@/lib/utils/tilingLabel";

// The gate feeds three UI sites: the sidebar checkbox, the force-off effect, and the `I` shortcut.
// It now admits every flat/spherical/hyperbolic class (hyperbolic gained a Hankin-in-absolute-geometry
// construction on the developed renderer, 54ad1e7) and excludes only freedraw, whose faces are not tiles.
type GateInput = Parameters<typeof polygonClassSupportsIslamic>[0];

describe("polygonClassSupportsIslamic — open to every flat class", () => {
	const enabled: Array<[string, GateInput]> = [
		["regular", { family: "3.3.3.3.3.3" }],
		["star (family token)", { family: "3.6*.3.6*" }],
		["convex (composable)", { family: "cx-4571", source: "composable" }],
		["convex (family token)", { family: "cx-9", source: undefined }],
		["isotoxal", { family: "α.4.α.4", source: "isotoxal" }],
		["mixed", { family: "m-1", source: "mixed" }],
		["scaled", { family: "3.3₂", source: "scaled" }],
		["polyomino", { family: "L-tetromino", source: "polyomino" }],
		["islamic", { family: "girih-bobbin", source: "islamic" }],
		["spherical", { family: "{4,3}", source: "spherical" }],
		// Hyperbolic now has a Hankin construction in absolute geometry on the developed renderer.
		["hyperbolic", { family: "{7,3}", source: "hyperbolic" }],
	];
	for (const [name, t] of enabled) {
		it(`enables Islamic for ${name}`, () => {
			expect(polygonClassSupportsIslamic(t)).toBe(true);
		});
	}

	// The Hankin construction needs a tile: vertices, edge midpoints, a centroid, inward normals. A freedraw
	// face has none of those — it can be an infinite strip or an annulus — so there is nothing to run it on.
	it("excludes freedraw (its faces are not tiles — no vertices, no centroid)", () => {
		expect(polygonClassSupportsIslamic({ family: "1 strip", source: "freedraw" })).toBe(false);
	});
});
