// Integrity of the spherical shelf wiring: every catalogue entry in the spherical atlas must point
// (via `spherical.solid`) at a Polyhedron that actually exists in the render registry, or the play page
// silently renders nothing. Guards the J27/J37 addition and any future spherical entry against id drift.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SPHERICAL_SOLIDS, polyhedronForId } from "@/lib/render/sphericalSolids";

interface AtlasEntry {
	id: string;
	spherical?: { solid: string };
}

const atlas = JSON.parse(
	readFileSync(resolve(process.cwd(), "public/reference-atlas-spherical.json"), "utf8"),
) as AtlasEntry[];

describe("spherical catalogue ↔ solid registry wiring", () => {
	it("every spherical catalogue entry resolves to a real Polyhedron", () => {
		const unresolved = atlas
			.filter((e) => !e.spherical || !polyhedronForId(e.spherical.solid))
			.map((e) => `${e.id} -> ${e.spherical?.solid}`);
		expect(unresolved, "catalogue entries with no matching solid").toEqual([]);
	});

	it("the registry holds 18 classical + 10 prisms/antiprisms + 2 k=2 Johnson twins (30 total)", () => {
		expect(SPHERICAL_SOLIDS.length).toBe(30);
		expect(polyhedronForId("triangular-orthobicupola")).not.toBeNull();
		expect(polyhedronForId("pseudo-rhombicuboctahedron")).not.toBeNull();
		expect(polyhedronForId("decagonal-prism")).not.toBeNull();
		expect(polyhedronForId("square-antiprism")).not.toBeNull();
	});

	it("solid ids are unique", () => {
		const ids = SPHERICAL_SOLIDS.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
