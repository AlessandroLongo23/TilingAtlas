import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { truchetPattern } from "@/lib/render/truchetTiling";
import { figureEscapes, figureSelfIntersects, tileFigure, wiringCrosses } from "@/lib/freedraw/arcs";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import { decodeAtlas } from "@/lib/services/atlasCodec";

const recs = (() => {
	return decodeAtlas<any>(JSON.parse(fs.readFileSync("public/reference-atlas-scaled.json", "utf8")));
})();

describe("the scaled shelf, read as Truchet", () => {
	it("every tile's ports land on unit edges it SHARES, so nothing is left loose", () => {
		let checked = 0;
		for (const r of recs.slice(0, 30)) {
			const p = truchetPattern(r.renderCell as TranslationalCellData, { seed: 9, block: 2 });
			if (!p) continue;
			const patch = p.patch!;
			// Count how many rings use each edge. Interior edges belong to exactly two tiles; the ones on
			// the block's rim belong to one, and their partner is the neighbouring copy.
			const use = new Map<string, number>();
			for (const ring of patch.polys) {
				for (let i = 0; i < ring.length; i++) {
					const a = ring[i][0];
					const b = ring[(i + 1) % ring.length][0];
					const k = a < b ? `${a}|${b}` : `${b}|${a}`;
					use.set(k, (use.get(k) ?? 0) + 1);
				}
			}
			// No edge is used more than twice — a third user would mean a port with two claimants.
			for (const n of use.values()) expect(n).toBeLessThanOrEqual(2);
			// And the interior is genuinely shared, not a set of isolated tiles.
			expect([...use.values()].filter((n) => n === 2).length).toBeGreaterThan(0);
			checked++;
		}
		expect(checked).toBeGreaterThan(20);
	});

	it("every drawing stays embedded and inside its tile, reflex corners and all", () => {
		let tiles = 0;
		let big = 0;
		for (const r of recs.slice(0, 30)) {
			const p = truchetPattern(r.renderCell as TranslationalCellData, { seed: 4, block: 1 });
			if (!p) continue;
			const patch = p.patch!;
			patch.polys.forEach((ring, i) => {
				const corners = ring.map(([vi]) => patch.verts[vi] as readonly [number, number]);
				const w = patch.wirings![i];
				const loops = tileFigure(corners, corners.map(() => true), undefined, w);
				expect(wiringCrosses(w)).toBe(false);
				expect(figureSelfIntersects(loops)).toBe(false);
				expect(figureEscapes(corners, loops)).toBe(false);
				tiles++;
				if (ring.length > 4) big++;
			});
		}
		// The shelf's whole point: the big tiles arrive with their sides already split, so they carry more
		// ports than corners and are the interesting case here.
		expect(big).toBeGreaterThan(20);
		console.log(`checked ${tiles} scaled tiles, ${big} of them with more than four ports`);
	});
});
