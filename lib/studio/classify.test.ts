import { describe, expect, it } from "vitest";
import { canonicalEdge, mergeFaces, type Ring } from "@/lib/freedraw/topology";
import { classify, keyFor } from "./classify";
import type { StudioPatch } from "./types";

type Poly = [number, number, number][];
type Cell = readonly [number, number];

/**
 * A StudioPatch from rings, periods and the set of quotient edges left UNDRAWN (which is what glues
 * faces into one tile). Everything else is derived, `mergeFaces` included, so a fixture states the
 * figure it wants and nothing more.
 *
 * A fixture need not TILE the plane. `classify` reads a ring set and its edge identities, so a cell with
 * gaps between its tiles is a legitimate input and a far more readable one than a real two-tile tiling
 * would be: two rectangles 5 apart say "same shape, different pose" in four lines.
 */
const patchOf = (
	verts: [number, number][],
	polys: Poly[],
	T1: [number, number],
	T2: [number, number],
	undrawn: string[] = [],
): StudioPatch => {
	const off = new Set(undrawn);
	const world = (vi: number, ox: number, oy: number): [number, number] => [
		verts[vi][0] + ox * T1[0] + oy * T2[0],
		verts[vi][1] + ox * T1[1] + oy * T2[1],
	];
	const edge = new Map<string, [number, number, number, number, number]>();
	let shortest = Infinity;
	for (const ring of polys) {
		for (let i = 0; i < ring.length; i++) {
			const [va, ax, ay] = ring[i];
			const [vb, bx, by] = ring[(i + 1) % ring.length];
			const c = canonicalEdge(va, vb, bx - ax, by - ay);
			edge.set(c.key, [c.vi, c.vj, c.dx, c.dy, off.has(c.key) ? 0 : 1]);
			const p = world(va, ax, ay);
			const q = world(vb, bx, by);
			shortest = Math.min(shortest, Math.hypot(q[0] - p[0], q[1] - p[1]));
		}
	}
	const m = mergeFaces(polys as Ring[], (k) => {
		const [va, vb, dx, dy] = k.split(",").map(Number);
		return !off.has(canonicalEdge(va, vb, dx, dy).key);
	});
	const incident: { face: number; cornerIdx: number }[][] = verts.map(() => []);
	polys.forEach((ring, f) => ring.forEach(([vi], i) => incident[vi].push({ face: f, cornerIdx: i })));
	return {
		T1,
		T2,
		verts,
		vorbit: verts.map(() => 0),
		edges: [...edge.values()],
		polys,
		polyComp: m.polyComp,
		polyLift: m.polyLift,
		compRank: m.compRank,
		compCells: m.compCells,
		compHoles: m.compHoles,
		stats: m.stats,
		half: m.half,
		incident,
		edgeKeys: [...edge.keys()],
		rings: polys as Ring[],
		basis: [T1, T2],
		medianEdge: shortest,
	};
};

/**
 * A patch whose tiles are these polyominoes, given in absolute cell coordinates, inside a cell padded
 * wide enough that nothing wraps. Edges shared by two cells of one piece are undrawn, so the piece
 * merges into a single tile; every other edge is drawn. `turnDeg` spins the whole figure, which is how
 * the 17° test asks for a congruence no 30°-step symmetry set contains.
 *
 * Component ids follow piece order, because `mergeFaces` numbers components by first visit and the cells
 * are pushed piece by piece.
 */
const ominoes = (pieces: readonly Cell[][], turnDeg = 0): StudioPatch => {
	const ids = new Map<string, number>();
	const raw: [number, number][] = [];
	const at = (x: number, y: number) => {
		const k = `${x},${y}`;
		let i = ids.get(k);
		if (i === undefined) {
			i = raw.length;
			ids.set(k, i);
			raw.push([x, y]);
		}
		return i;
	};
	const owner = new Map<string, number>();
	pieces.forEach((cells, pi) => cells.forEach(([x, y]) => owner.set(`${x},${y}`, pi)));
	const polys: Poly[] = [];
	for (const cells of pieces)
		for (const [x, y] of cells)
			polys.push([
				[at(x, y), 0, 0],
				[at(x + 1, y), 0, 0],
				[at(x + 1, y + 1), 0, 0],
				[at(x, y + 1), 0, 0],
			]);
	const undrawn: string[] = [];
	for (const [k, pi] of owner) {
		const [x, y] = k.split(",").map(Number);
		if (owner.get(`${x + 1},${y}`) === pi)
			undrawn.push(canonicalEdge(at(x + 1, y), at(x + 1, y + 1), 0, 0).key);
		if (owner.get(`${x},${y + 1}`) === pi)
			undrawn.push(canonicalEdge(at(x, y + 1), at(x + 1, y + 1), 0, 0).key);
	}
	const span = Math.max(...raw.flat().map(Math.abs)) + 2;
	const a = (turnDeg * Math.PI) / 180;
	const spin = ([x, y]: [number, number]): [number, number] => [
		x * Math.cos(a) - y * Math.sin(a),
		x * Math.sin(a) + y * Math.cos(a),
	];
	return patchOf(raw.map(spin), polys, spin([span, 0]), spin([0, span]), undrawn);
};

/** The 2x2 square cell: four unit squares per period, every edge drawn, so each is its own tile and
 *  three of the four rings reach across the cell boundary. */
const fourSquares = () =>
	patchOf(
		[
			[0, 0],
			[1, 0],
			[0, 1],
			[1, 1],
		],
		[
			[
				[0, 0, 0],
				[1, 0, 0],
				[3, 0, 0],
				[2, 0, 0],
			],
			[
				[1, 0, 0],
				[0, 1, 0],
				[2, 1, 0],
				[3, 0, 0],
			],
			[
				[2, 0, 0],
				[3, 0, 0],
				[1, 0, 1],
				[0, 0, 1],
			],
			[
				[3, 0, 0],
				[2, 1, 0],
				[0, 1, 1],
				[1, 0, 1],
			],
		],
		[2, 0],
		[0, 2],
	);

/** A rectangle w by h with its lower-left corner at (x, y), as four explicit vertices. */
const rect = (x: number, y: number, w: number, h: number): [number, number][] => [
	[x, y],
	[x + w, y],
	[x + w, y + h],
	[x, y + h],
];

/** Rings over consecutive vertex indices, one ring per length given: `ringsOf(4, 4)` reads vertices
 *  0..3 and 4..7. */
const ringsOf = (...sizes: number[]): Poly[] => {
	let n = 0;
	return sizes.map((s) => Array.from({ length: s }, () => [n++, 0, 0] as [number, number, number]));
};

describe("classify: the shape scope", () => {
	it("gives the four unit squares of a 2x2 cell one shape and one orientation", () => {
		const p = fourSquares();
		const k = classify(p);
		expect(p.compRank).toEqual([0, 0, 0, 0]);
		expect(new Set(k.shape).size).toBe(1);
		expect(new Set(k.orientation).size).toBe(1);
		// Four period orbits all the same: the tile scope is the one that still separates them.
		expect(new Set(k.tile).size).toBe(4);
	});

	it("separates a square from an equilateral triangle", () => {
		const p = patchOf(
			[...rect(0, 0, 1, 1), [3, 0], [4, 0], [3.5, Math.sqrt(3) / 2]],
			ringsOf(4, 3),
			[10, 0],
			[0, 10],
		);
		const k = classify(p);
		expect(k.shape[0]).not.toBe(k.shape[1]);
		expect(k.orientation[0]).not.toBe(k.orientation[1]);
	});
});

describe("classify: shape against orientation", () => {
	// The PAINT_SCOPES gloss as an executable assertion: "A 1x3 and a 3x1 share it" under shape, "a 1x3
	// and a 3x1 now differ" under orientation.
	it("calls a 1x3 and a 3x1 one shape and two orientations", () => {
		const p = patchOf([...rect(0, 0, 3, 1), ...rect(5, 0, 1, 3)], ringsOf(4, 4), [10, 0], [0, 10]);
		const k = classify(p);
		expect(k.shape[0]).toBe(k.shape[1]);
		expect(k.orientation[0]).not.toBe(k.orientation[1]);
	});

	it("calls a chiral tetromino and its mirror one shape, and a translate one orientation", () => {
		// The L-tetromino: a 3-bar with one cell above the left end, against the same bar with the cell
		// above the RIGHT end. Those two are mirror images and NOT rotations of each other (they are the
		// two one-sided tetrominoes J and L), which is what makes this a test of the word's reversal and
		// not of its rotation. The third piece is piece 0 translated up by 5.
		//
		// AL's brief named an L-TROMINO and its mirror; the tromino is achiral (its mirror is one of its
		// own four rotations), so it cannot test reflection at all. Promoted to the tetromino.
		const k = classify(
			ominoes([
				[
					[0, 0],
					[1, 0],
					[2, 0],
					[0, 1],
				],
				[
					[5, 0],
					[6, 0],
					[7, 0],
					[7, 1],
				],
				[
					[0, 5],
					[1, 5],
					[2, 5],
					[0, 6],
				],
			]),
		);
		expect(k.shape[0]).toBe(k.shape[1]);
		expect(k.shape[0]).toBe(k.shape[2]);
		expect(k.orientation[0]).not.toBe(k.orientation[1]);
		expect(k.orientation[0]).toBe(k.orientation[2]);
	});
});

describe("classify: the cases the geometry makes awkward", () => {
	it("reads through a collinear midpoint on a ring", () => {
		// Two unit squares, the second carrying an extra vertex at the middle of its bottom edge. A
		// subdivision point is not a corner: left in the word, the two would read as different shapes.
		const p = patchOf(
			[...rect(0, 0, 1, 1), [3, 0], [3.5, 0], [4, 0], [4, 1], [3, 1]],
			ringsOf(4, 5),
			[10, 0],
			[0, 10],
		);
		const k = classify(p);
		expect(k.shape[0]).toBe(k.shape[1]);
		expect(k.orientation[0]).toBe(k.orientation[1]);
	});

	it("keys a tile with a hole from all its loops, in an order the walk cannot change", () => {
		const ring8: Cell[] = [
			[0, 0],
			[1, 0],
			[2, 0],
			[0, 1],
			[2, 1],
			[0, 2],
			[1, 2],
			[2, 2],
		];
		const centre: Cell[] = [[1, 1]];
		const a = ominoes([ring8, centre]);
		const b = ominoes([[...ring8].reverse(), centre]);
		expect(a.compHoles[0]).toBe(1);
		// Two loops, so two words joined; reversing the cell order moves the walk's start and can swap
		// which loop it finds first, and the key has to survive that.
		expect(classify(a).shape[0]).toContain("|");
		expect(classify(a).shape[0]).toBe(classify(b).shape[0]);
		expect(classify(a).orientation[0]).toBe(classify(b).orientation[0]);
		// The annulus is not the unit square that fills its hole.
		expect(classify(a).shape[0]).not.toBe(classify(a).shape[1]);
	});

	it("finds the boundary of a tile that borders its own period copies", () => {
		// One face per period, every edge drawn: the unit square whose neighbour in all four directions is
		// its own translate. `buildHalfEdges` puts the reverse of all four of its boundary half-edges on
		// face 0, so the same-component test that `patch.half` alone can offer finds NO boundary at all
		// and the tile would come out shapeless. Only the lifted developed position separates the copies.
		const p = patchOf(
			[[0, 0]],
			[
				[
					[0, 0, 0],
					[0, 1, 0],
					[0, 1, 1],
					[0, 0, 1],
				],
			],
			[1, 0],
			[0, 1],
		);
		expect(p.compRank).toEqual([0]);
		const k = classify(p);
		const four = classify(fourSquares());
		expect(k.shape[0]).toBe(four.shape[0]);
		expect(k.orientation[0]).toBe(four.orientation[0]);
	});

	it("gives a strip a self-only key instead of a word", () => {
		// Two unit squares side by side in a 2x1 cell, each merged with its own vertical period copy: two
		// vertical strips, both rank 1, and no finite boundary to walk on either.
		const p = patchOf(
			[
				[0, 0],
				[1, 0],
			],
			[
				[
					[0, 0, 0],
					[1, 0, 0],
					[1, 0, 1],
					[0, 0, 1],
				],
				[
					[1, 0, 0],
					[0, 1, 0],
					[0, 1, 1],
					[1, 0, 1],
				],
			],
			[2, 0],
			[0, 1],
			["0,1,0,0", "0,1,-1,0"],
		);
		expect(p.compRank).toEqual([1, 1]);
		const k = classify(p);
		// Congruent-looking and still two classes: an infinite tile is only ever equal to itself.
		expect(k.shape[0]).not.toBe(k.shape[1]);
		expect(k.shape[0]).toBe(k.orientation[0]);
		expect(k.shape[0]).toContain("#0");
		expect(k.shape[1]).toContain("#1");
	});
});

describe("classify: the reason this module exists", () => {
	it("holds a shape key across a rotation that is not a multiple of 30°", () => {
		// Two unit squares, the second turned 17°. classifyPatchFaces in lib/freedraw/faces.ts searches
		// only 12 rotations in 30° steps, so it calls these two different shapes; the word does not care
		// what angle the tile sits at, because neither a length nor a turn moves under a rotation.
		const a = (17 * Math.PI) / 180;
		const spun = rect(0, 0, 1, 1).map(
			([x, y]): [number, number] => [5 + x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)],
		);
		const k = classify(patchOf([...rect(0, 0, 1, 1), ...spun], ringsOf(4, 4), [20, 0], [0, 20]));
		expect(k.shape[0]).toBe(k.shape[1]);
		expect(k.orientation[0]).not.toBe(k.orientation[1]);
	});

	it("holds a shape key when the whole figure is turned 17°", () => {
		const piece: Cell[] = [
			[0, 0],
			[1, 0],
			[2, 0],
			[0, 1],
		];
		expect(classify(ominoes([piece], 17)).shape[0]).toBe(classify(ominoes([piece])).shape[0]);
		expect(classify(ominoes([piece], 17)).orientation[0]).not.toBe(
			classify(ominoes([piece])).orientation[0],
		);
	});
});

describe("keyFor", () => {
	it("answers per face, per scope, and memoises the keys on the patch", () => {
		const p = fourSquares();
		const k = classify(p);
		expect(classify(p)).toBe(k);
		// The TILE key is the component's representative RING, not its index. Component ids are numbered
		// in face order, so one cut anywhere renumbers them and a colour keyed on an index would jump to
		// a different tile. What the key has to guarantee is only that it separates components.
		expect(new Set(p.rings.map((_, f) => keyFor(k, p, f, "tile"))).size).toBe(
			new Set(p.polyComp).size,
		);
		expect(keyFor(k, p, 0, "shape")).toBe(keyFor(k, p, 3, "shape"));
		expect(keyFor(k, p, 0, "orientation")).toBe(keyFor(k, p, 3, "orientation"));
		expect(keyFor(k, p, 0, "tile")).not.toBe(keyFor(k, p, 3, "tile"));
	});
});
