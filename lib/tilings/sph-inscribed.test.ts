import { describe, expect, it } from "vitest";
import { SPHERICAL_SOLIDS } from "@/lib/render/sphericalSolids";
import {
	circumsphereMiss,
	hasSphereView,
	isInscribed,
	NCX_INSCRIBED,
	SPH_NOT_INSCRIBED,
	sphericalSolidSub,
} from "./sph-inscribed";

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
	// The two lists in sph-inscribed.ts are what `subOf` and the view options read, and this is what stops
	// them drifting: recompute both from the vertices every run. A solid added to the shelf without a row
	// fails here.
	//
	// The "ncx-" shelf is listed the other way round — NCX_INSCRIBED names the few that DO have a
	// circumsphere — so assert it as a set equality, not as "none of them do". That claim was in this file
	// as a for-loop until the k=3 search landed and produced one that does.
	it("NCX_INSCRIBED is exactly the ncx- solids with a circumsphere", () => {
		const ncx = SPHERICAL_SOLIDS.filter((s) => s.id.startsWith("ncx-"));
		expect(ncx.length).toBeGreaterThan(0);
		const measured = ncx
			.filter((s) => isInscribed(s.vertices as [number, number, number][]))
			.map((s) => s.id)
			.sort();
		expect(measured).toEqual([...NCX_INSCRIBED].sort());
		for (const s of ncx) {
			expect(hasSphereView(s.id), s.id).toBe(
				isInscribed(s.vertices as [number, number, number][]),
			);
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

	// ⚑ The gap narrowed at k=4 and both thresholds moved with it. It read 1e-8 against 1e-2 while every
	// shipped solid came from k <= 3; the k=4 records come out of a deeper dihedral-angle root-find, so
	// the worst INSCRIBED one now misses its fitted sphere by 3.9e-7 of the radius and the closest
	// NON-inscribed one by 8.2e-3 (it was past 1e-2). Four and a bit orders of magnitude of clear air
	// instead of seven — still no borderline case anywhere, and isInscribed's own 1e-4 tolerance still
	// sits comfortably between the two populations.
	//
	// Those numbers are a measurement of the corpus, not a law, and this is where the erosion would show
	// if it continued. If k=5 narrows it again, move the numbers again and say so; do NOT widen
	// isInscribed's tolerance to keep a stale assertion passing, because that is the classifier and this
	// is only its evidence.
	it("separates the two populations by four orders of magnitude", () => {
		let worstIn = 0;
		let bestOut = Infinity;
		for (const s of SPHERICAL_SOLIDS) {
			if (s.id.startsWith("ncx-")) continue;   // measured by the test above, on its own claim
			const V = s.vertices as [number, number, number][];
			const miss = circumsphereMiss(V) / Math.max(...V.map((v) => Math.hypot(v[0], v[1], v[2])));
			if (SPH_NOT_INSCRIBED.has(s.id)) bestOut = Math.min(bestOut, miss);
			else worstIn = Math.max(worstIn, miss);
		}
		expect(worstIn).toBeLessThan(1e-6);
		expect(bestOut).toBeGreaterThan(5e-3);
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
