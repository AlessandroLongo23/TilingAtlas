/**
 * de Bruijn multigrid (dual) construction of quasiperiodic rhombic tilings — the projection-side
 * counterpart to the Sub Rosa substitution generator (lib/subrosa).
 *
 * Method (de Bruijn 1981). Take n grid directions eⱼ = (cos πj/n, sin πj/n) and n real offsets γⱼ.
 * Grid family j is the parallel lines z·eⱼ + γⱼ = k, k ∈ ℤ. Each intersection of a family-i line and
 * a family-j line dualizes to a RHOMBUS with edges e_i, e_j; each open mesh dualizes to a vertex.
 * The result is a 2n-fold rhombic tiling (n=5 → Penrose, n=4 → Ammann–Beenker, …) with ⌊n/2⌋ rhomb
 * shapes labelled protoId = min(|i−j|, n−|i−j|), matching Sub Rosa's prototiles and hues.
 *
 * Exactness. A rhombus corner is a mesh vertex V(K) = Σⱼ Kⱼ eⱼ with K ∈ ℤⁿ the integer index vector.
 * K is the EXACT identity of a vertex (two rhombi share a corner iff they share K), so topology is
 * integer equality — no tolerance. Positions are the float sum, computed by ONE canonical function so
 * shared corners are bit-identical (no render cracks). Hence no CyclotomicRing is needed: unlike Sub
 * Rosa, this is a single-pass construction, so float positions never accumulate error.
 */

import { Vector } from "@/classes/Vector";

export interface MultigridParams {
	n: number; // number of grid directions ⇒ 2n-fold symmetry
	offsets: number[]; // γⱼ, length n
	radius: number; // world-space radius of the enumerated patch
}

export interface MgTile {
	protoId: number; // min(|i−j|, n−|i−j|) ∈ 1..⌊n/2⌋
	corners: Vector[]; // 4 world corners
	vkeys: string[]; // the 4 corners' integer index-vector keys (exact vertex identity)
}

/** Grid directions eⱼ = (cos πj/n, sin πj/n), j = 0..n−1. */
export function directions(n: number): Vector[] {
	const e: Vector[] = [];
	for (let j = 0; j < n; j++) e.push(new Vector(Math.cos((Math.PI * j) / n), Math.sin((Math.PI * j) / n)));
	return e;
}

// A generic (irrational) multiplier: γⱼ = frac((j+1)·g) − 0.5 spreads the offsets so no three grid
// lines are ever concurrent. Equally-spaced offsets look tidier but are a measure-zero SINGULAR choice
// — for some n (e.g. 7) they force triple points, where the dual is not a clean rhombus. Generic
// offsets always yield an edge-to-edge rhombic tiling (unit edges regardless; only the combinatorics
// depend on the offsets), which is what a free editor needs.
const GENERIC_G = 0.6180339887498949; // 1/φ

/** Default offsets in [0,1): a generic set (no triple points) giving a clean patch for any n. Offsets
 *  are periodic mod 1 (a grid family repeats every unit); the +0.5 phase centres the golden sequence
 *  away from the singular configuration it hits without it, then folds back into [0,1) for the sliders. */
export function canonicalOffsets(n: number): number[] {
	const g: number[] = [];
	for (let j = 0; j < n; j++) g.push(((j + 1) * GENERIC_G + 0.5) % 1);
	return g;
}

/**
 * The 2n-fold-symmetric preset: all offsets = 0.5. Rotation by π/n about the origin sends direction
 * e_j → e_{j+1} and e_{n−1} → −e_0 (a sign flip on wrap), so the grid is invariant iff every γⱼ is
 * equal AND γ₀ = −γ_{n−1} (mod 1); 0.5 = −0.5 (mod 1) satisfies both, and keeps the origin off every
 * line (no singular centre). The result is a centred, 2n-fold-symmetric quasicrystal.
 */
export function symmetricOffsets(n: number): number[] {
	return new Array(n).fill(0.5);
}

/** Seeded generic offsets (mulberry32) for the Randomize preset. */
export function randomOffsets(n: number, seed: number): number[] {
	let s = seed >>> 0;
	const rnd = () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const g: number[] = [];
	for (let j = 0; j < n; j++) g.push(rnd());
	return g;
}

const keyOf = (K: number[]): string => K.join(",");

/**
 * Build one patch of the multigrid tiling. Enumerates every in-window intersection of two grid lines
 * and emits its dual rhombus. `maxTiles` caps the output (returns what fit + a `capped` flag).
 */
export function buildMultigrid(p: MultigridParams, maxTiles = 200_000): { tiles: MgTile[]; capped: boolean } {
	const { n, offsets: g, radius: R } = p;
	const e = directions(n);
	// vertexPos(K): the ONE canonical position map, fixed loop order ⇒ shared corners bit-identical.
	const vertexPos = (K: number[]): Vector => {
		let x = 0, y = 0;
		for (let m = 0; m < n; m++) {
			x += K[m] * e[m].x;
			y += K[m] * e[m].y;
		}
		return new Vector(x, y);
	};

	const tiles: MgTile[] = [];
	let capped = false;
	const R2 = R * R;

	for (let i = 0; i < n && !capped; i++) {
		for (let j = i + 1; j < n && !capped; j++) {
			const det = e[i].x * e[j].y - e[j].x * e[i].y; // = sin(π(j−i)/n) ≠ 0
			const aLo = Math.ceil(g[i] - R), aHi = Math.floor(g[i] + R);
			const bLo = Math.ceil(g[j] - R), bHi = Math.floor(g[j] + R);
			const proto = Math.min(j - i, n - (j - i));
			for (let a = aLo; a <= aHi && !capped; a++) {
				const ai = a - g[i]; // z·eᵢ on line (i,a)
				for (let b = bLo; b <= bHi; b++) {
					const bj = b - g[j]; // z·eⱼ on line (j,b)
					// Solve [eᵢ; eⱼ]·z = [ai; bj].
					const px = (ai * e[j].y - bj * e[i].y) / det;
					const py = (bj * e[i].x - ai * e[j].x) / det;
					if (px * px + py * py > R2) continue;

					// Base index for m ∉ {i,j}; a nudge keeps floor off exact grid lines at generic offsets.
					const K = new Array<number>(n);
					for (let m = 0; m < n; m++) {
						if (m === i || m === j) continue;
						K[m] = Math.floor(px * e[m].x + py * e[m].y + g[m] + 1e-9);
					}
					const corner = (ki: number, kj: number): { v: Vector; key: string } => {
						K[i] = ki;
						K[j] = kj;
						return { v: vertexPos(K), key: keyOf(K) };
					};
					const c00 = corner(a - 1, b - 1);
					const c10 = corner(a, b - 1);
					const c11 = corner(a, b);
					const c01 = corner(a - 1, b);
					tiles.push({
						protoId: proto,
						corners: [c00.v, c10.v, c11.v, c01.v],
						vkeys: [c00.key, c10.key, c11.key, c01.key],
					});
					if (tiles.length >= maxTiles) {
						capped = true;
						break;
					}
				}
			}
		}
	}
	return { tiles, capped };
}

export interface MgEdgeReport {
	tiles: number;
	edgesOverused: number; // interior edges shared by >2 tiles (should be 0)
	boundaryEdges: number; // edges used exactly once
	boundaryLoops: number; // 1 for a gap-free simply-connected patch
}

/**
 * Edge-to-edge check keyed on the EXACT integer vertex ids (vkeys), not float positions. A valid
 * rhombic tiling uses every interior edge exactly twice and every boundary edge once; a gap-free
 * simply-connected patch has exactly one boundary loop.
 */
export function multigridEdgeCheck(tiles: MgTile[]): MgEdgeReport {
	const use = new Map<string, number>();
	for (const t of tiles)
		for (let k = 0; k < 4; k++) {
			const a = t.vkeys[k], b = t.vkeys[(k + 1) % 4];
			const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
			use.set(edge, (use.get(edge) ?? 0) + 1);
		}
	let over = 0;
	const single: [string, string][] = [];
	for (const [edge, c] of use) {
		if (c > 2) over++;
		if (c === 1) single.push(edge.split("|") as [string, string]);
	}
	// Boundary loops: union-find on the once-used edges' endpoints.
	const parent = new Map<string, string>();
	const find = (x: string): string => {
		let r = x;
		while (parent.get(r) && parent.get(r) !== r) r = parent.get(r)!;
		parent.set(x, r);
		return r;
	};
	for (const [a, b] of single) {
		if (!parent.has(a)) parent.set(a, a);
		if (!parent.has(b)) parent.set(b, b);
		parent.set(find(a), find(b));
	}
	const roots = new Set<string>();
	for (const k of parent.keys()) roots.add(find(k));
	return { tiles: tiles.length, edgesOverused: over, boundaryEdges: single.length, boundaryLoops: roots.size };
}

/** Symmetries the constructor offers (2n-fold). Bounded by patch size, not arithmetic. */
export const MULTIGRID_SYMMETRIES: readonly number[] = [4, 5, 6, 7, 8, 9, 10];
