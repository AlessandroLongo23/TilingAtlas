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
import { HEMI_SOLIDS } from "@/lib/render/hemiSolids";
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
	// ⚑ The HEMIPOLYHEDRA are tabulated too (2026-08-25): their coordinates are closed-form, from the
	// uniform-polyhedron literature, and no search of ours produced them.
	const CLASSICAL = new Set(
		[...PLATONIC_SOLIDS, ...ARCHIMEDEAN_SOLIDS, ...PRISM_ANTIPRISM_SOLIDS, ...HEMI_SOLIDS].map((s) => s.id),
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

	it("the registry holds 18 classical + 10 prisms/antiprisms + 84 Johnson + 278 non-convex (401), plus the genus shelves", () => {
		// 12 inscribable ones from develop_spherical, plus 19 from develop_euclid (2026-08-20), of which
		// 14 have no circumsphere and could not have been developed on S2 at any k.
		// The non-convex shelf went 34 -> 69 when the k=3 develop output was re-harvested (2026-08-21):
		// the k=3 harvest had kept only the CONVEX records, so 37 reflex ones were computed and dropped.
		// Then k=4 the same day: +14 Johnson (62 -> 76 of the 92) and +75 non-convex (68 -> 143).
		// k=5 (2026-08-22): +8 Johnson (-> 84 of the 92) and +100 non-convex (-> 243).
		// The STAR run (2026-08-24): +59 non-convex (-> 302), 41 of them with a {n/d} face. Those are the
		// first star-faced records on this shelf, and the first anywhere in the atlas with no circumsphere
		// — develop_spherical cannot express them, since it materialises every vertex as a column of a
		// rotation matrix. The palette was {3,5,5/2} at k=2, a strict SUB-palette of star-wide, so this
		// number is a floor and not a count of anything.
		//
		// Then DOWN, 302 -> 278, on the degeneracy gate of the same day (Marek Čtrnáct, who found it by
		// clicking four links). 24 records were not polyhedra: 4 with two vertices of the map on one point
		// — ncx-7-15-10-a claimed seven vertices and had four distinct ones — and 20 with two faces sharing
		// an edge AND a plane, whose union is the real face and is not regular. The shelf had always
		// dropped the CONVEX records on that second test and shipped the reflex ones, which is why gluing
		// two triangular prisms into a rhombic prism was refused while ncx-10-22-14 shipped.
		// ⚑ ASSERTED AGAINST THE TOROIDAL COUNT, not against a total. The tor- shelf is the one shelf here
		// that is still FILLING — its develop runs for hours and the shelf is rebuilt as each group lands
		// (2026-08-25) — so a hardcoded total would fail on every poll and would be bumped without being
		// read, which is the opposite of what this guard is for. The 390 settled solids are the claim.
		// "genus" here is every non-spherical record: "tor-" at genus 1 and "gen<g>-" above it.
		const genus = SPHERICAL_SOLIDS.filter((s) => s.id.startsWith("tor-") || /^gen\d+-/.test(s.id));
		expect(genus.length, "the genus shelves should not be empty").toBeGreaterThan(0);
		// -> 401 on 2026-08-25: +2 from the isotoxal palette (the DODECAGONAL prism and antiprism — both
		// families are infinite and this shelf holds the prefix the palettes reach, and `isotox-sph` is
		// the first with a 12-gon), and +9 hemipolyhedra, which arrived the same day.
		// -> 407 on 2026-08-31 with the ISOTOXAL-STAR shelf: 6 solids whose star faces are the simple
		// 2n-gon outline, not the self-intersecting {n/d} the star shelf carries. AL described one of
		// them (iso-80-150-72, U30's analogue) before the search could find it; the search's answer is
		// congruent to the hand construction. Five close at chi = 2 and one at chi = -16.
		// -> 415 later the same day, when the search got fast enough to run one palette per star
		// OUTLINE instead of three outlines in one: +8, and seven of the eight are that outline's
		// PRISM. This count rises as the remaining outlines land.
		// -> 420 on 2026-09-01, the first k=3 isotoxal run: capping vertex VALENCE at 5 makes k=3
		// affordable (~400x cheaper than valence 6, which occurs at 20 of the 640 vertices this shelf
		// ships and all 20 in one solid), and it returned five — four genus-9 and one V=15 sphere.
		expect(SPHERICAL_SOLIDS.length - genus.length).toBe(420);
		expect(polyhedronForId("iso-80-150-72")).not.toBeNull();
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
