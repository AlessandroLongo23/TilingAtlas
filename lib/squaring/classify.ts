// Certification and vocabulary for a finished squaring.
//
// The two adjectives that matter both come from Brooks–Smith–Stone–Tutte, and they are independent:
//
//   PERFECT — no two tiles are the same size. Rare, and the thing the Trinity four were hunting.
//   SIMPLE  — no sub-rectangle of the tiling is itself tiled by a proper subset of the tiles. A tiling
//             that fails this is COMPOUND: it has a smaller squared rectangle sitting inside it, so it
//             is not a new object so much as two old ones stacked.
//
// Simplicity is the harder property and the one the polyhedron connection is really about: BSST proved
// that a simple squared rectangle's network is 3-connected, hence by Steinitz a convex polyhedron's
// skeleton. The converse does NOT hold, which is why this module certifies simplicity geometrically
// instead of inferring it from the graph we started with — a symmetric polyhedron can put two vertices
// at equal potential, and the squaring it produces then has fewer horizontal segments than the graph
// had vertices, with compound blocks the graph gave no warning of.

import type { Square, Squaring } from "./smith";

/** Number of tiles. Degenerate zero-side tiles are already excluded by squaringFrom. */
export const order = (s: Squaring): number => s.squares.length;

/** No two tiles the same size. */
export function isPerfect(s: Squaring): boolean {
	const seen = new Set<string>();
	for (const sq of s.squares) {
		const key = sq.side.toString();
		if (seen.has(key)) return false;
		seen.add(key);
	}
	return true;
}

/**
 * No proper sub-rectangle is itself tiled by a subset of the tiles.
 *
 * The candidate sub-rectangles are not all coordinate pairs: a sub-rectangle's bottom-left corner has
 * to BE the bottom-left corner of whichever tile occupies it, and likewise its top-right. So it is
 * enough to test each ordered pair of tiles, one supplying the low corner and one the high — O(n²)
 * candidates and O(n) to check each, instead of the O(n⁴) sweep over every pair of coordinate lines.
 * That is what makes this affordable at order 119, where the coordinate sweep is not.
 *
 * A candidate is a genuine compound block when the tiles it contains have exactly its area (so they
 * cover it with no gap, and by disjointness no overlap) and there are at least two of them and they are
 * not the whole tiling.
 */
export function isSimple(s: Squaring): boolean {
	const n = s.squares.length;
	if (n < 2) return true;
	const total = s.width * s.height;

	for (let i = 0; i < n; i++) {
		const x0 = s.squares[i].x;
		const y0 = s.squares[i].y;
		for (let j = 0; j < n; j++) {
			const x1 = s.squares[j].x + s.squares[j].side;
			const y1 = s.squares[j].y + s.squares[j].side;
			if (x1 <= x0 || y1 <= y0) continue;
			const area = (x1 - x0) * (y1 - y0);
			if (area === total) continue; // the whole rectangle is not a compound block
			let inside = 0n;
			let count = 0;
			for (let k = 0; k < n; k++) {
				const t = s.squares[k];
				if (t.x >= x0 && t.x + t.side <= x1 && t.y >= y0 && t.y + t.side <= y1) {
					inside += t.side * t.side;
					count++;
					if (inside > area) break;
				}
			}
			if (count >= 2 && inside === area) return false;
		}
	}
	return true;
}

/**
 * Every point of the rectangle covered exactly once — no gap, no overlap.
 *
 * Checked on the compressed coordinate grid, which is exact: every tile boundary is a grid line, so a
 * cell of the grid is either wholly inside a tile or wholly outside it. Same idea as the coverage
 * assertions in lib/tilings/length-families.test.ts, where 0 is a gap and 2 an overlap.
 */
export function tilesExactly(s: Squaring): boolean {
	if (s.squares.length === 0) return false;
	const xsSet = new Set<bigint>([0n, s.width]);
	const ysSet = new Set<bigint>([0n, s.height]);
	for (const sq of s.squares) {
		if (sq.x < 0n || sq.y < 0n || sq.x + sq.side > s.width || sq.y + sq.side > s.height) return false;
		xsSet.add(sq.x);
		xsSet.add(sq.x + sq.side);
		ysSet.add(sq.y);
		ysSet.add(sq.y + sq.side);
	}
	const cmp = (a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0);
	const xs = [...xsSet].sort(cmp);
	const ys = [...ysSet].sort(cmp);
	const xi = new Map(xs.map((v, i) => [v.toString(), i]));
	const yi = new Map(ys.map((v, i) => [v.toString(), i]));

	const cover = Array.from({ length: xs.length - 1 }, () => new Array<number>(ys.length - 1).fill(0));
	for (const sq of s.squares) {
		const a0 = xi.get(sq.x.toString()) as number;
		const a1 = xi.get((sq.x + sq.side).toString()) as number;
		const b0 = yi.get(sq.y.toString()) as number;
		const b1 = yi.get((sq.y + sq.side).toString()) as number;
		for (let a = a0; a < a1; a++) {
			for (let b = b0; b < b1; b++) {
				if (++cover[a][b] > 1) return false;
			}
		}
	}
	return cover.every((col) => col.every((c) => c === 1));
}

/** Total tile area, which must equal width × height. The cheap half of tilesExactly. */
export const tiledArea = (s: Squaring): bigint =>
	s.squares.reduce((acc, sq) => acc + sq.side * sq.side, 0n);

/**
 * Bouwkamp code — the standard notation for a squared rectangle, so results here can be compared with
 * the published catalogues (squaring.net holds every simple perfect squared rectangle up to order 21).
 *
 * Order, width, height, then one parenthesised group per maximal horizontal segment read top to bottom,
 * each listing the tiles resting immediately below that segment from left to right. Example: the
 * smallest simple perfect squared rectangle is `9 33 32 (18,15)(7,8)(14,4)(10,1)(9)`.
 */
export function bouwkampCode(s: Squaring): string {
	const placed = squarePlacementOrder(s);
	if (!placed) return `${s.squares.length} ${s.width} ${s.height}`;

	// A group is a maximal run of consecutive placements at the same depth — which is exactly the set
	// of tiles resting on one horizontal segment, since the greedy cannot leave a segment part-filled.
	const groups: Square[][] = [];
	let run: Square[] = [];
	let depth: bigint | null = null;
	for (const { square, depth: d } of placed) {
		if (depth !== null && d === depth) run.push(square);
		else {
			if (run.length) groups.push(run);
			run = [square];
			depth = d;
		}
	}
	if (run.length) groups.push(run);

	const body = groups.map((g) => `(${g.map((sq) => sq.side.toString()).join(",")})`).join("");
	return `${s.squares.length} ${s.width} ${s.height} ${body}`;
}

/**
 * The order Bouwkamp's notation reads the tiles in: repeatedly take the tile at the leftmost of the
 * currently highest points, as though filling the rectangle from the top down with a falling skyline.
 *
 * This is the same walk a decoder performs, which is what makes the notation decodable at all — the
 * code stores only side lengths, and the positions are recovered by replaying this greedy. Emitting in
 * any other order would produce a string that looks like a Bouwkamp code and decodes to a different
 * tiling.
 *
 * @returns the tiles in reading order with their depth below the top edge, or null if the greedy ever
 *          finds no tile at the corner it is standing on — which cannot happen for a true tiling, so a
 *          null here means the squaring is malformed
 */
function squarePlacementOrder(s: Squaring): { square: Square; depth: bigint }[] | null {
	// Corner lookup: "x,depth" → the tile whose TOP-LEFT corner sits there.
	const at = new Map<string, Square>();
	for (const sq of s.squares) at.set(`${sq.x},${s.height - (sq.y + sq.side)}`, sq);

	let runs: { start: bigint; end: bigint; depth: bigint }[] = [{ start: 0n, end: s.width, depth: 0n }];
	const out: { square: Square; depth: bigint }[] = [];

	for (let guard = 0; guard < s.squares.length; guard++) {
		let pick = -1;
		for (let i = 0; i < runs.length; i++) {
			if (pick < 0 || runs[i].depth < runs[pick].depth) pick = i;
		}
		if (pick < 0) return null;
		const { start, depth } = runs[pick];
		const square = at.get(`${start},${depth}`);
		if (!square) return null;
		out.push({ square, depth });

		// Drop the covered span to the tile's bottom edge, then merge equal-depth neighbours.
		const end = start + square.side;
		const next: typeof runs = [];
		for (const r of runs) {
			if (r.end <= start || r.start >= end) next.push(r);
			else {
				if (r.start < start) next.push({ start: r.start, end: start, depth: r.depth });
				if (r.end > end) next.push({ start: end, end: r.end, depth: r.depth });
			}
		}
		next.push({ start, end, depth: depth + square.side });
		next.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
		runs = next.reduce<typeof runs>((acc, r) => {
			const last = acc[acc.length - 1];
			if (last && last.depth === r.depth && last.end === r.start) last.end = r.end;
			else acc.push({ ...r });
			return acc;
		}, []);
	}
	return out.length === s.squares.length ? out : null;
}

export interface SmithGraph {
	/** Horizontal segments, as potentials measured from the bottom, ascending. */
	levels: bigint[];
	/** One edge per tile: the level indices its top and bottom sides lie on. */
	edges: [number, number][];
}

/**
 * The Smith diagram OF A SQUARING — the forward direction of the correspondence, recovered from the
 * finished picture rather than from the polyhedron we built it out of.
 *
 * Collapse each maximal horizontal segment to a node and turn each tile into an edge from the segment
 * along its top to the one along its bottom. Running this on our own output and comparing with the
 * graph we started from is the round-trip that certifies the construction; where a symmetry has forced
 * two vertices to equal potential the round trip will legitimately come back smaller, and that
 * discrepancy is exactly the count of degenerate tiles.
 *
 * Segments here are keyed by height alone. Two genuinely distinct segments at the same height merge,
 * which is the rare coincidence BSST flag and the reason a 3-connected graph can still yield a
 * compound squaring.
 */
export function smithGraphOf(s: Squaring): SmithGraph {
	const levelSet = new Set<string>();
	for (const sq of s.squares) {
		levelSet.add(sq.y.toString());
		levelSet.add((sq.y + sq.side).toString());
	}
	const levels = [...levelSet].map((v) => BigInt(v)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
	const index = new Map(levels.map((v, i) => [v.toString(), i]));
	const edges = s.squares.map(
		(sq) =>
			[index.get((sq.y + sq.side).toString()) as number, index.get(sq.y.toString()) as number] as [
				number,
				number,
			],
	);
	return { levels, edges };
}
