import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyPatchFaces } from "@/lib/freedraw/faces";
import type { FreedrawPattern } from "@/lib/freedraw/pattern";
import type { Darts } from "@/lib/render/hyperbolicDevelopClient";
import { decodeAtlas } from "@/lib/services/atlasCodec";
import { dartShapeIds, patchShapeIds, rankShapes, shapeClasses } from "@/lib/render/tileShapes";
import { readDataJson } from "../../scripts/atlas/io.mjs";

const read = (path: string): unknown => readDataJson(join(__dirname, "../../public", path));

describe("tile shapes in the disk", () => {
	type Rec = { id: string; edge?: number; darts: Darts & { tileOrbit: number[] }; stats?: { tileOrbits?: number } };
	for (const path of [
		"hyperbolic-edges/e333334-k1.json.br",
		"hyperbolic-edges/e33355-k4.json.br",
		"hyperbolic-edges/e3448-k5.json.br",
		"hyperbolic-edges/e34444-k1.json.br",
		"schwarz-hyp/h237-k3.json.br",
		"schwarz-hyp/h245-k3.json.br",
	])
		it(`agrees with the developer's tile orbits: ${path}`, () => {
			for (const r of read(path) as Rec[]) {
				const ids = dartShapeIds(r.darts, r.edge ?? 1);
				expect(
					r.darts.tileOrbit.every((t, h) => t < 0 === (ids[h] === "")),
					r.id,
				).toBe(true);
				const xs = r.darts.tileOrbit.flatMap((t, h) => (t < 0 ? [] : [{ t, id: ids[h] }]));
				// one tile orbit, one shape; and never more shapes than orbits
				for (const t of new Set(xs.map((x) => x.t)))
					expect(new Set(xs.filter((x) => x.t === t).map((x) => x.id)).size, r.id).toBe(1);
				expect(new Set(xs.map((x) => x.id)).size, r.id).toBeLessThanOrEqual(new Set(xs.map((x) => x.t)).size);
				if (r.stats?.tileOrbits === 1) expect(new Set(xs.map((x) => x.id)).size, r.id).toBe(1);
			}
		});
});

describe("tile shapes in the plane", () => {
	for (const path of [
		"freedraw/4436-solutions-k3.json.br",
		"freedraw/488-solutions-k4.json.br",
		"freedraw/hex-solutions-k3.json.br",
	])
		it(`finite tiles split as the point-set congruence does, where it can tell: ${path}`, () => {
			let checked = 0;
			for (const p of decodeAtlas<FreedrawPattern>(read(path))) {
				const patch = p.patch!;
				if (patch.compRank.some((r) => r !== 0)) continue;
				const ids = patchShapeIds(patch);
				const old = classifyPatchFaces(patch).shape;
				const cells = patch.compCells;
				for (let i = 0; i < ids.length; i++)
					for (let j = 0; j < ids.length; j++) {
						// one shape is one point-set class of one size
						if (ids[i] === ids[j]) expect(old[i] === old[j] && cells[i] === cells[j], p.id).toBe(true);
						// and two tiles the point sets merge are split only when their sizes differ (fd4436-3-00151:
						// 10 cells and 7, whose vertex sets agree)
						else if (old[i] === old[j]) expect(cells[i] !== cells[j], p.id).toBe(true);
					}
				checked++;
			}
			expect(checked).toBeGreaterThan(0);
		});
});

describe("a board's colour order", () => {
	it("ranks the shapes in most tilings first, ties by first sight, and gives the rest stable later hues", () => {
		const ranks = rankShapes([["a", "b"], ["b"], ["c", "b", "a"], ["d"]]);
		expect([...ranks]).toEqual([
			["b", 0],
			["a", 1],
			["c", 2],
			["d", 3],
		]);
		expect(shapeClasses(["c", "b", "zz9"], ranks).slice(0, 2)).toEqual([2, 0]);
		expect(shapeClasses(["zz9"], ranks)).toEqual(shapeClasses(["zz9"], ranks));
		expect(shapeClasses(["q", "r", "q"])).toEqual([0, 1, 0]);
	});
});
