import { describe, expect, it } from "vitest";
import { buildLandingPayload } from "@/lib/services/landing-core";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";

// A minimal synthetic atlas: drawable + empty Euclidean cells, the 11 uniform shelf, and hyperbolic
// / spherical entries — enough to exercise every branch of buildLandingPayload without the real files.
function makeAtlas(): ReferenceTiling[] {
	const drawableCell = { p: [[[0, 0], [1, 0], [1, 1]]] };
	const emptyCell = { p: [] };

	const euclideanDrawable = Array.from({ length: 100 }, (_, i) => ({
		id: `e${i}`,
		source: "ctrnact",
		family: "4.4.4.4",
		k: (i % 6) + 1,
		renderCell: drawableCell,
	}));
	// Euclidean but not drawable — must never enter the pool.
	const euclideanEmpty = Array.from({ length: 5 }, (_, i) => ({
		id: `empty${i}`,
		source: "ctrnact",
		family: "4.4.4.4",
		k: 2,
		renderCell: emptyCell,
	}));
	const uniform = Array.from({ length: 11 }, (_, i) => ({
		id: `t10${String(i + 1).padStart(2, "0")}`,
		source: "galebach",
		family: "3.3.3.3.3.3",
		k: 1,
		renderCell: drawableCell,
	}));
	const hyperbolic = [
		{ id: "h0", source: "hyperbolic", family: "5.5.5.5", k: 1, renderCell: emptyCell, developed: { patch: "hyp-5-5-5-5" } },
		{ id: "h1", source: "hyperbolic", family: "7.7.7", k: 1, renderCell: emptyCell, developed: { patch: "hyp-7-7-7" } },
	];
	const spherical = [
		{ id: "s0", source: "spherical", family: "3.3.3", k: 1, renderCell: emptyCell, spherical: { solid: "tetrahedron" } },
		{ id: "s1", source: "spherical", family: "5.6.6", k: 1, renderCell: emptyCell, spherical: { solid: "truncated-icosahedron" } },
	];

	return [
		...euclideanDrawable,
		...euclideanEmpty,
		...uniform,
		...hyperbolic,
		...spherical,
	] as unknown as ReferenceTiling[];
}

describe("buildLandingPayload", () => {
	const atlas = makeAtlas();
	const payload = buildLandingPayload(atlas, 20);

	it("counts every geometry over the full atlas, drawable or not", () => {
		// 100 drawable + 5 empty + 11 uniform = 116 euclidean; 2 hyperbolic; 2 spherical.
		expect(payload.counts).toEqual({ euclidean: 116, hyperbolic: 2, spherical: 2, total: 120 });
	});

	it("samples a capped, distinct, drawable, Euclidean-only pool", () => {
		// The 11 uniform tilings are Euclidean + drawable too, so they are legitimately pool-eligible.
		const forbidden = new Set(["empty0", "empty1", "empty2", "empty3", "empty4", "h0", "h1", "s0", "s1"]);
		expect(payload.euclideanPool).toHaveLength(20);
		expect(new Set(payload.euclideanPool.map((s) => s.id)).size).toBe(20);
		for (const s of payload.euclideanPool) {
			expect((s.cell.p ?? s.cell.cellPolygons ?? []).length).toBeGreaterThan(0);
			// no empty-cell, hyperbolic, or spherical entry ever reaches the pool
			expect(forbidden.has(s.id)).toBe(false);
		}
	});

	it("picks the 11 uniform tilings in id order and t1003 as the play cell", () => {
		expect(payload.uniformEleven.map((s) => s.id)).toEqual(
			Array.from({ length: 11 }, (_, i) => `t10${String(i + 1).padStart(2, "0")}`),
		);
		expect(payload.play.id).toBe("t1003");
	});

	it("selects the preferred hyperbolic patch and spherical solid", () => {
		expect(payload.hyperbolicPatch).toBe("hyp-7-7-7");
		expect(payload.sphericalSolid).toBe("truncated-icosahedron");
	});

	it("is deterministic — the committed pool is stable across rebuilds", () => {
		const again = buildLandingPayload(atlas, 20);
		expect(again.euclideanPool.map((s) => s.id)).toEqual(payload.euclideanPool.map((s) => s.id));
	});
});
