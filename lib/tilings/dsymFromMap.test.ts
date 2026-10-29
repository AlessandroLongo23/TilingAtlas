/* eslint-disable @typescript-eslint/no-explicit-any -- rows straight off the shipped JSON */
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { kUniformity, minimalImage } from "@/lib/classes/algorithm/delaney/DSymbol";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import { vertexConfig } from "@/lib/services/morphRelatives";
import { hydrateRenderCells } from "@/lib/services/renderCellDerive";
import { cellDSymbol, dartsDSymbol, solidDSymbol } from "@/lib/tilings/dsymFromMap";
import { referenceToCatalogue } from "@/lib/services/referenceAtlas";
import { conePoints, morphTiling, orbifoldName, parseTegulaSymbol, withOrders } from "@/lib/tilings/orbifoldMorph";
import { recordShape, recordSymbol } from "@/lib/tilings/recordSymbol";

const load = (f: string) => JSON.parse(gunzipSync(readFileSync(f)).toString());
const key = (s: Parameters<typeof minimalImage>[0] | null) => (s ? minimalImage(s).canonicalKey() : null);

// The ground truths: Tegula ships every type's symbol, and a k-uniform tiling's symbol has k vertex classes.
describe("symbols read off the atlas's own geometry", () => {
	it("gives every Tegula type its shipped symbol, from the plane skeleton and from the solid", () => {
		const bad: string[] = [];
		for (const r of load("public/reference-atlas-tegula.json.gz")) {
			const cell = {
				basis: r.tegula.basis,
				cellPolygons: r.tegula.polys.map((q: { v: number[][] }) => ({ vertices: q.v })),
			};
			if (key(cellDSymbol(cell)) !== key(parseTegulaSymbol(r.note))) bad.push(r.id);
		}
		for (const r of load("public/reference-atlas-tegula-sph.json.gz"))
			if (key(solidDSymbol(r.sphPoly.vertices, r.sphPoly.faces)) !== key(parseTegulaSymbol(r.note))) bad.push(r.id);
		expect(bad).toEqual([]);
	});

	it("names the eleven Archimedean tilings' groups and counts k on the k-uniform shelf", () => {
		const rows = hydrateRenderCells(decodeAtlas<any>(load("public/reference-atlas.json.gz")));
		const groups = Object.fromEntries(
			rows
				.filter((r: any) => /^t10(0\d|1[01])$/.test(r.id))
				.map((r: any) => {
					const s = cellDSymbol(r.renderCell)!;
					return [vertexConfig(s), orbifoldName(s)];
				}),
		);
		expect(groups).toMatchObject({
			"3.3.3.3.6": "632",
			"3.3.3.4.4": "2*22",
			"3.3.4.3.4": "4*2",
			"4.8.8": "*442",
			"3.4.6.4": "*632",
		});
		// Every 10th regular-polygon row (star families excepted: their topology can be more symmetric than
		// the drawing, as stars with different point angles meet the same way).
		const bad = rows
			.filter((r: any, i: number) => i % 10 === 0 && !String(r.id).includes("star") && !String(r.id).includes("s24f"))
			.filter((r: any) => kUniformity(cellDSymbol(r.renderCell)!) !== r.k)
			.map((r: any) => r.id);
		expect(bad).toEqual([]);
	}, 60_000);

	it("finds 3.4.7.4 on the hyperbolic board as the 3.4.6.4 tiling with its hexagons raised to 7", () => {
		const rows = hydrateRenderCells(decodeAtlas<any>(load("public/reference-atlas.json.gz")));
		const sym = cellDSymbol(rows.find((r: any) => r.id === "t1006").renderCell)!;
		const pts = conePoints(sym);
		const vs = pts.map((p) => (p.kind === "tile" && p.v === 6 ? 7 : p.v));
		const hp = decodeAtlas<any>(load("public/hyperbolic-poly/hp7-k1.json.gz"))[0];
		expect(hp.config).toBe("3.4.7.4");
		expect(key(dartsDSymbol(hp.darts, hp.edge))).toBe(key(withOrders(sym, vs)));
	});

	// A star's dent where only one other tile meets it is not a vertex of the topology, so the symbol alone
	// would morph the 12-gons into hexagons and the stars into triangles. The record's drawn shape rides
	// along (recordShape), and the stars and 12-gons come back in every geometry.
	it("keeps 3.3*.4.6.12's stars through a morph", () => {
		const rows = hydrateRenderCells(decodeAtlas<any>(load("public/reference-atlas.json.gz")));
		const t = referenceToCatalogue(rows.find((r: any) => r.id === "ctrnact-star-k7-n0003"));
		const sym = recordSymbol(t)!;
		const shape = recordShape(t);
		const vs = conePoints(sym).map((p) => p.v);
		const same = morphTiling(sym, vs, t.canonicalKey, "sides", shape);
		if ("error" in same || !same.cell) throw new Error("no redraw");
		const corners = (ps: any[]) => ps.map((p) => (p.vertices ?? p.v).length).sort((a: number, b: number) => a - b);
		expect(corners(same.cell.cellPolygons!)).toEqual(corners(t.renderCell?.cellPolygons ?? t.renderCell?.p ?? []));
		const at = (v: number) => {
			const m = morphTiling(sym, [v, ...vs.slice(1)], t.canonicalKey, "sides", shape);
			return "error" in m ? m.error : m.name;
		};
		expect([at(7), at(5)]).toEqual(["732", "532"]);
	});

	// A star whose dents are real vertices (three tiles meet there) is drawn convex by the circle pattern;
	// fitShape pulls it back to the record's angles, so a morph keeps its reflex corners.
	it("keeps a star's reflex corners through a morph into the disk", () => {
		const rows = hydrateRenderCells(decodeAtlas<any>(load("public/reference-atlas.json.gz")));
		const t = referenceToCatalogue(rows.find((r: any) => r.id === "ctrnact-star-k5-n0186"));
		const sym = recordSymbol(t)!;
		const pts = conePoints(sym);
		const vs = pts.map((p) => p.v);
		vs[pts.findIndex((p) => p.kind !== "edge" && p.v > 1)] += 1;
		const m = morphTiling(sym, vs, t.canonicalKey, "sides", recordShape(t));
		if ("error" in m || !m.disk) throw new Error("no disk");
		const reflex = m.disk.darts.alpha!.filter((a) => a > Math.PI + 1e-6).length;
		expect(reflex).toBeGreaterThan(0);
	});
});
