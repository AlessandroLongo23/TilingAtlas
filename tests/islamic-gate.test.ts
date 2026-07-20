import { describe, it, expect } from "vitest";
import { polygonClassSupportsIslamic } from "@/lib/utils/tilingLabel";

// The gate feeds three UI sites: the sidebar checkbox, the force-off effect, and the `I` shortcut.
// It must now admit every flat/spherical class and exclude only hyperbolic (its own shader path).
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
	];
	for (const [name, t] of enabled) {
		it(`enables Islamic for ${name}`, () => {
			expect(polygonClassSupportsIslamic(t)).toBe(true);
		});
	}

	it("excludes hyperbolic (its developed Poincaré-disk renderer has no Islamic construction)", () => {
		expect(polygonClassSupportsIslamic({ family: "{7,3}", source: "hyperbolic" })).toBe(false);
	});
});
