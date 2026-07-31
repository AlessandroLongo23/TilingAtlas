// Shader inputs for the per-pixel hyperbolic renderer, built on the CERTIFIED Dirichlet domain
// (lib/render/hyperbolicDirichlet.ts). Two artifacts per tiling:
//
//   * gens — the complete side-pairing set of the Dirichlet domain D. The shader greedy-reduces each
//     pixel with them; by Voight 2009 Prop. 4.4 the loop terminates INSIDE D̄, never at a spurious
//     local minimum (the hole mechanism of the old heuristic generator set).
//   * field — a TOTAL lookup texture over the square [-rTex, rTex]² ⊇ D̄ + collar: every texel carries
//     a tile side count and the hyperbolic distance to its tile's boundary (stroke anti-aliasing).
//     Totality is enforced at bake time: texels the direct point-location misses are folded into D and
//     re-located, and the rare float-crack texels copy their nearest resolved neighbour — a
//     reduced pixel can NEVER sample "no tile" (the black-hole pixel of the old renderer).
//
// The field radius rTex and the early-exit radius rInEu are per-tiling quantities derived from D —
// no magic constants tuned to k=1 tilings.

import { type Complex, type Su11 } from "@/lib/render/hyperbolic";
import {
	HyperbolicDeveloper,
	maxTileRadius,
	type Darts,
	type DevelopedEdgePatch,
} from "@/lib/render/hyperbolicDevelopClient";
import {
	buildDirichletDomain,
	foldIntoDomain,
	type DirichletDomain,
} from "@/lib/render/hyperbolicDirichlet";
import type { DevelopedPatch } from "@/lib/render/hyperbolicDevelopedDraw";

const SEG = 12; // geodesic tessellation for point-in-tile tests
const COLLAR = 0.15; // hyp collar past R_D the field also covers (float wobble of the shader fold)
export const EDGE_SCALE = 510; // hyp edge distance → byte (distances of interest are ≲ 0.5)

/** Orthogonal circle through disk points a,b (null = diameter). */
function orthoCircle(a: Complex, b: Complex): { cx: number; cy: number; r: number } | null {
	const det = a.x * b.y - a.y * b.x;
	if (Math.abs(det) < 1e-9) return null;
	const r1 = (a.x * a.x + a.y * a.y + 1) / 2;
	const r2 = (b.x * b.x + b.y * b.y + 1) / 2;
	const cx = (r1 * b.y - r2 * a.y) / det;
	const cy = (a.x * r2 - b.x * r1) / det;
	return { cx, cy, r: Math.sqrt(Math.max(cx * cx + cy * cy - 1, 0)) };
}

/** Geodesic arc a→b as n+1 points, choosing the arc that stays inside the disk. */
function geodesicPts(a: Complex, b: Complex, n: number): Complex[] {
	const oc = orthoCircle(a, b);
	if (!oc) {
		const out: Complex[] = [];
		for (let i = 0; i <= n; i++) {
			const t = i / n;
			out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
		}
		return out;
	}
	const ta = Math.atan2(a.y - oc.cy, a.x - oc.cx);
	const tb = Math.atan2(b.y - oc.cy, b.x - oc.cx);
	const d = ((tb - ta + Math.PI) % (2 * Math.PI)) - Math.PI;
	const build = (dd: number): Complex[] => {
		const o: Complex[] = [];
		for (let i = 0; i <= n; i++) {
			const t = ta + dd * (i / n);
			o.push({ x: oc.cx + oc.r * Math.cos(t), y: oc.cy + oc.r * Math.sin(t) });
		}
		return o;
	};
	const maxR = (pts: Complex[]): number => pts.reduce((m, q) => Math.max(m, Math.hypot(q.x, q.y)), 0);
	const A = build(d);
	const B = build(d > 0 ? d - 2 * Math.PI : d + 2 * Math.PI);
	return maxR(A) <= maxR(B) ? A : B;
}

interface BakeTile {
	poly: [number, number][];
	sides: number;
	center: Complex; // hyperbolic barycenter (equivariant) — drives the per-tile depth shade
	x0: number;
	x1: number;
	y0: number;
	y1: number;
}

/**
 * Hyperbolic barycenter of a set of Poincaré-disk points: the Minkowski mean on the hyperboloid,
 * normalised back to it. EQUIVARIANT under every isometry (isometries are linear on the hyperboloid),
 * for ANY polygon shape — so the per-tile shade computed from it is identical no matter which
 * fundamental copy of the tile a pixel folds into (no shading seams across the domain boundary).
 */
export function hypBarycenter(pts: [number, number][]): Complex {
	let X = 0;
	let Y = 0;
	let T = 0;
	for (const [x, y] of pts) {
		const r2 = x * x + y * y;
		const s = Math.max(1 - r2, 1e-12);
		X += (2 * x) / s;
		Y += (2 * y) / s;
		T += (1 + r2) / s;
	}
	const n = Math.sqrt(Math.max(T * T - X * X - Y * Y, 1e-18));
	const t = T / n;
	return { x: X / n / (1 + t), y: Y / n / (1 + t) };
}

function pointInPoly(poly: [number, number][], x: number, y: number): boolean {
	let c = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const [xi, yi] = poly[i];
		const [xj, yj] = poly[j];
		if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
	}
	return c;
}

/** Squared Euclidean distance from p to segment ab. */
function distSq(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
	const dx = bx - ax;
	const dy = by - ay;
	const l2 = dx * dx + dy * dy;
	let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
	t = Math.max(0, Math.min(1, t));
	const qx = ax + t * dx;
	const qy = ay + t * dy;
	return (px - qx) ** 2 + (py - qy) ** 2;
}

export interface TileField {
	/** RGBA bytes, row-major res×res. R = tile side count (never 0 after the bake post-pass).
	 *  G = hyperbolic distance to the tile boundary, ×EDGE_SCALE, clamped to 255.
	 *  B/A = the tile's hyperbolic barycenter (x, y) quantised over [-1,1] — the per-tile depth marker. */
	data: Uint8Array;
	res: number;
	/** The field covers [-rTex, rTex]²; texel (i,j) centre ↦ q = ((i,j)+0.5)/res·2·rTex − rTex. */
	rTex: number;
}

export interface ShaderTiling {
	/** Side-pairing generators, flattened [a.x, a.y, b.x, b.y] each. */
	gens: Float32Array;
	field: TileField;
	/** |w| ≤ rInEu ⇒ w ∈ D: the shader's reduction early-exit. */
	rInEu: number;
	domain: DirichletDomain;
	/** Bake diagnostics: texels unresolved BEFORE the copy post-pass. `deep` ones (well inside the
	 *  field, |q| < 0.95·rTex) indicate a real coverage bug and are console.error'd loudly. */
	bake: { unresolved: number; unresolvedDeep: number; res: number };
}

/**
 * Fill every unresolved texel with the value of a Chebyshev-nearest RESOLVED texel, so the baked field is
 * total (the shader can never sample a black hole). One 8-connected multi-source BFS seeded from all
 * resolved texels: on an unweighted 8-connected grid, graph distance == Chebyshev distance, so a texel's
 * first arrival carries a nearest source. O(res²) total, vs the old per-texel ring search's
 * O(unresolved · ring²) which blocked the main thread for minutes on deep-domain tilings (the corners +
 * rim of the sampled square are unresolved, and there are hundreds of thousands of them at res 2048).
 * Ties (equidistant sources with different values) resolve to whichever BFS wave arrived first — a
 * sub-pixel boundary choice, invisible in the field. Mutates `data` in place.
 */
export function fillNearestResolved(data: Uint8Array, resolved: Uint8Array, unresolvedIdx: number[], res: number): void {
	if (unresolvedIdx.length === 0) return;
	const total = res * res;
	const src = new Int32Array(total).fill(-1); // nearest resolved texel index per texel (-1 = unreached)
	const queue = new Int32Array(total); // each texel enqueues at most once → total slots suffice
	let head = 0;
	let tail = 0;
	for (let p = 0; p < total; p++) {
		if (resolved[p]) {
			src[p] = p;
			queue[tail++] = p;
		}
	}
	if (tail === 0) return; // no resolved texel to copy from — leave the field untouched
	while (head < tail) {
		const p = queue[head++];
		const s = src[p];
		const pi = p % res;
		const pj = (p - pi) / res;
		for (let dj = -1; dj <= 1; dj++) {
			const jj = pj + dj;
			if (jj < 0 || jj >= res) continue;
			for (let di = -1; di <= 1; di++) {
				if (di === 0 && dj === 0) continue;
				const ii = pi + di;
				if (ii < 0 || ii >= res) continue;
				const np = jj * res + ii;
				if (src[np] !== -1) continue;
				src[np] = s;
				queue[tail++] = np;
			}
		}
	}
	for (const o of unresolvedIdx) {
		const s = src[o >> 2];
		if (s < 0) continue;
		const so = s << 2;
		data[o] = data[so];
		data[o + 1] = data[so + 1];
		data[o + 2] = data[so + 2];
		data[o + 3] = data[so + 3];
	}
}

/**
 * Build everything the per-pixel renderer needs for one tiling. Returns null (with a loud
 * console.error) when the Dirichlet certificate fails — callers fall back to the 2D polygon path.
 */
export function prepareShaderTiling(
	darts: Darts,
	edge: number,
	meta: { id: string; name: string; config: string; edge: number },
	opts: { fieldRes?: number } = {},
): ShaderTiling | null {
	const dom = buildDirichletDomain(darts, edge);
	if (dom.certified !== true) {
		console.error(`hyperbolic reducer: Dirichlet certificate FAILED for ${meta.id}: ${dom.reason}`);
		return null;
	}

	// ---- bake patch: every face that can touch D̄ + collar closes inside this develop -------------
	const rMaxTile = maxTileRadius(darts, edge);
	const rTex = Math.tanh((dom.RD + COLLAR) / 2);
	const boundEu = Math.min(0.9995, Math.tanh((dom.RD + COLLAR + 2 * rMaxTile + 0.2) / 2));
	const dev = new HyperbolicDeveloper(darts, edge, { deepDedup: true });
	const patch: DevelopedPatch = dev.develop(meta, { a: { x: 1, y: 0 }, b: { x: 0, y: 0 } }, boundEu, 400_000);

	// tessellated tiles + spatial grid
	const tiles: BakeTile[] = [];
	for (const face of patch.faces) {
		const raw = face.map((i) => patch.vertices[i]);
		const poly: [number, number][] = [];
		for (let i = 0; i < raw.length; i++) {
			const a = { x: raw[i][0], y: raw[i][1] };
			const b = { x: raw[(i + 1) % raw.length][0], y: raw[(i + 1) % raw.length][1] };
			const pts = geodesicPts(a, b, SEG);
			for (let k = 0; k < pts.length - 1; k++) poly.push([pts[k].x, pts[k].y]);
		}
		let x0 = Infinity;
		let x1 = -Infinity;
		let y0 = Infinity;
		let y1 = -Infinity;
		for (const [x, y] of poly) {
			x0 = Math.min(x0, x);
			x1 = Math.max(x1, x);
			y0 = Math.min(y0, y);
			y1 = Math.max(y1, y);
		}
		tiles.push({ poly, sides: face.length, center: hypBarycenter(raw), x0, x1, y0, y1 });
	}
	const GRID = 64;
	const grid: number[][] = Array.from({ length: GRID * GRID }, () => []);
	const bin = (v: number) => Math.max(0, Math.min(GRID - 1, Math.floor(((v + 1) / 2) * GRID)));
	for (let ti = 0; ti < tiles.length; ti++) {
		const t = tiles[ti];
		for (let gy = bin(t.y0); gy <= bin(t.y1); gy++) {
			for (let gx = bin(t.x0); gx <= bin(t.x1); gx++) grid[gy * GRID + gx].push(ti);
		}
	}
	const locate = (x: number, y: number): number => {
		const cell = grid[bin(y) * GRID + bin(x)];
		for (const ti of cell) {
			const t = tiles[ti];
			if (x < t.x0 || x > t.x1 || y < t.y0 || y > t.y1) continue;
			if (pointInPoly(t.poly, x, y)) return ti;
		}
		return -1;
	};

	// ---- generators for the fold (f64 CPU twin of the shader loop) --------------------------------
	const gensSu = dom.gens;
	const gens = new Float32Array(gensSu.length * 4);
	for (let i = 0; i < gensSu.length; i++) {
		gens[i * 4] = gensSu[i].a.x;
		gens[i * 4 + 1] = gensSu[i].a.y;
		gens[i * 4 + 2] = gensSu[i].b.x;
		gens[i * 4 + 3] = gensSu[i].b.y;
	}

	// ---- total field bake -------------------------------------------------------------------------
	// res targets a hyperbolic texel of ~0.008 at D's rim (fills crisp to ~2 px on a 1000 px disk);
	// clamped so dense tilings stay cheap and the worst k=2 domain stays < ~1.5 s one-off.
	const res =
		opts.fieldRes ??
		Math.max(384, Math.min(2048, Math.ceil((4 * rTex) / ((1 - rTex * rTex) * 0.008))));
	const data = new Uint8Array(res * res * 4);
	const resolved = new Uint8Array(res * res); // bake bookkeeping only (B/A carry the tile centre)
	const unresolvedIdx: number[] = [];
	let unresolvedDeep = 0;
	const deepR = 0.95 * rTex;
	const q8 = (v: number) => Math.max(0, Math.min(255, Math.round(((v + 1) / 2) * 255)));
	for (let j = 0; j < res; j++) {
		const y = ((j + 0.5) / res) * 2 * rTex - rTex;
		for (let i = 0; i < res; i++) {
			const x = ((i + 0.5) / res) * 2 * rTex - rTex;
			const o = (j * res + i) * 4;
			let px = x;
			let py = y;
			let ti = x * x + y * y < 0.9995 ? locate(px, py) : -1;
			if (ti < 0 && x * x + y * y < 0.9995) {
				// crack or outside the patch: fold into D (guaranteed) and locate there
				const { w } = foldIntoDomain(gensSu, { x, y }, dom.rInEu);
				px = w.x;
				py = w.y;
				ti = locate(px, py);
			}
			if (ti < 0) {
				unresolvedIdx.push(o);
				if (x * x + y * y < deepR * deepR) unresolvedDeep++;
				continue;
			}
			const t = tiles[ti];
			let edgeSq = Infinity;
			for (let k = 0, m = t.poly.length; k < m; k++) {
				const a = t.poly[k];
				const b = t.poly[(k + 1) % m];
				edgeSq = Math.min(edgeSq, distSq(px, py, a[0], a[1], b[0], b[1]));
			}
			const conf = 2 / Math.max(1 - (px * px + py * py), 1e-6);
			data[o] = t.sides;
			data[o + 1] = Math.min(255, Math.round(Math.sqrt(edgeSq) * conf * EDGE_SCALE));
			// per-tile depth marker: the tile's hyperbolic barycenter, quantised over [-1,1]. The shader
			// transports it back through the inverse fold word and shades the whole tile by ITS screen
			// radius — one flat shade per tile, the app-wide fill convention.
			data[o + 2] = q8(t.center.x);
			data[o + 3] = q8(t.center.y);
			resolved[o / 4] = 1;
		}
	}
	// post-pass: unresolved texels copy the nearest resolved texel so the field is TOTAL (a distance
	// transform — O(res²), vs the old per-texel ring search's O(unresolved·ring²) that blocked the main
	// thread for minutes on deep-domain tilings).
	fillNearestResolved(data, resolved, unresolvedIdx, res);
	if (unresolvedDeep > 0) {
		console.error(
			`hyperbolic reducer: ${unresolvedDeep} unresolved texels DEEP inside the field for ${meta.id} — bake coverage bug`,
		);
	}

	return {
		gens,
		field: { data, res, rTex },
		rInEu: dom.rInEu,
		domain: dom,
		bake: { unresolved: unresolvedIdx.length, unresolvedDeep, res },
	};
}

// ----------------------------------------------------------------------------- edge-pattern field
/** One patch edge, tessellated once and SHARED by every face that measures against it. The bounding box
 *  is what keeps the vertex star cheap: a texel whose best hit already beats the box can skip the edge's
 *  whole sub-segment run on one compare, and a face's own sides are scanned first, so for the texels far
 *  from any vertex — almost all of them — the star costs a handful of rejects and nothing else. */
interface EdgeSegs {
	segs: number[]; // flat [ax,ay,bx,by …]
	x0: number;
	x1: number;
	y0: number;
	y1: number;
}

interface BakeEdgeTile {
	fillPoly: [number, number][]; // all sides tessellated — for point-in-tile
	/** Every DRAWN edge incident to one of this face's vertices — its own drawn sides FIRST (they give the
	 *  tight initial bound), then the rest of the star. See the note on the star below. */
	drawn: EdgeSegs[];
	scaffold: EdgeSegs[]; // the same star, UNDRAWN (the faint grid stroke)
	orbit: number; // merged-tile orbit — the fill hue key
	x0: number;
	x1: number;
	y0: number;
	y1: number;
}

/**
 * The edge-pattern twin of prepareShaderTiling. The Dirichlet reduction is IDENTICAL (same darts, same
 * deck group, so the per-pixel reducer folds and fills to the rim, infinitely, exactly as for the plain
 * hyperbolic shelf). Only the field changes: instead of (tile side count, one edge distance, barycenter),
 * each texel carries
 *   R = merged-tile orbit (fill hue),
 *   G = hyperbolic distance to the nearest DRAWN edge (the bold tile boundary),
 *   B = hyperbolic distance to the nearest UNDRAWN edge (the faint base-tiling scaffold),
 *   A = 255 (unused).
 * Depth shading is per-pixel (screen radius) in edge mode, so no barycenter needs storing. The drawn /
 * undrawn distances are each continuous across face boundaries (a shared edge is the same kind on both
 * sides), so the shader's bilinear read of G/B is sound just as it is for the plain field.
 *
 * Each distance is measured against the VERTEX STAR of the texel's face — every edge incident to one of
 * its three-or-more vertices — and not against its own sides alone. In the plain field "own sides" is
 * right, because from inside a convex tile the nearest point of the tiling's edge set always lies on that
 * tile's own boundary. Here the edge set is a SUBSET of the sides, so a face can be a hair from a drawn
 * edge that belongs to a neighbour: at a vertex where a bold run passes straight through, the faces
 * wedged either side of it have no drawn side of their own there, and taking their own sides only left a
 * white pinhole at every such vertex. The star is exactly the fix — a point within ε of a drawn edge
 * lies, for ε below the vertex-to-non-incident-edge separation, in a face touching one of that edge's
 * endpoints — and it can never make a distance too SMALL, since any path out of a face crosses its own
 * boundary first.
 */
export function prepareEdgeShaderTiling(
	darts: Darts,
	edge: number,
	meta: { id: string; name: string; config: string; edge: number },
	opts: { fieldRes?: number; colors?: boolean } = {},
): ShaderTiling | null {
	const dom = buildDirichletDomain(darts, edge);
	if (dom.certified !== true) {
		console.error(`hyperbolic edge reducer: Dirichlet certificate FAILED for ${meta.id}: ${dom.reason}`);
		return null;
	}

	const rMaxTile = maxTileRadius(darts, edge);
	const rTex = Math.tanh((dom.RD + COLLAR) / 2);
	const boundEu = Math.min(0.9995, Math.tanh((dom.RD + COLLAR + 2 * rMaxTile + 0.2) / 2));
	const dev = new HyperbolicDeveloper(darts, edge, { deepDedup: true });
	// Colors: faceOrbit carries the COLOR index and every edge is a tile boundary (all drawn, none scaffold). The
	// bake is otherwise byte-identical, so the same field format serves both — the shader keys R on a
	// palette in colors mode instead of a hue.
	const view0 = { a: { x: 1, y: 0 }, b: { x: 0, y: 0 } };
	const patch: DevelopedEdgePatch = opts.colors
		? dev.developColors(meta, view0, boundEu, 400_000)
		: dev.developEdges(meta, view0, boundEu, 400_000);

	// Tessellate every patch edge once and index the edges incident to each vertex — the star each face
	// measures its distances against.
	const tessellate = (a: [number, number], b: [number, number]): number[] => {
		const pts = geodesicPts({ x: a[0], y: a[1] }, { x: b[0], y: b[1] }, SEG);
		const flat: number[] = [];
		for (let k = 0; k < pts.length - 1; k++) flat.push(pts[k].x, pts[k].y, pts[k + 1].x, pts[k + 1].y);
		return flat;
	};
	const box = (segs: number[]): EdgeSegs => {
		let x0 = Infinity;
		let x1 = -Infinity;
		let y0 = Infinity;
		let y1 = -Infinity;
		for (let k = 0; k < segs.length; k += 2) {
			x0 = Math.min(x0, segs[k]);
			x1 = Math.max(x1, segs[k]);
			y0 = Math.min(y0, segs[k + 1]);
			y1 = Math.max(y1, segs[k + 1]);
		}
		return { segs, x0, x1, y0, y1 };
	};
	const edgeSegs: EdgeSegs[] = [];
	const edgeDrawn: boolean[] = [];
	const incident: number[][] = Array.from({ length: patch.vertices.length }, () => []);
	const edgeAt = new Map<string, number>(); // unordered endpoint pair → patch-edge index
	for (let ei = 0; ei < patch.edges.length; ei++) {
		const [u, v, drawn] = patch.edges[ei];
		edgeSegs.push(box(tessellate(patch.vertices[u], patch.vertices[v])));
		edgeDrawn.push(drawn === 1);
		incident[u].push(ei);
		incident[v].push(ei);
		edgeAt.set(u < v ? `${u},${v}` : `${v},${u}`, ei);
	}

	const tiles: BakeEdgeTile[] = [];
	for (let fi = 0; fi < patch.faces.length; fi++) {
		const ring = patch.faces[fi];
		const fillPoly: [number, number][] = [];
		// OWN SIDES FIRST, so the scan's running best is tight by the time it reaches the foreign edges and
		// can reject them on their box alone.
		const drawn: EdgeSegs[] = [];
		const scaffold: EdgeSegs[] = [];
		const took = new Set<number>();
		const take = (ei: number) => {
			if (took.has(ei)) return;
			took.add(ei);
			(edgeDrawn[ei] ? drawn : scaffold).push(edgeSegs[ei]);
		};
		for (let i = 0; i < ring.length; i++) {
			const u = ring[i];
			const v = ring[(i + 1) % ring.length];
			const ei = edgeAt.get(u < v ? `${u},${v}` : `${v},${u}`);
			// Own sides are tessellated HERE, in ring order, and not taken from the shared per-edge run: the
			// fill polygon has to walk the ring in one direction, and a shared run is stored in its own
			// edge's direction, which is the ring's for only one of the two faces on it. Sampling the arc
			// backwards is the same arc but not the same floats, and the field it replaces sampled it
			// forwards — so ring order here keeps every own-side distance bit-identical to that field, and
			// the star's effect stays exactly the one thing it is for.
			const pts = geodesicPts(
				{ x: patch.vertices[u][0], y: patch.vertices[u][1] },
				{ x: patch.vertices[v][0], y: patch.vertices[v][1] },
				SEG,
			);
			const flat: number[] = [];
			for (let k = 0; k < pts.length - 1; k++) {
				fillPoly.push([pts[k].x, pts[k].y]);
				flat.push(pts[k].x, pts[k].y, pts[k + 1].x, pts[k + 1].y);
			}
			// A side with no patch edge (its two ends collapsed onto one vid in the develop's position-dedup
			// grid, out at the crowded rim) has no drawn flag to read, so it counts as scaffold — which is
			// what the own-sides field did with it too.
			(ei !== undefined && edgeDrawn[ei] ? drawn : scaffold).push(box(flat));
			if (ei !== undefined) took.add(ei); // don't let the star add the shared copy of a side again
		}
		for (const u of ring) for (const ei of incident[u]) take(ei);
		let x0 = Infinity;
		let x1 = -Infinity;
		let y0 = Infinity;
		let y1 = -Infinity;
		for (const [x, y] of fillPoly) {
			x0 = Math.min(x0, x);
			x1 = Math.max(x1, x);
			y0 = Math.min(y0, y);
			y1 = Math.max(y1, y);
		}
		tiles.push({ fillPoly, drawn, scaffold, orbit: patch.faceOrbit[fi], x0, x1, y0, y1 });
	}

	const GRID = 64;
	const grid: number[][] = Array.from({ length: GRID * GRID }, () => []);
	const bin = (v: number) => Math.max(0, Math.min(GRID - 1, Math.floor(((v + 1) / 2) * GRID)));
	for (let ti = 0; ti < tiles.length; ti++) {
		const t = tiles[ti];
		for (let gy = bin(t.y0); gy <= bin(t.y1); gy++) for (let gx = bin(t.x0); gx <= bin(t.x1); gx++) grid[gy * GRID + gx].push(ti);
	}
	const locate = (x: number, y: number): number => {
		const cell = grid[bin(y) * GRID + bin(x)];
		for (const ti of cell) {
			const t = tiles[ti];
			if (x < t.x0 || x > t.x1 || y < t.y0 || y > t.y1) continue;
			if (pointInPoly(t.fillPoly, x, y)) return ti;
		}
		return -1;
	};
	/** Squared distance from (px,py) to the nearest of a face's star edges. Each edge is rejected whole
	 *  when the box distance already loses to the running best — with the face's own sides scanned first,
	 *  a texel in the middle of a tile pays one compare per foreign edge and never touches its segments. */
	const nearest = (edges: EdgeSegs[], px: number, py: number): number => {
		let best = Infinity;
		for (const e of edges) {
			const bx = px < e.x0 ? e.x0 - px : px > e.x1 ? px - e.x1 : 0;
			const by = py < e.y0 ? e.y0 - py : py > e.y1 ? py - e.y1 : 0;
			if (bx * bx + by * by >= best) continue;
			const s = e.segs;
			for (let k = 0; k < s.length; k += 4) {
				const d = distSq(px, py, s[k], s[k + 1], s[k + 2], s[k + 3]);
				if (d < best) best = d;
			}
		}
		return best;
	};

	const gensSu = dom.gens;
	const gens = new Float32Array(gensSu.length * 4);
	for (let i = 0; i < gensSu.length; i++) {
		gens[i * 4] = gensSu[i].a.x;
		gens[i * 4 + 1] = gensSu[i].a.y;
		gens[i * 4 + 2] = gensSu[i].b.x;
		gens[i * 4 + 3] = gensSu[i].b.y;
	}

	const res = opts.fieldRes ?? Math.max(384, Math.min(2048, Math.ceil((4 * rTex) / ((1 - rTex * rTex) * 0.008))));
	const data = new Uint8Array(res * res * 4);
	const resolved = new Uint8Array(res * res);
	const unresolvedIdx: number[] = [];
	let unresolvedDeep = 0;
	const deepR = 0.95 * rTex;
	const distByte = (dsq: number, conf: number) => (dsq === Infinity ? 255 : Math.min(255, Math.round(Math.sqrt(dsq) * conf * EDGE_SCALE)));
	for (let j = 0; j < res; j++) {
		const y = ((j + 0.5) / res) * 2 * rTex - rTex;
		for (let i = 0; i < res; i++) {
			const x = ((i + 0.5) / res) * 2 * rTex - rTex;
			const o = (j * res + i) * 4;
			let px = x;
			let py = y;
			let ti = x * x + y * y < 0.9995 ? locate(px, py) : -1;
			if (ti < 0 && x * x + y * y < 0.9995) {
				const { w } = foldIntoDomain(gensSu, { x, y }, dom.rInEu);
				px = w.x;
				py = w.y;
				ti = locate(px, py);
			}
			if (ti < 0) {
				unresolvedIdx.push(o);
				if (x * x + y * y < deepR * deepR) unresolvedDeep++;
				continue;
			}
			const t = tiles[ti];
			const conf = 2 / Math.max(1 - (px * px + py * py), 1e-6);
			data[o] = Math.min(255, t.orbit);
			data[o + 1] = distByte(nearest(t.drawn, px, py), conf);
			data[o + 2] = distByte(nearest(t.scaffold, px, py), conf);
			data[o + 3] = 255;
			resolved[o / 4] = 1;
		}
	}
	fillNearestResolved(data, resolved, unresolvedIdx, res);
	if (unresolvedDeep > 0) {
		console.error(`hyperbolic edge reducer: ${unresolvedDeep} unresolved texels DEEP inside the field for ${meta.id} — bake coverage bug`);
	}

	return {
		gens,
		field: { data, res, rTex },
		rInEu: dom.rInEu,
		domain: dom,
		bake: { unresolved: unresolvedIdx.length, unresolvedDeep, res },
	};
}
