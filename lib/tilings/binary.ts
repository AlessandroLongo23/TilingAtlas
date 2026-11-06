// The binary tiling and its n-ary kin (Böröczky 1974): hyperbolic tilings that have no finite quotient,
// so no walk table can hold them (lib/render/hyperbolicWalk.ts) and the disk camera anchors on a tile
// named by its ancestry instead.
//
// THE TILES. In the upper half-plane, row m holds the boxes [k·nᵐ, (k+1)·nᵐ] × [nᵐ, nᵐ⁺¹]: two vertical
// geodesics and two horocycles. A tile's top is one n-th of its parent's bottom, so a tile is an
// (n+3)-gon: two top corners, n+1 bottom vertices. The vertical lines carry on downward for ever; how
// far one carries on UPWARD is the choice that makes the tilings uncountably many, and it is the one
// thing the half-plane coordinates do not fix. The ancestry does: digit i is the child index of the
// anchor tile's i-th ancestor (0 = leftmost). The standard tiling has every digit 0, so the anchor's left
// side runs up to the ideal point for ever; a random ancestry gives one of the others.
//
// COORDINATES. A tile is (m, k) relative to the anchor at (0, 0): on rows m ≥ 0, k counts from the
// anchor's ancestor on that row; below, from the anchor's leftmost descendant. With D(m) the anchor's
// digit m (0 below the anchor), a tile's child index is (k + D(m)) mod n, its parent is
// (m + 1, ⌊(k + D(m))/n⌋), and its child i is (m − 1, n·k + i − D(m − 1)). The shader reads the same rule
// (lib/render/binaryTilingGL.ts).
//
// TWO GEOMETRIES on the same combinatorics. Horocyclic: Böröczky's boxes, for any n. Geodesic (n = 2):
// the dual of the binary tiling has every vertex 3.4.3.4.4, which closes with REGULAR triangles and
// squares at edge REG_EDGE, the edge of the catalogue's three periodic k = 2 tilings of that type
// (hyp-k2-3-4-3-4-4__3-4-3-4-4, -b, -c). Its tiles are then the Voronoi cells of the dual's vertices:
// congruent pentagons with corners 90°, 120°, 90°, 120°, 90° at the centres of the triangles and squares.
// For n ≥ 3 the dual has two vertex types, n triangles + 3 squares and n + 1 triangles + 2 squares, and
// both close at one edge only if a triangle's angle equals a square's, which never happens.
//
// FRAMES. A tile's frame is a disk with the tile's centre at 0 and its parent towards +x; its
// neighbours then lie counter-clockwise: parent, left sibling, children left to right, right sibling.
// The horocyclic frame's chart is t = ½ + √n·i(1 + w)/(1 − w), t the tile's own coordinates (the box
// [0, 1] × [1, n]); the geodesic frame puts the dual vertex at 0.

import {
	type Complex,
	type Su11,
	su11Apply,
	su11ApplyInverse,
	su11Identity,
	su11Inverse,
	su11Mul,
	su11Normalize,
	su11Rotation,
} from "@/lib/render/hyperbolic";
import { chartFrame, toHalf } from "@/lib/render/hyperbolicWalk";
import type { DiskChart } from "@/lib/render/hypCamera";

export type BinaryVariant = "standard" | "random";

/** The camera's anchor tile, named by its ancestry. Immutable: every move returns a new one. */
export interface BinaryAnchor {
	readonly n: number;
	/** Digits from the anchor upward, as far as they have been read or changed. */
	readonly digits: readonly number[];
	/** Past `digits`, a constant digit, or null for the seeded random sequence read at index i + tailOff. */
	readonly tail: number | null;
	readonly tailOff: number;
	readonly seed: number;
	/** The anchor row's absolute level: rows alternate in shade. */
	readonly level: number;
}

const mod = (x: number, n: number) => ((x % n) + n) % n;

const hashDigit = (seed: number, i: number, n: number): number => {
	let h = (Math.imul(i + 1, 0x9e3779b1) ^ seed) >>> 0;
	h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
	h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
	return ((h ^ (h >>> 16)) >>> 0) % n;
};

export function binaryAnchor(n: number, variant: BinaryVariant, seed = 0x2b0c): BinaryAnchor {
	return { n, digits: [], tail: variant === "standard" ? 0 : null, tailOff: 0, seed, level: 0 };
}

/** Digit i of the anchor's ancestry; D(m) of the header for m ≥ 0. */
export const digitAt = (a: BinaryAnchor, i: number): number =>
	i < 0 ? 0 : i < a.digits.length ? a.digits[i] : (a.tail ?? hashDigit(a.seed, i + a.tailOff, a.n));

const up = (a: BinaryAnchor): BinaryAnchor => ({
	...a,
	digits: a.digits.slice(1),
	tailOff: a.tailOff + 1,
	level: a.level + 1,
});

const down = (a: BinaryAnchor, j: number): BinaryAnchor => ({
	...a,
	digits: [j, ...a.digits],
	tailOff: a.tailOff - 1,
	level: a.level - 1,
});

/** The tile k places along the anchor's row: n-adic addition to the ancestry. A carry into a constant
 *  tail of n − 1 (which is −1) turns it to 0, and a borrow from a tail of 0 turns it to n − 1. */
function add(a: BinaryAnchor, k: number): BinaryAnchor {
	const n = a.n;
	const d = [...a.digits];
	let tail = a.tail;
	let c = k;
	for (let i = 0; c !== 0; i++) {
		if (i >= d.length) {
			if (tail === n - 1 && c > 0) [tail, c] = [0, c - 1];
			else if (tail === 0 && c < 0) [tail, c] = [n - 1, c + 1];
			if (c === 0) break;
			d.push(tail ?? hashDigit(a.seed, i + a.tailOff, n));
		}
		const s = d[i] + c;
		d[i] = mod(s, n);
		c = Math.floor(s / n);
	}
	return { ...a, digits: d, tail };
}

/** The anchor moved to the tile (m, k), in the coordinates of the header. */
export function moveTo(a: BinaryAnchor, m: number, k: number): BinaryAnchor {
	if (m >= 0) {
		for (let i = 0; i < m; i++) a = up(a);
		return add(a, k);
	}
	const js: number[] = [];
	for (let r = m; r < 0; r++) {
		js.push(mod(k, a.n));
		k = Math.floor(k / a.n);
	}
	a = add(a, k);
	for (let i = js.length - 1; i >= 0; i--) a = down(a, js[i]);
	return a;
}

/** How many rows above the anchor the shader is told about; tiles higher up are far below a pixel. */
export const ROWS = 32;

/** The shader's view of the ancestry: digit m, and F(m) = c(m)/nᵐ where the anchor's ancestor on row m
 *  starts at x = −c(m) in the anchor's half-plane. */
export function ancestryRows(a: BinaryAnchor): { digits: Float32Array; frac: Float32Array } {
	const digits = new Float32Array(ROWS);
	const frac = new Float32Array(ROWS);
	let f = 0;
	for (let m = 0; m < ROWS; m++) {
		digits[m] = digitAt(a, m);
		frac[m] = f;
		f = (f + digits[m]) / a.n;
	}
	return { digits, frac };
}

/** The sides of the dual face in sector s (between neighbours s and s + 1, counter-clockwise from the
 *  parent) of a tile with child index j: 3 at a vertex where a line from below ends, 4 where one goes on. */
export function sectorSides(n: number, j: number, s: number): number {
	if (s === 0) return j === 0 ? 4 : 3; // top left corner
	if (s === n + 2) return j === n - 1 ? 4 : 3; // top right
	return s === 1 || s === n + 1 ? 4 : 3; // bottom corners, then the n − 1 vertices between children
}

const O: Complex = { x: 0, y: 0 };
const fromHalf = (z: Complex): Complex => {
	const d = z.x * z.x + (z.y + 1) * (z.y + 1);
	return { x: (z.x * z.x + z.y * z.y - 1) / d, y: (-2 * z.x) / d };
};
/** Hyperbolic distance between two half-plane points, as cosh − 1 (monotone in it). */
const halfGap = (p: Complex, q: Complex) => ((p.x - q.x) ** 2 + (p.y - q.y) ** 2) / (2 * p.y * q.y);
const nearest = (q: Complex, cands: Complex[]) =>
	cands.reduce((b, c) => (halfGap(q, c) < halfGap(q, b) ? c : b), cands[0]);

/** Opening view: the anchor tile's centre at the disk centre, its parent straight up. */
const HOME = su11Rotation(-Math.PI / 2);

// ---------------------------------------------------------------------------------------------------
// Horocyclic: a point's tile is read off its coordinates, no walk.

/** The horocyclic chart: the camera's anchor is a tile, and its frame is the box's (FRAMES above). */
export function horocyclicChart(n: number, seedFace: BinaryAnchor): DiskChart<BinaryAnchor> {
	const sn = Math.sqrt(n);
	const F0 = chartFrame(0.5, sn); // anchor frame → the disk of the anchor's half-plane
	/** Tile (m, k) of a point of the anchor's half-plane, its left edge X and scale s = nᵐ. */
	const locate = (a: BinaryAnchor, h: Complex) => {
		let m = Math.floor(Math.log(h.y) / Math.log(n));
		if (h.y < n ** m) m--;
		else if (h.y >= n ** (m + 1)) m++;
		const s = n ** m;
		let F = 0;
		for (let r = 0; r < m; r++) F = (F + digitAt(a, r)) / n;
		const k = Math.floor(h.x / s + F);
		// tile frame → anchor frame: the box [X, X + s] × [s, ns] read in the anchor's half-plane
		const G = su11Normalize(su11Mul(su11Inverse(F0), chartFrame((k - F) * s + 0.5 * s, sn * s)));
		return { m, k, s, X: (k - F) * s, G };
	};
	const halfOf = (w: Complex) => toHalf(su11Apply(F0, w));
	return {
		seedFace,
		home: HOME,
		reanchor(a, view) {
			const { m, k, G } = locate(a, halfOf(su11ApplyInverse(view, O)));
			if (m === 0 && k === 0) return { f: a, view, W: null, Wref: su11Identity() };
			const W = su11Inverse(G);
			return { f: moveTo(a, m, k), view: su11Normalize(su11Mul(view, G)), W, Wref: W };
		},
		snap(a, w) {
			const h = halfOf(w);
			const { s, X, G } = locate(a, h);
			const t = { x: (h.x - X) / s, y: h.y / s };
			// centre, side and top midpoints, top corners, then the bottom's vertices and the midpoints between
			const cands: Complex[] = [0.5, 0, 1].map((x) => ({ x, y: sn }));
			cands.push({ x: 0.5, y: n }, { x: 0, y: n }, { x: 1, y: n }, { x: 0, y: 1 });
			for (let i = 1; i <= n; i++) cands.push({ x: i / n, y: 1 }, { x: (i - 0.5) / n, y: 1 });
			const q = nearest(t, cands);
			return su11Apply(G, fromHalf({ x: (q.x - 0.5) / sn, y: q.y / sn }));
		},
	};
}

// ---------------------------------------------------------------------------------------------------
// Geodesic (n = 2): the regular 3.4.3.4.4 dual and its Voronoi pentagons, found by walking.

/** Interior angle of a regular p-gon of edge L in the hyperbolic plane. */
const cornerAngle = (p: number, L: number) => 2 * Math.asin(Math.cos(Math.PI / p) / Math.cosh(L / 2));

/** The edge at which two triangles and three squares close around a vertex: 2α + 3β = 2π. */
export const REG_EDGE = (() => {
	let lo = 1e-6,
		hi = 4;
	for (let i = 0; i < 100; i++) {
		const L = (lo + hi) / 2;
		if (2 * cornerAngle(3, L) + 3 * cornerAngle(4, L) > 2 * Math.PI) lo = L;
		else hi = L;
	}
	return (lo + hi) / 2;
})();
const ALPHA = cornerAngle(3, REG_EDGE);
const BETA = cornerAngle(4, REG_EDGE);

/** Directions from a tile's dual vertex to its five neighbours (parent, left sibling, child 0, child 1,
 *  right sibling), for child index j. The gaps are the corners of the faces between them: the top left
 *  face is a square for a left child, a triangle for a right one. */
export const REG_DIRS: number[][] = [0, 1].map((j) => {
	const tl = j === 0 ? BETA : ALPHA;
	return [0, tl, tl + BETA, tl + BETA + ALPHA, tl + 2 * BETA + ALPHA];
});

/** The side of the neighbour across side s that leads back, and the neighbour's child index (the
 *  parent's comes from the ancestry, so it is passed in). */
const backSide = (s: number, j: number) => (s === 0 ? 2 + j : s === 1 ? 4 : s === 4 ? 1 : 0);
const childOf = (s: number, j: number, jParent: number) => (s === 0 ? jParent : s === 1 || s === 4 ? 1 - j : s - 2);

/** Side s of a tile with child index j, as the map from its frame to the neighbour's. */
function regSideMap(s: number, j: number, jN: number): Su11 {
	const th = REG_DIRS[j][s];
	const c = Math.cosh(REG_EDGE / 2),
		sh = Math.sinh(REG_EDGE / 2);
	const toN = su11Inverse({ a: { x: c, y: 0 }, b: { x: sh * Math.cos(th), y: sh * Math.sin(th) } });
	return su11Normalize(su11Mul(su11Rotation(REG_DIRS[jN][backSide(s, j)] - th - Math.PI), toN));
}

/** The shader's side maps: sides 1–4 at index 2(s − 1) + j, the parent at 8 + 2j + j(parent). */
export const REG_MAPS: Su11[] = [
	...[1, 2, 3, 4].flatMap((s) => [0, 1].map((j) => regSideMap(s, j, childOf(s, j, 0)))),
	...[0, 1].flatMap((j) => [0, 1].map((jp) => regSideMap(0, j, jp))),
];

/** How far w (in a tile's frame) lies past its side s, as a multiple of sinh of the distance: positive
 *  means nearer the neighbour's dual vertex than this one's. */
const regPast = (w: Complex, th: number) => {
	const r2 = w.x * w.x + w.y * w.y;
	const X = (2 * (w.x * Math.cos(th) + w.y * Math.sin(th))) / (1 - r2);
	const T = (1 + r2) / (1 - r2);
	return Math.sinh(REG_EDGE) * X - (Math.cosh(REG_EDGE) - 1) * T;
};

/** Walk w from the anchor's frame to its tile: the tile (m, k), its child index, w there, and the map W. */
export function regWalk(a: BinaryAnchor, w: Complex, maxSteps = 4096) {
	const D = (m: number) => (m >= 0 ? digitAt(a, m) : 0);
	let m = 0,
		k = 0,
		W = su11Identity();
	for (let it = 0; it < maxSteps; it++) {
		const j = mod(k + D(m), 2);
		let best = 1e-12,
			bs = -1;
		for (let s = 0; s < 5; s++) {
			const p = regPast(w, REG_DIRS[j][s]);
			if (p > best) [best, bs] = [p, s];
		}
		if (bs < 0) return { m, k, j, w, W, ok: true };
		if (bs === 0) {
			k = Math.floor((k + D(m)) / 2);
			m++;
		} else if (bs === 1 || bs === 4) k += bs === 1 ? -1 : 1;
		else {
			k = 2 * k + (bs - 2) - D(m - 1);
			m--;
		}
		const M = regSideMap(bs, j, mod(k + D(m), 2));
		w = su11Apply(M, w);
		W = su11Normalize(su11Mul(M, W));
	}
	return { m, k, j: mod(k + D(m), 2), w, W, ok: false };
}

/** The geodesic chart (n = 2): the same anchors as the horocyclic one, so the camera can swap between them. */
export function geodesicChart(seedFace: BinaryAnchor): DiskChart<BinaryAnchor> {
	const at = (th: number, r: number): Complex => ({ x: r * Math.cos(th), y: r * Math.sin(th) });
	return {
		seedFace,
		home: HOME,
		reanchor(a, view) {
			const r = regWalk(a, su11ApplyInverse(view, O));
			if (r.m === 0 && r.k === 0) return { f: a, view, W: null, Wref: su11Identity() };
			return { f: moveTo(a, r.m, r.k), view: su11Normalize(su11Mul(view, su11Inverse(r.W))), W: r.W, Wref: r.W };
		},
		snap(a, w) {
			const r = regWalk(a, w);
			const dirs = REG_DIRS[r.j];
			const cands: Complex[] = [O];
			for (let s = 0; s < 5; s++) {
				const t = dirs[s],
					t2 = s === 4 ? dirs[0] + 2 * Math.PI : dirs[s + 1];
				const p = sectorSides(2, r.j, s);
				// the face's centre: its circumradius R has sinh R = sinh(L/2) / sin(π/p)
				const R = Math.asinh(Math.sinh(REG_EDGE / 2) / Math.sin(Math.PI / p));
				cands.push(at(t, Math.tanh(REG_EDGE / 4)), at((t + t2) / 2, Math.tanh(R / 2)));
			}
			const q = r.w;
			const gap = (c: Complex) =>
				((c.x - q.x) ** 2 + (c.y - q.y) ** 2) / ((1 - c.x * c.x - c.y * c.y) * (1 - q.x * q.x - q.y * q.y));
			const best = cands.reduce((b, c) => (gap(c) < gap(b) ? c : b), O);
			return su11ApplyInverse(r.W, best);
		},
	};
}
