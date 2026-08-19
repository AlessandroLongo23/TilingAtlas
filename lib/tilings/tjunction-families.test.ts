import { describe, it, expect } from "vitest";
import { evaluateParamCell } from "@/lib/utils/paramCell";
import { TJUNCTION_ROWS } from "@/lib/tilings/length-families";

type Pt = [number, number];
const inPoly = (p: Pt, vs: Pt[]) => { let h = false;
	for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
		const [xi, yi] = vs[i], [xj, yj] = vs[j];
		if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) h = !h;
	} return h; };

describe("T-junction families are real tilings across their whole slider box", () => {
	it("covers every sample exactly once, at the box corners and centre", () => {
		// Every one of these was covering-checked in Python before it was emitted
		// (emit_tjunction_families.py drops anything that fails). This re-checks them on the SHIPPED
		// bytes, which is the part Python never saw. Once the shelf stopped shipping the same family
		// twenty times the whole set fits in the budget, so it no longer samples every twelfth row —
		// a sample of duplicates is not a sample.
		for (const row of TJUNCTION_ROWS) {
			const ps = row.cell.params;
			// the generic default, and two opposite corners of the fitted box
			const picks = [
				ps.map((p) => p.defaultAlphaDeg),
				ps.map((p) => p.alphaRangeDegOpen[0]),
				ps.map((p, j) => p.alphaRangeDegOpen[j % 2]),
			];
			for (const t of picks) {
				const cell = evaluateParamCell(row.cell, t);
				const [t1, t2] = cell.basis as number[][];
				const polys = (cell.cellPolygons as { v: Pt[] }[]) ?? [];
				const long = Math.max(Math.hypot(t1[0], t1[1]), Math.hypot(t2[0], t2[1]));
				const short = Math.min(Math.hypot(t1[0], t1[1]), Math.hypot(t2[0], t2[1]));
				const det = Math.abs(t1[0] * t2[1] - t1[1] * t2[0]);
				expect(det, `${row.id} degenerate lattice`).toBeGreaterThan(1e-9);
				const span = long * 2;
				const R = Math.ceil(span / Math.min(short, det / long)) + 2;
				for (let s = 1; s <= 6; s++) {
					const p: Pt = [((s * Math.SQRT2) % 1) * span - span / 2, ((s * Math.E) % 1) * span - span / 2];
					let n = 0;
					for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
						const q: Pt = [p[0] - i * t1[0] - j * t2[0], p[1] - i * t1[1] - j * t2[1]];
						for (const poly of polys) if (inPoly(q, poly.v)) n++;
					}
					expect(n, `${row.id} t=[${t.map((x) => x.toFixed(2))}]`).toBe(1);
				}
			}
		}
	});

	it("every family has at least one parameter, and the default sits strictly inside the box", () => {
		expect(TJUNCTION_ROWS.length).toBeGreaterThan(0);
		for (const r of TJUNCTION_ROWS) {
			expect(r.cell.params.length, r.id).toBeGreaterThanOrEqual(1);
			expect(r.k, r.id).toBeGreaterThanOrEqual(1);
			for (const p of r.cell.params) {
				const [lo, hi] = p.alphaRangeDegOpen;
				expect(p.defaultAlphaDeg, `${r.id} default outside its range`).toBeGreaterThan(lo);
				expect(p.defaultAlphaDeg, `${r.id} default outside its range`).toBeLessThan(hi);
			}
		}
	});

	it("the default is a GENERIC member, not the developed one", () => {
		// The developed member (every edge 1) is the box centre and the most symmetric point of the cone:
		// distinct edges coincide there and vertex orbits fuse, so k read there is the wrong number for
		// almost every tiling in the family, and the card would draw the one member that misrepresents it.
		// That is how byte-identical geometry came to ship filed under both k = 1 and k = 2.
		for (const r of TJUNCTION_ROWS) {
			const def = r.cell.params.map((p) => p.defaultAlphaDeg);
			const centre = r.cell.params.map((p) => (p.alphaRangeDegOpen[0] + p.alphaRangeDegOpen[1]) / 2);
			const off = Math.max(...def.map((v, i) => Math.abs(v - centre[i])));
			expect(off, `${r.id} defaults sit at the developed member`).toBeGreaterThan(1e-6);
			expect(new Set(def.map((v) => v.toFixed(6))).size, `${r.id} defaults are not distinct`)
				.toBe(def.length);
		}
	});
});
