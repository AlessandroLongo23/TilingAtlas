// Pure geometry helpers for the spherical renderer. The tiling is drawn PROCEDURALLY on a plain UV sphere
// (see sphericalTilingShader.ts): each fragment classifies its surface direction against the solid's face
// normals — the face is argmax(dot(dir, n_i)), an edge is where the top two faces are near-tied. So the only
// geometry the renderer needs from a Polyhedron is the set of outward face normals (+ the adjacent-normal
// dot, which fixes a constant angular edge width across solids). No three.js here — these are pure and
// unit-tested like lib/render/hyperbolic.ts.

import { polyhedronAsStarPattern, ringTurning, sphStarScene, starFaceRings, type Crease } from "./sphStar";
import type { Polyhedron, Vec3 } from "./platonicSolids";

function normalize(a: Vec3): Vec3 {
	const n = Math.hypot(a[0], a[1], a[2]) || 1;
	return [a[0] / n, a[1] / n, a[2] / n];
}
function dot(a: Vec3, b: Vec3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// Outward unit normal of each face. For a regular solid centred at the origin the face normal is the
// direction of the face centroid — perpendicular to the face plane by symmetry — so this is exact (and
// generalises to any convex polyhedron whose faces are regular and centred).
export function faceNormals(poly: Polyhedron): Vec3[] {
	return poly.faces.map((f) => {
		let cx = 0,
			cy = 0,
			cz = 0;
		for (const i of f) {
			const v = normalize(poly.vertices[i]);
			cx += v[0];
			cy += v[1];
			cz += v[2];
		}
		return normalize([cx, cy, cz]);
	});
}

// Exit-face "normal": the inverse of the actual face centroid, C_f / |C_f|². Classifying a direction by
// argmax(dot(dir, N_f)) picks the face the outward ray from the centre exits through — because the exit
// face minimises the ray parameter t_f = |C_f| / dot(dir, n_f), i.e. maximises dot(dir, n_f)/|C_f| =
// dot(dir, C_f/|C_f|²). This is correct for ANY convex solid, including the Archimedean solids whose face
// TYPES sit at different distances from the centre (no common insphere) — a plain unit-normal Voronoi
// would there put the edges in the wrong place. For a Platonic solid all |C_f| are equal, so N_f is just
// the unit normal scaled by a constant and the classification is unchanged.
export function faceExitNormals(poly: Polyhedron): Vec3[] {
	return poly.faces.map((f) => {
		let cx = 0,
			cy = 0,
			cz = 0;
		for (const i of f) {
			cx += poly.vertices[i][0];
			cy += poly.vertices[i][1];
			cz += poly.vertices[i][2];
		}
		const c: Vec3 = [cx / f.length, cy / f.length, cz / f.length];
		const d2 = c[0] * c[0] + c[1] * c[1] + c[2] * c[2] || 1;
		return [c[0] / d2, c[1] / d2, c[2] / d2];
	});
}

// Mean ‖N_f − N_g‖ over face pairs sharing an edge — the gradient of the classification gap across an
// edge, used to scale the baked stroke to a roughly constant angular width on every solid.
export function meanAdjacentExitDiff(poly: Polyhedron, N: Vec3[]): number {
	const edgeFaces = new Map<string, number[]>();
	poly.faces.forEach((f, fi) => {
		for (let k = 0; k < f.length; k++) {
			const a = f[k];
			const b = f[(k + 1) % f.length];
			const key = a < b ? `${a}-${b}` : `${b}-${a}`;
			const arr = edgeFaces.get(key);
			if (arr) arr.push(fi);
			else edgeFaces.set(key, [fi]);
		}
	});
	let sum = 0;
	let cnt = 0;
	for (const arr of edgeFaces.values()) {
		if (arr.length === 2) {
			const [i, j] = arr;
			sum += Math.hypot(N[i][0] - N[j][0], N[i][1] - N[j][1], N[i][2] - N[j][2]);
			cnt++;
		}
	}
	return cnt ? sum / cnt : 1;
}

// The largest dot between two DISTINCT face normals — i.e. the dot between adjacent faces (they have the
// closest normals). Near an edge the classification gap g = dot(dir,n1) − dot(dir,n2) grows like the
// angular distance times |n1 − n2| = sqrt(2 − 2·adjDot), so scaling the edge threshold by that term makes
// the stroke a constant angular width on every solid.
export function maxAdjacentNormalDot(normals: Vec3[]): number {
	let m = -1;
	for (let i = 0; i < normals.length; i++) {
		for (let j = i + 1; j < normals.length; j++) {
			const d = dot(normals[i], normals[j]);
			if (d > m) m = d;
		}
	}
	return m;
}

// Classify a direction to the face whose spherical polygon contains it: argmax(dot(dir, n_i)). Pure mirror
// of the bake shader's inner loop, exposed for tests.
export function classifyFace(dir: Vec3, normals: Vec3[]): number {
	let best = -Infinity;
	let idx = -1;
	for (let i = 0; i < normals.length; i++) {
		const d = dot(dir, normals[i]);
		if (d > best) {
			best = d;
			idx = i;
		}
	}
	return idx;
}

// FIT, DO NOT INFLATE. The polyhedron views scale the solid to `radius` by ONE factor for the whole
// solid — the largest vertex radius — so the shape survives.
//
// ⚑ This used to be a PER-VERTEX normalise, and the comment that justified it said "for a
// Platonic/Archimedean solid all vertices share one circumradius, so this is a UNIFORM scale … a
// per-vertex normalise would only distort a solid whose corners sat at mixed radii — none here do".
// That was true of the shelf it was written for and stopped being true the day the Johnson solids
// landed: nineteen of the sixty-four have NO CIRCUMSPHERE (lib/tilings/sph-inscribed.ts), their corners
// sit at mixed radii by definition, and pushing each one out to `radius` bends every face out of shape.
// AL saw it on J31 — "this sph-pentagonal-gyrobicupola doesn't seem to be consisting of only regular
// polygons" (2026-08-21). It consists of nothing else: 10 triangles, 10 squares, 2 pentagons, all 40
// edges equal to nine decimal places. The renderer was inflating it onto a sphere it does not have.
//
// For a solid whose vertices DO share a radius about the origin the two agree exactly — max|v| = |v| for
// every v, so the factor is the same one a normalise applied — which is why every Platonic, Archimedean,
// prism and antiprism render is untouched.
export function solidFitScale(poly: Polyhedron, radius = 1): Vec3[] {
	let far = 0;
	for (const v of poly.vertices) far = Math.max(far, Math.hypot(v[0], v[1], v[2]));
	const s = far > 1e-12 ? radius / far : radius;
	return poly.vertices.map((v) => [v[0] * s, v[1] * s, v[2] * s] as Vec3);
}

// Faces that share a PLANE, numbered within their group: 0 for a face alone in its plane, 1 for the
// second face found in a plane already seen, and so on.
//
// Why this exists: eleven of the fifteen faces of ncx-11-24-15-f lie in ONE plane, four of its eleven
// vertices are coincident to 1.5e-6, and the result on screen was a yellow/pink dither crawling across
// the solid as the depth buffer picked a different winner per pixel (AL, 2026-08-21). Coincident geometry
// has no depth answer, so the renderer has to be given one; the number here is that answer, and
// buildFlatSolid turns it into a per-layer polygon offset. Scanned across the whole corpus: 18 of the 143
// non-convex solids have coplanar face groups, and none of the Platonic, Archimedean, Johnson or prism
// solids has any — so this is exactly zero change for every shelf but that one.
//
// Note that "coplanar" is not "overlapping": most of the eighteen are pairs of faces meeting edge-to-edge
// in a shared plane, which never fought in the first place. Numbering them anyway costs a depth bias of a
// couple of ULPs on a face nothing else is drawn on.
const COPLANAR_EPS = 1e-3;
export function coplanarFaceLayers(poly: Polyhedron, unit: readonly Vec3[]): number[] {
	const planes: { n: Vec3; d: number; used: number }[] = [];
	return poly.faces.map((f) => {
		const a = unit[f[0]];
		const b = unit[f[1]];
		const c = unit[f[2]];
		const n: Vec3 = [
			(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
			(b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
			(b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
		];
		const L = Math.hypot(n[0], n[1], n[2]);
		if (L < 1e-12) return 0; // degenerate face: no plane to share
		n[0] /= L;
		n[1] /= L;
		n[2] /= L;
		let d = n[0] * a[0] + n[1] * a[1] + n[2] * a[2];
		// A plane is unoriented here — two faces of the same plane can wind oppositely, and they still
		// occupy the same pixels. Canonicalise the sign so they group.
		if (d < 0) {
			n[0] = -n[0];
			n[1] = -n[1];
			n[2] = -n[2];
			d = -d;
		}
		const hit = planes.find(
			(p) => Math.abs(p.d - d) < COPLANAR_EPS && Math.hypot(p.n[0] - n[0], p.n[1] - n[1], p.n[2] - n[2]) < COPLANAR_EPS,
		);
		if (hit) return hit.used++;
		planes.push({ n, d, used: 1 });
		return 0;
	});
}


// The TRUE flat facets of the solid (not the round sphere) as a non-indexed triangle soup — one fan per
// face, ready to hand to a flat-shaded BufferGeometry.
//
// ⚑ THE FAN ORIGIN IS NOT ALWAYS v0. Fan triangulation (v0,vk,vk+1) is valid because every CONVEX face
// is covered by it, and a {n/d} star face is not: a pentagram fanned from v0 gives v0-v2-v4, v0-v4-v1,
// v0-v1-v3, which is a jagged blade and not the star. A star face is decomposed into CONVEX rings first
// — starFaceRings, the same function the star shelf has used since 2026-08-19 — and each ring is fanned.
// Convex faces take the untouched v0 fan and render byte-identically.
//
// `positions` is the flattened xyz (9 floats per triangle);
// `faceSizes[t]` is the source face's vertex count for triangle t, so the mesh builder can colour by
// polygon size; `triLayers[t]` is its face's coplanar layer (see coplanarFaceLayers), which is 0 for
// every triangle of every solid that has no two faces in one plane.
export function flatSolidTriangles(poly: Polyhedron, radius = 1): { positions: Float32Array; faceSizes: number[]; triLayers: number[] } {
	// starFaceRings APPENDS the crossing-ring points it needs, so the scaled copy has to be extendable.
	const unit: Vec3[] = [...solidFitScale(poly, radius)];
	// One entry per source face: the convex rings that fill it. d = 1 gives back the face itself.
	const fill = poly.faces.map((f) => {
		const d = ringTurning(unit, f);
		return d > 1 ? (starFaceRings(f, d, unit as never) as number[][]) : [f];
	});
	const triCount = fill.reduce((sum, rings) => sum + rings.reduce((n, r) => n + r.length - 2, 0), 0);
	const positions = new Float32Array(triCount * 9);
	const faceSizes: number[] = new Array(triCount);
	const triLayers: number[] = new Array(triCount);
	const faceLayers = coplanarFaceLayers(poly, unit);
	let p = 0;
	let t = 0;
	for (let fi = 0; fi < poly.faces.length; fi++) {
		const srcLen = poly.faces[fi].length;
		for (const f of fill[fi]) {
		const a = unit[f[0]];
		for (let k = 1; k < f.length - 1; k++) {
			let b = unit[f[k]];
			let c = unit[f[k + 1]];
			// Orient the triangle OUTWARD: the face vertex ring is not guaranteed CCW-outward (the cube's is
			// inward), so (b−a)×(c−a) may point at the centre — which back-face-culls the facet and makes the
			// solid look see-through. Swap b/c when the normal opposes the outward (radial) direction.
			const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
			const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
			const nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
			if (nx * a[0] + ny * a[1] + nz * a[2] < 0) {
				const tmp = b;
				b = c;
				c = tmp;
			}
			positions[p++] = a[0]; positions[p++] = a[1]; positions[p++] = a[2];
			positions[p++] = b[0]; positions[p++] = b[1]; positions[p++] = b[2];
			positions[p++] = c[0]; positions[p++] = c[1]; positions[p++] = c[2];
			triLayers[t] = faceLayers[fi];
			// The SOURCE face's size, not the ring's: hue is per polygon, and a star face's fill rings
			// are a core n-gon plus n triangles that must not colour as triangles.
			faceSizes[t++] = srcLen;
		}
		}
	}
	return { positions, faceSizes, triLayers };
}

// The unique polyhedron edges as STRAIGHT chords (2 points each) — the flat solid's real edges, ready to
// feed the tube skeleton (buildTubeSkeleton) exactly like edgeArcs, but straight instead of curved.
// `extend` (in the same length units as `radius`) overshoots each end along the chord so adjacent tube
// bars overlap into a filled joint at every corner, matching edgeArcs' overshoot. This is what makes
// Wireframe + Polyhedron draw straight bars, and the flat solid's own edge tubes straight.
//
// Uses the same whole-solid fit as the facets, so the tubes land ON the edges they are drawing. When this
// normalised per vertex and the facets did too they at least agreed; the pair has to move together.
/**
 * The CREASES: where two faces of the solid cut through one another.
 *
 * ⚑ These are not edges and the record cannot carry them — `edges` is the polyhedron's own edge list and
 * V, E, F have to keep meaning what they say. They are a real feature of the surface all the same, and a
 * solid that passes through itself reads as unbroken without them (Marek Čtrnáct found them missing on
 * the pentagrammic prism, 2026-08-19).
 *
 * All of the work is sphStar.ts's, unchanged: the star shelf has drawn exactly this since then. The only
 * new part is `polyhedronAsStarPattern`, because `Polyhedron` carries no faceType and no edge list. It
 * matters for far more than the star records — 167 of the 302 solids on the non-convex shelf
 * self-intersect, including convex-faced ones like ncx-7-15-10, and none of them had a crease drawn.
 *
 * The creases come back WHOLE (with each face's outward normal), already scaled to `radius`, because they
 * are drawn as in-plane ribbons and not as tubes: a tube round a crease bulges a full radius out of both
 * face planes and surfaces through the neighbours as needles. See buildCreaseRibbons in
 * lib/render/sphericalWireframe.ts, which is where they go.
 */
export function solidCreaseList(poly: Polyhedron, radius = 1): Crease[] {
	return sphStarScene(
		polyhedronAsStarPattern({ id: poly.id, vertices: solidFitScale(poly, radius), faces: poly.faces }),
	).crossings;
}

/** The creases as straight 2-point segments, the same form `straightEdges` returns, ready for the same
 *  tube builder. `radius` scales them; `solidCreaseList` has already scaled its own, so pass 1 for those. */
export function creaseChords(creases: readonly Crease[], radius = 1, extend = 0): Float32Array[] {
	return creases.map(({ a, b }) => {
		const A: Vec3 = [a[0] * radius, a[1] * radius, a[2] * radius];
		const B: Vec3 = [b[0] * radius, b[1] * radius, b[2] * radius];
		const d = normalize([B[0] - A[0], B[1] - A[1], B[2] - A[2]]);
		return new Float32Array([
			A[0] - d[0] * extend, A[1] - d[1] * extend, A[2] - d[2] * extend,
			B[0] + d[0] * extend, B[1] + d[1] * extend, B[2] + d[2] * extend,
		]);
	});
}

export function straightEdges(poly: Polyhedron, radius = 1, extend = 0): Float32Array[] {
	const unit = solidFitScale(poly, radius);
	return solidEdges(poly).map(([a, b]) => {
		const A = unit[a];
		const B = unit[b];
		const d = normalize([B[0] - A[0], B[1] - A[1], B[2] - A[2]]);
		return new Float32Array([
			A[0] - d[0] * extend, A[1] - d[1] * extend, A[2] - d[2] * extend,
			B[0] + d[0] * extend, B[1] + d[1] * extend, B[2] + d[2] * extend,
		]);
	});
}

// The unique polyhedron edges as vertex-index pairs (each shared by two faces, deduped) — the flat solid's
// corners/creases, drawn as straight LineSegments between the normalised vertices. Same dedup key as
// edgeArcs, but returns the endpoints as indices, not sampled great-circle arcs (a flat facet's edge
// is a straight chord, not an arc).
export function solidEdges(poly: Polyhedron): [number, number][] {
	const seen = new Set<string>();
	const edges: [number, number][] = [];
	for (const f of poly.faces) {
		for (let k = 0; k < f.length; k++) {
			const a = f[k];
			const b = f[(k + 1) % f.length];
			const key = a < b ? `${a}-${b}` : `${b}-${a}`;
			if (seen.has(key)) continue;
			seen.add(key);
			edges.push([a, b]);
		}
	}
	return edges;
}
