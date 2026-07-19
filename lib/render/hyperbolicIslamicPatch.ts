// Regular {p,q} tiling patch + the faithful polygons-in-contact (Hankin) strap construction, in Poincaré
// coordinates. Both feed the fold-shader Islamic path (components/hyperbolic-canvas.tsx): buildRegularPatch
// builds the central tile, constructTileStraps builds its rosette straps, and the shader classifies each
// pixel A/B/C by the PARITY of straps the geodesic O→z crosses — see docs/superpowers/specs/
// 2026-07-19-hyperbolic-islamic-fold-shader-design.md. (The old Klein A/B/C mesh that reused the flat
// colorFacesAbc pipeline is retired; the shader does the arrangement per pixel, so there is no face graph,
// no finite patch, and no Klein detour — it inherits the fold's dimming, exact geodesic arcs, and full rim.)

import {
	type Complex,
	type WythoffSpec,
	type IslamicTileData,
	type StrapSegment,
	mirrorParams,
	tileHue,
	hypDist,
	hypMidpoint,
	geodesicThroughPointTangent,
	geodesicIntersect,
	geodesicTangentAt,
	geodesicMove,
	schwarzCorners,
	wythoffVertex,
	uniformDescriptor,
	snubData,
	su11Translation,
	su11Rotation,
	su11Mul,
	su11Inverse,
	su11Apply,
} from "@/lib/render/hyperbolic";
import { islamicNormalAngleFromSlider } from "@/lib/utils/islamicNoise";
import { Vector } from "@/classes/Vector";
import { keyOf, type Segment } from "@/lib/utils/islamicArrangement";
import { buildInterlaceMap, assignOverUnder } from "@/lib/utils/islamicInterlace";

/** Hyperbolic centroid of Poincaré points via the Klein average (affine in Klein), mapped back to Poincaré. */
function hypCentroid(pts: Complex[]): Complex {
	let kx = 0, ky = 0;
	for (const z of pts) {
		const s = 2 / (1 + z.x * z.x + z.y * z.y);
		kx += s * z.x; ky += s * z.y;
	}
	kx /= pts.length; ky /= pts.length;
	const d = 1 + Math.sqrt(Math.max(1 - (kx * kx + ky * ky), 0));
	return { x: kx / d, y: ky / d };
}

// ── Tiling patch ──────────────────────────────────────────────────────────────────────────────────
export interface HypTile { verts: Complex[]; centroid: Complex; hue: number; sides: number }

/** Reflect a disk point across the geodesic through disk points `a`,`b` (circle ⟂ the unit circle, or a
 *  diameter when a,b,O are collinear). Used to grow the tiling patch tile-by-tile across shared edges. */
function reflectAcrossGeodesic(z: Complex, a: Complex, b: Complex): Complex {
	// Centre κ of the orthogonal circle solves κ·a = (1+|a|²)/2 and κ·b = (1+|b|²)/2.
	const ka = 0.5 * (1 + a.x * a.x + a.y * a.y);
	const kb = 0.5 * (1 + b.x * b.x + b.y * b.y);
	const det = a.x * b.y - a.y * b.x;
	if (Math.abs(det) < 1e-12) {
		// Diameter through the origin at angle atan2: reflect across that line.
		const ang = Math.atan2(b.y - a.y, b.x - a.x);
		const c = Math.cos(2 * ang), s = Math.sin(2 * ang);
		return { x: c * z.x + s * z.y, y: s * z.x - c * z.y };
	}
	const cx = (ka * b.y - kb * a.y) / det;
	const cy = (kb * a.x - ka * b.x) / det;
	const r2 = cx * cx + cy * cy - 1;
	const dx = z.x - cx, dy = z.y - cy;
	const dd = dx * dx + dy * dy || 1e-18;
	const k = r2 / dd;
	return { x: cx + k * dx, y: cy + k * dy };
}

/** A regular {p,q} tiling patch, `layers` edge-reflections deep from the central p-gon (BFS, deduped by
 *  tile centroid). Every tile is a p-gon of Poincaré vertices. Uniform/snub patches are a follow-up. */
export function buildRegularPatch(p: number, q: number, layers: number): HypTile[] {
	const { rC } = mirrorParams(p, q);
	const central: Complex[] = [];
	for (let k = 0; k < p; k++) {
		const ang = Math.PI / p + (2 * Math.PI * k) / p;
		central.push({ x: rC * Math.cos(ang), y: rC * Math.sin(ang) });
	}
	const hue = tileHue(p);
	const keyOf = (c: Complex) => `${Math.round(c.x * 1e4)},${Math.round(c.y * 1e4)}`;
	const mk = (verts: Complex[]): HypTile => {
		const centroid = hypCentroid(verts);
		return { verts, centroid, hue, sides: p };
	};
	const out: HypTile[] = [];
	const seen = new Set<string>();
	let frontier: HypTile[] = [mk(central)];
	seen.add(keyOf(frontier[0].centroid));
	for (let layer = 0; layer <= layers; layer++) {
		out.push(...frontier);
		if (layer === layers) break;
		const next: HypTile[] = [];
		for (const tile of frontier) {
			const n = tile.verts.length;
			for (let i = 0; i < n; i++) {
				const a = tile.verts[i], b = tile.verts[(i + 1) % n];
				const reflected = tile.verts.map((v) => reflectAcrossGeodesic(v, a, b));
				const t = mk(reflected);
				if (Math.hypot(t.centroid.x, t.centroid.y) >= 0.9999) continue; // ran off the disk
				const key = keyOf(t.centroid);
				if (seen.has(key)) continue;
				seen.add(key);
				next.push(t);
			}
		}
		frontier = next;
	}
	return out;
}

// ── Faithful polygons-in-contact construction (ported to geodesics) ─────────────────────────────────
/** Strap segments of one tile: two rays per edge at ±θ from the inward normal at the hyperbolic edge
 *  midpoint, origins slid ALONG the edge (opposite each ray's lean — the two-point family), grown as
 *  geodesics and cut at the `count`-th forward ray-ray crossing. `theta` is measured from the inward
 *  normal (0 ⇒ along the normal → tips at the centre, π/2 ⇒ along the edge → tips at the vertices),
 *  matching Polygon.calculateIslamicSegments. Returned as geodesic endpoints in Poincaré. */
export function constructTileStraps(tile: HypTile, theta: number, offsetFrac: number, count: number): Array<[Complex, Complex]> {
	const V = tile.verts, n = V.length, C = tile.centroid;
	const eps = 1e-9;
	offsetFrac = Math.min(Math.max(offsetFrac, 0), 0.98); // fraction of the half-edge; never quite a vertex
	const ct = Math.cos(theta), st = Math.sin(theta);
	// Inward edge normal at point `o`: the unit edge tangent (toward b) rotated 90°, signed toward the
	// centroid. Perpendicular to the edge everywhere on it (conformal metric), unlike "tangent toward C".
	const inwardNormal = (o: Complex, eHat: Complex): Complex => {
		let nx = -eHat.y, ny = eHat.x;
		const toC = geodesicTangentAt(o, C);
		if (nx * toC.x + ny * toC.y < 0) { nx = -nx; ny = -ny; }
		return { x: nx, y: ny };
	};
	const origins: Complex[] = [];
	const tangents: Complex[] = [];
	const edgeOf: number[] = [];
	for (let i = 0; i < n; i++) {
		const a = V[i], b = V[(i + 1) % n];
		const M = hypMidpoint(a, b);
		const shift = offsetFrac * 0.5 * hypDist(a, b);
		// dPlus leans toward b, so (two-point family) its origin slides toward a; dMinus mirrors it. Compute
		// each ray's normal + edge tangent AT ITS OWN origin so the offset stays exactly on the edge.
		const oPlus = shift > 0 ? geodesicMove(M, a, shift) : M;
		const ePlus = geodesicTangentAt(oPlus, b);
		const nPlus = inwardNormal(oPlus, ePlus);
		origins.push(oPlus);
		tangents.push({ x: ct * nPlus.x + st * ePlus.x, y: ct * nPlus.y + st * ePlus.y });
		edgeOf.push(i);
		const oMinus = shift > 0 ? geodesicMove(M, b, shift) : M;
		const eMinus = geodesicTangentAt(oMinus, b);
		const nMinus = inwardNormal(oMinus, eMinus);
		origins.push(oMinus);
		tangents.push({ x: ct * nMinus.x - st * eMinus.x, y: ct * nMinus.y - st * eMinus.y });
		edgeOf.push(i);
	}
	const R = origins.length;
	const geo = origins.map((o, i) => geodesicThroughPointTangent(o, tangents[i]));
	// Growing-line simulation (Polygon.calculateIslamicSegments, ported): every crossing is one arrival per
	// ray; a ray stops at its `count`-th arrival that its partner's BODY covers (partner reached it first and
	// is still alive there). Resolving arrivals in time (distance) order makes the stops mutual, so opposite
	// rays share an exact endpoint and the straps close into faces.
	interface Arrival { time: number; ray: number; partner: number; partnerTime: number; X: Complex }
	const arrivals: Arrival[] = [];
	for (let i = 0; i < R; i++)
		for (let j = i + 1; j < R; j++) {
			if (edgeOf[i] === edgeOf[j]) continue; // sibling rays of one edge diverge, never cross forward
			const X = geodesicIntersect(geo[i], geo[j]);
			if (!X) continue;
			const ti = geodesicTangentAt(origins[i], X).x * tangents[i].x + geodesicTangentAt(origins[i], X).y * tangents[i].y > 0 ? hypDist(origins[i], X) : -1;
			const tj = geodesicTangentAt(origins[j], X).x * tangents[j].x + geodesicTangentAt(origins[j], X).y * tangents[j].y > 0 ? hypDist(origins[j], X) : -1;
			if (ti <= eps || tj <= eps) continue; // both rays must reach it going forward
			arrivals.push({ time: ti, ray: i, partner: j, partnerTime: tj, X });
			arrivals.push({ time: tj, ray: j, partner: i, partnerTime: ti, X });
		}
	arrivals.sort((x, y) => x.time - y.time);
	const stop = new Array<number>(R).fill(Infinity);
	const endX = new Array<Complex | null>(R).fill(null);
	const hits = new Array<number>(R).fill(0);
	const lastHitX = new Array<Complex | null>(R).fill(null);
	const nearestX = new Array<Complex | null>(R).fill(null);
	const nearest = new Array<number>(R).fill(Infinity);
	for (const ev of arrivals) {
		if (ev.time < nearest[ev.ray]) { nearest[ev.ray] = ev.time; nearestX[ev.ray] = ev.X; }
		if (Number.isFinite(stop[ev.ray])) continue;
		if (ev.partnerTime <= ev.time + eps && stop[ev.partner] >= ev.partnerTime - eps) {
			hits[ev.ray]++;
			lastHitX[ev.ray] = ev.X;
			if (hits[ev.ray] >= count) { stop[ev.ray] = ev.time; endX[ev.ray] = ev.X; }
		}
	}
	const segs: Array<[Complex, Complex]> = [];
	for (let i = 0; i < R; i++) {
		const end = endX[i] ?? lastHitX[i] ?? nearestX[i]; // clamp so a ray is never dropped
		if (end) segs.push([origins[i], end]);
	}
	return segs;
}

// ── Uniform + snub Islamic tile data (the fold-shader A/B/C fill) ────────────────────────────────────
// The uniform/snub path builds the SAME faithful rosette as the regular path, but for EVERY tile touching
// the fundamental domain — each tile as a real regular polygon, then constructTileStraps on it — matching
// the flat (Polygon.calculateIslamicSegments) and spherical (buildIslamicPattern) per-tile constructions.
// The earlier Wythoff-foot builder (hyperbolic.ts) emitted only the two edges incident to the generating
// vertex, so the rosette never closed: the strapwork broke into disconnected chevrons and the fill traced
// the bare tiles. Every uniform tile is a REGULAR polygon whose vertices are the single Wythoff-vertex orbit,
// so the tile is the orbit of W under the rotation about the tile centre — one vertex generates the whole
// polygon. The shader folds each pixel to the upper-half Schwarz triangle (uStrapReflect 1) so a single
// upper-half copy of an off-axis tile (e.g. the q-gon at V) also covers its mirror twin below the axis.

const clampFrac = (offsetPct: number) => Math.min(Math.max(offsetPct, 0), 100) / 100;
const clampCount = (count: number) => Math.min(Math.max(Math.round(count), 1), 3);

/** SU(1,1) rotation by `theta` about a disk point (translate the centre to O, rotate, translate back). */
function rotationAbout(center: Complex, theta: number) {
	const T = su11Translation(center);
	return su11Mul(su11Mul(T, su11Rotation(theta)), su11Inverse(T));
}

/** A regular hyperbolic tile as the orbit of one vertex `vertex` under the `sides`-fold rotation about
 *  `center` (uniform-tiling tiles are regular polygons; the single Wythoff vertex generates the whole ring).
 *  Vertices are re-sorted by angle about the centre so the edge order is the polygon boundary. */
function tilePolygon(center: Complex, sides: number, vertex: Complex): HypTile {
	const verts: Complex[] = [];
	for (let k = 0; k < sides; k++) verts.push(su11Apply(rotationAbout(center, (2 * Math.PI * k) / sides), vertex));
	verts.sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
	return { verts, centroid: hypCentroid(verts), hue: tileHue(sides), sides };
}

const strapsForTile = (tile: HypTile, theta: number, frac: number, count: number, ti: number): StrapSegment[] =>
	constructTileStraps(tile, theta, frac, count).map(([a, b]) => ({ a, b, tile: ti }));

/**
 * Uniform (non-snub) {p,q} tiling: the ≤3 present tiles (regular polygons at the Schwarz corners O/V/E) plus
 * every strap TAGGED by which tile it bounds. The shader classifies a folded pixel by the crossing parity
 * from each tile's centre against ONLY that tile's straps — the local polygons-in-contact rule, each tile
 * independent. Centres are the corners (all in the upper-half Schwarz triangle), so the shader's uStrapReflect
 * fold handles the mirror copies. Faithful growing-ray construction (constructTileStraps), from-normal angle.
 */
export function uniformIslamicData(spec: WythoffSpec, sliderDeg: number, offsetPct: number, count: number): IslamicTileData {
	const { p, q, rings } = spec;
	const theta = islamicNormalAngleFromSlider(sliderDeg);
	const frac = clampFrac(offsetPct);
	const nStop = clampCount(count);
	const desc = uniformDescriptor(p, q, rings);
	const corners = schwarzCorners(p, q);
	const cornerPt: Record<"O" | "V" | "E", Complex> = { O: corners.O, V: corners.V, E: corners.E };
	const W = wythoffVertex(p, q, rings);
	const centers: Complex[] = [];
	const hues: number[] = [];
	const straps: StrapSegment[] = [];
	desc.tiles.forEach((t, ti) => {
		const poly = tilePolygon(cornerPt[t.corner], t.sides, W);
		centers.push(cornerPt[t.corner]);
		hues.push(t.hue);
		straps.push(...strapsForTile(poly, theta, frac, nStop, ti));
	});
	return { centers, hues, straps };
}

/** Rotate a whole tile (verts + centroid) by `theta` about the origin. */
function rotTile(t: HypTile, theta: number): HypTile {
	const R = rotationAbout({ x: 0, y: 0 }, theta);
	return { verts: t.verts.map((v) => su11Apply(R, v)), centroid: su11Apply(R, t.centroid), hue: t.hue, sides: t.sides };
}

/**
 * Snub sr{p,q}: chiral, so the shader tests the kite coord directly (uStrapReflect 0) — there is no mirror to
 * cover a tile's other side. The shader folds each pixel into the reference p-fold wedge [−π/p, π/p] about O,
 * so every tile's rosette must live IN that wedge to be drawn. The p-gon (centre O, full C_p rosette) already
 * fills it; each snub triangle is rotated by the fold into the wedge and de-duplicated (the three about the
 * snub vertex include a fold-image pair). The q-gon sits with its centre ON the wedge boundary V (angle π/p),
 * so it straddles both adjacent wedges: with no reflection, emit BOTH it and its −2π/p twin so each wedge
 * boundary carries a q-gon half. Every tile keeps its faithful constructTileStraps rosette, tagged.
 */
export function snubIslamicData(spec: WythoffSpec, sliderDeg: number, offsetPct: number, count: number): IslamicTileData {
	const { p, q } = spec;
	const theta = islamicNormalAngleFromSlider(sliderDeg);
	const frac = clampFrac(offsetPct);
	const nStop = clampCount(count);
	const wedge = (2 * Math.PI) / p;
	const foldRot = (c: Complex) => -wedge * Math.round(Math.atan2(c.y, c.x) / wedge);
	const s = snubData(p, q);
	const O: Complex = { x: 0, y: 0 };
	const V = schwarzCorners(p, q).V;
	const tri = (verts: Complex[]): HypTile => ({ verts, centroid: hypCentroid(verts), hue: tileHue(3), sides: 3 });

	const qgon = tilePolygon(V, q, s.s);
	// p-gon + the q-gon straddling the +π/p boundary + its −2π/p twin straddling the −π/p boundary.
	const tiles: HypTile[] = [tilePolygon(O, p, s.s), qgon, rotTile(qgon, -wedge)];
	// Snub triangles: fold each into the reference wedge, drop fold-duplicate centroids.
	const centroids: Complex[] = tiles.map((t) => t.centroid);
	for (const t of [tri([s.s, s.as, s.bis]), tri([s.s, s.ais, s.n]), tri([s.s, s.n, s.bs])]) {
		const f = rotTile(t, foldRot(t.centroid));
		if (centroids.some((c) => (c.x - f.centroid.x) ** 2 + (c.y - f.centroid.y) ** 2 < 1e-6)) continue;
		centroids.push(f.centroid);
		tiles.push(f);
	}
	const centers = tiles.map((t) => t.centroid);
	const hues = tiles.map((t) => t.hue);
	const straps: StrapSegment[] = [];
	tiles.forEach((t, ti) => straps.push(...strapsForTile(t, theta, frac, nStop, ti)));
	return { centers, hues, straps };
}

// ── Interlace over/under weave (the fold-shader `interlace` style) ──────────────────────────────────
// For the CLEAN construction (offset 0, count 1) each strap is one ray whose ONLY crossing is its origin
// (a shared edge midpoint, 4-valent: two rays from each of the two adjacent tiles). So a single over/under
// bit per strap fully describes the weave. We recover it by pooling a neighbourhood of straps into the flat
// planar arrangement (buildInterlaceMap) and running the tested alternating-parity solver (assignOverUnder).
// The straps are geodesic arcs, but over/under is topological and the pooled endpoints coincide EXACTLY
// (shared midpoints/tips), so the straight-line arrangement recovers the right combinatorics near the centre.
//
// The fold shader only ever tests the CENTRAL tile's frame, so its crossings live on the central tile's
// EDGES — where the over partner is the NEIGHBOUR strand across the fold, absent from a central-only set.
// We therefore return, alongside the central straps, the neighbour STUBS incident to each central edge
// midpoint (the 2 neighbour rays sharing that origin). Every pixel folds to the central tile; a neighbour
// stub only comes within a band of a pixel right at the shared midpoint (its origin), exactly where it must
// complete the 4-valent crossing, and is far elsewhere — so the shader's plain over-band occlusion yields a
// true X-weave with no disc hack and no seam (both sides of the edge draw the identical completed crossing).
const toVec = (c: Complex): Vector => new Vector(c.x, c.y);

/**
 * Interlace strap set + per-strap under-flag for the fold shader. `straps` is the central rosette (aligned to
 * `central` order) followed, for regular {p,q}, by the neighbour stubs that complete each edge-midpoint
 * crossing; `under[i]` is 1 where straps[i] dives UNDER at its origin (uStrapA) end, 0 for over/none.
 * `degenerate` flags an inconsistent weave (odd-degree vertex / propagation conflict) — the caller then draws
 * flat bands. Uniform/snub pool the central multi-tile set only (first cut: boundary midpoints stay 2-valent,
 * read as over ⇒ flat bands), so no stubs are appended for them.
 */
export function hyperbolicInterlaceData(
	spec: WythoffSpec,
	central: StrapSegment[],
	sliderDeg: number,
	offsetPct: number,
	count: number,
	startUnder: boolean,
): { straps: StrapSegment[]; under: number[]; degenerate: boolean } {
	const theta = islamicNormalAngleFromSlider(sliderDeg);
	const frac = clampFrac(offsetPct);
	const nStop = clampCount(count);
	const isRegular = spec.rings[0] && !spec.rings[1] && !spec.rings[2] && !spec.snub;

	// Pooled straps with a `central` marker (tile 0 of the patch), so we can split them afterwards.
	const pooled: { a: Complex; b: Complex; central: boolean }[] = [];
	if (isRegular) {
		buildRegularPatch(spec.p, spec.q, 1).forEach((tile, ti) => {
			for (const [a, b] of constructTileStraps(tile, theta, frac, nStop)) pooled.push({ a, b, central: ti === 0 });
		});
	} else {
		for (const s of central) pooled.push({ a: s.a, b: s.b, central: true });
	}

	const map = buildInterlaceMap(pooled.map((p) => [toVec(p.a), toVec(p.b)] as Segment), false);
	const { degenerate } = assignOverUnder(map, startUnder);

	// Index edges by their (unordered) endpoint-key pair so a strap finds its edge + which end is its origin.
	const byEnds = new Map<string, { keyA: string; underA: boolean; underB: boolean }>();
	for (const e of map.edges) {
		byEnds.set(`${e.keyA}|${e.keyB}`, e);
		byEnds.set(`${e.keyB}|${e.keyA}`, e);
	}
	const flagOf = (a: Complex, b: Complex): number => {
		const ka = keyOf(toVec(a)), kb = keyOf(toVec(b)); // a = origin (crossing), b = tip (bend)
		const e = byEnds.get(`${ka}|${kb}`);
		if (!e) return 0; // split (T-junction/transversal) or unmatched ⇒ treat as over
		return (e.keyA === ka ? e.underA : e.underB) ? 1 : 0;
	};

	// Central straps first, aligned to `central` order.
	const straps: StrapSegment[] = [];
	const under: number[] = [];
	for (const s of central) { straps.push(s); under.push(flagOf(s.a, s.b)); }

	// Neighbour stubs: pooled non-central straps whose ORIGIN coincides with a central edge midpoint.
	if (isRegular) {
		const centralOrigins = new Set(central.map((s) => keyOf(toVec(s.a))));
		for (const pl of pooled) {
			if (pl.central) continue;
			if (!centralOrigins.has(keyOf(toVec(pl.a)))) continue; // only the 2 rays meeting a central midpoint
			straps.push({ a: pl.a, b: pl.b, tile: 0 });
			under.push(flagOf(pl.a, pl.b));
		}
	}
	return { straps, under, degenerate };
}
