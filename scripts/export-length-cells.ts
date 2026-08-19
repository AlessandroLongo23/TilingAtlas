// Dump every parametric-length family's cell at a GENERIC point of its box, for the Python side to
// check. Generic, not the defaults: at A = B = C the equiangular hexagon is regular, and a tile-shape
// constraint read off that member is a constraint the family does not have.
import { writeFileSync } from "node:fs";
import { evaluateParamCell } from "../lib/utils/paramCell";
// The UN-deduplicated list: every row needs meta, including the ones the dedup then absorbs,
// because the dedup key itself is what the Python side is being asked to compute.
import { LENGTH_FAMILIES_ALL } from "../lib/tilings/length-families";

const PHI = (1 + Math.sqrt(5)) / 2;
const cells: unknown[] = [];
const expect: Record<string, number> = {};
for (const f of LENGTH_FAMILIES_ALL) {
	const def = f.cell.params.map((p) => p.defaultAlphaDeg);
	const t = f.cell.params.map((p, j) => {
		const [lo, hi] = p.alphaRangeDegOpen;
		return lo + (hi - lo) * (0.12 + 0.76 * (((j + 1) * PHI) % 1));
	});
	const c = evaluateParamCell(f.cell, t);
	const rc = (x: ReturnType<typeof evaluateParamCell>) => ({
		cellPolygons: (x.cellPolygons as { n: number; v: [number, number][] }[])
			.map((p) => ({ n: p.n, vertices: p.v })),
		basis: x.basis,
	});
	cells.push({
		id: f.id,
		// generic point: where the PARAMETER COUNT is honest (regularity read at a symmetric member
		// reports a family as rigid)
		renderCell: rc(c),
		// the defaults: where the shelf shows the tiling, so where its k must be measured
		defaultCell: rc(evaluateParamCell(f.cell, def)),
		kTs: f.k ?? 1,
	});
	// A slider is pure scale exactly when scaling ALL of them scales the tiling. Checking only
	// basis[0] is not enough: a family whose first lattice vector happens to be proportional to t
	// while the rest of the cell is not reads as pure scale and its parameter is discounted away.
	// That is what put plen-enum-13 one below the dimension its own map reports.
	const K = 1.37;
	const flat = (c: ReturnType<typeof evaluateParamCell>) => [
		...(c.basis as number[][]).flat(),
		...((c.cellPolygons as { v: [number, number][] }[]) ?? []).flatMap((p) => p.v.flat()),
	];
	const u = flat(evaluateParamCell(f.cell, def));
	const w = flat(evaluateParamCell(f.cell, def.map((v) => v * K)));
	const scale = u.length === w.length && u.every((x, i) => Math.abs(w[i] - K * x) < 1e-9);
	expect[f.id] = f.cell.params.length - (scale ? 1 : 0);
}
writeFileSync("experiments/results/length-cells.json", JSON.stringify(cells));
writeFileSync("experiments/results/length-expect.json", JSON.stringify(expect, null, 1));
console.log(`wrote ${cells.length} cells`);
