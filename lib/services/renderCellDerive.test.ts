// Pins the contract that lets 200 MB of renderCell stay out of the shipped atlas: for every record
// that ships without one, exactSource must reproduce the same cell, and the lazy accessor must hand it
// to a consumer that just reads `t.renderCell`.
//
// This reads the real corpus deliberately. The claim being defended is about THIS data, not about a
// fixture: a future builder change that alters how exactSource is written would break the derivation
// silently, and the shipped file would then have no cell for those tilings at all.

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import {
	hydrateRenderCells,
	renderCellFromExactSource,
	reproducesRenderCell,
	type CellShape,
} from "@/lib/services/renderCellDerive";

const ATLAS = path.join(process.cwd(), "public", "reference-atlas.json");
const ring = CyclotomicRing.create(24);
setActiveRing(ring);

const records: any[] = fs.existsSync(ATLAS)
	? decodeAtlas(JSON.parse(fs.readFileSync(ATLAS, "utf8")))
	: [];

describe.skipIf(!records.length)("renderCell derivation over the shipped atlas", () => {
	it("ships most of the atlas with no renderCell at all", () => {
		const without = records.filter((t) => t.renderCell === undefined);
		expect(without.length).toBeGreaterThan(records.length * 0.9);
		// …and every one of those has something to derive from, or it would render nothing.
		expect(without.every((t) => t.exactSource)).toBe(true);
	});

	it("keeps a cell for exactly the records that cannot derive one", () => {
		for (const t of records) {
			if (t.renderCell === undefined) continue;
			// A kept cell is either sourceless, or its exact source will not reconstruct in ζ₂₄
			// (the 9-fold and 5-fold stars), or it reconstructs to something different.
			if (!t.exactSource) continue;
			const d = (() => {
				try {
					return renderCellFromExactSource(ring, t.id, t.exactSource);
				} catch {
					return null;
				}
			})();
			expect(d === null || !reproducesRenderCell(t.renderCell, d as CellShape)).toBe(true);
		}
	});

	it("the lazy accessor hands a consumer a drawable cell", () => {
		const stripped = records.filter((t) => t.renderCell === undefined).slice(0, 40);
		hydrateRenderCells(stripped);
		for (const t of stripped) {
			const cell = t.renderCell; // exactly what all 72 consumers do
			expect(cell).toBeTruthy();
			expect(cell.cellPolygons.length).toBeGreaterThan(0);
			expect(cell.basis).toHaveLength(2);
			for (const p of cell.cellPolygons) expect(p.vertices.length).toBeGreaterThanOrEqual(3);
		}
	});

	it("caches: the accessor collapses to a plain value after the first read", () => {
		const one = records.filter((t) => t.renderCell === undefined).slice(0, 1);
		hydrateRenderCells(one);
		const a = one[0].renderCell;
		const b = one[0].renderCell;
		expect(b).toBe(a); // same object, not re-derived
		expect(Object.getOwnPropertyDescriptor(one[0], "renderCell")?.get).toBeUndefined();
	});

	it("leaves a record that already has a cell untouched", () => {
		const kept = records.find((t) => t.renderCell !== undefined);
		if (!kept) return;
		const before = kept.renderCell;
		hydrateRenderCells([kept]);
		expect(kept.renderCell).toBe(before);
	});
});
