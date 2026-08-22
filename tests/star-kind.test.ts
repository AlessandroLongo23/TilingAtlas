import { describe, expect, it } from "vitest";
import { SPH_STAR_INDEX, sphStarKind, type SphStarKind } from "@/lib/tilings/sph-star";

// `sphStarKind` reads a solid's SHAPE off its structure — face census plus V, E and F — and never off its
// name. The argument for that is this file: it agrees with every record that carries a catalogue name,
// and it still answers for the two thirds of the shelf that ship unnamed because the naming discipline
// refuses to guess a U-number off a census.
describe("sphStarKind", () => {
	it("agrees with every record the shelf has a name for", () => {
		const named = SPH_STAR_INDEX.filter((e) => e.solid);
		expect(named.length).toBeGreaterThan(50);
		const wrong: string[] = [];
		for (const e of named) {
			const name = e.solid!.toLowerCase();
			// "crossed antiprism" contains "prism" too, so antiprism is tested first.
			const fromName: SphStarKind = name.includes("pyramid")
				? "pyramid"
				: name.includes("antiprism")
					? "antiprism"
					: name.includes("prism")
						? "prism"
						: "other";
			if (sphStarKind(e) !== fromName) wrong.push(`${e.id} "${e.solid}": structure=${sphStarKind(e)} name=${fromName}`);
		}
		expect(wrong, wrong.join("; ")).toEqual([]);
	});

	it("classifies every record on the shelf, and every class has members", () => {
		const counts = new Map<SphStarKind, number>();
		for (const e of SPH_STAR_INDEX) counts.set(sphStarKind(e), (counts.get(sphStarKind(e)) ?? 0) + 1);
		const total = [...counts.values()].reduce((a, b) => a + b, 0);
		expect(total).toBe(SPH_STAR_INDEX.length);
		for (const k of ["pyramid", "prism", "antiprism", "other"] as const) {
			expect(counts.get(k) ?? 0, `no ${k} on the shelf`).toBeGreaterThan(0);
		}
	});

	it("takes a crossed antiprism as an antiprism", () => {
		// The crossing is in how the band is joined, not in the structure this asks about: two {n/d} faces,
		// 2n triangles, 2n vertices, 4n edges either way.
		const crossed = SPH_STAR_INDEX.find((e) => e.solid?.includes("crossed antiprism"));
		expect(crossed).toBeDefined();
		expect(sphStarKind(crossed!)).toBe("antiprism");
	});

	it("needs the counts, not just the census", () => {
		// A solid with a pyramid's FACES but not its vertex and edge counts is not a pyramid, and a census
		// test alone would pass it. Take a real pyramid and give it one vertex too many.
		const pyramid = SPH_STAR_INDEX.find((e) => sphStarKind(e) === "pyramid")!;
		const faked = { ...pyramid, stats: { ...pyramid.stats, verts: pyramid.stats.verts + 1 } };
		expect(sphStarKind(faked)).toBe("other");
	});
});
