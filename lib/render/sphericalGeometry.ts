// Pure geometry helpers for the spherical renderer. The tiling is drawn PROCEDURALLY on a plain UV sphere
// (see sphericalTilingShader.ts): each fragment classifies its surface direction against the solid's face
// normals — the face is argmax(dot(dir, n_i)), an edge is where the top two faces are near-tied. So the only
// geometry the renderer needs from a Polyhedron is the set of outward face normals (+ the adjacent-normal
// dot, which fixes a constant angular edge width across solids). No three.js here — these are pure and
// unit-tested like lib/render/hyperbolic.ts.

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

// A great-circle arc between two unit directions (slerp), sampled into `segments + 1` points on the sphere
// of the given radius, flattened xyz. `extend` (radians) grows the arc PAST both endpoints along the great
// circle — the wireframe uses it so adjacent bars overlap at a vertex and fill the joint (no sphere caps).
function greatCircleArc(u: Vec3, v: Vec3, segments: number, radius: number, extend = 0): Float32Array {
	const out = new Float32Array((segments + 1) * 3);
	const omega = Math.acos(Math.max(-1, Math.min(1, dot(u, v))));
	const sinOmega = Math.sin(omega);
	const span = omega + 2 * extend;
	for (let i = 0; i <= segments; i++) {
		const theta = -extend + (i / segments) * span; // angle from u toward v, extended at both ends
		let x: number, y: number, z: number;
		if (sinOmega < 1e-6) {
			const t = theta / (omega || 1);
			x = u[0] + (v[0] - u[0]) * t;
			y = u[1] + (v[1] - u[1]) * t;
			z = u[2] + (v[2] - u[2]) * t;
		} else {
			const wa = Math.sin(omega - theta) / sinOmega;
			const wb = Math.sin(theta) / sinOmega;
			x = u[0] * wa + v[0] * wb;
			y = u[1] * wa + v[1] * wb;
			z = u[2] * wa + v[2] * wb;
		}
		const p = normalize([x, y, z]);
		out[i * 3] = p[0] * radius;
		out[i * 3 + 1] = p[1] * radius;
		out[i * 3 + 2] = p[2] * radius;
	}
	return out;
}

// One great-circle polyline per UNIQUE polyhedron edge (each shared by two faces, deduped). `extend`
// (radians) overshoots each end so wireframe bars overlap into a filled joint at every vertex.
export function edgeArcs(poly: Polyhedron, segments = 28, radius = 1, extend = 0): Float32Array[] {
	const unit = poly.vertices.map(normalize);
	const seen = new Set<string>();
	const arcs: Float32Array[] = [];
	for (const face of poly.faces) {
		for (let k = 0; k < face.length; k++) {
			const a = face[k];
			const b = face[(k + 1) % face.length];
			const key = a < b ? `${a}-${b}` : `${b}-${a}`;
			if (seen.has(key)) continue;
			seen.add(key);
			arcs.push(greatCircleArc(unit[a], unit[b], segments, radius, extend));
		}
	}
	return arcs;
}

// The polyhedron vertices on the sphere (for wireframe joint caps).
export function vertexPoints(poly: Polyhedron, radius = 1): Vec3[] {
	return poly.vertices.map((v) => {
		const n = normalize(v);
		return [n[0] * radius, n[1] * radius, n[2] * radius];
	});
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

// The TRUE flat facets of the solid (not the round sphere) as a non-indexed triangle soup — one fan per
// face, ready to hand to a flat-shaded BufferGeometry. Fan triangulation (v0,vk,vk+1) is valid because
// every face is a convex regular polygon. `positions` is the flattened xyz (9 floats per triangle);
// `faceSizes[t]` is the source face's vertex count for triangle t, so the mesh builder can colour by
// polygon size.
export function flatSolidTriangles(poly: Polyhedron, radius = 1): { positions: Float32Array; faceSizes: number[] } {
	const unit = solidFitScale(poly, radius);
	const triCount = poly.faces.reduce((sum, f) => sum + (f.length - 2), 0);
	const positions = new Float32Array(triCount * 9);
	const faceSizes: number[] = new Array(triCount);
	let p = 0;
	let t = 0;
	for (const f of poly.faces) {
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
			faceSizes[t++] = f.length;
		}
	}
	return { positions, faceSizes };
}

// The unique polyhedron edges as STRAIGHT chords (2 points each) — the flat solid's real edges, ready to
// feed the tube skeleton (buildTubeSkeleton) exactly like edgeArcs, but straight instead of curved.
// `extend` (in the same length units as `radius`) overshoots each end along the chord so adjacent tube
// bars overlap into a filled joint at every corner, matching edgeArcs' overshoot. This is what makes
// Wireframe + Polyhedron draw straight bars, and the flat solid's own edge tubes straight.
//
// Uses the same whole-solid fit as the facets, so the tubes land ON the edges they are drawing. When this
// normalised per vertex and the facets did too they at least agreed; the pair has to move together.
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
