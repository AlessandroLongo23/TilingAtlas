// The Brooks–Smith–Stone–Tutte construction: a polyhedron's edge graph, one edge chosen as a battery,
// becomes a rectangle tiled by squares.
//
// R. L. Brooks, C. A. B. Smith, A. H. Stone and W. T. Tutte, "The dissection of rectangles into
// squares", Duke Math. J. 7 (1940) 312–340. The four of them were Cambridge undergraduates publishing
// jointly as "Blanche Descartes".
//
// The correspondence runs like this. In a rectangle tiled by squares, collapse every maximal horizontal
// segment to a point and turn every square into a wire joining the segment along its top to the one
// along its bottom. Kirchhoff's current law at such a point — total current in equals total current out
// — says precisely that the squares resting on a segment are as wide as the squares hanging beneath it,
// which is what "tiled with no gaps" means. Ohm's law at unit resistance says a wire's current is its
// endpoints' potential difference, which is what "the tile is as tall as the gap it fills" means. Both
// tiling conditions are electrical laws, so the tiling IS a circuit. Smith's observation, 1939.
//
// Run backwards it becomes a construction, and the piece that makes it work is that the two coordinates
// come from two different potentials:
//
//   y — the potential V on VERTICES, harmonic away from the poles (every interior potential is the
//       average of its neighbours', which is Kirchhoff's law rearranged).
//   x — the stream function ψ on FACES, i.e. a potential on the planar dual. Put the battery edge back
//       carrying the return current and ψ is well defined by ψ(right of e) − ψ(left of e) = current(e);
//       consistency around each vertex is again Kirchhoff, so one BFS over the dual computes it and no
//       second linear solve is needed.
//
// The tile for edge u→v is then [ψ_left, ψ_right] × [V(v), V(u)], and it is automatically a SQUARE,
// because the edge's current is simultaneously its potential drop and its ψ jump. That single identity
// is the whole trick.
//
// Everything here is integer. See lib/squaring/linalg.ts for why the matrix-tree normalisation removes
// the fractions rather than merely postponing them.

import { bareissSolve, gcdAll, gcdBig } from "./linalg";
import { halfEdgeKey, type PlanarMap } from "./planarMap";

/** One tile. Coordinates are exact integers with the origin at the rectangle's bottom-left. */
export interface Square {
	x: bigint;
	y: bigint;
	side: bigint;
	/** The polyhedron edge this square came from, as a sorted vertex pair. */
	edge: [number, number];
}

export interface Squaring {
	/** The battery edge: potentials are fixed at these two vertices. */
	battery: [number, number];
	width: bigint;
	height: bigint;
	/** Non-degenerate tiles only, sorted by (y, x). */
	squares: Square[];
	/**
	 * Edges whose current came out zero, so their square has side zero and vanishes. These are forced
	 * by symmetry — two vertices the polyhedron's own isometries exchange sit at equal potential — and
	 * their presence is why a 3-connected graph does not always give a SIMPLE squaring.
	 */
	degenerate: number;
	/**
	 * Number of spanning 2-forests of the network separating the poles, = the height before the tiling
	 * is reduced by its gcd. Kept because it is the matrix-tree quantity the tests check against.
	 */
	forests: bigint;
	/** The factor the raw integer solution was divided by to reach lowest terms. */
	reduction: bigint;
	/**
	 * Potential at each vertex, in the same reduced units as the tiling: V(negative pole) = 0 and
	 * V(positive pole) = height. This is the y coordinate of the horizontal segment that vertex became,
	 * so it is what a drawing of the Smith diagram is laid out on.
	 */
	potential: bigint[];
	/**
	 * One entry per network edge, oriented downhill. `value` is the current, which is also the side of
	 * the square that edge became; a zero here is a degenerate tile.
	 */
	currents: { from: number; to: number; value: bigint }[];
}

/**
 * Build the squared rectangle for one choice of battery edge.
 *
 * @param map      an oriented planar map (see planarMap.ts — orientation is not optional here, the
 *                 left/right face distinction is where the x coordinates come from)
 * @param battery  the edge to remove and replace with a battery, as a vertex pair
 * @returns the squaring, or null if the network is degenerate (disconnected after the edge is removed,
 *          or the battery pair is not an edge)
 */
export function squaringFrom(map: PlanarMap, battery: [number, number]): Squaring | null {
	const [p, n] = battery;
	if (p === n) return null;
	if (!map.adjacency[p]?.has(n)) return null;

	const free: number[] = [];
	for (let v = 0; v < map.vertexCount; v++) {
		if (v !== p && v !== n) free.push(v);
	}
	const slot = new Map<number, number>();
	free.forEach((v, i) => slot.set(v, i));

	// Network edges: every edge except the battery.
	const netEdges = map.edges.filter(([a, b]) => !(a === Math.min(p, n) && b === Math.max(p, n)));

	// Reduced Laplacian. Free vertices keep their full degree — the removed edge touches only the poles.
	const m = free.length;
	const A: bigint[][] = Array.from({ length: m }, () => new Array<bigint>(m).fill(0n));
	const b: bigint[] = new Array<bigint>(m).fill(0n);
	for (const [u, w] of netEdges) {
		const iu = slot.get(u);
		const iw = slot.get(w);
		if (iu !== undefined) A[iu][iu] += 1n;
		if (iw !== undefined) A[iw][iw] += 1n;
		if (iu !== undefined && iw !== undefined) {
			A[iu][iw] -= 1n;
			A[iw][iu] -= 1n;
		} else if (iu !== undefined && w === p) {
			b[iu] += 1n; // coefficient of V(p), which we are about to fix at det(A)
		} else if (iw !== undefined && u === p) {
			b[iw] += 1n;
		}
		// Edges to n contribute nothing: V(n) = 0.
	}

	let solved;
	try {
		solved = bareissSolve(A, b);
	} catch {
		return null; // singular ⇒ the network fell apart when the battery edge was removed
	}

	// det(A) counts 2-forests separating the poles, so it is positive for a connected network; the sign
	// only ever flips through Bareiss's row swaps, so normalise rather than trust it.
	const flip = solved.det < 0n ? -1n : 1n;
	const forests = flip * solved.det;
	if (forests === 0n) return null;

	const potential = new Array<bigint>(map.vertexCount).fill(0n);
	potential[p] = forests;
	potential[n] = 0n;
	free.forEach((v, i) => {
		potential[v] = flip * solved.numer[i];
	});

	// Total current leaving the positive pole, which is the rectangle's width.
	let current = 0n;
	for (const [u, w] of netEdges) {
		if (u === p) current += potential[p] - potential[w];
		else if (w === p) current += potential[p] - potential[u];
	}
	if (current <= 0n) return null;

	// Flow on a directed half-edge. The battery edge carries the return current, from − to +, which is
	// what makes ψ single-valued: with it in place the flow is divergence-free at every vertex.
	const flow = (u: number, v: number): bigint => {
		if ((u === n && v === p) || (u === p && v === n)) return u === n ? current : -current;
		return potential[u] - potential[v];
	};

	// ψ by BFS over the dual. The equality check is Kirchhoff's law: reaching a face by two different
	// routes must give the same value, and it will unless the map's orientation is wrong.
	const psi = new Map<number, bigint>([[0, 0n]]);
	const stack = [0];
	while (stack.length) {
		const f = stack.pop() as number;
		const ring = map.faces[f];
		const here = psi.get(f) as bigint;
		for (let i = 0; i < ring.length; i++) {
			const u = ring[i];
			const v = ring[(i + 1) % ring.length];
			const opposite = map.faceLeftOf.get(halfEdgeKey(v, u));
			if (opposite === undefined) return null;
			const value = here + flow(u, v);
			const seen = psi.get(opposite);
			if (seen === undefined) {
				psi.set(opposite, value);
				stack.push(opposite);
			} else if (seen !== value) {
				return null; // inconsistent ⇒ not a valid oriented planar map
			}
		}
	}
	if (psi.size !== map.faces.length) return null;

	let psiMin = 0n;
	for (const value of psi.values()) {
		if (value < psiMin) psiMin = value;
	}

	const raw: Square[] = [];
	let degenerate = 0;
	for (const [a, c] of netEdges) {
		// Orient the edge downhill; a zero drop means a degenerate tile.
		const drop = potential[a] - potential[c];
		if (drop === 0n) {
			degenerate++;
			continue;
		}
		const hi = drop > 0n ? a : c;
		const lo = drop > 0n ? c : a;
		const side = drop > 0n ? drop : -drop;
		const left = psi.get(map.faceLeftOf.get(halfEdgeKey(hi, lo)) as number) as bigint;
		const right = psi.get(map.faceLeftOf.get(halfEdgeKey(lo, hi)) as number) as bigint;
		const span = right > left ? right - left : left - right;
		// The square condition. If this ever fails the construction is wrong, not the data.
		if (span !== side) return null;
		raw.push({
			x: (left < right ? left : right) - psiMin,
			y: potential[lo],
			side,
			edge: [Math.min(a, c), Math.max(a, c)],
		});
	}

	// Lowest terms. The τ-normalised solution is integral but rarely primitive.
	let g = gcdAll(raw.flatMap((s) => [s.x, s.y, s.side]));
	g = gcdBig(g, gcdBig(current, forests));
	const divisor = g === 0n ? 1n : g;

	const squares = raw
		.map((s) => ({ x: s.x / divisor, y: s.y / divisor, side: s.side / divisor, edge: s.edge }))
		.sort((s, t) => (s.y === t.y ? (s.x < t.x ? -1 : s.x > t.x ? 1 : 0) : s.y < t.y ? -1 : 1));

	return {
		battery: [p, n],
		width: current / divisor,
		height: forests / divisor,
		squares,
		degenerate,
		forests,
		reduction: divisor,
		// Reported in the reduced units, so a potential reads directly as a height in the tiling.
		potential: potential.map((v) => v / divisor),
		currents: netEdges.map(([a, c]) => {
			const drop = potential[a] - potential[c];
			return drop >= 0n
				? { from: a, to: c, value: drop / divisor }
				: { from: c, to: a, value: -drop / divisor };
		}),
	};
}

/**
 * Every distinct squaring of a polyhedron, one battery edge at a time.
 *
 * Deduplicated on (width, height, sorted sides): edges in the same orbit of the solid's symmetry group
 * give literally the same rectangle, and an edge-transitive solid — every Platonic solid — therefore has
 * exactly ONE squared rectangle. Deduplicating on the geometry rather than on a precomputed orbit map
 * also catches coincidences the symmetry group does not explain.
 */
export function allSquarings(map: PlanarMap): Squaring[] {
	const seen = new Set<string>();
	const out: Squaring[] = [];
	for (const edge of map.edges) {
		const squaring = squaringFrom(map, edge);
		if (!squaring) continue;
		const key = `${squaring.width}x${squaring.height}:${squaring.squares
			.map((s) => s.side)
			.sort((a, c) => (a < c ? -1 : a > c ? 1 : 0))
			.join(",")}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(squaring);
	}
	return out;
}
