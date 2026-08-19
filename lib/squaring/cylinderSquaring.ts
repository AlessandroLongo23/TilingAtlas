// Squaring a hyperbolic ball: the Brooks–Smith–Stone–Tutte construction with a wired boundary.
//
// Source at the centre, sink standing for the whole boundary. Delete nothing: the two poles are
// vertices, not the ends of a battery edge, and they are not adjacent. Everything else is as before —
// the potential V is the vertical coordinate, the stream function ψ on faces is the horizontal one, and
// each edge becomes a square because its current is both the drop in V and the jump in ψ.
//
// What changes is the shape of the answer. ψ is single-valued only away from the source: a loop in the
// dual that encircles the centre picks up the TOTAL current I, so the horizontal coordinate lives in
// ℝ/Iℤ and the result tiles a CYLINDER of circumference I and height H, not a rectangle. That is the
// Benjamini–Schramm picture, and the ±I discrepancies are checked here rather than assumed.
//
// Two certificates, both exact:
//   Σ current² = I·H          dissipated power is current times potential drop
//   every dual-loop discrepancy is 0 or ±I    which is what makes it a cylinder and not a rectangle
//
// Integrality comes from the matrix-tree theorem exactly as it does on the sphere: fixing the source at
// det(A) instead of at 1 makes every potential and every current an integer. Those integers are
// enormous — the determinant counts spanning forests of a few-hundred-vertex graph — which is why the
// SHIPPED shelf carries floats. That is a deliberate departure from the sphere and torus shelves, and
// the reason is that the property those shelves exist to protect does not arise here: nobody asks
// whether two of seven hundred squares are exactly equal, only whether the tiling closes up, and that
// is certified in exact integers at build time before anything is rounded.

import { bareissSolve, gcdAll } from "./linalg";
import type { PlanarMap } from "./planarMap";

export interface CylinderSquare {
	/** Position on the cylinder: x is taken modulo the circumference. */
	x: number;
	y: number;
	side: number;
	/** Index into the map's edge list. */
	edge: number;
}

export interface CylinderSquaring {
	squares: CylinderSquare[];
	/** Circumference: the total current, and the effective conductance centre-to-boundary. */
	circumference: number;
	/** Height: the potential drop from source to sink. Normalised to 1. */
	height: number;
	/** Potential per vertex, normalised so the source is 1 and the sink 0. */
	potential: number[];
	order: number;
	distinct: number;
}

export interface CylinderFailure {
	reason: "singular" | "not-a-cylinder" | "energy";
	detail: string;
}

/**
 * Ratio of two BigInts as a double, via a fixed-point divide so huge operands do not overflow.
 *
 * Rounded, not truncated. BigInt division truncates toward zero, which biases every coordinate down by
 * up to one unit in the last place — enough to turn 4.727431567 into 4.727431566 and make a pinned
 * regression fail for no reason.
 */
const ratio = (n: bigint, d: bigint): number => {
	if (d === 0n) return 0;
	// 1e12, not 1e9. Adjacent squares in these tilings abut EXACTLY, and at 1e9 the rounding put their
	// shared edge at two different values a nanometre apart, which reads as an overlap to any checker
	// tight enough to be worth running. A ratio here is a few units, so a few times 1e12 stays well
	// inside the 2^53 a double represents without loss.
	const SCALE = 1_000_000_000_000n;
	const num = n * SCALE;
	const half = d / 2n;
	const rounded = num >= 0n ? (num + half) / d : (num - half) / d;
	return Number(rounded) / Number(SCALE);
};

/**
 * The square tiling of the cylinder determined by a source and a wired sink.
 *
 * The solve is exact; only the returned coordinates are floats, and only after both certificates have
 * been checked in integers.
 */
export function squareCylinder(
	map: PlanarMap,
	source: number,
	sink: number,
): { ok: true; squaring: CylinderSquaring } | { ok: false; error: CylinderFailure } {
	const { vertexCount, faces, faceLeftOf, edges, adjacency } = map;

	// ---- potential: harmonic everywhere but the two poles -----------------------------------------
	const free: number[] = [];
	for (let v = 0; v < vertexCount; v++) if (v !== source && v !== sink) free.push(v);
	const at = new Map(free.map((v, i) => [v, i]));
	const n = free.length;
	const A: bigint[][] = Array.from({ length: n }, () => new Array<bigint>(n).fill(0n));
	const b: bigint[] = new Array<bigint>(n).fill(0n);
	for (const v of free) {
		const i = at.get(v) as number;
		A[i][i] = BigInt(adjacency[v].size);
		for (const w of adjacency[v]) {
			if (w === source) b[i] += 1n;
			else if (w === sink) continue;
			else A[i][at.get(w) as number] -= 1n;
		}
	}
	let sol;
	try {
		sol = bareissSolve(A, b);
	} catch (e) {
		return { ok: false, error: { reason: "singular", detail: String(e) } };
	}
	// Potentials in units of 1/det: the source sits at det, the sink at zero.
	const det = sol.det;
	const P: bigint[] = new Array<bigint>(vertexCount).fill(0n);
	P[source] = det;
	for (const v of free) P[v] = sol.numer[at.get(v) as number];

	const H = det;
	let I = 0n;
	for (const w of adjacency[source]) I += P[source] - P[w];
	if (I <= 0n) return { ok: false, error: { reason: "energy", detail: `total current ${I}` } };

	// ---- stream function: ψ on faces, single-valued only modulo I ----------------------------------
	const key = (a: number, c: number) => `${a},${c}`;
	const psi: (bigint | null)[] = new Array<bigint | null>(faces.length).fill(null);
	psi[0] = 0n;
	const queue = [0];
	const wraps: bigint[] = [];
	while (queue.length > 0) {
		const f = queue.shift() as number;
		const ring = faces[f];
		for (let i = 0; i < ring.length; i++) {
			const a = ring[i];
			const c = ring[(i + 1) % ring.length];
			const g = faceLeftOf.get(key(c, a));
			if (g === undefined) continue;
			const val = (psi[f] as bigint) + (P[a] - P[c]);
			if (psi[g] === null) {
				psi[g] = val;
				queue.push(g);
			} else {
				wraps.push(val - (psi[g] as bigint));
			}
		}
	}
	for (const w of wraps) {
		if (w % I !== 0n) {
			return {
				ok: false,
				error: { reason: "not-a-cylinder", detail: `dual loop closes with ${w}, not a multiple of ${I}` },
			};
		}
	}

	// ---- energy certificate, in integers ------------------------------------------------------------
	let energy = 0n;
	for (const [u, v] of edges) {
		const d = P[u] - P[v];
		energy += d * d;
	}
	if (energy !== I * H) {
		return { ok: false, error: { reason: "energy", detail: `Σ i² = ${energy}, I·H = ${I * H}` } };
	}

	// ---- lay the squares out ------------------------------------------------------------------------
	const mod = (v: bigint, m: bigint): bigint => ((v % m) + m) % m;
	const raw: { x: bigint; y: bigint; s: bigint; edge: number }[] = [];
	for (let e = 0; e < edges.length; e++) {
		const [u, v] = edges[e];
		const hi = P[u] > P[v] ? u : v;
		const lo = hi === u ? v : u;
		const s = P[hi] - P[lo];
		if (s === 0n) continue;
		// The face to the left of the downhill dart carries the square's left edge.
		const f = faceLeftOf.get(key(hi, lo));
		if (f === undefined) continue;
		raw.push({ x: mod(psi[f] as bigint, I), y: P[lo], s, edge: e });
	}

	const g = gcdAll([...raw.flatMap((r) => [r.x, r.y, r.s]), I, H]) || 1n;
	const squares = raw.map((r) => ({
		x: ratio(r.x / g, H / g),
		y: ratio(r.y / g, H / g),
		side: ratio(r.s / g, H / g),
		edge: r.edge,
	}));
	const sides = new Set(raw.map((r) => (r.s / g).toString()));

	return {
		ok: true,
		squaring: {
			squares,
			// Normalised to height 1, so the circumference is the effective conductance directly.
			circumference: ratio(I, H),
			height: 1,
			potential: Array.from({ length: vertexCount }, (_, v) => ratio(P[v], H)),
			order: squares.length,
			distinct: sides.size,
		},
	};
}
