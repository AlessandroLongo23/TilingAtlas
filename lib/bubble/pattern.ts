// Bubble tiles — the catalogue side. Sibling of lib/freedraw/pattern.ts and lib/colors/pattern.ts,
// occupying the same slot: the type the shelf reads, plus the translational cell it renders as.
//
// Source: Chase, Field & McCluer, "Puzzle Pieces and Bubble Tiles" (working draft, 2026-08-22). A
// bubble tile is an equilateral polygon carrying one binary edge decoration — a BUMP that protrudes
// or a BITE cut into it — under a COMPLEMENTARY matching rule: a bump must meet a bite, and two
// bumps or two bites cannot meet. That makes it an edge system like freedraw, with one difference
// that is not cosmetic: freedraw's two sides of an edge must AGREE, bubble's must DIFFER. The second
// relation is irreflexive, so no relabelling of the first reaches it — see the EU_EDGE_COMPL branch
// in eu_solver.cpp's edge_ok and the `compl` branch in gen_alphabet's edge_type_forbidden_pairs.
//
// WHY THERE IS NO BUBBLE RENDERER. A bubble tiling is an ORDINARY periodic tiling whose tiles happen
// to have curved edges, so it needs no renderer of its own: it ships a `renderCell` like any other
// Euclidean row and the flat canvas, the conformal lens, the SVG export and the thumbnails all draw
// it, which is also how it inherits fill mode, line stroke, hue shift and rotation. A first version
// of this shelf drew its own SVG instead and had none of that, and double-stroked every shared edge
// besides — each edge painted once from each side. Curved edges reach the renderers as flattened
// polylines; that is not a workaround, it is what the isohedral shelf's bulged edges already do (see
// the featureOf note in lib/render/periodic/tilings.ts).
//
// ⚑ COVERAGE. Five boards, each to its own k: triangle 4, square 5, hexagon 5, and the two mixed
// substrates 3. `k` counts VERTEX ORBITS, so those bound the SHELF and not the family. Bubble tilings
// exist at every k, and the balanced families have positive entropy (the 2-bite square family is in
// bijection with square ice, residual entropy Lieb's (4/3)^{3/2}), so no k bound will ever make this
// complete. Never relabel it "all bubble tilings".
//
// ⚑ A MIXED BOARD SHIPS ONLY GENUINELY MIXED TILINGS. An all-tile palette contains the
// single-substrate searches as special cases, so the triangle+hexagon run returned 923 all-triangle
// and 65 all-hexagon solutions that are already on their own boards. Those pure slices match the
// dedicated catalogues EXACTLY at every k, which is the best cross-validation the bubble work has,
// but shipping them would list one tiling under two boards. Publishing filters them out.

import { cubicFlatness, cubicSegmentCount, flattenCubicOpen, type Cubic, type Pt } from "@/lib/render/cubic";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

/** One developed solution, as `tools/ctrnact-oracle/develop_marked.py --complement` emits it. */
export interface BubblePattern {
	id: string;
	/** Vertex orbits of the decorated tiling, the same axis every other shelf's k uses. */
	k: number;
	/** The two period vectors; `faces` is one fundamental domain, everything else is a translate. */
	T1: [number, number];
	T2: [number, number];
	/** Distinct vertices of one fundamental domain, deduplicated. */
	verts: [number, number][];
	/** One ring of `verts` indices per tile. Indices and not coordinates because adjacent tiles share
	 *  corners: a square k=5 cell has ~20 distinct vertices behind ~70 face corners, and spelling each
	 *  one out cost about four times the bytes. Same shape public/colors ships. */
	polys: number[][];
	/** Per tile, per boundary edge i (running from ring vertex i to i+1): 1 = this tile owns the bite. */
	bites: number[][];
	/** Which lattice the substrate is. One catalogue per lattice, the way freedraw shards per grid. */
	grid: BubbleGrid;
}

/** The SUBSTRATE a bubble tiling decorates. "tri-hex" is a mixed substrate and not a lattice of its
 *  own: triangles and hexagons on one board, which is the tile set the paper's mixed (T,H) rows need. */
export type BubbleGrid = "triangle" | "square" | "hex" | "tri-hex" | "tri-square";

/** Display order and labels for the lattice facet — the shelf's "folders". */
export const BUBBLE_GRID_ORDER: BubbleGrid[] = ["triangle", "square", "hex", "tri-hex", "tri-square"];
export const BUBBLE_GRID_LABEL: Record<BubbleGrid, string> = {
	triangle: "Triangle",
	square: "Square",
	hex: "Hexagon",
	"tri-hex": "Triangle + hexagon",
	"tri-square": "Triangle + square",
};

/** One shard per (board, k). Loaded together on the Edge patterns chip, the way the colouring
 *  catalogues load on Colorings. ~37 MB in total, of which sq-k5 alone is 27. */
export const BUBBLE_FILES = [
	...[1, 2, 3, 4].map((k) => `/bubble/tri-k${k}.json`),
	...[1, 2, 3, 4, 5].map((k) => `/bubble/sq-k${k}.json`),
	...[1, 2, 3, 4, 5].map((k) => `/bubble/hex-k${k}.json`),
	...[1, 2, 3].map((k) => `/bubble/th-k${k}.json`),
	...[1, 2, 3].map((k) => `/bubble/ts-k${k}.json`),
];

/**
 * A face's TILE IDENTITY: the lexicographically least rotation of its bite word.
 *
 * The bite COUNT is not enough and only looked like it was on the triangular family, where a length-3
 * binary necklace happens to be determined by its weight. On squares two bites already splits into the
 * paper's S2A (adjacent, 0011) and S2B (opposite, 0101), and on hexagons three bites splits four ways
 * (3A, 3A-star, 3B, 3C). Rotation and not reflection, because the engine cannot place a tile reflected
 * and the paper counts chiral partners as distinct tiles — H3A and H3A-star are two tiles, not one.
 */
export function tileKeyOf(biteWord: number[]): string {
	const s = biteWord.join("");
	let best = s;
	for (let i = 1; i < s.length; i++) {
		const r = s.slice(i) + s.slice(0, i);
		if (r < best) best = r;
	}
	return best;
}

/** Every necklace of length n, in a stable order, memoised. n ≤ 6, so brute force over 2^n is free. */
const necklaceIndex = new Map<number, Map<string, number>>();
function necklaceOrder(n: number): Map<string, number> {
	const hit = necklaceIndex.get(n);
	if (hit) return hit;
	const keys = new Set<string>();
	for (let m = 0; m < 1 << n; m++) {
		const w: number[] = [];
		for (let b = 0; b < n; b++) w.push((m >> b) & 1);
		keys.add(tileKeyOf(w));
	}
	const map = new Map([...keys].sort().map((k, i) => [k, i] as const));
	necklaceIndex.set(n, map);
	return map;
}

/**
 * The tile's NAME in the paper's convention: bite count, plus a letter only where that count is
 * ambiguous within the family. Reproduces T0…T3 exactly (every triangular count is unique) and
 * S0/S1/S2A/S2B/S3/S4 exactly.
 *
 * ⚑ Hexagons diverge in one place: the paper writes the chiral pair at three bites as 3A and 3A*,
 * where this writes 3A and 3B, so its 3B/3C become 3C/3D. The partition into tiles is identical, only
 * the labels differ — worth reconciling before quoting hexagonal names back at the authors.
 */
/** The family letter, read off the TILE and not off the catalogue: a mixed substrate carries both
 *  triangles and hexagons, so "which letter" is a per-tile question. Matches the paper's T / S / H. */
export const FAMILY_LETTER: Record<number, string> = { 3: "T", 4: "S", 6: "H" };

export function tileNameOf(biteWord: number[]): string {
	const n = biteWord.length;
	const key = tileKeyOf(biteWord);
	const weight = (k: string) => [...k].filter((c) => c === "1").length;
	const sameWeight = [...necklaceOrder(n).keys()].filter((k) => weight(k) === weight(key)).sort();
	const w = String(weight(key));
	return sameWeight.length === 1 ? w : w + String.fromCharCode(65 + sameWeight.indexOf(key));
}

/**
 * Fill hue for a tile. An explicit hue overrides the by-side-count ramp, which every shelf whose tiles
 * share a side count has to do (polyominoes, the isohedral colouring) — here every tile of a family is
 * the same polygon, so the ramp alone would paint all of them identically.
 *
 * The golden-angle walk lib/render/periodic/edges.ts uses for orbit colours, indexed by the tile's
 * position among its family's necklaces. Stable per family, and spread far enough apart that 14
 * hexagonal tiles stay told apart.
 */
export function tileHueOf(biteWord: number[]): number {
	const order = necklaceOrder(biteWord.length);
	return (34 + (order.get(tileKeyOf(biteWord)) ?? 0) * 137.508) % 360;
}

/** The card + search label: the prototile set with its frequency ratio, reduced — "T0×1 T3×1" is the
 *  paper's T{0,3}(1:1). There is no vertex configuration to name a bubble tiling by (the substrate is
 *  always the plain triangular tiling), so the tile census is the identity, as it is for colourings. */
export function bubbleFamilyLabel(p: BubblePattern): string {
	const count = new Map<string, number>();
	for (const w of p.bites) {
		const t = FAMILY_LETTER[w.length] + tileNameOf(w);
		count.set(t, (count.get(t) ?? 0) + 1);
	}
	const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
	const g = [...count.values()].reduce(gcd, 0) || 1;
	return [...count.entries()]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([t, n]) => `${t}×${n / g}`)
		.join(" ");
}

// A 60° arc on a unit chord has radius exactly 1 (r = chord / 2·sin(θ/2) = 1 / 2·sin 30°), and one
// cubic Bézier carries a 60° arc to within ~1e-6: the handle length is (4/3)·tan(θ/4)·r. So each
// decorated edge is ONE cubic, flattened by the shared flattener the isohedral page and the lens both
// use — same curve, same segment count, so the views cannot disagree about faceting.
const ARC_HANDLE = (4 / 3) * Math.tan(Math.PI / 12);
// Flattening tolerance, as a fraction of the edge. Tighter than the 0.004 that lib/render/periodic/
// edges.ts uses for its Truchet arcs, because those arcs are line art and these are a tile BOUNDARY
// that the eye reads as a smooth curve along its whole length.
//
// Sized against the zoom range rather than guessed. cubicFlatness of a 60° arc's cubic is ≈0.1925, and
// the bound is error = 0.75·M/n², so 0.004 gives 7 segments and ≈0.003 world units of error — 0.44 px
// at ZOOM_MAX = 150 px per world unit, which is visible on a long arc and much worse under the
// conformal lens, whose magnification is unbounded near the inversion centre. 0.0004 gives 19 segments
// and ≈0.075 px, under the flat view's resolution with room left for the lens.
//
// ⚑ This is a FIXED resolution, not a zoom-adaptive one. Re-tessellating per zoom would mean keying
// the mesh cache on the zoom level, which no shelf does today; flattening fine enough that the range
// cannot resolve the facets buys the same result for one constant.
const ARC_TOL_FRAC = 0.0004;
const MAX_ARC_SEGMENTS = 48;

/** One decorated edge from `a` to `b`, appended to `out` WITHOUT its endpoint (the next edge starts
 *  there). `outward` bulges the arc to the left of a→b; the caller orients that by the ring's winding. */
function pushArc(out: Pt[], a: [number, number], b: [number, number], outward: boolean) {
	const [ax, ay] = a;
	const [bx, by] = b;
	const dx = bx - ax;
	const dy = by - ay;
	const L = Math.hypot(dx, dy);
	if (!(L > 0)) return;
	const ux = dx / L;
	const uy = dy / L;
	// Left normal of a→b, and the chord midpoint.
	const nx = -uy;
	const ny = ux;
	const mx = (ax + bx) / 2;
	const my = (ay + by) / 2;
	// r = L / (2·sin(θ/2)) = L at θ = 60°, so the arc scales with the chord and never needs the tile's
	// edge length passed in. The centre sits h off the midpoint, on the side AWAY from the bulge.
	const r = L;
	const h = Math.sqrt(Math.max(0, r * r - (L / 2) * (L / 2)));
	const side = outward ? 1 : -1;
	const cx = mx - side * h * nx;
	const cy = my - side * h * ny;
	// Tangent at an endpoint is its radius turned a quarter turn; which of the two turns is the
	// direction of travel is settled by the sign of the dot with a→b, so no sweep bookkeeping is
	// needed. |radius| = r already, so k·tangent has exactly the handle length k·r.
	const tangent = (px: number, py: number): [number, number] => {
		let tx = -(py - cy);
		let ty = px - cx;
		if (tx * ux + ty * uy < 0) {
			tx = -tx;
			ty = -ty;
		}
		return [tx, ty];
	};
	const [t1x, t1y] = tangent(ax, ay);
	const [t2x, t2y] = tangent(bx, by);
	const cubic: Cubic = [
		{ x: ax, y: ay },
		{ x: ax + ARC_HANDLE * t1x, y: ay + ARC_HANDLE * t1y },
		{ x: bx - ARC_HANDLE * t2x, y: by - ARC_HANDLE * t2y },
		{ x: bx, y: by },
	];
	// flattenCubicOpen omits the endpoint, which is the next arc's start — that is what lets a ring be
	// concatenated arc by arc with no duplicate vertex, and a duplicate would be a zero-area ear.
	flattenCubicOpen(cubic, cubicSegmentCount(cubicFlatness(cubic), 1, ARC_TOL_FRAC * L, MAX_ARC_SEGMENTS), out);
}

/**
 * The tiling as a translational cell: one ring per bubble tile, curved edges flattened.
 *
 * This is the whole renderer. Everything downstream — the flat canvas, the conformal lens through
 * `tilingPeriodicCell`, the SVG export, the card and tree thumbnails — consumes `renderCell`, so
 * emitting one here is what makes a bubble tiling behave like every other Euclidean row.
 */
export function bubbleRenderCell(p: BubblePattern): TranslationalCellData {
	return {
		basis: [p.T1, p.T2],
		cellPolygons: p.polys.map((poly, f) => {
			const pts = poly.map((i) => p.verts[i]);
			const bites = p.bites[f];
			// Shoelace: which side "left of a→b" is depends on the ring's winding, and the developer's
			// walk direction is not guaranteed, so read it off the face instead of assuming.
			let area = 0;
			for (let i = 0; i < pts.length; i++) {
				const [x1, y1] = pts[i];
				const [x2, y2] = pts[(i + 1) % pts.length];
				area += x1 * y2 - x2 * y1;
			}
			const ccw = area > 0;
			const ring: Pt[] = [];
			const corners: number[] = [];
			for (let i = 0; i < pts.length; i++) {
				// Each arc starts AT a tile corner, so the ring length before pushing is that corner's
				// index. Everything after it up to the next corner is flattening, not geometry.
				corners.push(ring.length);
				// A bump bulges away from this face, a bite cuts into it.
				pushArc(ring, pts[i], pts[(i + 1) % pts.length], (bites[i] === 0) === ccw);
			}
			const verts = ring.map((q) => [q.x, q.y]);
			// `n` = the flattened point count, so a ring can never be mistaken for a star (that test is
			// verts.length === 2n). `corners` is what every polygon consumer reads as the tile's real
			// vertices — the dots, the halfways, and medianEdge.
			return { v: verts, n: verts.length, corners, hue: tileHueOf(bites) };
		}),
	};
}
