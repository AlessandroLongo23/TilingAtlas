import { describe, expect, it } from "vitest";
import { countsOf, loadLandingData, pickDistinct } from "@/lib/services/landingData";
import payload from "@/lib/services/landing-data.generated.json";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";

// A cheap deterministic rng for reproducible picks.
function seededRng(seed = 42): () => number {
	let s = seed;
	return () => {
		s = (s * 1664525 + 1013904223) % 4294967296;
		return s / 4294967296;
	};
}

describe("countsOf", () => {
	it("splits by geometry with spherical > developed precedence", () => {
		const atlas = [
			{ id: "a" },
			{ id: "b", developed: { patch: "p" } },
			{ id: "c", spherical: { solid: "cube" } },
			{ id: "d", spherical: { solid: "cube" }, developed: { patch: "p" } },
		] as unknown as ReferenceTiling[];
		expect(countsOf(atlas)).toEqual({ euclidean: 1, hyperbolic: 1, spherical: 2, total: 4 });
	});
});

describe("pickDistinct", () => {
	it("returns n distinct elements, deterministically under a seeded rng", () => {
		const pool = Array.from({ length: 50 }, (_, i) => i);
		const a = pickDistinct(pool, 9, seededRng());
		const b = pickDistinct(pool, 9, seededRng());
		expect(a).toHaveLength(9);
		expect(new Set(a).size).toBe(9);
		expect(a).toEqual(b);
	});

	it("caps at the pool size", () => {
		expect(pickDistinct([1, 2, 3], 9, seededRng())).toHaveLength(3);
	});
});

describe("loadLandingData (real atlas files)", () => {
	it("returns consistent counts and well-formed specimens", async () => {
		const data = await loadLandingData(seededRng());
		const { euclidean, hyperbolic, spherical, total } = data.counts;
		expect(total).toBe(euclidean + hyperbolic + spherical);
		expect(euclidean).toBeGreaterThan(1000);
		expect(hyperbolic).toBeGreaterThan(0);
		expect(spherical).toBeGreaterThan(0);

		// The Theory ring: exactly the 11 uniform tilings, in id order.
		expect(data.uniformEleven.map((t) => t.id)).toEqual(
			Array.from({ length: 11 }, (_, i) => `t10${String(i + 1).padStart(2, "0")}`),
		);

		// Hero pool + mosaic carry drawable cells.
		const polysOf = (s: { cell: { p?: unknown[]; cellPolygons?: unknown[] } }) =>
			s.cell.p ?? s.cell.cellPolygons ?? [];
		expect(data.heroPool).toHaveLength(14);
		expect(new Set(data.heroPool.map((t) => t.id)).size).toBe(14);
		for (const h of data.heroPool) expect(polysOf(h).length).toBeGreaterThan(0);
		expect(data.mosaic).toHaveLength(9);
		expect(new Set(data.mosaic.map((t) => t.id)).size).toBe(9);
		for (const m of data.mosaic) expect(polysOf(m).length).toBeGreaterThan(0);

		// The three collection-preview specimens. They are RE-DEALT from the baked pools on every
		// request (landingData.ts), so pinning them to specific ids would make every atlas addition
		// look like a regression — the invariant is that each pick comes from its own pool and is
		// drawable, not which one the rng happened to land on.
		expect(payload.euclideanPool.map((t) => t.id)).toContain(data.play.id);
		expect(polysOf(data.play)).not.toHaveLength(0);
		expect(payload.hyperbolicPool).toContain(data.hyperbolicPatch);
		expect(payload.sphericalPool).toContain(data.sphericalSolid);
	});
});
