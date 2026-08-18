import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { annotatePolygonFacets } from "./polygonFacets";
import {
	polygonSpeciesOf,
	tilePeriodsOf,
	speciesFromPolys,
	periodsFromPolys,
} from "./polygonSpecies";
import { decodeAtlas } from "./atlasCodec";
import type { ReferenceTiling } from "./referenceAtlas";

/** A square and a 12-pointed star at 30°, as the atlas ships cell polygons. */
const square = {
	n: 4,
	vertices: [
		[0, 0],
		[1, 0],
		[1, 1],
		[0, 1],
	],
};
const tri = {
	n: 3,
	vertices: [
		[0, 0],
		[1, 0],
		[0.5, Math.sqrt(3) / 2],
	],
};

const rec = (cellPolygons: unknown[], id = "t1") =>
	({ id, renderCell: { cellPolygons } }) as unknown as ReferenceTiling;

describe("annotatePolygonFacets", () => {
	it("writes both facets on a record whose cell has polygons", () => {
		const r = rec([square, tri]);
		const { annotated, empty } = annotatePolygonFacets([r] as never);
		expect(annotated).toBe(1);
		expect(empty).toBe(0);
		expect(r.polygonSpecies).toEqual(["3", "4"]);
		expect(r.tilePeriods).toEqual([1]);
	});

	it("writes NOTHING on a record whose cell has no polygons", () => {
		// Every decoration row shares one empty cell. Writing `[]` on 342k of them would be pure
		// payload; the reader answers from a shared constant instead.
		const r = rec([]);
		const { annotated, empty } = annotatePolygonFacets([r] as never);
		expect(annotated).toBe(0);
		expect(empty).toBe(1);
		expect(r.polygonSpecies).toBeUndefined();
		expect(r.tilePeriods).toBeUndefined();
	});

	it("counts a record with no renderCell at all as empty", () => {
		const r = { id: "x" } as unknown as ReferenceTiling;
		expect(annotatePolygonFacets([r] as never)).toEqual({ annotated: 0, empty: 1 });
	});
});

describe("the readers prefer the shipped field", () => {
	it("polygonSpeciesOf returns the field WITHOUT touching renderCell", () => {
		let touched = 0;
		const r = { id: "lazy1", polygonSpecies: ["7"] } as unknown as ReferenceTiling;
		Object.defineProperty(r, "renderCell", {
			get() {
				touched++;
				return { cellPolygons: [square] };
			},
		});
		expect(polygonSpeciesOf(r)).toEqual(["7"]);
		// The whole point: the codec ships renderCell as a lazy accessor, and this memo runs over the
		// entire corpus. One touch here is 18 s across /library.
		expect(touched).toBe(0);
	});

	it("tilePeriodsOf returns the field WITHOUT touching renderCell", () => {
		let touched = 0;
		const r = { id: "lazy2", tilePeriods: [3] } as unknown as ReferenceTiling;
		Object.defineProperty(r, "renderCell", {
			get() {
				touched++;
				return { cellPolygons: [square] };
			},
		});
		expect(tilePeriodsOf(r)).toEqual([3]);
		expect(touched).toBe(0);
	});

	it("falls back to the geometry walk when the field is absent", () => {
		expect(polygonSpeciesOf(rec([square, tri], "fallback1"))).toEqual(["3", "4"]);
		expect(tilePeriodsOf(rec([square], "fallback2"))).toEqual([1]);
	});

	it("answers an empty cell from a shared frozen array, so 342k rows cost no cache entries", () => {
		const a = polygonSpeciesOf(rec([], "e1"));
		const b = polygonSpeciesOf(rec([], "e2"));
		expect(a).toEqual([]);
		expect(a).toBe(b); // same object — nothing was allocated or memoised per record
		expect(Object.isFrozen(a)).toBe(true);
	});
});

describe("the shipped field agrees with the geometry walk", () => {
	// The anti-drift gate. annotatePolygonFacets and the runtime fallback must be the SAME walk; if a
	// script ever grows its own copy, this is what catches it. Scans every shipped root shelf rather
	// than one named file, so excluding a single shelf from the migration cannot silently disarm it.
	it("agrees on every annotated record in every shipped root shelf", () => {
		const dir = path.join(process.cwd(), "public");
		if (!fs.existsSync(dir)) return; // corpus not present in this checkout
		const files = fs
			.readdirSync(dir)
			.filter((f) => f.startsWith("reference-atlas") && f.endsWith(".json"));
		let checked = 0;
		let annotatedFiles = 0;
		for (const f of files) {
			const records = decodeAtlas<ReferenceTiling>(
				JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")),
			);
			let hit = 0;
			for (const t of records) {
				if (!t.polygonSpecies) continue;
				// Only records that SHIP a cell — reading a stripped one would fire the ℤ[ζ₂₄] derive
				// and turn this test into a 47-second reconstruction of the whole base atlas.
				const d = Object.getOwnPropertyDescriptor(t, "renderCell");
				if (!d || d.get || !d.value) continue;
				const polys = (d.value.cellPolygons ?? []) as never[];
				if (!polys.length) continue;
				expect(t.polygonSpecies, `${f} ${t.id} species`).toEqual(speciesFromPolys(polys));
				expect(t.tilePeriods, `${f} ${t.id} periods`).toEqual(periodsFromPolys(polys));
				checked++;
				hit++;
			}
			if (hit) annotatedFiles++;
		}
		// If this trips, the corpus has not been through scripts/atlas-annotate-facets.ts and /library
		// is back to walking geometry for every facet chip — 47 s on the base atlas alone, measured.
		expect(annotatedFiles, "no shipped shelf carries polygonSpecies").toBeGreaterThan(0);
		expect(checked).toBeGreaterThan(0);
	});
});
