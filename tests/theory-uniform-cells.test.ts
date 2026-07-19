import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { buildCellMesh } from "@/lib/render/buildCellMesh";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

// /theory embeds the 11 uniform tilings' render cells straight from the reference atlas (see
// app/(app)/theory/page.tsx). Guard the contract: all 11 ids present, every cell mesh-buildable,
// and every markdown card tag resolves to one of them.

const UNIFORM_IDS = [
	"t1001", "t1002", "t1003", "t1004", "t1005", "t1006",
	"t1007", "t1008", "t1009", "t1010", "t1011",
];

const atlas = JSON.parse(
	readFileSync(path.join(process.cwd(), "public", "reference-atlas.json"), "utf8"),
) as { id: string; k: number; renderCell: TranslationalCellData }[];

describe("theory page uniform-tiling cells", () => {
	it("finds all 11 uniform tilings (k=1) in the reference atlas", () => {
		const byId = new Map(atlas.map((t) => [t.id, t]));
		for (const id of UNIFORM_IDS) {
			const t = byId.get(id);
			expect(t, `atlas entry ${id}`).toBeDefined();
			expect(t!.k).toBe(1);
		}
	});

	it("builds a non-empty render mesh for every uniform tiling", () => {
		const byId = new Map(atlas.map((t) => [t.id, t]));
		for (const id of UNIFORM_IDS) {
			const mesh = buildCellMesh(byId.get(id)!.renderCell);
			expect(mesh, `mesh for ${id}`).not.toBeNull();
			expect(mesh!.fillVertexCount).toBeGreaterThan(0);
			expect(mesh!.strokeVertexCount).toBeGreaterThan(0);
		}
	});

	it("every tiling-card tag in the theory markdown references a known uniform id", () => {
		const md = readFileSync(
			path.join(process.cwd(), "public", "theory", "uniform-tilings.md"),
			"utf8",
		);
		const refs = [...md.matchAll(/<tiling-card[^>]*\btiling="([^"]+)"/g)].map((m) => m[1]);
		expect(refs.length).toBeGreaterThanOrEqual(11);
		for (const id of refs) expect(UNIFORM_IDS, `markdown references ${id}`).toContain(id);
		// And the page shows each of the 11 at least once.
		for (const id of UNIFORM_IDS) expect(refs, `markdown missing ${id}`).toContain(id);
	});
});
