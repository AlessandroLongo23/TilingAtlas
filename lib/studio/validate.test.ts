import { describe, expect, it } from "vitest";
import { buildHalfEdges, canonicalEdge, mergeFaces, ringKey } from "@/lib/freedraw/topology";
import { EMPTY_DOC, type PointRef, type Pt, type StudioDoc, type StudioPatch } from "./types";
import { canCommitCut, canDropEdge, canExtendCut, canMoveVertex, clampVertexMove } from "./validate";

/**
 * A StudioPatch from the four things that are genuinely hand-written: vertices, edges, rings and the
 * basis. Everything else on the type is an INDEX of those, so deriving it here (with the same topology
 * calls the app uses) is safer than transcribing it and getting one offset wrong.
 */
function studioPatch(
	verts: [number, number][],
	edges: [number, number, number, number, number][],
	polys: [number, number, number][][],
	T1: [number, number],
	T2: [number, number],
	medianEdge: number,
): StudioPatch {
	const incident: { face: number; cornerIdx: number }[][] = verts.map(() => []);
	polys.forEach((ring, face) =>
		ring.forEach(([vi], cornerIdx) => incident[vi].push({ face, cornerIdx })),
	);
	const bare = mergeFaces(polys, () => true); // every edge drawn: one component per face
	return {
		T1,
		T2,
		verts,
		vorbit: verts.map(() => 0),
		edges,
		polys,
		polyComp: bare.polyComp,
		polyLift: bare.polyLift,
		compRank: bare.compRank,
		compCells: bare.compCells,
		compHoles: bare.compHoles,
		stats: bare.stats,
		half: buildHalfEdges(polys),
		incident,
		edgeKeys: edges.map(([a, b, dx, dy]) => canonicalEdge(a, b, dx, dy).key),
		rings: polys,
		basis: [T1, T2],
		medianEdge,
	};
}

/**
 * 2x2 torus of unit squares. Quotient vertices 0..3 at (0,0), (1,0), (0,1), (1,1); T1 = (2,0),
 * T2 = (0,2); faces 0..3 are the lower-left, lower-right, upper-left and upper-right squares.
 *
 * Note what the width-2 period does to adjacency: every pair of row or column neighbours meets along TWO
 * quotient edges (face 0's left edge at x = 0 IS face 1's right edge at x = 2), so the dual graph is four
 * doubled bonds. That is exactly the shape that makes the strip block interesting.
 */
const cell2 = () =>
	studioPatch(
		[
			[0, 0],
			[1, 0],
			[0, 1],
			[1, 1],
		],
		[
			[0, 1, 0, 0, 1], // (0,0)-(1,0)   faces 0 | 2
			[0, 2, 0, 0, 1], // (0,0)-(0,1)   faces 0 | 1
			[1, 0, 1, 0, 1], // (1,0)-(2,0)   faces 1 | 3
			[1, 3, 0, 0, 1], // (1,0)-(1,1)   faces 0 | 1
			[2, 3, 0, 0, 1], // (0,1)-(1,1)   faces 0 | 2
			[2, 0, 0, 1, 1], // (0,1)-(0,2)   faces 2 | 3
			[3, 2, 1, 0, 1], // (1,1)-(2,1)   faces 1 | 3
			[3, 1, 0, 1, 1], // (1,1)-(1,2)   faces 2 | 3
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
		1,
	);

/** One unit square per period: the smallest cell there is, where a single drop already closes a strip. */
const cell1 = () =>
	studioPatch(
		[[0, 0]],
		[
			[0, 0, 1, 0, 1],
			[0, 0, 0, 1, 1],
		],
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
		1,
	);

const V_ROW = "1,3,0,0"; // the wall at x = 1, between faces 0 and 1
const V_WRAP = "0,2,0,0"; // the wall at x = 0 ≡ 2, also between faces 0 and 1
const H_MID = "2,3,0,0"; // the wall at y = 1, between faces 0 and 2
const docWith = (d: Partial<StudioDoc>): StudioDoc => ({ ...EMPTY_DOC, ...d });
const vref = (vi: number, off: [number, number] = [0, 0]): PointRef => ({ kind: "vertex", vi, off });
/** A midpoint ref for face `f`'s edge `i`, derived the way a click derives it.
 *
 * The edge by its canonical KEY, and `off` measured from that CANONICAL frame. Both halves matter: an
 * index would name a different edge after a rebuild renumbered the faces, and an `off` measured from the
 * ring instead of from the canonical start would put the new vertex in the wrong lattice cell, so the
 * chord would join copies of two midpoints that are not the ones clicked. */
function midRef(patch: StudioPatch, f: number, i: number, off: [number, number]): PointRef {
	const ring = patch.rings[f];
	const [va, ax, ay] = ring[i];
	const [vb, bx, by] = ring[(i + 1) % ring.length];
	const c = canonicalEdge(va, vb, bx - ax, by - ay);
	// The canonical start's own offset within this ring: the cell the canonical frame sits in.
	const base: [number, number] = c.flipped ? [bx, by] : [ax, ay];
	return {
		kind: "midpoint",
		edge: c.key,
		off: [base[0] + off[0], base[1] + off[1]],
	};
}

/** A centroid ref for face `f`, by its canonical ring key. An out-of-range `f` yields a ref that names
 *  nothing, which is what the stale-ref tests want. */
function cenRef(patch: StudioPatch, f: number, off: [number, number]): PointRef {
	const ring = patch.rings[f];
	return { kind: "centroid", ring: ring ? ringKey(ring) : "no-such-ring", off };
}

/** A centroid ref against the standard 2x2 fixture, by ring key. */
const cref = (face: number, off: [number, number] = [0, 0]): PointRef => cenRef(cell2(), face, off);

describe("the 2x2 fixture itself", () => {
	it("is four separate unit squares before any edit", () => {
		const p = cell2();
		expect(p.compRank).toEqual([0, 0, 0, 0]);
		expect(p.compCells).toEqual([1, 1, 1, 1]);
		expect(p.edgeKeys).toEqual([
			"0,1,0,0",
			"0,2,0,0",
			"0,1,-1,0",
			"1,3,0,0",
			"2,3,0,0",
			"0,2,0,-1",
			"2,3,-1,0",
			"1,3,0,-1",
		]);
		// Every key names a real edge with two sides, which is what canDropEdge looks up.
		for (const k of p.edgeKeys) expect(p.half.has(k)).toBe(true);
	});
});

describe("canDropEdge", () => {
	it("allows one interior wall and gives a finite domino", () => {
		const p = cell2();
		expect(canDropEdge(p, new Set(), V_ROW)).toEqual({ ok: true });
		const m = mergeFaces(p.rings, (k) => k !== V_ROW && k !== "3,1,0,0");
		expect(m.polyComp[0]).toBe(m.polyComp[1]);
		expect(m.compRank[m.polyComp[0]]).toBe(0);
		expect(m.compCells[m.polyComp[0]]).toBe(2);
	});

	// The load-bearing test for block-the-gesture: the first wall of the bottom row is a merge, the
	// second one closes the row onto its own translate and must never reach the doc.
	it("refuses the step that closes a row into a strip, after allowing the step before it", () => {
		const p = cell2();
		const dropped = new Set<string>();

		const first = canDropEdge(p, dropped, V_ROW);
		expect(first).toEqual({ ok: true });
		dropped.add(V_ROW);

		const second = canDropEdge(p, dropped, V_WRAP);
		expect(second.ok).toBe(false);
		if (second.ok) throw new Error("unreachable");
		expect(second.code).toBe("infinite-tile");
		expect(second.message).toContain("strip");
		// Blocked, so the doc still holds one drop and the tile is still the finite domino.
		expect([...dropped]).toEqual([V_ROW]);
	});

	it("refuses the column the same way", () => {
		const p = cell2();
		expect(canDropEdge(p, new Set(), H_MID)).toEqual({ ok: true });
		const v = canDropEdge(p, new Set([H_MID]), "0,1,0,0");
		expect(v.ok).toBe(false);
		if (!v.ok) expect(v.code).toBe("infinite-tile");
	});

	it("never lets a drop-everything sweep reach an unbounded sheet", () => {
		const p = cell2();
		const dropped = new Set<string>();
		const codes: string[] = [];
		for (const k of p.edgeKeys) {
			const v = canDropEdge(p, dropped, k);
			if (v.ok) dropped.add(k);
			else codes.push(v.code);
		}
		// Three drops are a spanning tree of the four faces, which assembles them into ONE finite 4-cell
		// tile filling the whole period. Every remaining edge closes a cycle on the torus, and the sweep
		// stops there: rank 2 is never reached, because rank 1 is refused first.
		expect(dropped.size).toBe(3);
		expect(codes).toHaveLength(5);
		// Four of those cycles carry holonomy and would close the tile onto its own translate. The fifth,
		// the wall at x = 0 between faces 2 and 3, does not: in the assembled tile those two cells are
		// already flush, so that merge is a true no-op and not an infinity. Worth pinning, because it is
		// the ordering the rank check depends on.
		expect(codes.filter((c) => c === "infinite-tile")).toHaveLength(4);
		expect(codes.filter((c) => c === "degenerate")).toHaveLength(1);
		const m = mergeFaces(p.rings, (k) => !dropped.has(canonicalEdge(...keyParts(k)).key));
		expect(m.compRank).toEqual([0]);
		expect(m.compCells).toEqual([4]);
		expect(m.compHoles).toEqual([0]);
	});

	it("names the sheet when the trial merge really is rank 2", () => {
		// A one-square cell: dropping the east wall already glues the face to its own translate, so the
		// reachable verdict is the strip. Forcing the doc past that (a state the UI cannot produce, which
		// is the point of blocking) is how the second branch gets exercised.
		const p = cell1();
		const strip = canDropEdge(p, new Set(), "0,0,1,0");
		expect(strip.ok).toBe(false);
		if (!strip.ok) expect(strip.message).toContain("strip");

		const sheet = canDropEdge(p, new Set(["0,0,1,0"]), "0,0,0,1");
		expect(sheet.ok).toBe(false);
		if (!sheet.ok) {
			expect(sheet.code).toBe("infinite-tile");
			expect(sheet.message).toContain("sheet");
		}
	});

	it("calls a re-drop and an unknown key degenerate", () => {
		const p = cell2();
		const again = canDropEdge(p, new Set([V_ROW]), V_ROW);
		expect(again.ok).toBe(false);
		if (!again.ok) expect(again.code).toBe("degenerate");

		const bogus = canDropEdge(p, new Set(), "7,9,0,0");
		expect(bogus.ok).toBe(false);
		if (!bogus.ok) expect(bogus.code).toBe("degenerate");
	});
});

/** `canonicalEdge`'s four arguments out of a directed key, for the merge cross-checks above. */
function keyParts(key: string): [number, number, number, number] {
	const [a, b, c, d] = key.split(",").map(Number);
	return [a, b, c, d];
}

describe("canMoveVertex", () => {
	it("allows a move that leaves every tile convex, in all four lattice copies at once", () => {
		// Vertex 0 sits at a different lattice offset in each of the four rings ((0,0), (1,0), (0,1),
		// (1,1)), so this is the case that fails if the displacement is not applied per QUOTIENT vertex.
		const p = cell2();
		expect(canMoveVertex(p, 0, [0.2, 0.15], {})).toEqual({ ok: true });
	});

	it("refuses dragging a corner past the opposite edge", () => {
		const p = cell2();
		const v = canMoveVertex(p, 3, [-2, -2], {});
		expect(v.ok).toBe(false);
		if (!v.ok) {
			expect(v.code).toBe("folds-tile");
			expect(v.message).toContain("tile 0");
		}
	});

	it("takes a zero move and an unknown vertex without pretending", () => {
		const p = cell2();
		expect(canMoveVertex(p, 3, [0, 0], {})).toEqual({ ok: true });
		const v = canMoveVertex(p, 99, [0.1, 0], {});
		expect(v.ok).toBe(false);
		if (!v.ok) expect(v.code).toBe("degenerate");
	});

	it("measures the move on top of the displacement already in the doc", () => {
		// Half the fold is already committed, so the same increment that was fine from home now folds.
		const p = cell2();
		const moved: Record<string, Pt> = { "3": [-0.9, -0.9] };
		expect(canMoveVertex(p, 3, [-0.05, -0.05], moved)).toEqual({ ok: true });
		expect(canMoveVertex(p, 3, [-0.5, -0.5], moved).ok).toBe(false);
	});
});

describe("clampVertexMove", () => {
	it("returns the full move when it is valid", () => {
		const p = cell2();
		expect(clampVertexMove(p, 0, [0.2, 0.15], {})).toEqual([0.2, 0.15]);
	});

	it("sticks at a strictly shorter displacement that still passes", () => {
		const p = cell2();
		const delta: Pt = [-2, -2];
		const clamped = clampVertexMove(p, 3, delta, {});
		expect(Math.hypot(...clamped)).toBeGreaterThan(0);
		expect(Math.hypot(...clamped)).toBeLessThan(Math.hypot(...delta));
		expect(canMoveVertex(p, 3, clamped, {})).toEqual({ ok: true });
		// Face 0's area is 1 - 2t along this drag, so the boundary is t = 1/2 and the clamp lands just
		// under it: vertex 3 stops a hair short of the origin.
		const t = clamped[0] / delta[0];
		expect(t).toBeGreaterThan(0.499);
		expect(t).toBeLessThan(0.5);
	});
});

describe("canExtendCut", () => {
	it("allows the first click, which has no segment yet", () => {
		expect(canExtendCut(cell2(), EMPTY_DOC, [], cref(0))).toEqual({ ok: true });
	});

	it("allows a diagonal from vertex to vertex across one tile", () => {
		// (0,0) to (1,1) shares an endpoint with four tile edges at each end and crosses none of them,
		// which only passes because `segmentsIntersect` does not count a shared endpoint.
		expect(canExtendCut(cell2(), EMPTY_DOC, [vref(0)], vref(3))).toEqual({ ok: true });
	});

	it("refuses a chord that crosses a tile edge", () => {
		// Centre of face 0 to centre of face 1 walks straight through the wall at x = 1.
		const v = canExtendCut(cell2(), EMPTY_DOC, [cref(0)], cref(1));
		expect(v.ok).toBe(false);
		if (!v.ok) {
			expect(v.code).toBe("chord-crosses");
			expect(v.message).toContain("tile edge");
		}
	});

	it("lets the same chord through once that wall has been merged away", () => {
		// The gesture the "undrawn edge is not a boundary" filter exists for: cutting a merged tile.
		expect(canExtendCut(cell2(), docWith({ dropped: [V_ROW] }), [cref(0)], cref(1))).toEqual({
			ok: true,
		});
	});

	it("refuses a chord that crosses an existing cut", () => {
		const p = cell2();
		// The committed cut is face 0's (0,0)-(1,1) diagonal; the new chord is the other diagonal, from
		// (1,0) to (0,1), and the two meet in the middle of the tile.
		const doc = docWith({ cuts: [[vref(0), vref(3)]] });
		const v = canExtendCut(p, doc, [vref(1)], vref(2));
		expect(v.ok).toBe(false);
		if (!v.ok) {
			expect(v.code).toBe("chord-crosses");
			expect(v.message).toContain("existing cut");
		}
	});

	it("does not mistake the path's own previous segment for a crossing", () => {
		// vertex -> centroid -> vertex: the second segment shares the centroid with the first.
		expect(canExtendCut(cell2(), EMPTY_DOC, [vref(0), cref(0)], vref(3))).toEqual({ ok: true });
	});

	it("refuses a chord of no length", () => {
		const v = canExtendCut(cell2(), EMPTY_DOC, [vref(0)], vref(0));
		expect(v.ok).toBe(false);
		if (!v.ok) expect(v.code).toBe("degenerate");
	});
});

describe("canCommitCut", () => {
	it("refuses a path that ends inside a tile, then takes it once it reaches the boundary", () => {
		const p = cell2();
		const half = [vref(0), cref(0)];
		const v = canCommitCut(p, EMPTY_DOC, half);
		expect(v.ok).toBe(false);
		if (!v.ok) {
			expect(v.code).toBe("dead-end");
			expect(v.message).toContain("boundary");
		}
		expect(canCommitCut(p, EMPTY_DOC, [...half, vref(3)])).toEqual({ ok: true });
	});

	it("refuses a path that STARTS inside a tile", () => {
		const v = canCommitCut(cell2(), EMPTY_DOC, [cref(0), vref(3)]);
		expect(v.ok).toBe(false);
		if (!v.ok) expect(v.code).toBe("dead-end");
	});

	it("takes a midpoint as a boundary end", () => {
		// Midpoint of face 0's first edge, (0.5, 0), to the opposite corner.
		const p = cell2();
		const mid: PointRef = midRef(p, 0, 0, [0, 0]);
		expect(canCommitCut(p, EMPTY_DOC, [mid, vref(3)])).toEqual({ ok: true });
	});

	it("refuses a path with fewer than two points", () => {
		const v = canCommitCut(cell2(), EMPTY_DOC, [vref(0)]);
		expect(v.ok).toBe(false);
		if (!v.ok) expect(v.code).toBe("dead-end");
	});

	it("refuses a stale ref left behind by a rebuild", () => {
		const v = canCommitCut(cell2(), EMPTY_DOC, [vref(0), vref(42)]);
		expect(v.ok).toBe(false);
		if (!v.ok) expect(v.code).toBe("degenerate");
	});
});
