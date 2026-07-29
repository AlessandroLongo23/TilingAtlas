import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildTilingFromCell } from "@/lib/render/buildPatchTiling";
import { GenericPolygon } from "@/classes/polygons/GenericPolygon";
import { evaluateParamCell, type ParametricCellData } from "@/lib/utils/paramCell";
import type { TranslationalCellData } from "@/classes/algorithm/types";

/**
 * `buildTilingFromCell` can rebuild INTO a previous grid instead of allocating a new one — the optimisation
 * that makes a parametric-angle drag free of the ~180 000 object allocations it used to cost per tick. The
 * whole thing rests on "identical output either way", so that is what these tests check: not that it is
 * faster, but that the reused grid is indistinguishable from the fresh one, and that a shape mismatch falls
 * back instead of writing garbage. See docs/DEVELOPMENT_NOTES.md §104c.
 */
const shelfPath = path.join(process.cwd(), "public", "reference-atlas-mixed.json");
const shelf: { id: string; paramCell?: ParametricCellData }[] = fs.existsSync(shelfPath)
	? JSON.parse(fs.readFileSync(shelfPath, "utf8"))
	: [];

const family = shelf.find((r) => r.id === "ctrnact-mixed-family-k2-01" && r.paramCell)
	?? shelf.find((r) => r.paramCell);

/** Everything a draw path reads off a node, flattened for comparison. */
function snapshot(t: ReturnType<typeof buildTilingFromCell>): string {
	const parts: (number | string | boolean)[] = [t.nodes.length, t.maxRadius ?? 0];
	for (const n of t.nodes) {
		const g = n as GenericPolygon;
		parts.push(g.n, g.name ?? "", g.hue ?? 0, !!g.isStar, g.angle ?? 0, g.interior_angle ?? 0);
		for (const v of g.vertices) parts.push(v.x, v.y);
		for (const v of g.halfways) parts.push(v.x, v.y);
		parts.push(g.centroid.x, g.centroid.y, g.anchor.x, g.anchor.y, g.dir.x, g.dir.y);
	}
	return parts.join("|");
}

const cellAt = (pc: ParametricCellData, deg: number[]) =>
	evaluateParamCell(pc, deg) as unknown as TranslationalCellData;

describe.skipIf(!family)("buildTilingFromCell in-place reuse", () => {
	const pc = family!.paramCell!;
	const lo = pc.params.map((p) => p.alphaRangeDegOpen[0] + (p.alphaRangeDegOpen[1] - p.alphaRangeDegOpen[0]) * 0.3);
	const hi = pc.params.map((p) => p.alphaRangeDegOpen[0] + (p.alphaRangeDegOpen[1] - p.alphaRangeDegOpen[0]) * 0.7);

	it("reused grid is identical to a freshly built one", () => {
		// A drag is exactly this: build at one angle, then rebuild at the next INTO the same grid.
		const prev = buildTilingFromCell(cellAt(pc, lo), 2, 2);
		const reused = buildTilingFromCell(cellAt(pc, hi), 2, 2, null, prev);
		const fresh = buildTilingFromCell(cellAt(pc, hi), 2, 2);
		expect(reused).toBe(prev); // it really did write in place, not quietly allocate
		expect(snapshot(reused)).toBe(snapshot(fresh));
	});

	it("holds across a whole sweep, so error cannot accumulate", () => {
		// Writing in place means each rebuild starts from the previous one's memory; if any field were left
		// stale, the drift would show up after several steps, not after one.
		let rolling = buildTilingFromCell(cellAt(pc, lo), 2, 2);
		for (let k = 1; k <= 6; k++) {
			const at = pc.params.map((_, j) => lo[j] + ((hi[j] - lo[j]) * k) / 6);
			rolling = buildTilingFromCell(cellAt(pc, at), 2, 2, null, rolling);
			expect(snapshot(rolling), `step ${k}`).toBe(snapshot(buildTilingFromCell(cellAt(pc, at), 2, 2)));
		}
	});

	it("falls back to a fresh build when the grid radius changed", () => {
		const prev = buildTilingFromCell(cellAt(pc, lo), 2, 2);
		const bigger = buildTilingFromCell(cellAt(pc, lo), 3, 3, null, prev);
		expect(bigger).not.toBe(prev);
		expect(snapshot(bigger)).toBe(snapshot(buildTilingFromCell(cellAt(pc, lo), 3, 3)));
		expect(prev.nodes.length).toBeLessThan(bigger.nodes.length);
	});

	it("falls back when the node shapes no longer match", () => {
		// A grid of the same node COUNT but different polygon degrees must not be overwritten — the vertex
		// arrays would be the wrong length. Fake it by handing back a grid built from a different family.
		const other = shelf.find((r) => r.paramCell && r.id !== family!.id);
		if (!other) return;
		const mine = buildTilingFromCell(cellAt(pc, lo), 2, 2);
		const mineBefore = snapshot(mine);
		const theirs = buildTilingFromCell(cellAt(other.paramCell!, other.paramCell!.params.map((p) => p.defaultAlphaDeg)), 2, 2);
		const out = buildTilingFromCell(cellAt(pc, hi), 2, 2, null, theirs);
		expect(snapshot(out)).toBe(snapshot(buildTilingFromCell(cellAt(pc, hi), 2, 2)));
		// and a grid that was NOT offered for reuse is never touched
		expect(snapshot(mine)).toBe(mineBefore);
	});

	it("omitting the reuse argument still allocates, so callers that share a grid stay safe", () => {
		const a = buildTilingFromCell(cellAt(pc, lo), 2, 2);
		const b = buildTilingFromCell(cellAt(pc, hi), 2, 2);
		expect(b).not.toBe(a);
		expect(snapshot(a)).not.toBe(snapshot(b)); // different angle ⇒ different geometry, so `a` was not touched
	});
});
