import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EDGE_BOARD_LABEL, EDGE_BOARD_ORDER } from "@/lib/services/facets";
import { edgeBoardOf, subOf, tileClassOf, type ReferenceTiling } from "@/lib/services/referenceAtlas";
import {
	EU_HALF_BOARDS,
	euHalfKGaps,
	euHalfLazyShardsForK,
	euHalfSubOfBoard,
	type EuHalfBoard,
} from "./eu-half";

// The Euclidean half-polygon shelf. scripts/build-euhalf-shelf.mjs refuses to write anything whose faces
// are the wrong shape, leave a gap, overlap, or fold a vertex past 360°, so this does not re-litigate the
// geometry on all 27,728 records. It guards what that script cannot: that the shipped METADATA says true
// things, that the classification behind "there are exactly four boards" is written down and checked, and
// that every row lands in the right folder.

const atlas = "public/reference-atlas-euhalf.json";
const anyShard = existsSync(atlas);
const eager = (): ReferenceTiling[] => JSON.parse(readFileSync(atlas, "utf8"));
const shipped = (b: EuHalfBoard) => [...b.eagerKs, ...b.lazyKs].sort((x, y) => x - y);

/** Which regular polygon each board halves, and how. Written out here so the test knows the geometry
 *  independently of the board table it is checking. */
const CUT: Record<string, { n: number; kind: "vertex" | "midpoint" | "mirror" }> = {
	hexv: { n: 6, kind: "vertex" },
	pent: { n: 5, kind: "mirror" },
	hexm: { n: 6, kind: "midpoint" },
	sqmid: { n: 4, kind: "midpoint" },
};

describe("board manifest", () => {
	it("gives every board a distinct id, sub and label, and no k both eager and lazy", () => {
		expect(new Set(EU_HALF_BOARDS.map((b) => b.id)).size).toBe(EU_HALF_BOARDS.length);
		expect(new Set(EU_HALF_BOARDS.map(euHalfSubOfBoard)).size).toBe(EU_HALF_BOARDS.length);
		expect(new Set(EU_HALF_BOARDS.map((b) => b.label)).size).toBe(EU_HALF_BOARDS.length);
		for (const b of EU_HALF_BOARDS) {
			expect(shipped(b).length, b.id).toBeGreaterThan(0);
			expect(b.eagerKs.filter((k) => b.lazyKs.includes(k)), b.id).toEqual([]);
			expect(Object.keys(b.counts).map(Number).sort((x, y) => x - y)).toEqual(shipped(b));
			expect(euHalfKGaps(b), b.id).toEqual([]);
		}
	});

	it("accounts for every k the search covered, exactly once", () => {
		// Nothing here is `dropped`: the whole enumeration is on the shelf. What varies is where each
		// board STOPPED, and above `enumeratedTo` the shelf claims nothing at all.
		for (const b of EU_HALF_BOARDS) {
			for (let k = 1; k <= b.enumeratedTo; k++) {
				const claims = [shipped(b).includes(k), b.emptyKs.includes(k)].filter(Boolean).length;
				expect(claims, `${b.id} k=${k} is claimed ${claims} times`).toBe(1);
			}
			for (const k of [...shipped(b), ...b.emptyKs]) {
				expect(k, `${b.id}: k=${k} is above enumeratedTo`).toBeLessThanOrEqual(b.enumeratedTo);
			}
		}
	});

	it("is a tile HALF: two of them are the whole polygon, by angle and by area", () => {
		for (const b of EU_HALF_BOARDS) {
			const { n } = CUT[b.id];
			// A flat m-gon's angles sum to (m-2)*180, which is the first thing a typo in the table breaks.
			expect(b.angles.reduce((s, a) => s + a, 0), b.id).toBeCloseTo((b.angles.length - 2) * 180, 9);
			// And the halves must add back to the regular n-gon. A bisected CORNER adds nothing — the two
			// halves split the original angle — while a MIDPOINT end is a new vertex on a straight edge,
			// reopened as two right angles, so it adds 180. A vertex cut has two corner ends, a midpoint
			// cut two midpoint ends, and the odd mirror one of each.
			const midEnds = { vertex: 0, midpoint: 2, mirror: 1 }[CUT[b.id].kind];
			expect(2 * b.angles.reduce((s, a) => s + a, 0), b.id).toBeCloseTo((n - 2) * 180 + 180 * midEnds, 9);
			// Every angle is a whole number of the ring's units, or the palette could not express it.
			for (const a of b.angles) expect((a * b.D) / 360, `${b.id} angle ${a}`).toBeCloseTo(Math.round((a * b.D) / 360), 9);
		}
	});

	it("carries the side lengths the regular polygon forces", () => {
		for (const b of EU_HALF_BOARDS) {
			const { n, kind } = CUT[b.id];
			expect(b.sides.length, b.id).toBe(b.angles.length);
			// The shelf develops at twice the polygon's side wherever the cut lands on a MIDPOINT, so a
			// half-edge comes out whole; the two vertex-to-vertex boards need no scaling.
			const unit = kind === "vertex" ? 1 : 2;
			const cut = kind === "vertex" ? 1 / Math.sin(Math.PI / n)          // the long diagonal, 2R
				: kind === "midpoint" ? 1 / Math.tan(Math.PI / n)              // the width across
					: 1 / Math.tan(Math.PI / (2 * n)) / 2;                     // R + apothem, the height
			const longest = Math.max(...b.sides);
			expect(longest, `${b.id} cut`).toBeCloseTo(unit * cut, 8);
			// Every other side is the polygon's edge or, on a midpoint cut, half of it.
			for (const s of b.sides) {
				if (Math.abs(s - longest) < 1e-8) continue;
				const ok = Math.abs(s - unit) < 1e-8 || (kind !== "vertex" && Math.abs(s - unit / 2) < 1e-8);
				expect(ok, `${b.id}: side ${s} is neither the edge nor half of it`).toBe(true);
			}
		}
	});

	it("is the WHOLE Euclidean family — the two filters that bound it, re-derived here", () => {
		// FILTER 1, the angles. a*(alpha/2) + b*alpha = 360 with alpha = 180(n-2)/n forces
		// a + 2b = 4 + 8/(n-2) for a vertex cut, so (n-2) must divide 8.
		const vertexOk = (n: number) => n % 2 === 0 && Number.isInteger(8 / (n - 2));
		expect([...Array(40).keys()].map((i) => i + 3).filter(vertexOk)).toEqual([4, 6, 10]);
		// FILTER 2, the edge slots. Each corner at a vertex contributes two edge-slots and each edge is
		// shared by two corners, so every edge type's slot count must be EVEN. On a vertex cut only the
		// two alpha/2 corners touch the long diagonal, so their count `a` must be even — and a + 2b = 5
		// on n=10 makes it odd, which is why the half-decagon has no vertex figure at all.
		const a10 = 4 + 8 / (10 - 2);
		expect(a10).toBe(5);
		expect(a10 % 2, "n=10: a + 2b is odd, so `a` is odd for every solution").toBe(1);
		// What survives, and it is what ships: the two n=6 cuts, the n=5 mirror, the n=4 midpoint. The
		// other two live boards (n=3 mirror, n=4 vertex) are on the planigon and tri45 shelves already.
		expect(EU_HALF_BOARDS.map((b) => `${CUT[b.id].n}${CUT[b.id].kind[0]}`).sort())
			.toEqual(["4m", "5m", "6m", "6v"]);
	});

	it("offers each lazy slice at its own k and nowhere else", () => {
		const lazy = EU_HALF_BOARDS.flatMap((b) => b.lazyKs.map((k) => `${b.id}@${k}`)).sort();
		expect(lazy.length).toBe(19);
		for (const b of EU_HALF_BOARDS) {
			for (let k = 1; k <= b.enumeratedTo; k++) {
				expect(euHalfLazyShardsForK(k).some((x) => x.id === b.id), `${b.id} k=${k}`)
					.toBe(b.lazyKs.includes(k));
			}
		}
	});
});

describe("shelf placement", () => {
	it("gives every tile shape its own folder under the multiple-edge-lengths class", () => {
		// One facet row per SHAPE, not one for the whole family: a trapezoid, a quadrilateral, a pentagon
		// and a domino behind a single chip is not a choice a visitor can make.
		for (const b of EU_HALF_BOARDS) {
			const board = `euh-${b.id}`;
			expect(EDGE_BOARD_ORDER, b.id).toContain(board);
			expect(EDGE_BOARD_LABEL[board as (typeof EDGE_BOARD_ORDER)[number]], b.id).toBeTruthy();
			expect(edgeBoardOf({ source: "euhalf", euHalfBoard: b.id }), b.id).toBe(board);
		}
		expect(EDGE_BOARD_ORDER.length).toBe(3 + EU_HALF_BOARDS.length);
	});

	it("routes a row to its class and its own sub", () => {
		for (const b of EU_HALF_BOARDS) {
			const row = { source: "euhalf" as const, euHalfBoard: b.id, family: b.label };
			expect(tileClassOf(row), b.id).toBe("edgelen");
			expect(subOf(row), b.id).toBe(euHalfSubOfBoard(b));
		}
	});
});

describe.skipIf(!anyShard)("shipped rows", () => {
	it("puts k<=4 in the eager atlas with the counts the boards declare", () => {
		const rows = eager();
		for (const b of EU_HALF_BOARDS) {
			for (const k of b.eagerKs) {
				const got = rows.filter((r) => r.euHalfBoard === b.id && r.k === k);
				expect(got.length, `${b.id} k=${k}`).toBe(b.counts[k]);
			}
		}
		// and nothing else rode in: every eager row is a declared eager (board, k)
		for (const r of rows) {
			const b = EU_HALF_BOARDS.find((x) => x.id === r.euHalfBoard);
			expect(b, `${r.id} has no board`).toBeTruthy();
			expect(b!.eagerKs, r.id).toContain(r.k);
		}
	});

	it("ships a lazy shard for every lazy k, with the declared count", () => {
		for (const k of [...new Set(EU_HALF_BOARDS.flatMap((b) => b.lazyKs))].sort((a, b) => a - b)) {
			const f = `public/reference-atlas-euhalf-k${k}.json`;
			expect(existsSync(f), f).toBe(true);
			const rows: ReferenceTiling[] = JSON.parse(readFileSync(f, "utf8"));
			for (const b of EU_HALF_BOARDS) {
				const want = b.lazyKs.includes(k) ? b.counts[k] : 0;
				expect(rows.filter((r) => r.euHalfBoard === b.id).length, `${b.id} k=${k}`).toBe(want);
			}
			for (const r of rows) expect(r.k, r.id).toBe(k);
		}
	});

	it("ships faces that are the tile, in a cell they exactly fill", () => {
		// The builder checks this on all 27,728; here it runs on the SHIPPED eager bytes, which is a
		// different artefact from the developer's scratch file and the one a visitor actually gets.
		for (const r of eager()) {
			const b = EU_HALF_BOARDS.find((x) => x.id === r.euHalfBoard)!;
			// `cellPolygons` is typed as unknown[] on the shared cell type (two shelves put different shapes
			// in it), so the shape this shelf writes is named here rather than asserted away wholesale.
			const cell = r.renderCell as { cellPolygons: { n: number; vertices: number[][] }[]; basis: number[][] };
			const want = [...b.angles].sort((x, y) => x - y);
			let area = 0;
			for (const poly of cell.cellPolygons) {
				const v = poly.vertices;
				expect(v.length, r.id).toBe(b.angles.length);
				const angs: number[] = [];
				let a2 = 0;
				for (let t = 0; t < v.length; t++) {
					const p = v[t], u = v[(t - 1 + v.length) % v.length], w = v[(t + 1) % v.length];
					const ux = u[0] - p[0], uy = u[1] - p[1], wx = w[0] - p[0], wy = w[1] - p[1];
					angs.push(Math.abs((Math.atan2(ux * wy - uy * wx, ux * wx + uy * wy) * 180) / Math.PI));
					a2 += p[0] * w[1] - w[0] * p[1];
				}
				area += Math.abs(a2 / 2);
				angs.sort((x, y) => x - y).forEach((a, i) => expect(a, r.id).toBeCloseTo(want[i], 6));
			}
			const [T1, T2] = cell.basis;
			expect(area, r.id).toBeCloseTo(Math.abs(T1[0] * T2[1] - T1[1] * T2[0]), 6);
		}
	});
});
