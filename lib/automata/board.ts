// Turning a tiling plus a chosen surface into something the engine can actually run.
//
// For the plane, the cylinder and the torus this is bookkeeping: the board's periods are whole numbers of
// fundamental cells along v₁ and v₂, and the engine wraps by them. The Möbius band and the Klein bottle
// are the ones that need work, and this module is where that work lives.
//
// ── WHY A FLIPPED BOARD IS NOT JUST A WRAP WITH A MINUS SIGN ──────────────────────────────────────────
//
// Crossing a flipped seam applies a glide reflection g = R + τ, where R is the Euclidean reflection across
// the seam direction v₁. Two facts make that awkward for a rectangular array:
//
//  1. R's −1 eigenvector is PERPENDICULAR to v₁, and the lattice vector along it is generally not v₂. On
//     the hexagonal lattice R sends v₂ to v₁ − v₂, so the perpendicular lattice direction is w = 2v₂ − v₁
//     — a sublattice of index 2. A board whose second period is v₂ is simply not a quotient of the plane
//     by anything containing g.
//  2. g is an isometry of the tiling, not of the cell decomposition: it maps tiles onto tiles, but slot t
//     lands on some other slot in some other cell.
//
// So step one is REFINEMENT: rewrite the adjacency on the sublattice ⟨v₁, w⟩, whose cell holds μ = 1 or 2
// of the original cells. In that basis R is exactly diag(1, −1) — v₁ and w are the +1 and −1 eigenvectors
// of an orthogonal reflection, hence perpendicular, hence the refined cell is a rectangle — and g becomes
// (A, B, s) ↦ (A + P[s], −B + Q[s], σ(s)) with integer P, Q and a slot permutation σ.
//
// ── AND WHY THE ENGINE STILL NEVER SEES A FLIP ────────────────────────────────────────────────────────
//
// The board is then run on its ORIENTATION DOUBLE COVER — a cylinder for the Möbius band, a torus for the
// Klein bottle, twice as wide — carrying a state invariant under the deck transformation ι (the glide
// itself). That is not an approximation. ι is an automorphism of the adjacency graph and maps every tile
// to a congruent one, so it commutes with the rule; an ι-invariant configuration therefore stays
// ι-invariant exactly, forever, in integer arithmetic. Configurations on the cover invariant under ι are
// in bijection with configurations on the quotient, and each cell's neighbour multiset is preserved
// because a covering map is a local isomorphism. Running the cover IS running the quotient.
//
// The payoff is that the engine keeps one code path: plain modular wrapping, contiguous halo copies, no
// per-cell slot permutation in the inner loop. The flip is paid for once, when the soup is seeded.

import { buildPeriodicAdjacency, type NeighborRef, type PeriodicAdjacency } from "@/lib/automata/adjacency";
import { findFlip, topologyDef, type TopologyId } from "@/lib/automata/topology";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

/** A map on tiles, in the coordinates of whatever adjacency it was built for. */
export type TileMap = (a: number, b: number, s: number) => [number, number, number];

export interface BoardPlan {
	topology: TopologyId;
	/** The adjacency the engine AND every renderer run on — refined when the surface is flipped. */
	adj: PeriodicAdjacency;
	/** Engine periods, null per open axis. On a flipped surface these are the DOUBLE COVER's. */
	wrapI: number | null;
	wrapJ: number | null;
	/**
	 * The deck transformation of the double cover, or null when the surface is orientable.
	 *
	 * The board's state is kept invariant under it; that invariance is what makes the cover a faithful
	 * simulation of the quotient.
	 */
	involution: TileMap | null;
	/**
	 * Width of the quotient board in refined cells: half the cover's period.
	 *
	 * A HALF-INTEGER here is not a bug. It means the tiling's only glide parallel to v₁ shifts by half a
	 * cell (the brick-wall pattern is the classic case), so the surface really does close up after a
	 * half-cell offset. The seam overlay draws it there.
	 */
	domainW: number;
	domainH: number;
	/** Where the flip's axis sits along v₂ of the refined cell: the identification is B ↦ axis·2 − B. */
	axisB: number;
	/** Original cells per refined cell — 1 unless the flip forced a sublattice. */
	refine: number;
}

// ── Refinement onto ⟨v₁, a·v₁ + b·v₂⟩ ──────────────────────────────────────────────────────────────

/**
 * Rewrite an adjacency on the sublattice spanned by v₁ and w = a·v₁ + b·v₂, with b ≥ 1.
 *
 * The new cell holds b copies of the old one — old cells (0,0) … (0,b−1) — so slot (r, t) of the refined
 * cell is old slot t of old cell (0, r), and the new slot index is r·n + t. Everything else follows from
 * the coordinate change (i, j) ↦ (A, B, r) with j = B·b + r and i = A + a·B.
 *
 * b = 1 and a = 0 is the identity and returns the input untouched, which is the common case: a tiling
 * whose reflection sends v₂ to −v₂ needs no refinement at all.
 */
export function refineAdjacency(adj: PeriodicAdjacency, a: number, b: number): PeriodicAdjacency {
	if (a === 0 && b === 1) return adj;
	const n = adj.n;
	const [[v1x, v1y], [v2x, v2y]] = adj.basis;

	/** Old lattice cell → refined cell plus which of the b cosets it is. */
	const toRefined = (i: number, j: number): [number, number, number] => {
		const B = Math.floor(j / b);
		return [i - a * B, B, j - B * b];
	};

	const polys: PeriodicAdjacency["polys"] = [];
	const sides: number[] = [];
	const centroids: { x: number; y: number }[] = [];
	for (let r = 0; r < b; r++) {
		const ox = r * v2x;
		const oy = r * v2y;
		for (let t = 0; t < n; t++) {
			const p = adj.polys[t];
			polys.push({ ...p, vertices: p.vertices.map((v) => ({ x: v.x + ox, y: v.y + oy })) });
			sides.push(adj.sides[t]);
			centroids.push({ x: adj.centroids[t].x + ox, y: adj.centroids[t].y + oy });
		}
	}

	const convert = (table: NeighborRef[][]): NeighborRef[][] => {
		const out: NeighborRef[][] = [];
		for (let r = 0; r < b; r++) {
			for (let t = 0; t < n; t++) {
				out.push(
					table[t].map((ref) => {
						// Slot (r, t) sits at old cell (0, r); its neighbour is at old cell (di, r + dj).
						const [A, B, r2] = toRefined(ref.di, r + ref.dj);
						return { t: r2 * n + ref.t, di: A, dj: B };
					}),
				);
			}
		}
		return out;
	};

	const edge = convert(adj.edge);
	const moore = convert(adj.moore);
	let radius = 1;
	for (const list of moore) {
		for (const ref of list) radius = Math.max(radius, Math.abs(ref.di), Math.abs(ref.dj));
	}

	return {
		n: n * b,
		sides,
		centroids,
		polys,
		medianEdge: adj.medianEdge,
		edge,
		moore,
		basis: [
			[v1x, v1y],
			[a * v1x + b * v2x, a * v1y + b * v2y],
		],
		radius,
	};
}

// ── The glide, in refined coordinates ──────────────────────────────────────────────────────────────

export interface RefinedFlip {
	adj: PeriodicAdjacency;
	/** Slot permutation. σ² = identity. */
	sigma: Int32Array;
	/** Per slot, the glide's whole-cell displacement: (A, B, s) ↦ (A + P[s], −B + Q[s], σ(s)). */
	P: Int32Array;
	Q: Int32Array;
	/** The glide's translation along v₁ of the refined cell, as a real number. Always a half-integer. */
	alpha: number;
	/** The reflection's axis: the plane map is B ↦ beta − B. */
	beta: number;
	refine: number;
}

/**
 * Put the tiling's glide parallel to v₁ into the form a rectangular board can use.
 *
 * Returns null when the tiling has no such glide (it is chiral along this axis), or when the reflection
 * does not have the shape the argument above assumes — a cheap guard, since everything downstream trusts
 * that R fixes v₁ and squares to the identity.
 */
export function refinedFlip(adj: PeriodicAdjacency): RefinedFlip | null {
	const flip = findFlip(adj, 0);
	if (!flip) return null;
	const [m0, m1, c, m3] = flip.m;
	// R fixes the seam direction and has determinant −1, so its matrix is [[1, c], [0, −1]]. Anything else
	// means findFlip changed contract underneath this.
	if (m0 !== 1 || m1 !== 0 || m3 !== -1) return null;

	// The −1 eigenvector: R(a, b) = (a + c·b, −b) equals −(a, b) exactly when 2a + c·b = 0. Primitive
	// solution (−c/2, 1) when c is even, (−c, 2) when it is odd. b > 0 keeps the refined basis positively
	// oriented, so the renderers' winding is unchanged.
	const even = c % 2 === 0;
	const a = even ? -c / 2 : -c;
	const b = even ? 1 : 2;

	const refined = refineAdjacency(adj, a, b);
	const n = adj.n;
	const count = refined.n;
	const sigma = new Int32Array(count);
	const P = new Int32Array(count);
	const Q = new Int32Array(count);

	for (let r = 0; r < b; r++) {
		for (let t = 0; t < n; t++) {
			// Slot (r, t) is old tile t of old cell (0, r). Push it through the old-lattice flip, then read
			// the answer back in refined coordinates.
			const i2 = c * r + flip.di[t];
			const j2 = -r + flip.dj[t];
			const B = Math.floor(j2 / b);
			const r2 = j2 - B * b;
			const s = r * n + t;
			P[s] = i2 - a * B;
			Q[s] = B;
			sigma[s] = r2 * n + flip.slot[t];
		}
	}

	// α and β are the same map read as a map of the plane. Recover them from any slot: the glide sends
	// slot s's centroid to slot σ(s)'s, displaced by (P, Q) cells, and in refined coordinates it acts as
	// (A, B) ↦ (A + α, β − B).
	const [[V1x, V1y], [V2x, V2y]] = refined.basis;
	const det = V1x * V2y - V2x * V1y;
	if (Math.abs(det) < 1e-12) return null;
	const latA = (x: number, y: number) => (x * V2y - y * V2x) / det;
	const latB = (x: number, y: number) => (-x * V1y + y * V1x) / det;

	let alpha = 0;
	let beta = 0;
	for (let s = 0; s < count; s++) {
		const cs = refined.centroids[s];
		const cd = refined.centroids[sigma[s]];
		const A = latA(cs.x, cs.y);
		const Bc = latB(cs.x, cs.y);
		const A2 = latA(cd.x, cd.y);
		const B2 = latB(cd.x, cd.y);
		const alphaS = A2 + P[s] - A;
		const betaS = B2 + Q[s] + Bc;
		if (s === 0) {
			alpha = alphaS;
			beta = betaS;
		} else if (Math.abs(alphaS - alpha) > 1e-6 || Math.abs(betaS - beta) > 1e-6) {
			// Every slot must agree: they are all reporting the same isometry.
			return null;
		}
	}

	// g² is a translation along the axis by 2α, and it is a symmetry of the tiling, so 2α is a whole
	// number of v₁ steps. A board built on a non-half-integer α would not close up at all.
	if (Math.abs(2 * alpha - Math.round(2 * alpha)) > 1e-6) return null;
	alpha = Math.round(2 * alpha) / 2;

	return { adj: refined, sigma, P, Q, alpha, beta, refine: b };
}

// ── The plan ───────────────────────────────────────────────────────────────────────────────────────

/**
 * What to hand the engine and the renderers for this tiling on this surface.
 *
 * Returns null when the cell will not parse, or when a flipped surface was asked for and the tiling has
 * no glide to fold it through. The caller falls back to the unflipped partner — the UI disables those
 * surfaces up front, so this is the belt to that braces.
 */
export function planBoard(
	cell: TranslationalCellData | null,
	topology: TopologyId,
	boardW: number,
	boardH: number,
): BoardPlan | null {
	const raw = buildPeriodicAdjacency(cell);
	if (!raw) return null;
	const def = topologyDef(topology);

	if (!def.needsFlip) {
		return {
			topology,
			adj: raw,
			wrapI: def.i === "open" ? null : boardW,
			wrapJ: def.j === "open" ? null : boardH,
			involution: null,
			domainW: boardW,
			domainH: boardH,
			axisB: 0,
			refine: 1,
		};
	}

	const rf = refinedFlip(raw);
	if (!rf) return null;
	const { sigma, P, Q, alpha } = rf;

	// The available glides are g composed with any whole number of v₁ steps, so the board's width can be
	// any α + K. Take the K that lands nearest the width asked for, and never below one cell.
	let K = Math.round(boardW - alpha);
	while (alpha + K < 1) K++;
	const domainW = alpha + K;
	const cover = Math.round(2 * domainW);

	const involution: TileMap = (a, b, s) => [a + P[s] + K, Q[s] - b, sigma[s]];

	return {
		topology,
		adj: rf.adj,
		wrapI: cover,
		wrapJ: def.j === "open" ? null : boardH,
		involution,
		domainW,
		domainH: boardH,
		axisB: rf.beta / 2,
		refine: rf.refine,
	};
}
