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

import { BUBBLE_KOCH_LEVELS, DEFAULT_BUBBLE_EDGE_STYLE, pushEdge, type BubbleEdgeStyle } from "@/lib/bubble/edges";
import type { Pt } from "@/lib/render/cubic";
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
export type BubbleGrid =
	| "triangle" | "square" | "hex"
	| "tri-hex" | "tri-square" | "tri-sq-hex"
	| "rhombus"
	| "rhomb-tri" | "rhomb-hex" | "rhomb-tri-hex";

/** Display order and labels for the lattice facet — the shelf's "folders". */
// ⚑ GROUPED BY HEADING, and it has to be. /play gathers sub rows into families by SCANNING this order
// rather than re-sorting it, which is the only way the tree can show the same sequence the browse
// arrows walk — so a family must occupy ONE contiguous run. Leaving the rhombus where it used to sit,
// after the mixed regular boards, split "Mixed families" into two runs under one heading; the guard is
// tests/catalogue-sub-family.test.ts. Single-family boards first, then every mixture.
export const BUBBLE_GRID_ORDER: BubbleGrid[] = [
	"triangle", "square", "hex",
	"rhombus",
	"tri-hex", "tri-square", "tri-sq-hex",
	"rhomb-tri", "rhomb-hex", "rhomb-tri-hex",
];
export const BUBBLE_GRID_LABEL: Record<BubbleGrid, string> = {
	triangle: "Triangle",
	square: "Square",
	hex: "Hexagon",
	"tri-hex": "Triangle + hexagon",
	"tri-square": "Triangle + square",
	"tri-sq-hex": "Triangle + square + hexagon",
	rhombus: "Rhombus (2-iamond)",
	// ⚑ These three are NOT "the polyiamond mixtures". The hexagon is the 6-iamond as much as the
	// rhombus is the 2-iamond, so every board here is a polyiamond board and the classification cannot
	// be the axis (AL, 2026-08-27). What distinguishes them is that they mix FAMILIES, which is the
	// third heading — and it is why tri+hex and tri+square moved under it too.
	"rhomb-tri": "Rhombus + triangle",
	"rhomb-hex": "Rhombus + hexagon",
	"rhomb-tri-hex": "Rhombus + triangle + hexagon",
};

/** One shard per (board, k). Loaded together on the Edge patterns chip, the way the colouring
 *  catalogues load on Colorings. ~37 MB in total, of which sq-k5 alone is 27. */
export const BUBBLE_FILES = [
	...[1, 2, 3, 4].map((k) => `/bubble/tri-k${k}.json`),
	...[1, 2, 3, 4, 5].map((k) => `/bubble/sq-k${k}.json`),
	...[1, 2, 3, 4, 5].map((k) => `/bubble/hex-k${k}.json`),
	...[1, 2, 3].map((k) => `/bubble/th-k${k}.json`),
	...[1, 2, 3].map((k) => `/bubble/ts-k${k}.json`),
	...[1, 2].map((k) => `/bubble/tsh-k${k}.json`),
	...[1, 2, 3].map((k) => `/bubble/rh-k${k}.json`),
	// The rhombic mixtures. Each starts where it has something to show: the two-family boards are
	// EMPTY at k=1 (one vertex orbit cannot hold a rhombus with a triangle, nor with a hexagon), and
	// listing a k=1 shard for them would be an empty folder in the tree. The three-family board has 4.
	`/bubble/rt-k2.json`,
	...[2, 3].map((k) => `/bubble/rhx-k${k}.json`),
	...[1, 2].map((k) => `/bubble/rth-k${k}.json`),
];

/**
 * The id prefixes the shelf's records use, so a DEEP LINK can decide to load this catalogue before it
 * knows what the id is.
 *
 * Here and not in /play because it belongs with the shard list: a new board is a grid string, a shard
 * and a prefix, and those were in two files with only somebody's memory joining them. `brth-` and
 * `brt-` were both added to BUBBLE_FILES while /play still carried the seven-prefix chain that predated
 * them, and the effect is silent — the link resolves to the atlas's default tiling instead of failing.
 * bubble.shards.test.ts reads the SHIPPED shards and checks every id against this list.
 */
export const BUBBLE_ID_PREFIXES = ["bt-", "bs-", "bh-", "bth-", "bts-", "btsh-", "brh-", "brt-", "brx-", "brth-"];
export const isBubbleId = (key: string | null | undefined) =>
	!!key && BUBBLE_ID_PREFIXES.some((p) => key.startsWith(p));

/**
 * A face's TILE IDENTITY: the lexicographically least rotation of its bite word.
 *
 * The bite COUNT is not enough and only looked like it was on the triangular family, where a length-3
 * binary necklace happens to be determined by its weight. On squares two bites already splits into the
 * paper's S2A (adjacent, 0011) and S2B (opposite, 0101), and on hexagons three bites splits four ways
 * (3A, 3A-star, 3B, 3C). Rotation and not reflection, because the engine cannot place a tile reflected
 * and the paper counts chiral partners as distinct tiles — H3A and H3A-star are two tiles, not one.
 *
 * Feed it an ANCHORED word (`alignedTile`) and not a raw one off the pattern: a raw word starts
 * wherever the developer's face walk did, which the least rotation only forgives when every rotation
 * is a symmetry of the substrate.
 */
export function tileKeyOf(biteWord: number[], step = 1): string {
	const s = biteWord.join("");
	let best = s;
	for (let i = step; i < s.length; i += step) {
		const r = s.slice(i) + s.slice(0, i);
		if (r < best) best = r;
	}
	return best;
}

/**
 * A face's bite word ANCHORED to its own geometry, plus the rotation step that word lives modulo.
 *
 * `bites[i]` is indexed from the developer's face walk, which starts at whichever half-edge the walk
 * reached first (`faces_with_darts` in develop_marked.py), so index 0 carries no meaning of its own.
 * On a REGULAR substrate that costs nothing: every rotation is a symmetry, so `tileKeyOf` quotients
 * the arbitrary start away. On the 60-degree rhombus it is a colouring bug. Only the half turn is a
 * symmetry there, so a word read from a 60-degree corner and the SAME tile's word read from its
 * 120-degree corner differ by an odd rotation and land in different classes: brh-1-00005 painted its
 * four rhombi 3 + 1 where the truth is 2 + 2, and 409 of the 737 rhombic tilings split a tile from
 * itself this way (475 also gave a tile and its mirror one colour, the same mistake from the other side).
 *
 * The fix is to let the TILE choose index 0 instead of the walk: pair every bite with the corner its
 * edge leaves, and take the least rotation of that pair sequence. The angles give the step for free —
 * the least rotation fixing the angle word IS the substrate's rotational symmetry, 1 for a regular
 * polygon and 2 for the rhombus (Burnside over that gives the (2^4 + 2^2)/2 = 10 rhombic tiles of the
 * paper's Figure 27) — so no per-grid table is needed and a non-regular substrate needs no new case.
 *
 * Winding is normalised first, because a ring read backwards spells the MIRROR tile and chiral
 * partners are distinct tiles here. The convention is the one the corpus already emits (every face
 * clockwise, all 52,800 of them); any fixed choice serves as well, since what breaks chirality is
 * having no convention and not which one.
 */
function alignedTile(pts: [number, number][], bites: number[]): { word: number[]; step: number; ccw: boolean } {
	const n = pts.length;
	let area = 0;
	for (let i = 0; i < n; i++) {
		const [x1, y1] = pts[i];
		const [x2, y2] = pts[(i + 1) % n];
		area += x1 * y2 - x2 * y1;
	}
	const ccw = area > 0;
	// Reading the ring backwards turns edge i into edge n-2-i, edge i being the one LEAVING corner i.
	const ring = ccw ? [...pts].reverse() : pts;
	const word = ccw ? bites.map((_, i) => bites[(n - 2 - i + n) % n]) : bites;
	// Corner label: the turn from "towards the next corner" to "towards the previous one". Which of the
	// two angles at a corner this names follows the winding, now fixed, so equal labels mean equal corners.
	const ang = ring.map(([x, y], i) => {
		const [ax, ay] = ring[(i + n - 1) % n];
		const [bx, by] = ring[(i + 1) % n];
		const t = Math.atan2(ay - y, ax - x) - Math.atan2(by - y, bx - x);
		return Math.round((((t * 180) / Math.PI) % 360 + 360) % 360);
	});
	let step = n;
	for (let s = 1; s < n; s++)
		if (ang.every((a, i) => a === ang[(i + s) % n])) {
			step = s;
			break;
		}
	// Anchor at the rotation whose (corner, bite) sequence is least. The angle dominates each pair, so
	// index 0 lands on the same corner of every copy of the tile; the bites break the remaining tie,
	// which is exactly the freedom `step` describes.
	const rot = ang.map((_, s) => ang.map((_, i) => `${String(ang[(i + s) % n]).padStart(3, "0")}${word[(i + s) % n]}`).join(""));
	let best = 0;
	for (let s = 1; s < n; s++) if (rot[s] < rot[best]) best = s;
	return { word: word.map((_, i) => word[(i + best) % n]), step, ccw };
}

/** Every necklace of length n, in a stable order, memoised. n ≤ 6, so brute force over 2^n is free. */
const necklaceIndex = new Map<number, Map<string, number>>();
function necklaceOrder(n: number, step = 1): Map<string, number> {
	const cacheKey = n * 10 + step;
	const hit = necklaceIndex.get(cacheKey);
	if (hit) return hit;
	const keys = new Set<string>();
	for (let m = 0; m < 1 << n; m++) {
		const w: number[] = [];
		for (let b = 0; b < n; b++) w.push((m >> b) & 1);
		keys.add(tileKeyOf(w, step));
	}
	const map = new Map([...keys].sort().map((k, i) => [k, i] as const));
	necklaceIndex.set(cacheKey, map);
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

/** A RHOMBUS also has four edges, so its tiles cannot be told from a square's by edge count alone.
 *  The two are never on the same board, so the board decides: only the rhombic board carries R. */
export const rhombicLetter = (grid: BubbleGrid) => (grid === "rhombus" ? "R" : null);

export function tileNameOf(biteWord: number[], step = 1): string {
	const n = biteWord.length;
	const key = tileKeyOf(biteWord, step);
	const weight = (k: string) => [...k].filter((c) => c === "1").length;
	const sameWeight = [...necklaceOrder(n, step).keys()].filter((k) => weight(k) === weight(key)).sort();
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
export function tileHueOf(biteWord: number[], step = 1): number {
	const order = necklaceOrder(biteWord.length, step);
	return (34 + (familyStart(biteWord.length) + (order.get(tileKeyOf(biteWord, step)) ?? 0)) * 137.508) % 360;
}

/** Where a family starts in that walk: past every necklace of the smaller families. Indexing by
 *  position WITHIN a family alone is enough on a board with one family and wrong on a mixed one — the
 *  bare triangle and the bare hexagon were both index 0, so both hue 34, on all 2,431 tri-hex,
 *  tri-square and tri-sq-hex tilings. The rhombus starts where the square does, which is sound only
 *  because no board mixes rhombi with hexagons. Costs the square and hexagonal boards a one-off
 *  recolour, the tiles keeping their colours across every board they appear on. */
const familyStart = (n: number) => (n > 3 ? necklaceOrder(3).size : 0) + (n > 4 ? necklaceOrder(4).size : 0);

/** The card + search label: the prototile set with its frequency ratio, reduced — "T0×1 T3×1" is the
 *  paper's T{0,3}(1:1). There is no vertex configuration to name a bubble tiling by (the substrate is
 *  always the plain triangular tiling), so the tile census is the identity, as it is for colourings. */
export function bubbleFamilyLabel(p: BubblePattern): string {
	const count = new Map<string, number>();
	p.polys.forEach((poly, f) => {
		const { word, step } = alignedTile(poly.map((i) => p.verts[i]), p.bites[f]);
		const t = (rhombicLetter(p.grid) ?? FAMILY_LETTER[word.length]) + tileNameOf(word, step);
		count.set(t, (count.get(t) ?? 0) + 1);
	});
	const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
	const g = [...count.values()].reduce(gcd, 0) || 1;
	return [...count.entries()]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([t, n]) => `${t}×${n / g}`)
		.join(" ");
}

/**
 * The tiling as a translational cell: one ring per bubble tile, curved edges flattened.
 *
 * This is the whole renderer. Everything downstream — the flat canvas, the conformal lens through
 * `tilingPeriodicCell`, the SVG export, the card and tree thumbnails — consumes `renderCell`, so
 * emitting one here is what makes a bubble tiling behave like every other Euclidean row.
 *
 * `style` picks the EDGE PROFILE (lib/bubble/edges.ts), `kochLevel` its one parameter. They only ever change the flattened polyline
 * between two consecutive tile corners: the substrate, the bite words, the tile identities and the
 * hues are all combinatorics and are untouched by it, which is why /play can restyle a selection by
 * calling this again and nothing else in the record has to be rebuilt.
 */
export function bubbleRenderCell(
	p: BubblePattern,
	style: BubbleEdgeStyle = DEFAULT_BUBBLE_EDGE_STYLE,
	kochLevel: number = BUBBLE_KOCH_LEVELS.default,
): TranslationalCellData {
	return {
		basis: [p.T1, p.T2],
		cellPolygons: p.polys.map((poly, f) => {
			const pts = poly.map((i) => p.verts[i]);
			const bites = p.bites[f];
			// `ccw` because which side "left of a→b" is depends on the ring's winding and the developer's
			// walk direction is not guaranteed; `word`/`step` because which TILE this face is does too.
			const { word, step, ccw } = alignedTile(pts, bites);
			const ring: Pt[] = [];
			const corners: number[] = [];
			for (let i = 0; i < pts.length; i++) {
				// Each arc starts AT a tile corner, so the ring length before pushing is that corner's
				// index. Everything after it up to the next corner is flattening, not geometry.
				corners.push(ring.length);
				// A bump bulges away from this face, a bite cuts into it.
				pushEdge(ring, pts[i], pts[(i + 1) % pts.length], (bites[i] === 0) === ccw, style, p.grid, kochLevel);
			}
			const verts = ring.map((q) => [q.x, q.y]);
			// `n` = the flattened point count, so a ring can never be mistaken for a star (that test is
			// verts.length === 2n). `corners` is what every polygon consumer reads as the tile's real
			// vertices — the dots, the halfways, and medianEdge.
			return { v: verts, n: verts.length, corners, hue: tileHueOf(word, step) };
		}),
	};
}
