// The five surfaces a board can be, and whether a given tiling can actually be glued into each.
//
// THE COMPLETE LIST, AND WHY IT IS COMPLETE. A board is ℝ² quotiented by a group Γ of isometries acting
// freely and properly discontinuously, so it is a two-dimensional Euclidean space form. There are exactly
// five: the plane (Γ trivial), the cylinder (Γ = ⟨translation⟩), the Möbius band (Γ = ⟨glide reflection⟩),
// the torus (Γ = ⟨two translations⟩) and the Klein bottle (Γ = ⟨translation, glide⟩). The projective plane
// is the one that looks like it belongs and cannot: a closed flat surface has Euler characteristic 0 by
// Gauss–Bonnet, and χ(ℝP²) = 1.
//
// THE PART THAT DEPENDS ON THE TILING. A seam glued by TRANSLATION is free: translating by W·v₁ is a
// symmetry of every periodic tiling by construction, so the torus and cylinder always exist. A seam glued
// with a FLIP folds through a glide reflection, and that is a quotient of the *tiling* only when the
// tiling admits that glide. A chiral tiling admits none, so its Möbius and Klein boards do not exist —
// gluing it anyway would join tiles whose edges do not meet and invent adjacency that is not there.
// `findFlip` decides this per tiling by testing the map, never by guessing from a wallpaper-group name:
// the group tells you a mirror exists somewhere, not that its axis lines up with the seam being glued.

import type { PeriodicAdjacency } from "@/lib/automata/adjacency";

/** How one lattice direction's pair of edges is treated. */
export type Seam =
	/** Not identified — the board is unbounded (plane) or has a boundary (cylinder/Möbius edge). */
	| "open"
	/** Identified by translation. */
	| "glue"
	/** Identified with a reversal: crossing this seam reflects the other coordinate. */
	| "flip";

export type TopologyId = "plane" | "cylinder" | "mobius" | "torus" | "klein";

export interface TopologyDef {
	id: TopologyId;
	label: string;
	/** How the two lattice directions are identified. `i` is the v₁ direction, `j` the v₂ direction. */
	i: Seam;
	j: Seam;
	/** Is the board finite (both directions identified)? */
	closed: boolean;
	/** Does it need a glide reflection, and so a compatible tiling? */
	needsFlip: boolean;
	blurb: string;
}

export const TOPOLOGIES: TopologyDef[] = [
	{
		id: "plane",
		label: "Plane",
		i: "open",
		j: "open",
		closed: false,
		needsFlip: false,
		blurb:
			"Unbounded. The board grows as the pattern does, so nothing meets a wall and a spaceship can leave. This is the theoretical object.",
	},
	{
		id: "cylinder",
		label: "Cylinder",
		i: "glue",
		j: "open",
		closed: false,
		needsFlip: false,
		blurb:
			"One pair of edges glued by translation; the other pair is a real boundary. A glider that leaves sideways comes back, one that leaves through an end is gone.",
	},
	{
		id: "mobius",
		label: "Möbius band",
		i: "flip",
		j: "open",
		closed: false,
		needsFlip: true,
		blurb:
			"The cylinder with a half turn: crossing the seam mirrors the board. A pattern that goes round once comes back reflected, and only returns to itself after two laps.",
	},
	{
		id: "torus",
		label: "Torus",
		i: "glue",
		j: "glue",
		closed: true,
		needsFlip: false,
		blurb:
			"Both pairs glued by translation. Finite, so every orbit closes — but growth is capped and a spaceship re-enters its own wake.",
	},
	{
		id: "klein",
		label: "Klein bottle",
		i: "flip",
		j: "glue",
		closed: true,
		needsFlip: true,
		blurb:
			"Closed like the torus, but one seam is mirrored, so the surface has no consistent side. It does not embed in three dimensions — the 3D view is an immersion and passes through itself.",
	},
];

export const topologyDef = (id: TopologyId): TopologyDef =>
	TOPOLOGIES.find((t) => t.id === id) ?? TOPOLOGIES[0];

// ── Does the tiling admit the glide a flipped seam needs? ─────────────────────────────────────────

/**
 * How a flipped seam acts on the board.
 *
 * The flip's linear part is the Euclidean REFLECTION across the line spanned by the seam's direction.
 * Written in lattice coordinates that is an integer matrix `m` — and it is generally NOT "negate the
 * other coordinate": on the hexagonal lattice, reflecting across v₁ sends v₂ to v₁ − v₂, so
 * (i, j) ↦ (i + j, −j). Taking the naive form instead would silently test a shear, which is not an
 * isometry and which no tiling is invariant under, so every non-rectangular lattice would wrongly report
 * "no flip available".
 *
 * `slot`, `di`, `dj` then say where each slot lands after `m` has been applied.
 */
export interface FlipAction {
	/** Column-major integer involution on lattice coordinates: (i,j) ↦ (m[0]i + m[2]j, m[1]i + m[3]j). */
	m: [number, number, number, number];
	/** slot[t] = which slot t becomes under the reflection. */
	slot: number[];
	di: number[];
	dj: number[];
}

const EPS = 1e-6;

/** Sorted, rounded vertex ring — an order-insensitive fingerprint for "is this the same polygon?". */
function ringKey(pts: { x: number; y: number }[], q: number): string {
	return pts
		.map((p) => `${Math.round(p.x / q)},${Math.round(p.y / q)}`)
		.sort()
		.join("|");
}

/**
 * Can this tiling be glued with a flip along `axis` (0 = the v₁ seam, 1 = the v₂ seam)?
 *
 * Two conditions, checked in order because the first is cheap and rules most cases out:
 *
 *  1. The reflection must preserve the LATTICE. R fixes the seam direction by construction; the other
 *     basis vector's image has to be an integer combination of v₁ and v₂, or the quotient is not even a
 *     periodic board.
 *  2. It must preserve the TILING. Tiles have to land on tiles: same outline, same place modulo the
 *     lattice. A chiral tiling fails here even when its lattice passes, which is exactly the case worth
 *     catching — the lattice is a much weaker object than the tiling on it.
 *
 * Symmetries sharing a linear part form a coset of the translation lattice, so one representative
 * determines the map. Candidates come from sending slot 0's image onto each slot in turn.
 *
 * Returns null when no such symmetry exists — the honest answer, and the reason the UI can disable a
 * board instead of drawing a seam that joins tiles which do not meet.
 */
export function findFlip(adj: PeriodicAdjacency, axis: 0 | 1): FlipAction | null {
	const { n, basis, centroids, polys } = adj;
	const [[v1x, v1y], [v2x, v2y]] = basis;
	const det = v1x * v2y - v2x * v1y;
	if (Math.abs(det) < EPS) return null;

	const toLat = (x: number, y: number): [number, number] => [
		(x * v2y - y * v2x) / det,
		(-x * v1y + y * v1x) / det,
	];
	const toWorld = (a: number, b: number): [number, number] => [a * v1x + b * v2x, a * v1y + b * v2y];

	// Euclidean reflection across the line spanned by the seam direction. Always an isometry, which the
	// lattice-coordinate version is not.
	const [ax, ay] = axis === 0 ? [v1x, v1y] : [v2x, v2y];
	const len2 = ax * ax + ay * ay;
	if (len2 < EPS) return null;
	const reflect = (x: number, y: number): [number, number] => {
		const k = (2 * (x * ax + y * ay)) / len2;
		return [k * ax - x, k * ay - y];
	};

	// (1) Does R preserve the lattice? Its matrix in lattice coordinates must be integral.
	const [i1a, i1b] = toLat(...(reflect(v1x, v1y) as [number, number]));
	const [i2a, i2b] = toLat(...(reflect(v2x, v2y) as [number, number]));
	const cols = [i1a, i1b, i2a, i2b];
	if (cols.some((v) => Math.abs(v - Math.round(v)) > 1e-6)) return null;
	const m = cols.map(Math.round) as [number, number, number, number];

	const q = adj.medianEdge / 20;

	/** Try the symmetry "reflect, then translate by τ" and return its action, or null. */
	const tryTau = (tx: number, ty: number): FlipAction | null => {
		const slot: number[] = new Array(n);
		const di: number[] = new Array(n);
		const dj: number[] = new Array(n);
		for (let t = 0; t < n; t++) {
			const img = polys[t].vertices.map((v) => {
				const [rx, ry] = reflect(v.x, v.y);
				return { x: rx + tx, y: ry + ty };
			});
			let cx = 0;
			let cy = 0;
			for (const p of img) {
				cx += p.x;
				cy += p.y;
			}
			cx /= img.length;
			cy /= img.length;

			let hit: { t: number; di: number; dj: number } | null = null;
			for (let t2 = 0; t2 < n && !hit; t2++) {
				if (polys[t2].n !== polys[t].n) continue;
				const [da, db] = toLat(cx - centroids[t2].x, cy - centroids[t2].y);
				const oi = Math.round(da);
				const oj = Math.round(db);
				const [ox, oy] = toWorld(oi, oj);
				if (Math.hypot(cx - centroids[t2].x - ox, cy - centroids[t2].y - oy) > q) continue;
				// Centroids agreeing is not enough — a square and a rhombus of the same area share one.
				const shifted = img.map((p) => ({ x: p.x - ox, y: p.y - oy }));
				if (ringKey(shifted, q) !== ringKey(polys[t2].vertices, q)) continue;
				hit = { t: t2, di: oi, dj: oj };
			}
			if (!hit) return null;
			slot[t] = hit.t;
			di[t] = hit.di;
			dj[t] = hit.dj;
		}
		return { m, slot, di, dj };
	};

	const [c0x, c0y] = reflect(centroids[0].x, centroids[0].y);
	for (let t2 = 0; t2 < n; t2++) {
		for (let oj = -1; oj <= 1; oj++) {
			for (let oi = -1; oi <= 1; oi++) {
				const [ox, oy] = toWorld(oi, oj);
				const found = tryTau(centroids[t2].x + ox - c0x, centroids[t2].y + oy - c0y);
				if (found) return found;
			}
		}
	}
	return null;
}

/** Which of the five surfaces this tiling can actually be glued into. */
export function availableTopologies(adj: PeriodicAdjacency | null): Set<TopologyId> {
	const out = new Set<TopologyId>(["plane", "cylinder", "torus"]);
	if (!adj) return out;
	if (findFlip(adj, 0)) {
		out.add("mobius");
		out.add("klein");
	}
	return out;
}
