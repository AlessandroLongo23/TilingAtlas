import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { UNIFORM_CELLS } from "@/lib/render/uniformCells";
import { tilingToSvg } from "@/lib/render/tilingSvg";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";

// lib/render/uniformCells.ts is a copy of atlas data, kept in source so the error screens can draw
// real specimens with no server to ask (see scripts/extract-uniform-cells.mjs). A copy can rot, so
// this pins it to its source: rebake the atlas without rerunning the script and this fails.

const atlas: ReferenceTiling[] = JSON.parse(
	readFileSync(path.join(process.cwd(), "public/reference-atlas.json"), "utf8"),
);

const eleven = atlas
	.filter((t) => t.source === "galebach" && t.k === 1 && !t.family.includes("*"))
	.sort((a, b) => a.id.localeCompare(b.id));

// Matches the extraction script: `+ 0` folds -0, which JSON.stringify writes as plain 0.
const round = (v: number) => Number(v.toFixed(6)) + 0;

describe("UNIFORM_CELLS", () => {
	it("is the 11 uniform tilings, in atlas order", () => {
		expect(UNIFORM_CELLS.map((c) => c.id)).toEqual(eleven.map((t) => t.id));
	});

	it("still matches public/reference-atlas.json", () => {
		for (const [i, entry] of UNIFORM_CELLS.entries()) {
			const source = eleven[i];
			expect(entry.family).toBe(source.family);

			const cell = source.renderCell as { p?: unknown[]; cellPolygons?: unknown[]; b?: number[][]; basis?: number[][] };
			const polys = (cell.p ?? cell.cellPolygons ?? []) as {
				n?: number;
				v?: number[][];
				vertices?: number[][];
			}[];
			expect(entry.cell.p).toHaveLength(polys.length);
			polys.forEach((poly, j) => {
				const verts = (poly.v ?? poly.vertices ?? []).map((pt) => [round(pt[0]), round(pt[1])]);
				expect(entry.cell.p![j]).toEqual({ n: poly.n ?? verts.length, v: verts });
			});
			expect(entry.cell.b).toEqual((cell.b ?? cell.basis)!.map((row) => row.map(round)));
		}
	});

	it("every cell renders to a drawable patch", () => {
		for (const entry of UNIFORM_CELLS) {
			const svg = tilingToSvg(entry.cell, 12, 1.5);
			expect(svg, entry.id).not.toBeNull();
			expect(svg!.paths.length, entry.id).toBeGreaterThan(0);
			// One path per distinct tile shape, each carrying every copy of it.
			for (const p of svg!.paths) expect(p.d.startsWith("M")).toBe(true);
		}
	});
});
