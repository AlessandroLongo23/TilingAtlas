import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { evaluateParamCell, type ParametricCellData } from "@/lib/utils/paramCell";
import { parseBaseCell } from "@/lib/utils/renderTiling";
import { buildTorusMap, type TorusCell, type TorusMap } from "./torusMap";
import { squareTorus, torusClasses } from "./torusSquaring";
import { squaringCell, type SquaringSupport } from "./playSquaring";
import { sqSectors, torusFrame, torusSqDomains } from "./torusSqDomains";

// Two things /play needs that the theory page does not.
//
// FIRST: whether the sliders may drive the construction. They may not. The construction reads only the
// quotient graph — unit conductance on every edge, geometry nowhere — so a FIXED map gives a fixed
// squaring however far α travels. But the map is not fixed under a flex: a vertex sitting on the cell
// boundary reduces into a different representative at a different α, which flips some `vshift`, and
// different vshifts are a different basis of H₁. The family of squarings survives that; the LABELS do
// not, so the same (m, n) can name a different member at a different slider position. That is the whole
// reason the code reads the record's own `renderCell` once instead of the live cell every frame.
//
// SECOND: whether the squaring, written back out as a translation cell for the flat canvas, is still a
// tiling. The canvas draws whatever it is handed; the certificate that the squares tile their torus
// exactly is Σ side² = |det Λ|, the discrete Riemann bilinear relation, and it has to survive the
// rescale that puts the cell at the source tiling's own size.

const ROOT = process.cwd();
const LIMIT = 4;
/** Cheap enough to run the exact solve at every class in the window, several times per record. */
const MAX_EDGES = 20;
const HOW_MANY = 6;

interface AtlasFile {
	geom: { s: { vertices: [number, number][] }[]; v: [number, number][] };
	records: {
		id: string;
		paramCell?: ParametricCellData;
		renderCell?: { b: [[number, number], [number, number]]; i: number[] };
	}[];
}

const atlas = JSON.parse(readFileSync(path.join(ROOT, "public", "reference-atlas-period.json"), "utf8")) as AtlasFile;

/**
 * The shipped `renderCell` is (prototype, placement) index pairs into a shared geometry pool, and the app
 * hydrates it before anything sees it. Reading `i` as a plain list of shape indices — the obvious guess —
 * silently doubles the cell's area, so this mirrors scripts/build-torus-shelf.ts exactly.
 */
function shippedCell(rec: AtlasFile["records"][number]): TorusCell | null {
	const rc = rec.renderCell;
	if (!rc?.i) return null;
	const polygons: [number, number][][] = [];
	for (let k = 0; k < rc.i.length / 2; k++) {
		const shape = atlas.geom.s[rc.i[2 * k]];
		const at = atlas.geom.v[rc.i[2 * k + 1]];
		if (!shape || !at) return null;
		polygons.push(shape.vertices.map((p) => [p[0] + at[0], p[1] + at[1]] as [number, number]));
	}
	return polygons.length > 0 ? { polygons, basis: rc.b } : null;
}

/** Every parameter placed at the same fraction of its own open range. */
function flexedCell(pc: ParametricCellData, t: number): TorusCell | null {
	const alphas = pc.params.map((p) => {
		const [lo, hi] = p.alphaRangeDegOpen;
		return lo + t * (hi - lo);
	});
	const base = parseBaseCell(evaluateParamCell(pc, alphas));
	if (!base) return null;
	return {
		polygons: base.polys.map((p) => p.vertices.map((v) => [v.x, v.y] as [number, number])),
		basis: base.basis,
	};
}

const mapOf = (cell: TorusCell | null): TorusMap | null => {
	if (!cell) return null;
	const b = buildTorusMap(cell);
	return b.ok ? b.map : null;
};

/** The map's gluing, as the multiset of its edges with their lattice shifts. This is what drifts. */
const gluing = (m: TorusMap): string =>
	m.edges.map((e) => `${e.tail}>${e.head}[${e.vshift}]`).sort().join(" ");

const sides = (m: TorusMap, p: number, q: number): string => {
	const r = squareTorus(m, p, q);
	return r.ok === false
		? "none"
		: r.squaring.squares
				.map((s) => s.side)
				.sort((a, b) => Number(a) - Number(b))
				.join(",");
};

describe("the sliders may not drive the construction", () => {
	// Named rather than searched for, so the test says which object it makes a claim about. Five
	// parameters, twelve quotient edges, and every number below was measured on 2026-08-19.
	const rec = atlas.records.find((r) => r.id === "period-k2-044");

	it("has the family the claim is about", () => {
		expect(rec?.paramCell).toBeTruthy();
	});

	it("re-glues the quotient as the family flexes, though the counts never move", () => {
		const pc = rec?.paramCell as ParametricCellData;
		const A = mapOf(flexedCell(pc, 0.25));
		const B = mapOf(flexedCell(pc, 0.75));
		expect(A && B).toBeTruthy();
		if (!A || !B) return;
		// Same graph by every count anyone would check it with...
		expect([A.V, A.E, A.F]).toEqual([B.V, B.E, B.F]);
		// ...and a different map on the torus, because the shifts across the gluing are not the same.
		expect(gluing(A)).not.toBe(gluing(B));
	});

	it("so a fixed class can name a different squaring at a different slider position", () => {
		const pc = rec?.paramCell as ParametricCellData;
		const A = mapOf(flexedCell(pc, 0.25));
		const B = mapOf(flexedCell(pc, 0.75));
		if (!A || !B) throw new Error("both positions must build");
		// (1, 0) survives the re-basing here; (7, 3) does not. Both are worth pinning: the first says the
		// squarings are the same family, the second says the labels are not the same labels — which is
		// exactly the jump a reader would see if the panel rebuilt from the live cell mid-drag.
		expect(sides(A, 1, 0)).toBe(sides(B, 1, 0));
		expect(sides(A, 7, 3)).not.toBe(sides(B, 7, 3));
	});
});

describe("the cell handed to the canvas is still a tiling", () => {
	const picks = atlas.records
		.map((r) => {
			const map = mapOf(shippedCell(r));
			if (!map || map.E > MAX_EDGES || map.E < 4) return null;
			const frame = torusFrame(map);
			const domains = frame ? torusSqDomains(map) : null;
			if (!frame || !domains) return null;
			const support: SquaringSupport = { map, frame, domains, sectors: sqSectors(domains.walls), halfTurn: false };
			return { id: r.id, support };
		})
		.filter((x) => x !== null)
		.slice(0, HOW_MANY);

	it("finds records to check", () => {
		expect(picks.length).toBeGreaterThanOrEqual(3);
	});

	for (const pick of picks) {
		it(`${pick.id}: every class gives squares whose areas sum to the cell's`, () => {
			let checked = 0;
			for (const [m, n] of torusClasses(LIMIT)) {
				const r = squareTorus(pick.support.map, m, n);
				if (r.ok === false) continue;
				const cell = squaringCell(pick.support, r.squaring, false);
				expect(cell, `${pick.id} at (${m}, ${n})`).toBeTruthy();
				if (!cell) continue;
				const base = parseBaseCell(cell);
				expect(base).toBeTruthy();
				if (!base) continue;

				// Every tile is an axis-aligned square, which is the claim the whole construction rests on.
				for (const poly of base.polys) {
					expect(poly.vertices).toHaveLength(4);
					const w = poly.vertices[1].x - poly.vertices[0].x;
					const h = poly.vertices[2].y - poly.vertices[1].y;
					expect(Math.abs(w - h)).toBeLessThan(1e-9 * Math.max(1, Math.abs(w)));
				}

				// Σ side² = |det Λ|: the squares cover their torus once, no gap and no overlap.
				const area = base.polys.reduce((a, p) => {
					const s = p.vertices[1].x - p.vertices[0].x;
					return a + s * s;
				}, 0);
				const [[ax, ay], [bx, by]] = base.basis;
				const covol = Math.abs(ax * by - ay * bx);
				expect(Math.abs(area - covol)).toBeLessThan(1e-6 * covol);

				// And the rescale put it at the source tiling's own size, so the drawing never opens at an
				// arbitrary zoom however the solve happened to normalise.
				const [[sx, sy], [tx, ty]] = pick.support.map.basis;
				expect(Math.abs(covol - Math.abs(sx * ty - sy * tx))).toBeLessThan(1e-6 * covol);
				checked += 1;
			}
			expect(checked).toBeGreaterThan(0);
		});
	}
});
