// The board Marek Čtrnáct's `edges_pentagons_01` corpus decorates: a Kershner TYPE 1 pentagon tiling
// with a SPLIT SIDE. Decoded by tools/ctrnact-oracle/develop_pent_edges.py, which ships only
// combinatorics; everything geometric lives here, so a record can be realised at any point of the
// family without re-developing anything offline.
//
// THE TILE IS A HEXAGON, not a pentagon, as the tiling sees it:
//
//     A --b-- B --c-- C --d-- Pi --b-- D --e-- E --a-- A
//
// `Pi` is a FLAT 180° vertex where a neighbour's corner lands inside the pentagon's C–D side, so that
// one side is two tiling edges (d then b) and class b occurs TWICE. Its six interior angles sum to
// 720°, which is what a hexagon must have and the first check that the corner/edge incidence derived
// from the corpus is right.
//
// WHY b IS FREE — and it is type 1 itself saying so. Closing the hexagon is two real linear equations
// on (a, b, c, d, e), and the b column is identically zero: the two b-edges are exactly antiparallel,
// so whatever b is, its two contributions cancel. The heading between them is the turn at B, C and Pi,
// that is (180 − B) + (180 − C) + 0 = 360 − (B + C), which is 180° EXACTLY when B + C = 180° — the
// defining constraint of Kershner type 1. The split side is not an extra condition bolted onto type 1;
// it is what type 1 buys.
//
// So the family is five-dimensional, the same as type 1's: three free angles (A, B, D, with
// C = 180 − B and E from the 540° sum), the free b, and one more side ratio once the scale is fixed by
// a = 1. It is NOT the parameterisation lib/pentagon/types.ts uses for type 1 — those side defaults
// describe a different type 1 tiling and leave this hexagon open by 0.61 — which is why this board
// solves its own side system instead of borrowing them.

/** Corners of the tile, in cyclic order. "Pi" is the flat vertex, not a corner of the pentagon. */
export const BOARD_CORNERS = ["A", "B", "C", "Pi", "D", "E"] as const;
/** Edge class of the side LEAVING each corner, so side i runs BOARD_CORNERS[i] → BOARD_CORNERS[i+1]. */
export const BOARD_SIDES = ["b", "c", "d", "b", "e", "a"] as const;

export type SideKey = "a" | "b" | "c" | "d" | "e";
export const SIDE_KEYS: SideKey[] = ["a", "b", "c", "d", "e"];

/** The free parameters. Angles in degrees; `b` is a length with a = 1; `t` picks a point on the
 *  one-dimensional family the closure equations leave for (c, d, e), normalised to [0,1] across the
 *  interval where all three stay positive (see `validTRange`). */
export interface PentEdgeParams {
	A: number;
	B: number;
	D: number;
	b: number;
	t: number;
}

export const PENT_EDGE_DEFAULTS: PentEdgeParams = { A: 120, B: 100, D: 110, b: 0.8, t: 0.5 };

export interface SolvedBoard {
	/** All five interior angles in degrees, including the two the constraints pin. */
	angles: Record<"A" | "B" | "C" | "D" | "E", number>;
	/** The five edge-class lengths, a = 1. */
	sides: Record<SideKey, number>;
	/** Interior angle in RADIANS at each of the six tile corners, indexed like BOARD_CORNERS. */
	cornerAngles: number[];
	/** The tile's six vertices in the plane, starting at the origin with side b along +x. */
	outline: { x: number; y: number }[];
	/** How far the outline walk missed its start. Pinned in the tests. */
	closure: number;
}

export type BoardError = "angle-out-of-range" | "no-positive-sides" | "degenerate";
export type SolveBoardResult =
	| { ok: true; board: SolvedBoard; error?: undefined }
	| { ok: false; board?: undefined; error: BoardError };

const DEG = Math.PI / 180;

/** The two pinned angles. C is type 1's constraint; E is what is left of the 540° pentagon sum. */
export function pinnedAngles(A: number, B: number, D: number) {
	const C = 180 - B;
	const E = 540 - A - B - C - D;
	return { A, B, C, D, E };
}

/** Interior angle at each of the six tile corners, in degrees, in BOARD_CORNERS order. */
function cornerDegrees(ang: Record<string, number>): number[] {
	return BOARD_CORNERS.map((c) => (c === "Pi" ? 180 : ang[c]));
}

/** The heading of each of the six sides, in radians, walking the tile boundary. Side 0 starts along
 *  +x; at each corner the heading turns by the exterior angle 180 − interior. */
function headings(ang: Record<string, number>): number[] {
	const deg = cornerDegrees(ang);
	const out: number[] = [];
	let th = 0;
	for (let i = 0; i < BOARD_SIDES.length; i++) {
		out.push(th);
		// The turn happens AT the corner the side arrives at, which is corner i+1.
		th += (180 - deg[(i + 1) % deg.length]) * DEG;
	}
	return out;
}

/** The 2 × 5 closure matrix: row 0 the x components, row 1 the y, columns in SIDE_KEYS order. Summing
 *  length × direction over the six sides must give zero, and the two b-edges cancel each other. */
export function closureMatrix(ang: Record<string, number>): number[][] {
	const th = headings(ang);
	const M = [new Array(5).fill(0), new Array(5).fill(0)];
	for (let i = 0; i < BOARD_SIDES.length; i++) {
		const j = SIDE_KEYS.indexOf(BOARD_SIDES[i]);
		M[0][j] += Math.cos(th[i]);
		M[1][j] += Math.sin(th[i]);
	}
	return M;
}

/** (c, d, e) as `particular + t · direction`: the closure equations are two constraints on three
 *  unknowns once a = 1 is fixed and b has dropped out, so exactly one degree of freedom survives. */
function cdeFamily(ang: Record<string, number>) {
	const M = closureMatrix(ang);
	const [ca, , cc, cd, ce] = [0, 1, 2, 3, 4].map((j) => [M[0][j], M[1][j]]);
	// Solve [cc cd ce]·(c,d,e) = -ca for a particular solution, and find the 1-D nullspace direction.
	// Two equations, three unknowns: eliminate by 2×2 solves over the three column pairs, taking the
	// best-conditioned pair so a near-parallel choice never drives the arithmetic.
	const cols = [cc, cd, ce];
	const pairs: [number, number][] = [
		[0, 1],
		[0, 2],
		[1, 2],
	];
	let best = -1;
	let bestDet = 0;
	for (let p = 0; p < pairs.length; p++) {
		const [i, j] = pairs[p];
		const det = cols[i][0] * cols[j][1] - cols[i][1] * cols[j][0];
		if (Math.abs(det) > Math.abs(bestDet)) {
			bestDet = det;
			best = p;
		}
	}
	if (best < 0 || Math.abs(bestDet) < 1e-12) return null;
	const [i, j] = pairs[best];
	const k = [0, 1, 2].find((x) => x !== i && x !== j)!;
	const solve2 = (rhs: number[]) => {
		const x = (rhs[0] * cols[j][1] - rhs[1] * cols[j][0]) / bestDet;
		const y = (cols[i][0] * rhs[1] - cols[i][1] * rhs[0]) / bestDet;
		return [x, y];
	};
	// particular: free unknown k = 0
	const part = new Array(3).fill(0);
	const [pi, pj] = solve2([-ca[0], -ca[1]]);
	part[i] = pi;
	part[j] = pj;
	// direction: free unknown k = 1, homogeneous
	const dir = new Array(3).fill(0);
	const [di, dj] = solve2([-cols[k][0], -cols[k][1]]);
	dir[i] = di;
	dir[j] = dj;
	dir[k] = 1;
	return { part, dir };
}

/** The interval of `t` (in the raw `part + t·dir` parameter) where c, d and e are all positive. The
 *  slider is normalised across it, so every slider position is a real tiling and none is a hole. */
export function validTRange(ang: Record<string, number>): [number, number] | null {
	const f = cdeFamily(ang);
	if (!f) return null;
	let lo = -Infinity;
	let hi = Infinity;
	for (let i = 0; i < 3; i++) {
		const p = f.part[i];
		const d = f.dir[i];
		if (Math.abs(d) < 1e-12) {
			if (p <= 0) return null; // this length is fixed and non-positive: no valid t at all
			continue;
		}
		// p + t·d > 0
		const bound = -p / d;
		if (d > 0) lo = Math.max(lo, bound);
		else hi = Math.min(hi, bound);
	}
	if (!(lo < hi)) return null;
	// An unbounded end is clamped to something drawable: past this the tile is a sliver and the
	// slider would spend most of its travel on shapes nobody can see.
	const LO = Number.isFinite(lo) ? lo : hi - 8;
	const HI = Number.isFinite(hi) ? hi : lo + 8;
	return [LO, HI];
}

/** Solve the board at a parameter point. */
export function solveEdgeBoard(p: PentEdgeParams): SolveBoardResult {
	const angles = pinnedAngles(p.A, p.B, p.D);
	for (const v of Object.values(angles)) {
		if (!(v > 0.5 && v < 179.5)) return { ok: false, error: "angle-out-of-range" };
	}
	if (!(p.b > 0)) return { ok: false, error: "no-positive-sides" };
	const range = validTRange(angles);
	const f = cdeFamily(angles);
	if (!range || !f) return { ok: false, error: "degenerate" };
	// The positivity range is OPEN: at either end one of c, d, e is exactly zero and the tile collapses
	// to a quadrilateral. So the slider's travel is inset into the interior, which keeps every position
	// a real tiling instead of making the two extremes dead.
	const INSET = 0.02;
	const lo = range[0] + (range[1] - range[0]) * INSET;
	const hi = range[1] - (range[1] - range[0]) * INSET;
	const tRaw = lo + (hi - lo) * Math.min(1, Math.max(0, p.t));
	const [c, d, e] = [0, 1, 2].map((i) => f.part[i] + tRaw * f.dir[i]);
	if (!(c > 0 && d > 0 && e > 0)) return { ok: false, error: "no-positive-sides" };
	const sides: Record<SideKey, number> = { a: 1, b: p.b, c, d, e };

	const th = headings(angles);
	const outline: { x: number; y: number }[] = [];
	let x = 0;
	let y = 0;
	for (let i = 0; i < BOARD_SIDES.length; i++) {
		outline.push({ x, y });
		const L = sides[BOARD_SIDES[i]];
		x += L * Math.cos(th[i]);
		y += L * Math.sin(th[i]);
	}
	const closure = Math.hypot(x, y);
	if (!(closure < 1e-9)) return { ok: false, error: "degenerate" };
	return {
		ok: true,
		board: {
			angles,
			sides,
			cornerAngles: cornerDegrees(angles).map((v) => v * DEG),
			outline,
			closure,
		},
	};
}

/** Interior angle in radians for a certificate letter: "A5"…"E5" a corner, "Pi" the flat vertex, and
 *  any digon letter a zero-angle slot (a drawn or undrawn edge marker, never a corner). */
export function letterAngle(letter: string, board: SolvedBoard): number {
	if (letter === "Pi") return Math.PI;
	if (/^[A-E]5$/.test(letter)) return board.angles[letter[0] as "A"] * DEG;
	if (/^[A-E]1[0-3]$/.test(letter)) return 0;
	return Number.NaN;
}

/** Edge-class length for a certificate digon letter: "B12" → the b length. */
export function letterLength(letter: string, board: SolvedBoard): number {
	const m = /^([A-E])1[0-3]$/.exec(letter);
	return m ? board.sides[m[1].toLowerCase() as SideKey] : Number.NaN;
}
