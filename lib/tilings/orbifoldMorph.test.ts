import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { conePoints, morphTiling, orbifoldName, parseTegulaSymbol, stepOrder } from "@/lib/tilings/orbifoldMorph";

const TRIANGLES = "<1.0:1:1,1,1:3,6>"; // 3^6, one chamber, *632

describe("orbifold morph", () => {
	it("reads the symbol's cone points and names its group", () => {
		const sym = parseTegulaSymbol(TRIANGLES)!;
		expect(orbifoldName(sym)).toBe("*632");
		expect(conePoints(sym).map((p) => [p.kind, p.v, p.mirror])).toEqual([
			["vertex", 6, true],
			["tile", 3, true],
			["edge", 2, true],
		]);
	});

	it("takes {3,6} to {3,7} in the disk and to the icosahedron on the sphere", () => {
		const sym = parseTegulaSymbol(TRIANGLES)!;
		const hyp = morphTiling(sym, [7, 3, 2], "t");
		expect("error" in hyp ? hyp.error : [hyp.name, hyp.geometry, !!hyp.disk]).toEqual(["*732", -1, true]);
		const sph = morphTiling(sym, [5, 3, 2], "t");
		if ("error" in sph || !sph.sphere) throw new Error("no sphere");
		expect([sph.name, sph.sphere.faces.length, sph.sphere.stats.symmetryOrder]).toEqual(["*532", 20, 120]);
	});

	it("refuses what Tegula refuses", () => {
		const sym = parseTegulaSymbol(TRIANGLES)!;
		expect(stepOrder(sym, [3, 3, 2], 0, 2)).toBeNull(); // a vertex of degree 2
		expect(stepOrder(sym, [6, 3, 2], 2, 3)).toBeNull(); // an edge's order is fixed
		expect(stepOrder(sym, [6, 3, 2], 0, 7)).toEqual([7, 3, 2]);
	});

	// The load-bearing check: at the catalogued orders every Tegula type develops to the tiling the shelf
	// ships, tile for tile and colour for colour on the plane (one period cell), tile for tile on the sphere.
	it("reproduces every shipped Tegula type at its own orders", () => {
		const rows = ["reference-atlas-tegula.json.gz", "reference-atlas-tegula-sph.json.gz"].flatMap((f) =>
			JSON.parse(gunzipSync(readFileSync(`public/${f}`)).toString()),
		);
		const bad = rows.filter((r) => {
			const sym = parseTegulaSymbol(r.note)!;
			const m = morphTiling(
				sym,
				conePoints(sym).map((p) => p.v),
				r.id,
			);
			if ("error" in m) return true;
			// Same tiles, and on the plane the same colours: the shelf's hue per class, read back off the data.
			if (r.tegula) {
				const hues = (ps: { hue?: number }[]) => ps.map((p) => p.hue).sort((a, b) => a! - b!);
				return JSON.stringify(hues(m.cell?.cellPolygons ?? [])) !== JSON.stringify(hues(r.tegula.polys));
			}
			return m.sphere?.faces.length !== r.sphPoly.faces.length;
		});
		expect(rows.length).toBe(2235);
		expect(bad.map((r) => r.id)).toEqual([]);
	}, 120_000);
});
