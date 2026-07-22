// Hankin polygons-in-contact construction on the hyperbolic shelf, for the certified-Dirichlet
// per-pixel renderer. Kaplan & Salesin (Islamic star patterns in absolute geometry, ACM TOG 2004)
// showed the flat construction is valid verbatim in absolute geometry — rays leave each edge midpoint
// at the contact angle and become geodesics. Two model tricks make the port small:
//
//   * KLEIN: hyperbolic geodesics are straight chords in the Klein model and ordering along a geodesic
//     is preserved, so the whole flat arrangement machinery (lib/utils/islamicArrangement.ts —
//     crossings, T-junctions, face tracing, point-in-polygon) runs UNCHANGED on Klein coordinates.
//     Only metric quantities (midpoints, contact angles, ray arrival times, stroke distances) use
//     hyperbolic formulas in the Poincaré model, where angles are Euclidean (conformal).
//   * Γ-INVARIANCE: the construction is canonical per tile, so it commutes with every isometry of the
//     tiling. The pattern can therefore be baked over the Dirichlet fundamental domain and sampled
//     after the shader's fold with exactly the soundness of the base tile field.
//
// The bake mirrors lib/render/hyperbolicReduce.ts texel-for-texel: same square [-rTex, rTex]², same
// fold-then-locate fallback for cracks, same ring post-pass, same loud error on deep unresolved.
// Field channels: R = face class + 1 (1 = A star body, 2 = B side field, 3 = C edge diamond),
// G = hyperbolic distance to the nearest construction line × EDGE_SCALE (the base stroke pipeline
// applies untouched), B/A = the containing FACE's hyperbolic barycenter (equivariant per-face shade).

import {
	type Complex,
	geodesicMove,
	geodesicTangentAt,
	hypDist,
	hypMidpoint,
} from "@/lib/render/hyperbolic";
import { EDGE_SCALE, fillNearestResolved, hypBarycenter, type ShaderTiling, type TileField } from "@/lib/render/hyperbolicReduce";
import { HyperbolicDeveloper, type Darts } from "@/lib/render/hyperbolicDevelopClient";
import { foldIntoDomain } from "@/lib/render/hyperbolicDirichlet";
import type { DevelopedPatch } from "@/lib/render/hyperbolicDevelopedDraw";
import { buildArrangement, extractFaces, keyOf, pointInPolygon, type Segment } from "@/utils/islamicArrangement";
import { Vector } from "@/classes/Vector";

// The arrangement quantises vertices to 1e-5 (islamicArrangement QUANT). Klein features at the bake's
// outermost tiles sit at ~2e-6 of the unit disk, so all arrangement work happens in Klein coordinates
// scaled by this factor — the quantum lands ~2 orders of magnitude below the smallest real feature.
export const KLEIN_SCALE = 256;

const COLLAR = 0.15; // must match hyperbolicReduce (the field square the shader samples)
const SEG_T = 24; // max pieces per face-boundary arc for the stroke-distance channel
// Max angular span per tessellation piece. Sagitta ≈ (Δθ/8)·chord, and the stroke's visibility
// threshold is a few bytes of G — at 0.35 rad the LONG unbroken walls of the slider-90 construction
// (whole apothems, ~0.28 rad, ONE chord) sagged ~12 bytes mid-arc and visibly pinched the stroke at
// the quarter points of every dual-cell edge (AL's report). 0.08 rad keeps the error under ~1 byte.
const TESS_MAX_RAD = 0.08;

/** Poincaré → Klein (same disk, same ideal boundary). */
export function poincareToKlein(p: Complex): Complex {
	const s = 2 / (1 + p.x * p.x + p.y * p.y);
	return { x: p.x * s, y: p.y * s };
}

/** Klein → Poincaré. */
export function kleinToPoincare(k: Complex): Complex {
	const s = 1 + Math.sqrt(Math.max(1 - (k.x * k.x + k.y * k.y), 0));
	return { x: k.x / s, y: k.y / s };
}

interface RayK {
	o: Complex; // origin, SCALED Klein
	d: Complex; // unit direction, SCALED Klein
	sMax: number; // parameter at the ideal endpoint (never reached)
	sExit: number; // parameter where the ray leaves its OWN tile — rays are strictly tile-local
	edge: number;
	mP: Complex; // origin in Poincaré — hyperbolic arrival times are measured from here
}

/**
 * The geodesic ray from Poincaré point M with unit conformal tangent t, as a scaled-Klein chord ray.
 * The geodesic's circle (orthogonal to the unit circle, tangent to t at M) yields its two IDEAL
 * endpoints, which the Klein model shares; the forward one E satisfies (E − M)·t > 0 (the
 * tangent–chord angle of an arc inside the disk is < 90°, and > 90° toward the other endpoint).
 */
function rayChord(M: Complex, t: Complex): { o: Complex; d: Complex; sMax: number } {
	const n = { x: -t.y, y: t.x };
	const md = M.x * n.x + M.y * n.y;
	let E1: Complex;
	let E2: Complex;
	if (Math.abs(md) < 1e-12) {
		// radial tangent ⇒ the geodesic is the diameter through M
		E1 = t;
		E2 = { x: -t.x, y: -t.y };
	} else {
		const lam = (1 - (M.x * M.x + M.y * M.y)) / (2 * md);
		const K = { x: M.x + lam * n.x, y: M.y + lam * n.y };
		const dK = Math.hypot(K.x, K.y); // > 1 (orthogonal-circle centre is outside the disk)
		const a = 1 / dK; // the radical line of the two circles is x·K̂ = 1/|K|
		const h = Math.sqrt(Math.max(1 - a * a, 0));
		const kx = K.x / dK;
		const ky = K.y / dK;
		E1 = { x: a * kx - h * ky, y: a * ky + h * kx };
		E2 = { x: a * kx + h * ky, y: a * ky - h * kx };
	}
	const fwd = (E1.x - M.x) * t.x + (E1.y - M.y) * t.y > 0 ? E1 : E2;
	const o = poincareToKlein(M);
	const ox = o.x * KLEIN_SCALE;
	const oy = o.y * KLEIN_SCALE;
	const dx = fwd.x * KLEIN_SCALE - ox;
	const dy = fwd.y * KLEIN_SCALE - oy;
	const L = Math.hypot(dx, dy);
	return { o: { x: ox, y: oy }, d: { x: dx / L, y: dy / L }, sMax: L * 0.999 };
}

/**
 * Hankin rays of one tile: from each edge's contact point(s), two geodesic rays at ±theta from the
 * inward edge normal (theta measured from the normal — islamicNormalAngleFromSlider convention, the
 * exact flat calculateIslamicSegments contract). Angles are conformal, so the ±theta tilt is a plain
 * 2D rotation of the Poincaré tangent.
 *
 * `offsetFrac ∈ [0,1]` is Kaplan/Bonner's two-point split, in HYPERBOLIC arc length: the two roots
 * slide symmetrically from the midpoint to M ± frac·(half edge) along the edge geodesic (1 ⇒ the
 * tiling vertices), and each ray leans toward the FAR side (the +ê-leaning ray roots at M − d·ê),
 * so the pair converges just off the midpoint — the flat construction's exact contract. At 0 both
 * roots collapse onto M and the classic single-contact rays come back bit-for-bit.
 */
function tileRays(polyP: Complex[], center: Complex, theta: number, offsetFrac: number): RayK[] {
	const n = polyP.length;
	const cosT = Math.cos(theta);
	const sinT = Math.sin(theta);
	const frac = Math.min(Math.max(offsetFrac, 0), 1);
	const epsS = 1e-9 * KLEIN_SCALE;
	// the tile as a Klein chord polygon (convex for regular hyperbolic tiles) — the ray exit cap
	const polyK = polyP.map((p) => {
		const k = poincareToKlein(p);
		return { x: k.x * KLEIN_SCALE, y: k.y * KLEIN_SCALE };
	});
	const exitOf = (o: Complex, d: Complex, sMax: number): number => {
		let sExit = sMax;
		for (let j = 0; j < n; j++) {
			const A = polyK[j];
			const B = polyK[(j + 1) % n];
			const ex = B.x - A.x;
			const ey = B.y - A.y;
			const denom = d.x * ey - d.y * ex;
			if (Math.abs(denom) < 1e-12) continue;
			const fx = A.x - o.x;
			const fy = A.y - o.y;
			const s = (fx * ey - fy * ex) / denom;
			const u = (fx * d.y - fy * d.x) / denom;
			if (s > epsS && u > -1e-9 && u < 1 + 1e-9 && s < sExit) sExit = s;
		}
		return sExit;
	};
	const rays: RayK[] = [];
	for (let i = 0; i < n; i++) {
		const v0 = polyP[i];
		const v1 = polyP[(i + 1) % n];
		const M = hypMidpoint(v0, v1);
		const d = frac * 0.5 * hypDist(v0, v1);
		// (root, lean toward v1?) — the +ê-leaning ray roots on the v0 side and vice versa
		const roots: [Complex, boolean][] = [
			[d > 0 ? geodesicMove(M, v0, d) : M, true],
			[d > 0 ? geodesicMove(M, v1, d) : M, false],
		];
		for (const [o, leanPlus] of roots) {
			// unit tangent toward v1 at the root — taken toward the FARTHER endpoint so it stays
			// well-defined when the root reaches a vertex (offset 100 %)
			const towardV0 = hypDist(o, v0) >= hypDist(o, v1);
			const tRaw = geodesicTangentAt(o, towardV0 ? v0 : v1);
			const ex = towardV0 ? -tRaw.x : tRaw.x;
			const ey = towardV0 ? -tRaw.y : tRaw.y;
			let nx = -ey;
			let ny = ex;
			const cTan = geodesicTangentAt(o, center);
			if (nx * cTan.x + ny * cTan.y < 0) {
				nx = -nx;
				ny = -ny;
			}
			const s = leanPlus ? sinT : -sinT;
			const dir = { x: nx * cosT + ex * s, y: ny * cosT + ey * s };
			const c = rayChord(o, dir);
			rays.push({ o: c.o, d: c.d, sMax: c.sMax, sExit: exitOf(c.o, c.d, c.sMax), edge: i, mP: o });
		}
	}
	return rays;
}

/**
 * The growing-ray race of Polygon.calculateIslamicSegments, in scaled Klein: every ray grows from its
 * contact point at unit HYPERBOLIC speed; a crossing with another ray's already-drawn body is a
 * qualifying arrival; a ray stops at its first one (classic single-contact construction). Crossings
 * are Klein straight-line intersections (exact); arrival times are hyperbolic distances. The clamp
 * (last covered crossing, else nearest forward crossing) and the loud no-partner warning are the flat
 * ones verbatim. Returns one [origin, endpoint] scaled-Klein segment per ray.
 */
export function islamicSegmentsForTile(
	polyP: Complex[],
	theta: number,
	offsetFrac = 0,
	label = "tile",
): [Complex, Complex][] {
	const center = hypBarycenter(polyP.map((p) => [p.x, p.y] as [number, number]));
	const rays = tileRays(polyP, center, theta, offsetFrac);
	const R = rays.length;
	const epsS = 1e-9 * KLEIN_SCALE;
	const epsT = 1e-9;

	interface Arrival {
		time: number;
		s: number;
		ray: number;
		partner: number;
		partnerTime: number;
	}
	const arrivals: Arrival[] = [];
	for (let i = 0; i < R; i++) {
		for (let j = i + 1; j < R; j++) {
			// siblings never STOP each other (at offset > 0 they do cross — the arrangement's
			// splitCrossings pass turns that crossing into a vertex, the flat contract exactly)
			if (rays[i].edge === rays[j].edge) continue;
			const di = rays[i].d;
			const dj = rays[j].d;
			const denom = di.x * dj.y - di.y * dj.x;
			if (Math.abs(denom) < 1e-12) continue;
			const fx = rays[j].o.x - rays[i].o.x;
			const fy = rays[j].o.y - rays[i].o.y;
			const s = (fx * dj.y - fy * dj.x) / denom;
			const u = (fx * di.y - fy * di.x) / denom;
			// crossings past a ray's own tile exit are not part of the motif — in the hyperbolic
			// unclosable regime (fat tiles, extreme sliders) rays would otherwise terminate on
			// accidental far-away crossings and shred the arrangement
			if (s <= epsS || u <= epsS || s >= rays[i].sExit || u >= rays[j].sExit) continue;
			const Xp = kleinToPoincare({
				x: (rays[i].o.x + s * di.x) / KLEIN_SCALE,
				y: (rays[i].o.y + s * di.y) / KLEIN_SCALE,
			});
			const ti = hypDist(rays[i].mP, Xp);
			const tj = hypDist(rays[j].mP, Xp);
			arrivals.push({ time: ti, s, ray: i, partner: j, partnerTime: tj });
			arrivals.push({ time: tj, s: u, ray: j, partner: i, partnerTime: ti });
		}
	}
	arrivals.sort((a, b) => a.time - b.time);

	const stopT = new Array<number>(R).fill(Infinity);
	const stopS = new Array<number>(R).fill(Infinity);
	const hits = new Array<number>(R).fill(0);
	const lastHitT = new Array<number>(R).fill(Infinity);
	const lastHitS = new Array<number>(R).fill(Infinity);
	const nearestT = new Array<number>(R).fill(Infinity);
	const nearestS = new Array<number>(R).fill(Infinity);
	for (const ev of arrivals) {
		if (ev.time < nearestT[ev.ray]) {
			nearestT[ev.ray] = ev.time;
			nearestS[ev.ray] = ev.s;
		}
		if (isFinite(stopT[ev.ray])) continue;
		// the partner's body covers the crossing iff it arrived no later and was still alive there
		if (ev.partnerTime <= ev.time + epsT && stopT[ev.partner] >= ev.partnerTime - epsT) {
			hits[ev.ray]++;
			lastHitT[ev.ray] = ev.time;
			lastHitS[ev.ray] = ev.s;
			if (hits[ev.ray] >= 1) {
				stopT[ev.ray] = ev.time;
				stopS[ev.ray] = ev.s;
			}
		}
	}
	const segments: [Complex, Complex][] = [];
	for (let i = 0; i < R; i++) {
		let s = stopS[i];
		if (!isFinite(s)) s = isFinite(lastHitT[i]) ? lastHitS[i] : nearestS[i];
		// no crossing inside the tile at all (the hyperbolic unclosable regime): run to the tile
		// boundary. The free end is a pendant the arrangement prune retracts to the last junction,
		// so the motif degrades continuously instead of dropping walls or shooting off-tile.
		if (!isFinite(s)) s = rays[i].sExit;
		segments.push([
			{ x: rays[i].o.x, y: rays[i].o.y },
			{ x: rays[i].o.x + s * rays[i].d.x, y: rays[i].o.y + s * rays[i].d.y },
		]);
	}
	return segments;
}

/** Poincaré geodesic arc a→b as a short ADAPTIVE polyline (the in-disk arc of the orthogonal
 *  circle). Pieces are chosen by angular span (TESS_MAX_RAD each, sagitta/chord ≈ Δθ/8): the many
 *  near-straight arrangement edges emit ONE segment instead of `maxN`, which is what keeps the
 *  full-res texel loop affordable, while long unbroken walls get enough pieces that the stored
 *  line distance never sags visibly (see TESS_MAX_RAD). */
function geodesicPts(a: Complex, b: Complex, maxN: number): Complex[] {
	const det = a.x * b.y - a.y * b.x;
	if (Math.abs(det) < 1e-9) return [a, b]; // diameter — exactly straight
	const r1 = (a.x * a.x + a.y * a.y + 1) / 2;
	const r2 = (b.x * b.x + b.y * b.y + 1) / 2;
	const cx = (r1 * b.y - r2 * a.y) / det;
	const cy = (a.x * r2 - b.x * r1) / det;
	const ta = Math.atan2(a.y - cy, a.x - cx);
	const tb = Math.atan2(b.y - cy, b.x - cx);
	const rr = Math.sqrt(Math.max(cx * cx + cy * cy - 1, 0));
	let d = ((tb - ta + Math.PI) % (2 * Math.PI)) - Math.PI;
	// of the two arcs pick the one inside the disk (the short one for an orthogonal circle)
	const midShort = { x: cx + rr * Math.cos(ta + d / 2), y: cy + rr * Math.sin(ta + d / 2) };
	if (Math.hypot(midShort.x, midShort.y) > 1) d = d > 0 ? d - 2 * Math.PI : d + 2 * Math.PI;
	const n = Math.max(1, Math.min(maxN, Math.ceil(Math.abs(d) / TESS_MAX_RAD)));
	const out: Complex[] = [];
	for (let i = 0; i <= n; i++) {
		const t = ta + d * (i / n);
		out.push({ x: cx + rr * Math.cos(t), y: cy + rr * Math.sin(t) });
	}
	return out;
}

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

// Angle-independent develop cache (the expensive step of a re-bake). Small LRU — a patch for a deep
// k=2 domain is a few MB.
const patchCache = new Map<string, DevelopedPatch>();
const PATCH_CACHE_CAP = 8;

function getBakePatch(
	darts: Darts,
	edge: number,
	meta: { id: string; name: string; config: string; edge: number },
	boundEu: number,
): DevelopedPatch {
	const key = `${meta.id}|${boundEu.toFixed(6)}`;
	const hit = patchCache.get(key);
	if (hit) return hit;
	const dev = new HyperbolicDeveloper(darts, edge, { deepDedup: true });
	const patch = dev.develop(meta, { a: { x: 1, y: 0 }, b: { x: 0, y: 0 } }, boundEu, 400_000);
	if (patchCache.size >= PATCH_CACHE_CAP) {
		const oldest = patchCache.keys().next().value;
		if (oldest !== undefined) patchCache.delete(oldest);
	}
	patchCache.set(key, patch);
	return patch;
}

interface FaceRec {
	polyK: Vector[]; // scaled Klein — containment (faces are straight polygons here)
	tess: [number, number][]; // Poincaré boundary polyline — the stroke-distance channel
	cls: number; // 1 = A, 2 = B, 3 = C; 0 = ambiguous, resolve per texel from the marker lists
	/** Poincaré positions of the CONTAINED markers, present only on ambiguous (cls 0) faces: near
	 *  the merge/split bifurcations of the construction (offset ≳ 95 %) a face can hold tile centres
	 *  AND edge contacts at once — a per-texel nearest-marker split keeps the colouring continuous
	 *  across the topology change, where any single per-face class would pop. */
	ambA?: Complex[];
	ambC?: Complex[];
	bx: number; // face hyp barycenter, Poincaré
	by: number;
	x0: number; // scaled-Klein bbox
	x1: number;
	y0: number;
	y1: number;
}

/**
 * Bake the plain-style Islamic field for a prepared tiling: same square, res-independent semantics,
 * and totality discipline as the base field (fold-into-domain for cracks, ring-copy post-pass, loud
 * error on deep unresolved texels). Returns null only when the construction produced no faces —
 * callers then render the base tiling and the toggle is a loud no-op.
 */
export function prepareIslamicField(
	st: ShaderTiling,
	darts: Darts,
	edge: number,
	meta: { id: string; name: string; config: string; edge: number },
	angleFromNormalRad: number,
	offsetFrac = 0,
	opts: { fieldRes?: number } = {},
): TileField | null {
	const rTex = st.field.rTex;
	const res = opts.fieldRes ?? Math.min(st.field.res, 1024);

	// ---- develop the same patch the base bake uses: every face touching the square closes inside it.
	// The patch is angle-INDEPENDENT, so it is cached per tiling — an angle-slider drag re-runs only
	// the rays + arrangement + texel loop.
	let rMaxTile = 0;
	for (const p of darts.lvert) rMaxTile = Math.max(rMaxTile, Math.asinh(Math.sinh(edge / 2) / Math.sin(Math.PI / p)));
	const boundEu = Math.min(0.9995, Math.tanh((st.domain.RD + COLLAR + 2 * rMaxTile + 0.2) / 2));
	const patch = getBakePatch(darts, edge, meta, boundEu);

	// ---- per-tile Hankin rays → pooled scaled-Klein arrangement --------------------------------------
	// The offset endpoint is regularised: at EXACTLY 100 % the roots coincide with the tiling
	// vertices and new junctions snap the arrangement topology (measured: ~8 % of texels flip in the
	// last 1 % of the slider vs ~1.5 % per percent elsewhere). Capping at 99.8 % keeps the roots a
	// sub-pixel shy of the vertices — the offset-100 look, without the pop AL asked to avoid.
	const frac = Math.min(Math.max(offsetFrac, 0), 0.998);
	const segments: Segment[] = [];
	const centers: Vector[] = []; // one per tile (hyp barycenter), scaled Klein
	const contacts: Vector[] = []; // one per tiling EDGE (hyp midpoint), scaled Klein, deduped
	const contactSeen = new Set<string>();
	for (const face of patch.faces) {
		const polyP: Complex[] = face.map((i) => ({ x: patch.vertices[i][0], y: patch.vertices[i][1] }));
		for (const [a, b] of islamicSegmentsForTile(polyP, angleFromNormalRad, frac, meta.id)) {
			segments.push([new Vector(a.x, a.y), new Vector(b.x, b.y)]);
		}
		const c = hypBarycenter(polyP.map((p) => [p.x, p.y] as [number, number]));
		const cK = poincareToKlein(c);
		centers.push(new Vector(cK.x * KLEIN_SCALE, cK.y * KLEIN_SCALE));
		for (let i = 0; i < polyP.length; i++) {
			const mK = poincareToKlein(hypMidpoint(polyP[i], polyP[(i + 1) % polyP.length]));
			const mV = new Vector(mK.x * KLEIN_SCALE, mK.y * KLEIN_SCALE);
			const k = keyOf(mV);
			if (!contactSeen.has(k)) {
				contactSeen.add(k);
				contacts.push(mV);
			}
		}
	}
	// offset > 0 makes real crossings land mid-segment (sibling rays converge over the midpoint) —
	// the arrangement must split them into vertices, exactly the flat construction's flag.
	//
	// Degenerate slider corners can leave PENDANT spikes (a ray clamped to a crossing whose covering
	// partner was itself cut shorter, or a ray with no covered crossing at all). A pendant makes the
	// face trace non-simple and can void whole regions of the field. Prune dangling chains back to
	// the last real junction: what remains is a closed subdivision, every face is simple, and the
	// bake stays TOTAL. At the classic settings no pendant exists and this is a no-op.
	const arr = buildArrangement(segments, frac > 0);
	const deg = new Array<number>(arr.pts.length).fill(0);
	const vEdges: number[][] = arr.pts.map(() => []);
	for (let ei = 0; ei < arr.edges.length; ei++) {
		const [a, b] = arr.edges[ei];
		deg[a]++;
		deg[b]++;
		vEdges[a].push(ei);
		vEdges[b].push(ei);
	}
	const alive = new Array<boolean>(arr.edges.length).fill(true);
	const stack: number[] = [];
	for (let v = 0; v < deg.length; v++) if (deg[v] === 1) stack.push(v);
	while (stack.length) {
		const v = stack.pop()!;
		if (deg[v] !== 1) continue;
		const ei = vEdges[v].find((e) => alive[e]);
		if (ei === undefined) continue;
		alive[ei] = false;
		const [a, b] = arr.edges[ei];
		deg[a]--;
		deg[b]--;
		const w = a === v ? b : a;
		if (deg[w] === 1) stack.push(w);
	}
	const prunedSegs: Segment[] = [];
	for (let ei = 0; ei < arr.edges.length; ei++) {
		if (alive[ei]) prunedSegs.push([arr.pts[arr.edges[ei][0]], arr.pts[arr.edges[ei][1]]]);
	}
	const faces = extractFaces(prunedSegs, false); // already split — every junction is a vertex
	if (faces.length === 0) {
		console.error(`hyperbolicIslamic: no faces for ${meta.id} at angle ${angleFromNormalRad.toFixed(3)}`);
		return null;
	}

	// ---- classify + record faces ---------------------------------------------------------------------
	// A = the face holds a tile centre (star body, keeps the tile hue). C = else it strictly holds an
	// edge contact — the diamond the offset opens around each midpoint. B = the rest. This GEOMETRIC
	// rule replaces colorFacesAbc's global parity split on purpose: parity re-anchors when the star
	// bodies degenerate (angle → 90°) and can flip whole regions between B and C; marker containment
	// is local, Γ-invariant, and CONTINUOUS — the C region shrinks to nothing as the offset closes and
	// no face ever flips at the slider's end stops. At offset 0 the midpoints are arrangement VERTICES
	// (every root sits on them), so containment is boundary-ambiguous there — C is skipped entirely,
	// which is also its continuous limit.
	const kSq = poincareToKlein({ x: rTex, y: 0 }).x * KLEIN_SCALE; // the sampled square, in Klein
	let extentSum = 0;
	const bboxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
	for (const f of faces) {
		let x0 = Infinity;
		let x1 = -Infinity;
		let y0 = Infinity;
		let y1 = -Infinity;
		for (const v of f.vertices) {
			x0 = Math.min(x0, v.x);
			x1 = Math.max(x1, v.x);
			y0 = Math.min(y0, v.y);
			y1 = Math.max(y1, v.y);
		}
		bboxes.push({ x0, x1, y0, y1 });
		extentSum += x1 - x0 + (y1 - y0);
	}
	const mcell = Math.max(1e-9, extentSum / (2 * faces.length));
	const gridOf = (pts: Vector[]): Map<string, number[]> => {
		const g = new Map<string, number[]>();
		for (let i = 0; i < pts.length; i++) {
			const k = `${Math.floor(pts[i].x / mcell)},${Math.floor(pts[i].y / mcell)}`;
			let arr = g.get(k);
			if (!arr) {
				arr = [];
				g.set(k, arr);
			}
			arr.push(i);
		}
		return g;
	};
	// Boundary-exact degeneracies get an EMPTY marker set — the continuous limit of their class:
	//   * offset 0: every contact is an arrangement VERTEX (all roots sit on it) — containment would
	//     be parity noise; the C diamonds have zero area, so C simply does not exist.
	//   * angle 90 (θ = 0) at offset 0: the apothem walls pass THROUGH the tile centres, making each
	//     centre a face vertex — and the star bodies have shrunk to nothing, so A does not exist.
	const centersActive = !(angleFromNormalRad < 1e-9 && frac < 1e-9);
	const centerGrid = centersActive ? gridOf(centers) : new Map<string, number[]>();
	const contactGrid = frac > 0 ? gridOf(contacts) : new Map<string, number[]>();
	const heldMarkers = (fi: number, grid: Map<string, number[]>, pts: Vector[]): Vector[] => {
		const out: Vector[] = [];
		const b = bboxes[fi];
		for (let gx = Math.floor(b.x0 / mcell); gx <= Math.floor(b.x1 / mcell); gx++) {
			for (let gy = Math.floor(b.y0 / mcell); gy <= Math.floor(b.y1 / mcell); gy++) {
				const arr = grid.get(`${gx},${gy}`);
				if (!arr) continue;
				for (const mi of arr) {
					if (pointInPolygon(faces[fi].vertices, pts[mi])) out.push(pts[mi]);
				}
			}
		}
		return out;
	};
	const toP = (v: Vector): Complex => kleinToPoincare({ x: v.x / KLEIN_SCALE, y: v.y / KLEIN_SCALE });

	const recs: FaceRec[] = [];
	for (let fi = 0; fi < faces.length; fi++) {
		const vs = faces[fi].vertices;
		const b = bboxes[fi];
		if (b.x1 < -kSq || b.x0 > kSq || b.y1 < -kSq || b.y0 > kSq) continue; // never sampled
		const inA = heldMarkers(fi, centerGrid, centers);
		const inC = heldMarkers(fi, contactGrid, contacts);
		const cls = inA.length > 0 && inC.length > 0 ? 0 : inA.length > 0 ? 1 : inC.length > 0 ? 3 : 2;
		const polyP = vs.map((v) => kleinToPoincare({ x: v.x / KLEIN_SCALE, y: v.y / KLEIN_SCALE }));
		const tess: [number, number][] = [];
		for (let i = 0; i < polyP.length; i++) {
			const pts = geodesicPts(polyP[i], polyP[(i + 1) % polyP.length], SEG_T);
			for (let k = 0; k < pts.length - 1; k++) tess.push([pts[k].x, pts[k].y]);
		}
		const bc = hypBarycenter(polyP.map((p) => [p.x, p.y] as [number, number]));
		recs.push({
			polyK: vs,
			tess,
			cls,
			ambA: cls === 0 ? inA.map(toP) : undefined,
			ambC: cls === 0 ? inC.map(toP) : undefined,
			bx: bc.x,
			by: bc.y,
			x0: b.x0,
			x1: b.x1,
			y0: b.y0,
			y1: b.y1,
		});
	}

	const GRID = 64;
	const grid: number[][] = Array.from({ length: GRID * GRID }, () => []);
	const bin = (v: number) => Math.max(0, Math.min(GRID - 1, Math.floor(((v / kSq + 1) / 2) * GRID)));
	for (let ri = 0; ri < recs.length; ri++) {
		const r = recs[ri];
		for (let gy = bin(r.y0); gy <= bin(r.y1); gy++) {
			for (let gx = bin(r.x0); gx <= bin(r.x1); gx++) grid[gy * GRID + gx].push(ri);
		}
	}
	const locate = (px: number, py: number): number => {
		const k = poincareToKlein({ x: px, y: py });
		const kx = k.x * KLEIN_SCALE;
		const ky = k.y * KLEIN_SCALE;
		const cell = grid[bin(ky) * GRID + bin(kx)];
		const P = new Vector(kx, ky);
		for (const ri of cell) {
			const r = recs[ri];
			if (kx < r.x0 || kx > r.x1 || ky < r.y0 || ky > r.y1) continue;
			if (pointInPolygon(r.polyK, P)) return ri;
		}
		return -1;
	};
	// Sliver-crack fallback: a texel centre can land exactly on a T-junction/face border where the
	// crossing test misses BOTH neighbours — and in the wall-less regime a texel may lie in the OUTER
	// (unbounded) region that face extraction rightly drops. Returns the face whose boundary is
	// nearest within the 3×3 grid neighbourhood, plus that squared distance (the stroke channel of
	// the marker-Voronoi fallback below reuses it).
	const nearestFace = (px: number, py: number): { ri: number; dSq: number } => {
		const k = poincareToKlein({ x: px, y: py });
		const gx = bin(k.x * KLEIN_SCALE);
		const gy = bin(k.y * KLEIN_SCALE);
		let best = -1;
		let bd = Infinity;
		const seen = new Set<number>();
		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				const cx = gx + dx;
				const cy = gy + dy;
				if (cx < 0 || cy < 0 || cx >= GRID || cy >= GRID) continue;
				for (const ri of grid[cy * GRID + cx]) {
					if (seen.has(ri)) continue;
					seen.add(ri);
					const r = recs[ri];
					for (let kk = 0, m = r.tess.length; kk < m; kk++) {
						const a = r.tess[kk];
						const b = r.tess[(kk + 1) % m];
						const d = distSq(px, py, a[0], a[1], b[0], b[1]);
						if (d < bd) {
							bd = d;
							best = ri;
						}
					}
				}
			}
		}
		return { ri: best, dSq: bd };
	};

	// ---- texel loop (base-bake discipline) -----------------------------------------------------------
	const centersP = centers.map(toP); // Poincaré marker positions for the wall-less Voronoi fallback
	const contactsP = contacts.map(toP);
	const gensSu = st.domain.gens;
	const data = new Uint8Array(res * res * 4);
	const resolved = new Uint8Array(res * res);
	const unresolvedIdx: number[] = [];
	const cornerIdx: number[] = [];
	let unresolvedDeep = 0;
	const deepR = 0.95 * rTex;
	// The shader re-aims any reduced point with |w| > rTex before sampling, so texels OUTSIDE the
	// disk of radius rTex (the square's corners) are never read. Skip their (expensive: the patch
	// ends before them, so every one would fold) classification and fill them by radial copy — on
	// the deepest domains this is most of the full-res bake time.
	const rSampled = rTex + (2 * (2 * rTex)) / res; // two texels of bilinear margin
	const q8 = (v: number) => Math.max(0, Math.min(255, Math.round(((v + 1) / 2) * 255)));
	for (let j = 0; j < res; j++) {
		const y = ((j + 0.5) / res) * 2 * rTex - rTex;
		for (let i = 0; i < res; i++) {
			const x = ((i + 0.5) / res) * 2 * rTex - rTex;
			const o = (j * res + i) * 4;
			if (x * x + y * y > rSampled * rSampled) {
				cornerIdx.push(o);
				continue;
			}
			let px = x;
			let py = y;
			let ri = locate(px, py);
			let nearWallSq = -1;
			if (ri < 0) {
				const { w } = foldIntoDomain(gensSu, { x, y }, st.rInEu);
				px = w.x;
				py = w.y;
				ri = locate(px, py);
				if (ri < 0) {
					const near = nearestFace(px, py);
					// only adopt the nearest face when the texel is plausibly ON its border (a crack);
					// a texel deep in wall-less territory falls through to the marker Voronoi instead
					const crackSq = ((4 * rTex) / res) ** 2;
					if (near.ri >= 0 && near.dSq <= crackSq) {
						ri = near.ri;
					} else {
						nearWallSq = near.ri >= 0 ? near.dSq : Infinity;
					}
				}
			}
			if (ri < 0) {
				// Wall-less regime: the motif does not close here (fat tiles at extreme sliders), so
				// this texel belongs to no bounded face. Its continuous-limit class as the walls
				// vanish is the nearest-marker Voronoi; the marker doubles as the (equivariant)
				// depth anchor. G = the nearest surviving wall if one is in reach.
				const wp = { x: px, y: py };
				let dA = Infinity;
				let mA: Complex | null = null;
				if (centersActive) {
					for (const m of centersP) {
						const dd = hypDist(wp, m);
						if (dd < dA) {
							dA = dd;
							mA = m;
						}
					}
				}
				let dC = Infinity;
				let mC: Complex | null = null;
				if (frac > 0) {
					for (const m of contactsP) {
						const dd = hypDist(wp, m);
						if (dd < dC) {
							dC = dd;
							mC = m;
						}
					}
				}
				const mk = dA <= dC ? mA : mC;
				if (mk) {
					const conf0 = 2 / Math.max(1 - (px * px + py * py), 1e-6);
					data[o] = dA <= dC ? 1 : 3;
					data[o + 1] =
						nearWallSq >= 0 && isFinite(nearWallSq)
							? Math.min(255, Math.round(Math.sqrt(nearWallSq) * conf0 * EDGE_SCALE))
							: 255;
					data[o + 2] = q8(mk.x);
					data[o + 3] = q8(mk.y);
					resolved[o / 4] = 1;
					continue;
				}
				unresolvedIdx.push(o);
				if (x * x + y * y < deepR * deepR) unresolvedDeep++;
				continue;
			}
			const r = recs[ri];
			let lineSq = Infinity;
			for (let k = 0, m = r.tess.length; k < m; k++) {
				const a = r.tess[k];
				const b = r.tess[(k + 1) % m];
				lineSq = Math.min(lineSq, distSq(px, py, a[0], a[1], b[0], b[1]));
			}
			const conf = 2 / Math.max(1 - (px * px + py * py), 1e-6);
			let cls = r.cls;
			if (cls === 0) {
				// merged star∪diamond face — split by nearest contained marker (hyperbolic distance,
				// so the split is Γ-invariant and matches the separated faces on either side of the
				// bifurcation)
				const wp = { x: px, y: py };
				let dA = Infinity;
				for (const m of r.ambA!) dA = Math.min(dA, hypDist(wp, m));
				let dC = Infinity;
				for (const m of r.ambC!) dC = Math.min(dC, hypDist(wp, m));
				cls = dA <= dC ? 1 : 3;
			}
			data[o] = cls;
			data[o + 1] = Math.min(255, Math.round(Math.sqrt(lineSq) * conf * EDGE_SCALE));
			data[o + 2] = q8(r.bx);
			data[o + 3] = q8(r.by);
			resolved[o / 4] = 1;
		}
	}
	// unresolved texels copy their nearest resolved texel so the field is TOTAL — a distance transform
	// (O(res²)), replacing the per-texel ring search whose O(unresolved·ring²) froze the offset slider for
	// seconds per notch on deep tilings. Same helper the base bake uses.
	fillNearestResolved(data, resolved, unresolvedIdx, res);
	// corner texels: copy from the same direction on the sampled disk (the shader's own re-aim
	// direction), O(1) each — cheap totality for texels that are never actually read
	for (const o of cornerIdx) {
		const idx = o / 4;
		const i = idx % res;
		const j = (idx - i) / res;
		const x = ((i + 0.5) / res) * 2 * rTex - rTex;
		const y = ((j + 0.5) / res) * 2 * rTex - rTex;
		const s = (rTex * 0.995) / Math.hypot(x, y);
		const ii = Math.max(0, Math.min(res - 1, Math.floor(((x * s) / rTex / 2 + 0.5) * res)));
		const jj = Math.max(0, Math.min(res - 1, Math.floor(((y * s) / rTex / 2 + 0.5) * res)));
		const oo = (jj * res + ii) * 4;
		data[o] = data[oo];
		data[o + 1] = data[oo + 1];
		data[o + 2] = data[oo + 2];
		data[o + 3] = data[oo + 3];
	}
	if (unresolvedDeep > 0) {
		console.error(
			`hyperbolicIslamic: ${unresolvedDeep} unresolved texels DEEP inside the field for ${meta.id} — bake coverage bug`,
		);
	}
	return { data, res, rTex };
}

// ---- shared cache (canvas + any future consumer): one bake per (tiling, slider notch, res) ----------
const fieldCache = new Map<string, TileField | null>();
const CACHE_CAP = 16; // full-res entries are ~4 MB; re-bakes are ≤ ~100 ms, so a small cache suffices

/** Cached plain-field lookup, keyed by tiling id + integer slider angle (degrees FROM NORMAL) +
 *  edge-offset percent. */
export function getIslamicField(
	st: ShaderTiling,
	darts: Darts,
	edge: number,
	meta: { id: string; name: string; config: string; edge: number },
	angleFromNormalRad: number,
	offsetFrac = 0,
	opts: { fieldRes?: number } = {},
): TileField | null {
	const res = opts.fieldRes ?? Math.min(st.field.res, 1024);
	const key = `${meta.id}|${Math.round((angleFromNormalRad * 180) / Math.PI)}|${Math.round(offsetFrac * 100)}|${res}`;
	const hit = fieldCache.get(key);
	if (hit !== undefined) return hit;
	let field: TileField | null = null;
	try {
		field = prepareIslamicField(st, darts, edge, meta, angleFromNormalRad, offsetFrac, { fieldRes: res });
	} catch (e) {
		console.error(`hyperbolicIslamic: bake failed for ${meta.id}:`, e);
	}
	if (fieldCache.size >= CACHE_CAP) {
		const oldest = fieldCache.keys().next().value;
		if (oldest !== undefined) fieldCache.delete(oldest);
	}
	fieldCache.set(key, field);
	return field;
}
