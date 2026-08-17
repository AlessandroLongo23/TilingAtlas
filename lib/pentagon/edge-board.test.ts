import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	BOARD_CORNERS,
	BOARD_SIDES,
	closureMatrix,
	letterAngle,
	letterLength,
	PENT_EDGE_DEFAULTS,
	pinnedAngles,
	SIDE_KEYS,
	solveEdgeBoard,
	validTRange,
	type PentEdgeParams,
} from "./edge-board";
import { developPentEdges, type PentEdgeRecord } from "./edgeDevelop";
import { useConfiguration } from "@/stores/configuration";
import { decodeAtlas } from "@/lib/services/atlasCodec";

const K2 = "public/pentagon-edges/pe1-k2.json";
const K4 = "public/pentagon-edges/pe1-k4.json";
const anyShard = existsSync(K2);
const read = (p: string): PentEdgeRecord[] =>
	decodeAtlas<PentEdgeRecord>(JSON.parse(readFileSync(p, "utf8")));

const solved = (p: Partial<PentEdgeParams> = {}) => {
	const r = solveEdgeBoard({ ...PENT_EDGE_DEFAULTS, ...p });
	if (!r.ok) throw new Error(`solve failed: ${r.error}`);
	return r.board;
};

describe("the split-side pentagon board", () => {
	it("is a hexagon: six sides, class b twice, and 720 degrees of interior angle", () => {
		expect(BOARD_CORNERS.length).toBe(6);
		expect(BOARD_SIDES.length).toBe(6);
		expect(BOARD_SIDES.filter((s) => s === "b").length).toBe(2);
		// The flat vertex is what makes a five-sided tile into a six-edged one.
		expect(BOARD_CORNERS).toContain("Pi");
		const b = solved();
		const sum = b.cornerAngles.reduce((a, c) => a + c, 0);
		expect((sum * 180) / Math.PI).toBeCloseTo(720, 9);
	});

	it("pins C by type 1's constraint and E by the 540 degree sum", () => {
		const a = pinnedAngles(120, 100, 110);
		expect(a.B + a.C).toBeCloseTo(180, 12);
		expect(a.A + a.B + a.C + a.D + a.E).toBeCloseTo(540, 12);
	});

	it("leaves b free, and that is type 1's constraint doing it", () => {
		// The b column of the closure matrix vanishes because the two b-edges are antiparallel: the
		// heading between them is (180-B) + (180-C) + 0 = 360 - (B+C), which is 180 exactly when
		// B + C = 180. So this is not a coincidence of one parameter point — it is the family.
		for (const [A, B, D] of [
			[120, 100, 110],
			[110, 130, 100],
			[130, 45, 120],
			[100, 90, 130],
		]) {
			const M = closureMatrix(pinnedAngles(A, B, D));
			const j = SIDE_KEYS.indexOf("b");
			expect(Math.hypot(M[0][j], M[1][j])).toBeLessThan(1e-12);
		}
		// And changing b really does keep the tile closed.
		for (const b of [0.2, 0.8, 3.5]) expect(solved({ b }).closure).toBeLessThan(1e-9);
	});

	it("closes at every point of its own family", () => {
		for (const t of [0, 0.25, 0.5, 0.75, 1]) {
			const b = solved({ t });
			expect(b.closure).toBeLessThan(1e-9);
			for (const k of SIDE_KEYS) expect(b.sides[k]).toBeGreaterThan(0);
		}
	});

	it("does NOT close at lib/pentagon's type 1 side defaults, which describe another tiling", () => {
		// The finding that made this board need its own solver: type 1's stored b/a and c/a are for the
		// standard type 1 tiling, not this split-side one, and leave the hexagon open by ~0.61.
		const ang = pinnedAngles(120, 100, 110);
		const M = closureMatrix(ang);
		const defaults = { a: 1, b: 2.253835, c: 2.251052, d: 1, e: 1 };
		const x = SIDE_KEYS.reduce((s, k, j) => s + M[0][j] * defaults[k], 0);
		const y = SIDE_KEYS.reduce((s, k, j) => s + M[1][j] * defaults[k], 0);
		expect(Math.hypot(x, y)).toBeGreaterThan(0.5);
	});

	it("gives a t range on which every side stays positive", () => {
		const range = validTRange(pinnedAngles(120, 100, 110))!;
		expect(range).not.toBeNull();
		expect(range[0]).toBeLessThan(range[1]);
	});

	it("is where the configuration store starts, so the two views open on the same pentagon", () => {
		// The store spells the defaults out instead of importing them (it keeps no dependency on a shelf),
		// so this is what stops the two drifting: the flat canvas and the conformal lens both build from
		// `pentParams`, and a mismatch here would put them on different points of the family at load.
		expect(useConfiguration.getState().pentParams).toEqual(PENT_EDGE_DEFAULTS);
	});

	it("refuses a parameter point that is not a pentagon", () => {
		expect(solveEdgeBoard({ ...PENT_EDGE_DEFAULTS, A: 400 }).ok).toBe(false);
		expect(solveEdgeBoard({ ...PENT_EDGE_DEFAULTS, b: -1 }).ok).toBe(false);
	});

	it("reads the certificate alphabet: corners, the flat vertex, and zero-angle digons", () => {
		const b = solved();
		expect(letterAngle("Pi", b)).toBeCloseTo(Math.PI, 12);
		expect((letterAngle("A5", b) * 180) / Math.PI).toBeCloseTo(b.angles.A, 9);
		expect(letterAngle("B12", b)).toBe(0); // a digon is a marker, never a corner
		expect(letterLength("B12", b)).toBeCloseTo(b.sides.b, 12);
		expect(letterLength("D10", b)).toBeCloseTo(b.sides.d, 12);
	});
});

describe.skipIf(!anyShard)("developing a shipped record", () => {
	it("realises the bare board, and it is the one record with nothing drawn", () => {
		const recs = read(K2);
		const bare = recs.filter((r) => !r.drawn.includes("1"));
		expect(bare.length).toBe(1);
		const scene = developPentEdges(bare[0], solved(), { radius: 8 });
		expect(scene.edges.length).toBeGreaterThan(50);
		expect(scene.edges.every((e) => !e.drawn)).toBe(true);
	});

	it("puts every developed edge at one of the five class lengths", () => {
		const board = solved();
		const lens = SIDE_KEYS.map((k) => board.sides[k]);
		for (const rec of read(K4).slice(0, 12)) {
			const s = developPentEdges(rec, board, { radius: 6 });
			for (const e of s.edges) {
				const d = Math.hypot(s.vertices[e.u].x - s.vertices[e.v].x, s.vertices[e.u].y - s.vertices[e.v].y);
				expect(Math.min(...lens.map((L) => Math.abs(d - L)))).toBeLessThan(1e-9);
			}
		}
	});

	it("closes every interior vertex out of the tile's own corner angles", () => {
		// The geometric statement of the certificate's claim: around any interior vertex the angular
		// gaps between consecutive edges are corners of the tile, and they fill the full turn.
		const board = solved();
		const corners = board.cornerAngles;
		let checked = 0;
		for (const rec of read(K4).slice(0, 6)) {
			const s = developPentEdges(rec, board, { radius: 6 });
			const inc = new Map<number, number[]>();
			for (const e of s.edges) {
				for (const [p, q] of [[e.u, e.v], [e.v, e.u]] as const) {
					const th = Math.atan2(s.vertices[q].y - s.vertices[p].y, s.vertices[q].x - s.vertices[p].x);
					const list = inc.get(p) ?? [];
					list.push(th);
					inc.set(p, list);
				}
			}
			for (const [v, ths] of inc) {
				if (Math.hypot(s.vertices[v].x, s.vertices[v].y) > 3) continue; // interior only
				const a = [...ths].sort((x, y) => x - y);
				let total = 0;
				for (let i = 0; i < a.length; i++) {
					const gap = ((a[(i + 1) % a.length] - a[i] + 2 * Math.PI) % (2 * Math.PI)) || 2 * Math.PI;
					total += gap;
					expect(Math.min(...corners.map((c) => Math.abs(gap - c)))).toBeLessThan(1e-5);
				}
				expect(total).toBeCloseTo(2 * Math.PI, 6);
				checked++;
			}
		}
		expect(checked).toBeGreaterThan(50);
	});

	it("keeps the COMBINATORICS fixed as the parameters move, which is the whole design", () => {
		// The record ships no geometry, so re-solving at a different point must give a different SHAPE
		// with the same incidence structure. If these counts drifted, the shelf would be shipping a
		// parameter point by accident.
		const rec = read(K4)[3];
		const p1 = solved();
		const p2 = solved({ A: 108, B: 130, D: 96, b: 2.1, t: 0.2 });
		// Bounded by INSTANCE COUNT, not radius: the two parameter points give tiles of different size,
		// so a fixed radius would cover different amounts of tiling and compare nothing.
		const bound = { radius: Infinity, budget: 900 };
		const s1 = developPentEdges(rec, p1, bound);
		const s2 = developPentEdges(rec, p2, bound);
		expect(s2.vertices.length).toBe(s1.vertices.length);
		expect(s2.edges.length).toBe(s1.edges.length);
		expect(s2.edges.filter((e) => e.drawn).length).toBe(s1.edges.filter((e) => e.drawn).length);
		// ...and the shapes really are different, or the test above proves nothing.
		expect(Math.abs(p2.sides.c - p1.sides.c)).toBeGreaterThan(1e-3);
	});
});
