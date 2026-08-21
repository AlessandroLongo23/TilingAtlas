// Integrity of the spherical shelf wiring: every catalogue entry in the spherical atlas must point
// (via `spherical.solid`) at a Polyhedron that actually exists in the render registry, or the play page
// silently renders nothing. Guards the J27/J37 addition and any future spherical entry against id drift.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SPHERICAL_SOLIDS, polyhedronForId } from "@/lib/render/sphericalSolids";
import { PLATONIC_SOLIDS } from "@/lib/render/platonicSolids";
import { ARCHIMEDEAN_SOLIDS } from "@/lib/render/archimedeanSolids";
import { PRISM_ANTIPRISM_SOLIDS } from "@/lib/render/prismSolids";
import { decodeAtlas } from "@/lib/services/atlasCodec";

interface AtlasEntry {
	id: string;
	spherical?: { solid: string };
	derivation?: "searched" | "constructed" | "tabulated";
}

const atlas = decodeAtlas<AtlasEntry>(
	JSON.parse(readFileSync(resolve(process.cwd(), "public/reference-atlas-spherical.json"), "utf8")),
);

// HOW the shelf got each record, which the card states and a reader will check against the literature.
// The measurement lives in tools/ctrnact-oracle/annotate_derivation.py — it needs the develop outputs,
// which are gitignored, so this cannot re-measure. What it CAN guarantee from shipped data alone is that
// nothing ships unannotated and that "tabulated" means what it says.
describe("derivation — searched, constructed, or tabulated", () => {
	const CLASSICAL = new Set(
		[...PLATONIC_SOLIDS, ...ARCHIMEDEAN_SOLIDS, ...PRISM_ANTIPRISM_SOLIDS].map((s) => s.id),
	);

	it("every spherical record says how it was derived", () => {
		const bare = atlas.filter((e) => e.spherical && !e.derivation).map((e) => e.id);
		expect(bare, "records with no derivation").toEqual([]);
	});

	it("only the three values, and tabulated is exactly the classical solids", () => {
		const wrong = atlas
			.filter((e) => e.derivation && !["searched", "constructed", "tabulated"].includes(e.derivation))
			.map((e) => `${e.id} -> ${e.derivation}`);
		expect(wrong).toEqual([]);
		// A Johnson or non-convex record calling itself "tabulated" would be claiming closed-form
		// coordinates it does not have; a Platonic one calling itself "searched" would be claiming the
		// engine derived it. Both are the same error and this catches either.
		for (const e of atlas) {
			if (!e.spherical) continue;
			expect(e.derivation === "tabulated", `${e.id} (${e.spherical.solid})`).toBe(
				CLASSICAL.has(e.spherical.solid),
			);
		}
	});

	it("the constructed records are the gyrate/diminished families and nothing else", () => {
		// These reach k = 27 and 29 — no search of ours gets there, so they were built by operating on a
		// parent Archimedean solid. ⚑ This list SHRINKS as the search deepens, and that is the point: a
		// solid moves to "searched" the moment a run finds it. If a deeper run makes this fail, re-run
		// annotate_derivation.py and shorten the list — do not widen the assertion.
		const built = atlas
			.filter((e) => e.derivation === "constructed")
			.map((e) => e.spherical!.solid)
			.sort();
		expect(built.every((s) => /rhombicosidodecahedron/.test(s))).toBe(true);
		// 12 until the k=4 run reproduced two of them by search — metabidiminished-icosahedron and
		// parabigyrate-rhombicosidodecahedron — which is precisely what this field is for.
		expect(built).toHaveLength(10);
	});
});

describe("spherical catalogue ↔ solid registry wiring", () => {
	it("every spherical catalogue entry resolves to a real Polyhedron", () => {
		const unresolved = atlas
			.filter((e) => !e.spherical || !polyhedronForId(e.spherical.solid))
			.map((e) => `${e.id} -> ${e.spherical?.solid}`);
		expect(unresolved, "catalogue entries with no matching solid").toEqual([]);
	});

	it("the registry holds 18 classical + 10 prisms/antiprisms + 76 Johnson + 143 non-convex (247 total)", () => {
		// 12 inscribable ones from develop_spherical, plus 19 from develop_euclid (2026-08-20), of which
		// 14 have no circumsphere and could not have been developed on S2 at any k.
		// The non-convex shelf went 34 -> 69 when the k=3 develop output was re-harvested (2026-08-21):
		// the k=3 harvest had kept only the CONVEX records, so 37 reflex ones were computed and dropped.
		// Then k=4 the same day: +14 Johnson (62 -> 76 of the 92) and +75 non-convex (68 -> 143).
		expect(SPHERICAL_SOLIDS.length).toBe(247);
		expect(polyhedronForId("snub-square-antiprism")).not.toBeNull();
		expect(polyhedronForId("gyrobifastigium")).not.toBeNull();
		expect(polyhedronForId("triangular-orthobicupola")).not.toBeNull();
		expect(polyhedronForId("pseudo-rhombicuboctahedron")).not.toBeNull();
		expect(polyhedronForId("decagonal-prism")).not.toBeNull();
		expect(polyhedronForId("square-antiprism")).not.toBeNull();
		expect(polyhedronForId("gyrate-rhombicosidodecahedron")).not.toBeNull();
		expect(polyhedronForId("tridiminished-icosahedron")).not.toBeNull();
		// the 2-orbit deltahedra (2026-08-20)
		expect(polyhedronForId("snub-disphenoid")).not.toBeNull();
		expect(polyhedronForId("pentagonal-bipyramid")).not.toBeNull();
		// J72–J83 complete: the seven the spherical 3.4.n.4 shelf carried (2026-08-21)
		expect(polyhedronForId("trigyrate-rhombicosidodecahedron")).not.toBeNull();
		expect(polyhedronForId("tridiminished-rhombicosidodecahedron")).not.toBeNull();
		// the non-convex regular-faced shelf (2026-08-21), which no catalogue names
		expect(polyhedronForId("ncx-7-15-10")).not.toBeNull();
		expect(polyhedronForId("ncx-30-60-32-a")).not.toBeNull();
		// the k=3 Johnson run (2026-08-21)
		expect(polyhedronForId("pentagonal-rotunda")).not.toBeNull();
		expect(polyhedronForId("bilunabirotunda")).not.toBeNull();
	});

	it("solid ids are unique", () => {
		const ids = SPHERICAL_SOLIDS.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
