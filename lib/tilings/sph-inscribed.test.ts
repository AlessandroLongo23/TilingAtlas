import { describe, expect, it } from "vitest";
import { SPHERICAL_SOLIDS } from "@/lib/render/sphericalSolids";
import { circumsphereMiss, hasSphereView, isInscribed, SPH_NOT_INSCRIBED, sphericalSolidSub } from "./sph-inscribed";

describe("circumsphere fit", () => {
	it("finds the sphere a vertex CENTROID would miss", () => {
		// A square pyramid with unit edges: circumcentre at the centre of the base, not at the centroid.
		const h = Math.SQRT1_2;
		const V = [
			[0.5, 0.5, 0], [0.5, -0.5, 0], [-0.5, -0.5, 0], [-0.5, 0.5, 0], [0, 0, h],
		] as [number, number, number][];
		expect(isInscribed(V)).toBe(true);
		expect(circumsphereMiss(V)).toBeLessThan(1e-9);
	});

	it("rejects a solid with no sphere through its vertices", () => {
		const V = [
			[1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0], [0, 0, 1], [0, 0, 3],
		] as [number, number, number][];
		expect(isInscribed(V)).toBe(false);
	});
});

describe("the shipped split", () => {
	// The list in sph-inscribed.ts is what `subOf` reads, and this is what stops it drifting: recompute
	// it from the vertices every run. A solid added to the shelf without a row here fails here.
	// The "ncx-" shelf is non-convex regular-faced solids and NOT ONE of them has a circumsphere, which is
	// why hasSphereView answers on the prefix instead of listing 34 more ids. Assert both halves: the
	// prefix claim, and that the hand-list is exactly the remaining exceptions.
	it("no ncx- solid has a circumsphere", () => {
		const ncx = SPHERICAL_SOLIDS.filter((s) => s.id.startsWith("ncx-"));
		expect(ncx.length).toBeGreaterThan(0);
		for (const s of ncx) {
			expect(isInscribed(s.vertices as [number, number, number][]), s.id).toBe(false);
			expect(hasSphereView(s.id), s.id).toBe(false);
		}
	});

	it("SPH_NOT_INSCRIBED is exactly the OTHER solids with no circumsphere", () => {
		const measured = SPHERICAL_SOLIDS.filter(
			(s) => !s.id.startsWith("ncx-") && !isInscribed(s.vertices as [number, number, number][]),
		)
			.map((s) => s.id)
			.sort();
		expect(measured).toEqual([...SPH_NOT_INSCRIBED].sort());
	});

	it("separates the two populations by seven orders of magnitude", () => {
		let worstIn = 0;
		let bestOut = Infinity;
		for (const s of SPHERICAL_SOLIDS) {
			if (s.id.startsWith("ncx-")) continue;   // measured by the test above, on its own claim
			const V = s.vertices as [number, number, number][];
			const miss = circumsphereMiss(V) / Math.max(...V.map((v) => Math.hypot(v[0], v[1], v[2])));
			if (SPH_NOT_INSCRIBED.has(s.id)) bestOut = Math.min(bestOut, miss);
			else worstIn = Math.max(worstIn, miss);
		}
		expect(worstIn).toBeLessThan(1e-8);
		expect(bestOut).toBeGreaterThan(1e-2);
	});

	// ONE row for all of them now: the shelf's split is convexity, with k naming uniform against Johnson
	// underneath (2026-08-21). The circumsphere is still measured and still gates the sphere view — it is
	// simply not an axis, so nothing here may send a solid to a row the tree does not have.
	it("routes every solid to one of the two rows the tree has", () => {
		const subs = new Set(SPHERICAL_SOLIDS.map((s) => sphericalSolidSub(s.id)));
		expect([...subs].sort()).toEqual(["spn-solid", "spx-solid"]);
		// …and the split is exactly the ncx- prefix, so nothing lands on the wrong side of it.
		for (const s of SPHERICAL_SOLIDS) {
			expect(sphericalSolidSub(s.id)).toBe(s.id.startsWith("ncx-") ? "spn-solid" : "spx-solid");
		}
	});
});
