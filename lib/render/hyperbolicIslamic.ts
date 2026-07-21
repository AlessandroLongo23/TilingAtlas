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
	geodesicTangentAt,
	hypDist,
	hypMidpoint,
	tileHue,
} from "@/lib/render/hyperbolic";
import { EDGE_SCALE, hypBarycenter, type ShaderTiling, type TileField } from "@/lib/render/hyperbolicReduce";
import { HyperbolicDeveloper, type Darts } from "@/lib/render/hyperbolicDevelopClient";
import { foldIntoDomain } from "@/lib/render/hyperbolicDirichlet";
import type { DevelopedPatch } from "@/lib/render/hyperbolicDevelopedDraw";
import { extractFaces, colorFacesAbc, pointInPolygon, type Marker, type Segment } from "@/utils/islamicArrangement";
import { Vector } from "@/classes/Vector";

// The arrangement quantises vertices to 1e-5 (islamicArrangement QUANT). Klein features at the bake's
// outermost tiles sit at ~2e-6 of the unit disk, so all arrangement work happens in Klein coordinates
// scaled by this factor — the quantum lands ~2 orders of magnitude below the smallest real feature.
export const KLEIN_SCALE = 256;

const COLLAR = 0.15; // must match hyperbolicReduce (the field square the shader samples)
const SEG_T = 8; // geodesic tessellation of a face boundary for the stroke-distance channel

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
 * Hankin rays of one tile: from each edge's hyperbolic midpoint, two geodesic rays at ±theta from the
 * inward edge normal (theta measured from the normal — islamicNormalAngleFromSlider convention, the
 * exact flat calculateIslamicSegments contract). Angles are conformal, so the ±theta tilt is a plain
 * 2D rotation of the Poincaré tangent.
 */
function tileRays(polyP: Complex[], center: Complex, theta: number): RayK[] {
	const n = polyP.length;
	const cosT = Math.cos(theta);
	const sinT = Math.sin(theta);
	const rays: RayK[] = [];
	for (let i = 0; i < n; i++) {
		const v0 = polyP[i];
		const v1 = polyP[(i + 1) % n];
		const M = hypMidpoint(v0, v1);
		const eTan = geodesicTangentAt(M, v1);
		let nx = -eTan.y;
		let ny = eTan.x;
		const cTan = geodesicTangentAt(M, center);
		if (nx * cTan.x + ny * cTan.y < 0) {
			nx = -nx;
			ny = -ny;
		}
		const dPlus = { x: nx * cosT - ny * sinT, y: nx * sinT + ny * cosT };
		const dMinus = { x: nx * cosT + ny * sinT, y: -nx * sinT + ny * cosT };
		for (const t of [dPlus, dMinus]) {
			const c = rayChord(M, t);
			rays.push({ o: c.o, d: c.d, sMax: c.sMax, edge: i, mP: M });
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
export function islamicSegmentsForTile(polyP: Complex[], theta: number, label = "tile"): [Complex, Complex][] {
	const center = hypBarycenter(polyP.map((p) => [p.x, p.y] as [number, number]));
	const rays = tileRays(polyP, center, theta);
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
			if (rays[i].edge === rays[j].edge) continue; // siblings diverge, never cross forward
			const di = rays[i].d;
			const dj = rays[j].d;
			const denom = di.x * dj.y - di.y * dj.x;
			if (Math.abs(denom) < 1e-12) continue;
			const fx = rays[j].o.x - rays[i].o.x;
			const fy = rays[j].o.y - rays[i].o.y;
			const s = (fx * dj.y - fy * dj.x) / denom;
			const u = (fx * di.y - fy * di.x) / denom;
			if (s <= epsS || u <= epsS || s >= rays[i].sMax || u >= rays[j].sMax) continue;
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
		if (!isFinite(s)) {
			// impossible for a regular tile (D_n symmetry guarantees a mate) — never drop silently
			console.warn(`hyperbolicIslamic: a ray from edge ${rays[i].edge} of ${label} found no partner`);
			continue;
		}
		segments.push([
			{ x: rays[i].o.x, y: rays[i].o.y },
			{ x: rays[i].o.x + s * rays[i].d.x, y: rays[i].o.y + s * rays[i].d.y },
		]);
	}
	return segments;
}

/** Poincaré geodesic arc a→b as a short ADAPTIVE polyline (the in-disk arc of the orthogonal
 *  circle). Pieces are chosen by angular span (sagitta/chord ≈ Δθ/8, so 0.35 rad keeps the chord
 *  within ~4 % of the arc — a few bytes at EDGE_SCALE): the many near-straight arrangement edges
 *  emit ONE segment instead of `maxN`, which is what keeps the full-res texel loop affordable. */
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
	const n = Math.max(1, Math.min(maxN, Math.ceil(Math.abs(d) / 0.35)));
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
	cls: number; // 1 = A, 2 = B, 3 = C
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
	const segments: Segment[] = [];
	const markers: Marker[] = [];
	for (const face of patch.faces) {
		const polyP: Complex[] = face.map((i) => ({ x: patch.vertices[i][0], y: patch.vertices[i][1] }));
		for (const [a, b] of islamicSegmentsForTile(polyP, angleFromNormalRad, meta.id)) {
			segments.push([new Vector(a.x, a.y), new Vector(b.x, b.y)]);
		}
		const c = hypBarycenter(polyP.map((p) => [p.x, p.y] as [number, number]));
		const cK = poincareToKlein(c);
		markers.push({
			point: new Vector(cK.x * KLEIN_SCALE, cK.y * KLEIN_SCALE),
			kind: "centroid",
			hue: tileHue(face.length),
		});
	}
	const faces = extractFaces(segments, false);
	const { faces: abc, degenerate } = colorFacesAbc(faces, markers);
	if (abc.length === 0) {
		console.error(`hyperbolicIslamic: no faces for ${meta.id} at angle ${angleFromNormalRad.toFixed(3)}`);
		return null;
	}

	// ---- face records: containment in Klein, stroke distance + barycenter in Poincaré ----------------
	const kSq = poincareToKlein({ x: rTex, y: 0 }).x * KLEIN_SCALE; // the sampled square, in Klein
	const recs: FaceRec[] = [];
	for (const f of abc) {
		const vs = f.face.vertices;
		let x0 = Infinity;
		let x1 = -Infinity;
		let y0 = Infinity;
		let y1 = -Infinity;
		for (const v of vs) {
			x0 = Math.min(x0, v.x);
			x1 = Math.max(x1, v.x);
			y0 = Math.min(y0, v.y);
			y1 = Math.max(y1, v.y);
		}
		if (x1 < -kSq || x0 > kSq || y1 < -kSq || y0 > kSq) continue; // never sampled
		const polyP = vs.map((v) => kleinToPoincare({ x: v.x / KLEIN_SCALE, y: v.y / KLEIN_SCALE }));
		const tess: [number, number][] = [];
		for (let i = 0; i < polyP.length; i++) {
			const pts = geodesicPts(polyP[i], polyP[(i + 1) % polyP.length], SEG_T);
			for (let k = 0; k < pts.length - 1; k++) tess.push([pts[k].x, pts[k].y]);
		}
		const bc = hypBarycenter(polyP.map((p) => [p.x, p.y] as [number, number]));
		// C exists only once the edge offset opens the contact diamonds; a degenerate parity split
		// collapses it to B (the euclid classNum rule), so v1 backgrounds read as one colour family.
		const cls = f.klass === "A" ? 1 : f.klass === "C" && !degenerate ? 3 : 2;
		recs.push({ polyK: vs, tess, cls, bx: bc.x, by: bc.y, x0, x1, y0, y1 });
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
	// crossing test misses BOTH neighbours. Assign the face whose boundary is nearest — for a border
	// point that is the correct answer up to float noise, unlike the base bake's blind ring copy.
	const locateNearest = (px: number, py: number): number => {
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
		return best;
	};

	// ---- texel loop (base-bake discipline) -----------------------------------------------------------
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
			if (ri < 0) {
				const { w } = foldIntoDomain(gensSu, { x, y }, st.rInEu);
				px = w.x;
				py = w.y;
				ri = locate(px, py);
				if (ri < 0) ri = locateNearest(px, py);
			}
			if (ri < 0) {
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
			data[o] = r.cls;
			data[o + 1] = Math.min(255, Math.round(Math.sqrt(lineSq) * conf * EDGE_SCALE));
			data[o + 2] = q8(r.bx);
			data[o + 3] = q8(r.by);
			resolved[o / 4] = 1;
		}
	}
	for (const o of unresolvedIdx) {
		const idx = o / 4;
		const i = idx % res;
		const j = (idx - i) / res;
		let done = false;
		for (let ring = 1; ring < res && !done; ring++) {
			for (let dj = -ring; dj <= ring && !done; dj++) {
				for (let di = -ring; di <= ring && !done; di++) {
					if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
					const ii = i + di;
					const jj = j + dj;
					if (ii < 0 || jj < 0 || ii >= res || jj >= res) continue;
					const oo = (jj * res + ii) * 4;
					if (resolved[oo / 4]) {
						data[o] = data[oo];
						data[o + 1] = data[oo + 1];
						data[o + 2] = data[oo + 2];
						data[o + 3] = data[oo + 3];
						done = true;
					}
				}
			}
		}
	}
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

/** Cached plain-field lookup, keyed by tiling id + integer slider angle (degrees FROM NORMAL). */
export function getIslamicField(
	st: ShaderTiling,
	darts: Darts,
	edge: number,
	meta: { id: string; name: string; config: string; edge: number },
	angleFromNormalRad: number,
	opts: { fieldRes?: number } = {},
): TileField | null {
	const res = opts.fieldRes ?? Math.min(st.field.res, 1024);
	const key = `${meta.id}|${Math.round((angleFromNormalRad * 180) / Math.PI)}|${res}`;
	const hit = fieldCache.get(key);
	if (hit !== undefined) return hit;
	let field: TileField | null = null;
	try {
		field = prepareIslamicField(st, darts, edge, meta, angleFromNormalRad, { fieldRes: res });
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
