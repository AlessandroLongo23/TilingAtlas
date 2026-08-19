// The regression that proves the machinery: on the square tiling, this engine MUST be Conway's Life.
//
// The square grid is the degenerate case of everything here — one tile per fundamental cell, the unit
// lattice, 4 edge-neighbours and 8 corner-neighbours falling out of the same modulo-lattice matching that
// serves 3.4.6.4. If a glider does not move one cell diagonally every four generations, the adjacency, the
// halo gather, the offset table or the rule table is wrong, and nothing measured on any other tiling means
// anything. Everything else in this file is a corollary of that check.

import { describe, expect, it } from "vitest";
import { buildPeriodicAdjacency, neighborhoodOf } from "@/lib/automata/adjacency";
import { AutomatonEngine } from "@/lib/automata/engine";
import { buildRuleTable, formatRule, parseRule } from "@/lib/automata/rule";
import { planBoard, refinedFlip, type BoardPlan } from "@/lib/automata/board";
import { availableTopologies, findFlip } from "@/lib/automata/topology";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

const SQUARE: TranslationalCellData = {
	cellPolygons: [{ n: 4, vertices: [[0, 0], [1, 0], [1, 1], [0, 1]] }],
	basis: [[1, 0], [0, 1]],
};

const S3 = Math.sqrt(3);
/** One regular hexagon (side 1) per cell; centres √3 apart at 30° and 90°. */
const HEX: TranslationalCellData = {
	cellPolygons: [
		{
			n: 6,
			vertices: [
				[1, 0], [0.5, S3 / 2], [-0.5, S3 / 2],
				[-1, 0], [-0.5, -S3 / 2], [0.5, -S3 / 2],
			],
		},
	],
	basis: [[1.5, S3 / 2], [0, S3]],
};

/** Two triangles (up and down) per rhombic cell — the 3.3.3.3.3.3 tiling, k=1 with n=2 slots. */
const TRIANGLE: TranslationalCellData = {
	cellPolygons: [
		{ n: 3, vertices: [[0, 0], [1, 0], [0.5, S3 / 2]] },
		{ n: 3, vertices: [[1, 0], [1.5, S3 / 2], [0.5, S3 / 2]] },
	],
	basis: [[1, 0], [0.5, S3 / 2]],
};

function conwayEngine(mode: "plane" | "torus" = "plane", size = 16) {
	const adj = buildPeriodicAdjacency(SQUARE);
	if (!adj) throw new Error("square cell failed to parse");
	const nb = neighborhoodOf(adj, "moore", 1);
	const rule = parseRule("B3/S23");
	const table = buildRuleTable(rule, nb.map((l) => l.length), adj.sides, "absolute");
	const wrap = mode === "torus" ? size : null;
	return new AutomatonEngine(adj, nb, table, { wrapI: wrap, wrapJ: wrap });
}

/** The canonical glider, as (x, y) offsets from its corner. */
const GLIDER: [number, number][] = [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]];

function placeGlider(eng: AutomatonEngine, ox: number, oy: number) {
	for (const [x, y] of GLIDER) eng.setCell(ox + x, oy + y, 0, 1);
}

function liveSet(eng: AutomatonEngine, x0: number, y0: number, x1: number, y1: number): string[] {
	const out: string[] = [];
	for (let y = y0; y <= y1; y++) {
		for (let x = x0; x <= x1; x++) if (eng.getCell(x, y, 0) === 1) out.push(`${x},${y}`);
	}
	return out.sort();
}

describe("periodic adjacency", () => {
	it("gives the square tiling 4 edge and 8 corner neighbours", () => {
		const adj = buildPeriodicAdjacency(SQUARE)!;
		expect(adj.n).toBe(1);
		expect(adj.edge[0]).toHaveLength(4);
		expect(adj.moore[0]).toHaveLength(8);
		// Exactly the eight Moore offsets, no more and no less.
		const offs = adj.moore[0].map((r) => `${r.di},${r.dj}`).sort();
		expect(offs).toEqual(["-1,-1", "-1,0", "-1,1", "0,-1", "0,1", "1,-1", "1,0", "1,1"]);
	});

	it("gives the hexagonal tiling 6 neighbours, and corner-sharing adds nothing", () => {
		const adj = buildPeriodicAdjacency(HEX)!;
		expect(adj.edge[0]).toHaveLength(6);
		// Three hexagons meet at every corner and each pair of them already shares an edge, so the Moore
		// and von Neumann neighbourhoods coincide. This is the first place a tiling stops behaving like
		// the square grid.
		expect(adj.moore[0]).toHaveLength(6);
	});

	it("gives the triangular tiling 3 edge and 12 corner neighbours per slot", () => {
		const adj = buildPeriodicAdjacency(TRIANGLE)!;
		expect(adj.n).toBe(2);
		expect(adj.edge[0]).toHaveLength(3);
		expect(adj.edge[1]).toHaveLength(3);
		expect(adj.moore[0]).toHaveLength(12);
		expect(adj.moore[1]).toHaveLength(12);
	});

	it("expands range 2 on the square Moore graph to the 5x5 ball", () => {
		const adj = buildPeriodicAdjacency(SQUARE)!;
		expect(neighborhoodOf(adj, "moore", 2)[0]).toHaveLength(24);
		expect(neighborhoodOf(adj, "moore", 3)[0]).toHaveLength(48);
	});

	it("reports the light-cone radius the engine sizes its halo from", () => {
		expect(buildPeriodicAdjacency(SQUARE)!.radius).toBe(1);
		expect(buildPeriodicAdjacency(HEX)!.radius).toBe(1);
	});
});

describe("rule parsing", () => {
	it("reads the classic form", () => {
		const r = parseRule("B3/S23");
		expect(r.birth).toEqual([3]);
		expect(r.survival).toEqual([2, 3]);
		expect(r.states).toBe(2);
	});

	it("reads Generations and round-trips", () => {
		const r = parseRule("B2/S/G3");
		expect(r.birth).toEqual([2]);
		expect(r.survival).toEqual([]);
		expect(r.states).toBe(3);
		expect(formatRule(r)).toBe("B2/S/G3");
	});

	it("reads the Larger-than-Life comma form with ranges", () => {
		const r = parseRule("R5,C2,S33-57,B34-45");
		expect(r.range).toBe(5);
		expect(r.states).toBe(2);
		expect(r.birth[0]).toBe(34);
		expect(r.birth.at(-1)).toBe(45);
		expect(r.survival[0]).toBe(33);
		expect(r.survival.at(-1)).toBe(57);
	});

	it("reads Bays' comma-separated counts", () => {
		expect(parseRule("B3,4,6/S23").birth).toEqual([3, 4, 6]);
	});
});

describe("rule semantics on mixed degrees", () => {
	it("normalized equals absolute when every tile already has the reference degree", () => {
		const abs = buildRuleTable(parseRule("B3/S23"), [8, 8], [4, 4], "absolute");
		const norm = buildRuleTable(parseRule("B3/S23"), [8, 8], [4, 4], "normalized");
		expect([...norm.birth[0]]).toEqual([...abs.birth[0]]);
		expect([...norm.survival[0]]).toEqual([...abs.survival[0]]);
	});

	it("normalized rescales a low-degree tile up to the reference", () => {
		// Degrees 4 and 8, reference 8. The degree-4 tile is born when round(c * 8/4) == 3, i.e. never
		// (2c is even, 3 is odd) — which is the honest answer, not a silently different rule.
		const t = buildRuleTable(parseRule("B3/S23"), [4, 8], [3, 4], "normalized");
		expect([...t.birth[0]]).toEqual([0, 0, 0, 0, 0]);
		// Survival on 2 or 3 becomes survival on 1 (2*2=4? no: c=1 -> 2, which is in S).
		expect(t.survival[0][1]).toBe(1);
		expect(t.birth[1][3]).toBe(1);
	});

	it("perShape gives each side count its own automaton", () => {
		const t = buildRuleTable(
			parseRule("B3/S23"),
			[3, 6],
			[3, 6],
			"perShape",
			{ 3: parseRule("B1/S1"), 6: parseRule("B2/S34") },
		);
		expect(t.birth[0][1]).toBe(1);
		expect(t.birth[0][3]).toBe(0);
		expect(t.birth[1][2]).toBe(1);
		expect(t.survival[1][4]).toBe(1);
	});
});

describe("Conway's Life on the square tiling", () => {
	it("moves a glider one cell diagonally every four generations", () => {
		const eng = conwayEngine();
		placeGlider(eng, 0, 0);
		expect(eng.population).toBe(5);
		const start = liveSet(eng, -4, -4, 12, 12);
		for (let i = 0; i < 4; i++) eng.step();
		expect(eng.population).toBe(5);
		const moved = liveSet(eng, -4, -4, 12, 12);
		const shifted = start.map((s) => {
			const [x, y] = s.split(",").map(Number);
			return `${x + 1},${y + 1}`;
		}).sort();
		expect(moved).toEqual(shifted);
	});

	it("holds a block still forever", () => {
		const eng = conwayEngine();
		for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) eng.setCell(x, y, 0, 1);
		for (let i = 0; i < 20; i++) eng.step();
		expect(eng.population).toBe(4);
		expect(liveSet(eng, -3, -3, 4, 4)).toEqual(["0,0", "0,1", "1,0", "1,1"]);
	});

	it("blinks a blinker with period 2", () => {
		const eng = conwayEngine();
		for (const [x, y] of [[0, 0], [1, 0], [2, 0]]) eng.setCell(x, y, 0, 1);
		eng.step();
		expect(liveSet(eng, -3, -3, 5, 5)).toEqual(["1,-1", "1,0", "1,1"]);
		eng.step();
		expect(liveSet(eng, -3, -3, 5, 5)).toEqual(["0,0", "1,0", "2,0"]);
	});

	it("settles the R-pentomino at its known population of 116", () => {
		// The standard methuselah: 1103 generations, then 116 cells. If the board were bounded anywhere
		// this number would come out low, so it doubles as the proof that the plane really is unbounded.
		const eng = conwayEngine();
		for (const [x, y] of [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]]) eng.setCell(x, y, 0, 1);
		for (let i = 0; i < 1103; i++) eng.step();
		expect(eng.population).toBe(116);
	});
});

describe("the unbounded board", () => {
	it("lets a glider travel far past the region it was seeded in", () => {
		const eng = conwayEngine();
		placeGlider(eng, 0, 0);
		for (let i = 0; i < 400; i++) eng.step();
		// 100 diagonal steps out. On any bounded board it would have hit a wall and died or stuck.
		expect(eng.population).toBe(5);
		expect(liveSet(eng, 96, 96, 106, 106)).toHaveLength(5);
	});

	it("frees the blocks a departing glider leaves behind", () => {
		const eng = conwayEngine();
		placeGlider(eng, 0, 0);
		for (let i = 0; i < 200; i++) eng.step();
		const early = eng.blockCount;
		for (let i = 0; i < 800; i++) eng.step();
		// Memory must track the PATTERN, not the distance travelled. A glider's footprint is its own block
		// plus the ring of eight the growth step keeps ready ahead of it; 250 further diagonal cells must
		// not add a single block. Without pruning this would climb past 40.
		expect(early).toBeLessThanOrEqual(9);
		expect(eng.blockCount).toBeLessThanOrEqual(9);
		expect(eng.population).toBe(5);
	});
});

describe("the torus", () => {
	it("wraps a glider back to its starting position", () => {
		// A glider advances (1,1) every 4 generations, so on a W×W torus it returns after 4W.
		const W = 12;
		const eng = conwayEngine("torus", W);
		placeGlider(eng, 0, 0);
		const start = liveSet(eng, 0, 0, W - 1, W - 1);
		for (let i = 0; i < 4 * W; i++) eng.step();
		expect(liveSet(eng, 0, 0, W - 1, W - 1)).toEqual(start);
	});

	it("wraps correctly at a board size that is not a multiple of the block", () => {
		// 20 is not a multiple of CHUNK (32), which is exactly the case a naive chunked gather gets wrong.
		const W = 20;
		const eng = conwayEngine("torus", W);
		placeGlider(eng, W - 2, W - 2); // straddling the seam
		const start = liveSet(eng, 0, 0, W - 1, W - 1);
		expect(start).toHaveLength(5);
		for (let i = 0; i < 4 * W; i++) eng.step();
		expect(liveSet(eng, 0, 0, W - 1, W - 1)).toEqual(start);
	});
});

describe("Generations", () => {
	it("ages a cell through the decay tail instead of killing it", () => {
		const adj = buildPeriodicAdjacency(SQUARE)!;
		const nb = neighborhoodOf(adj, "moore", 1);
		const rule = parseRule("B2/S/G4"); // nothing survives; a live cell must decay 1 -> 2 -> 3 -> 0
		const table = buildRuleTable(rule, nb.map((l) => l.length), adj.sides, "absolute");
		const eng = new AutomatonEngine(adj, nb, table, {});
		eng.setCell(0, 0, 0, 1);
		eng.step();
		expect(eng.getCell(0, 0, 0)).toBe(2);
		eng.step();
		expect(eng.getCell(0, 0, 0)).toBe(3);
		eng.step();
		expect(eng.getCell(0, 0, 0)).toBe(0);
	});
});

describe("determinism", () => {
	it("reproduces a soup exactly from a seed", () => {
		const a = conwayEngine();
		const b = conwayEngine();
		a.randomize(0.4, 12345, 20, 20);
		b.randomize(0.4, 12345, 20, 20);
		expect(a.population).toBe(b.population);
		for (let i = 0; i < 30; i++) {
			a.step();
			b.step();
		}
		expect(a.population).toBe(b.population);
		expect(liveSet(a, -30, -30, 30, 30)).toEqual(liveSet(b, -30, -30, 30, 30));
	});

	it("gives different seeds different soups", () => {
		const a = conwayEngine();
		const b = conwayEngine();
		a.randomize(0.4, 1, 20, 20);
		b.randomize(0.4, 2, 20, 20);
		expect(liveSet(a, -30, -30, 30, 30)).not.toEqual(liveSet(b, -30, -30, 30, 30));
	});
});

describe("sampleRegion", () => {
	it("reads back what was written, including across a torus seam", () => {
		const W = 20;
		const eng = conwayEngine("torus", W);
		eng.setCell(0, 0, 0, 1);
		eng.setCell(W - 1, W - 1, 0, 1);
		const buf = eng.sampleRegion(-1, -1, 3, 3);
		// (-1,-1) wraps to (W-1, W-1) -> index 0; (0,0) sits at local (1,1) -> index 4.
		expect(buf[0]).toBe(1);
		expect(buf[4]).toBe(1);
		expect(buf[1]).toBe(0);
	});
});

// A PINWHEEL cell: the unit square cut into four congruent quadrilaterals by joining the centre to a
// point one third along each edge. It has four-fold rotation and NO mirror — wallpaper group p4 — which
// is the whole point: its lattice is as symmetric as the square grid's, and only the tiling on it rules
// the flip out.
const PINWHEEL: TranslationalCellData = {
	cellPolygons: [
		{ n: 4, vertices: [[0, 0], [1 / 3, 0], [0.5, 0.5], [0, 2 / 3]] },
		{ n: 4, vertices: [[1 / 3, 0], [1, 0], [1, 1 / 3], [0.5, 0.5]] },
		{ n: 4, vertices: [[0.5, 0.5], [1, 1 / 3], [1, 1], [2 / 3, 1]] },
		{ n: 4, vertices: [[0, 2 / 3], [0.5, 0.5], [2 / 3, 1], [0, 1]] },
	],
	basis: [[1, 0], [0, 1]],
};

/** A generic oblique cell: one parallelogram, no symmetry of any kind. */
const OBLIQUE: TranslationalCellData = {
	cellPolygons: [{ n: 4, vertices: [[0, 0], [1, 0], [1.3, 1], [0.3, 1]] }],
	basis: [[1, 0], [0.3, 1]],
};

describe("gluing a flipped seam", () => {
	it("finds the reflection on the square grid, as negate-the-other-coordinate", () => {
		const f = findFlip(buildPeriodicAdjacency(SQUARE)!, 0)!;
		expect(f).not.toBeNull();
		expect(f.m).toEqual([1, 0, 0, -1]);
	});

	it("finds the hexagonal reflection, which is NOT negate-the-other-coordinate", () => {
		// Reflecting across v₁ sends v₂ to −v₁−v₂ on this lattice, so the matrix has an off-diagonal term.
		// Testing the naive (i, j) ↦ (i, −j) instead would call every non-rectangular lattice chiral.
		const f = findFlip(buildPeriodicAdjacency(HEX)!, 0)!;
		expect(f).not.toBeNull();
		expect(f.m).toEqual([1, 0, 1, -1]);
	});

	it("is an involution on the lattice", () => {
		for (const cell of [SQUARE, HEX, TRIANGLE]) {
			const f = findFlip(buildPeriodicAdjacency(cell)!, 0);
			expect(f).not.toBeNull();
			// M² = I, or the seam would not close after two crossings. Column-major throughout:
			// M = [[m0, m2], [m1, m3]].
			const [m0, m1, m2, m3] = f!.m;
			expect([
				m0 * m0 + m2 * m1,
				m1 * m0 + m3 * m1,
				m0 * m2 + m2 * m3,
				m1 * m2 + m3 * m3,
			]).toEqual([1, 0, 0, 1]);
		}
	});

	it("refuses a chiral tiling even though its lattice is square", () => {
		const adj = buildPeriodicAdjacency(PINWHEEL)!;
		expect(adj.n).toBe(4);
		// The lattice passes — it is the unit square — so a lattice-only test would wrongly say yes.
		expect(findFlip(adj, 0)).toBeNull();
		expect(findFlip(adj, 1)).toBeNull();
	});

	it("refuses an oblique lattice the reflection does not preserve", () => {
		expect(findFlip(buildPeriodicAdjacency(OBLIQUE)!, 0)).toBeNull();
	});

	it("offers the three unflipped surfaces always, and the flipped two only when earned", () => {
		const square = availableTopologies(buildPeriodicAdjacency(SQUARE));
		expect([...square].sort()).toEqual(["cylinder", "klein", "mobius", "plane", "torus"]);
		const chiral = availableTopologies(buildPeriodicAdjacency(PINWHEEL));
		expect([...chiral].sort()).toEqual(["cylinder", "plane", "torus"]);
	});
});

describe("the cylinder", () => {
	it("wraps one axis and lets the other grow", () => {
		const adj = buildPeriodicAdjacency(SQUARE)!;
		const nb = neighborhoodOf(adj, "moore", 1);
		const table = buildRuleTable(parseRule("B3/S23"), nb.map((l) => l.length), adj.sides, "absolute");
		const eng = new AutomatonEngine(adj, nb, table, { wrapI: 12, wrapJ: null });
		expect(eng.wrapSize).toEqual([12, null]);
		expect(eng.closed).toBe(false);
		// A glider heading down-right returns to the same column every 12 diagonal steps (48 generations)
		// but keeps descending forever, because only one axis is glued.
		placeGlider(eng, 0, 0);
		for (let i = 0; i < 48; i++) eng.step();
		expect(eng.population).toBe(5);
		// Query EXACTLY one period wide: getCell wraps, so a wider window reports the same cell twice.
		const live = liveSet(eng, 0, 10, 11, 20);
		expect(live).toHaveLength(5);
	});
});


// ── The two non-orientable boards ──────────────────────────────────────────────────────────────────
//
// These are the tests that decide whether "Klein bottle" on the surface picker is a claim or a label.
// The engine never sees a flip: a Möbius or Klein board is run as its ORIENTATION DOUBLE COVER carrying a
// state invariant under the deck transformation ι (lib/automata/board.ts). That reduction is only sound
// if three things hold, and each gets a test below:
//
//   1. ι is an automorphism of the adjacency graph — neighbours map to neighbours, degrees unchanged.
//   2. ι-invariance is preserved by the dynamics, exactly and forever.
//   3. The result agrees, generation by generation, with a cellular automaton run on the QUOTIENT graph
//      built independently — orbits as cells, neighbour orbits counted with multiplicity.
//
// (3) is the one that would catch a subtle error in (1) or (2), so it is run on a refined board (the
// hexagonal one, whose flip forces a sublattice of index 2) as well as on the square grid.

function planFor(cell: TranslationalCellData, topology: "mobius" | "klein" | "torus", w: number, h: number) {
	const plan = planBoard(cell, topology, w, h);
	if (!plan) throw new Error(`no ${topology} board for this cell`);
	return plan;
}

function engineFor(plan: BoardPlan, rule = "B3/S23") {
	const nb = neighborhoodOf(plan.adj, "moore", 1);
	const table = buildRuleTable(parseRule(rule), nb.map((l) => l.length), plan.adj.sides, "absolute");
	return new AutomatonEngine(plan.adj, nb, table, {
		wrapI: plan.wrapI,
		wrapJ: plan.wrapJ,
		involution: plan.involution,
	});
}

/** Is the whole board equal to its own image under ι? */
function isSymmetric(plan: BoardPlan, eng: AutomatonEngine, iRange: number, jRange: [number, number]): boolean {
	const inv = plan.involution!;
	for (let j = jRange[0]; j < jRange[1]; j++) {
		for (let i = 0; i < iRange; i++) {
			for (let t = 0; t < plan.adj.n; t++) {
				const [a, b, s] = inv(i, j, t);
				if (eng.getCell(i, j, t) !== eng.getCell(a, b, s)) return false;
			}
		}
	}
	return true;
}

describe("the refined flip", () => {
	it("needs no sublattice on the square grid and an index-2 one on the hexagonal", () => {
		const sq = refinedFlip(buildPeriodicAdjacency(SQUARE)!)!;
		expect(sq.refine).toBe(1);
		expect(sq.adj.n).toBe(1);

		// R sends v₂ to v₁ − v₂ here, so the perpendicular lattice direction is 2v₂ − v₁ and the cell that
		// closes up under the flip holds two of the tiling's own.
		const hex = refinedFlip(buildPeriodicAdjacency(HEX)!)!;
		expect(hex.refine).toBe(2);
		expect(hex.adj.n).toBe(2);
	});

	it("makes the refined basis rectangular — v₁ and w are a reflection's ±1 eigenvectors", () => {
		for (const cell of [SQUARE, HEX, TRIANGLE]) {
			const rf = refinedFlip(buildPeriodicAdjacency(cell)!)!;
			const [[ax, ay], [bx, by]] = rf.adj.basis;
			expect(Math.abs(ax * bx + ay * by)).toBeLessThan(1e-9);
		}
	});

	it("is an involution on slots, with a consistent glide length", () => {
		for (const cell of [SQUARE, HEX, TRIANGLE]) {
			const rf = refinedFlip(buildPeriodicAdjacency(cell)!)!;
			let sum: number | null = null;
			for (let s = 0; s < rf.adj.n; s++) {
				expect(rf.sigma[rf.sigma[s]]).toBe(s);
				// g² is a translation along the axis, so it must displace every slot by the same amount and
				// none of them across the axis.
				expect(rf.Q[rf.sigma[s]]).toBe(rf.Q[s]);
				const both = rf.P[s] + rf.P[rf.sigma[s]];
				if (sum === null) sum = both;
				expect(both).toBe(sum);
			}
			expect(sum).toBe(Math.round(2 * rf.alpha));
		}
	});

	it("maps neighbours to neighbours — ι is a graph automorphism", () => {
		for (const cell of [SQUARE, HEX, TRIANGLE]) {
			const rf = refinedFlip(buildPeriodicAdjacency(cell)!)!;
			const F = (a: number, b: number, s: number): [number, number, number] => [
				a + rf.P[s],
				rf.Q[s] - b,
				rf.sigma[s],
			];
			for (let s = 0; s < rf.adj.n; s++) {
				const [a0, b0] = F(0, 0, s);
				const image = new Set(rf.adj.moore[rf.sigma[s]].map((r) => `${r.t}|${r.di}|${r.dj}`));
				expect(image.size).toBe(rf.adj.moore[s].length);
				for (const r of rf.adj.moore[s]) {
					const [a1, b1, s1] = F(r.di, r.dj, r.t);
					expect(image.has(`${s1}|${a1 - a0}|${b1 - b0}`)).toBe(true);
				}
			}
		}
	});
});

describe("the Möbius band and the Klein bottle", () => {
	it("runs each as a double cover exactly twice the quotient's width", () => {
		const klein = planFor(SQUARE, "klein", 6, 8);
		expect(klein.wrapI).toBe(Math.round(2 * klein.domainW));
		expect(klein.wrapJ).toBe(8);
		const mobius = planFor(SQUARE, "mobius", 6, 8);
		expect(mobius.wrapI).toBe(Math.round(2 * mobius.domainW));
		// Only one axis is glued, so the other still grows without bound.
		expect(mobius.wrapJ).toBeNull();
	});

	it("glues with a free involution: no tile is its own mirror", () => {
		const plan = planFor(SQUARE, "klein", 6, 8);
		const L = plan.wrapI!;
		const H = plan.wrapJ!;
		const inv = plan.involution!;
		for (let j = 0; j < H; j++) {
			for (let i = 0; i < L; i++) {
				for (let t = 0; t < plan.adj.n; t++) {
					const [a, b, s] = inv(i, j, t);
					const wi = ((a % L) + L) % L;
					const wj = ((b % H) + H) % H;
					expect(`${wi},${wj},${s}`).not.toBe(`${i},${j},${t}`);
					// And applying it twice is the identity on the cover.
					const [a2, b2, s2] = inv(wi, wj, s);
					expect(`${((a2 % L) + L) % L},${((b2 % H) + H) % H},${s2}`).toBe(`${i},${j},${t}`);
				}
			}
		}
	});

	it("seeds a soup the surface can actually hold", () => {
		for (const cell of [SQUARE, HEX, TRIANGLE]) {
			const plan = planFor(cell, "klein", 6, 8);
			const eng = engineFor(plan);
			eng.randomize(0.4, 7);
			expect(eng.population).toBeGreaterThan(0);
			expect(isSymmetric(plan, eng, plan.wrapI!, [0, plan.wrapJ!])).toBe(true);
		}
	});

	it("keeps the gluing exactly, for a thousand generations", () => {
		// This is the load-bearing claim. ι commutes with the rule because it maps every tile to a
		// congruent one, so the invariance is preserved in integer arithmetic — not approximately, not for
		// a while. If it ever drifts, the board is no longer a quotient of anything.
		const plan = planFor(HEX, "klein", 5, 7);
		const eng = engineFor(plan, "B2/S23");
		eng.randomize(0.45, 11);
		for (let g = 0; g < 1000; g++) {
			eng.step();
			if (g % 97 === 0 || g === 999) {
				expect(isSymmetric(plan, eng, plan.wrapI!, [0, plan.wrapJ!])).toBe(true);
			}
		}
	});

	it("keeps it on the Möbius band too, where one axis is unbounded", () => {
		const plan = planFor(SQUARE, "mobius", 7, 12);
		const eng = engineFor(plan);
		eng.randomize(0.4, 3, 12, 12);
		for (let g = 0; g < 200; g++) eng.step();
		expect(isSymmetric(plan, eng, plan.wrapI!, [-40, 40])).toBe(true);
	});

	it("agrees with a Life run on the quotient graph, generation by generation", () => {
		// The independent check. Cells are ι-orbits; a cell's neighbours are the orbits its cover
		// neighbours fall into, counted WITH multiplicity (the same convention a wrapped array gives a
		// small torus). Nothing here shares code with the engine except the adjacency table itself.
		for (const cell of [SQUARE, HEX]) {
			const plan = planFor(cell, "klein", 5, 6);
			const L = plan.wrapI!;
			const H = plan.wrapJ!;
			const n = plan.adj.n;
			const inv = plan.involution!;
			const id = (i: number, j: number, t: number) => (i * H + j) * n + t;
			const canon = (i0: number, j0: number, t0: number) => {
				const i = ((i0 % L) + L) % L;
				const j = ((j0 % H) + H) % H;
				const [ri, rj, rt] = inv(i, j, t0);
				const i2 = ((ri % L) + L) % L;
				const j2 = ((rj % H) + H) % H;
				return id(i, j, t0) <= id(i2, j2, rt)
					? { key: id(i, j, t0), i, j, t: t0 }
					: { key: id(i2, j2, rt), i: i2, j: j2, t: rt };
			};

			const reps = new Map<number, { i: number; j: number; t: number }>();
			for (let j = 0; j < H; j++) {
				for (let i = 0; i < L; i++) {
					for (let t = 0; t < n; t++) {
						const c = canon(i, j, t);
						if (!reps.has(c.key)) reps.set(c.key, { i: c.i, j: c.j, t: c.t });
					}
				}
			}
			// Half the cover, exactly — ι is free, so every orbit has two members.
			expect(reps.size).toBe((L * H * n) / 2);

			const nbrs = new Map<number, number[]>();
			for (const [key, r] of reps) {
				nbrs.set(key, plan.adj.moore[r.t].map((ref) => canon(r.i + ref.di, r.j + ref.dj, ref.t).key));
			}

			const eng = engineFor(plan);
			eng.randomize(0.42, 5);
			let state = new Map<number, number>();
			for (const [key, r] of reps) state.set(key, eng.getCell(r.i, r.j, r.t));

			for (let g = 0; g < 40; g++) {
				const next = new Map<number, number>();
				for (const [key, list] of nbrs) {
					let live = 0;
					for (const k of list) if (state.get(k) === 1) live++;
					const cur = state.get(key)!;
					next.set(key, cur === 1 ? (live === 2 || live === 3 ? 1 : 0) : live === 3 ? 1 : 0);
				}
				eng.step();
				const fromEngine = [...reps]
					.map(([key, r]) => `${key}:${eng.getCell(r.i, r.j, r.t)}`)
					.join(" ");
				const fromQuotient = [...next].map(([key, v]) => `${key}:${v}`).join(" ");
				expect(fromEngine, `generation ${g + 1} on ${plan.adj.n}-slot cell`).toBe(fromQuotient);
				state = next;
			}
		}
	});

	it("is not the torus wearing a different label", () => {
		const klein = planFor(SQUARE, "klein", 8, 8);
		const torus = planFor(SQUARE, "torus", 8, 8);
		const a = engineFor(klein);
		const b = engineFor(torus);
		a.randomize(0.4, 21);
		b.randomize(0.4, 21);
		let differed = false;
		for (let g = 0; g < 30; g++) {
			a.step();
			b.step();
			if (a.population !== b.population) differed = true;
		}
		expect(differed).toBe(true);
	});

	it("reports the surface's own population, not the cover's", () => {
		const plan = planFor(SQUARE, "klein", 6, 6);
		const eng = engineFor(plan);
		eng.clear();
		// One cell of the surface. On the cover that is two tiles, which is exactly what coverFactor is for.
		eng.setCell(0, 0, 0, 1);
		expect(eng.coverFactor).toBe(2);
		expect(eng.population).toBe(2);
		expect(eng.population / eng.coverFactor).toBe(1);
	});
});
