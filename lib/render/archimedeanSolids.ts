// The Archimedean solids as spherical tilings — the vertex-transitive (isogonal) convex polyhedra with
// two or more regular face types. They extend the 5 Platonic solids (platonicSolids.ts) as the same
// generic Polyhedron record, so the mesh builder, texture baker and edge-arc code consume them unchanged;
// the only renderer-side difference is that a face's colour is keyed by its polygon size (a solid now has
// several face hues, not one).
//
// Geometry is CONSTRUCTED from the Platonic seeds, not transcribed from coordinate tables — each operation
// (truncate / rectify / cantellate) has an exact vertex formula, and faces are then derived by
// polyhedronFaces.facesFromVertices (verified against the Platonic solids). Every solid is checked in the
// test suite: all faces regular (equal edge lengths), Euler V−E+F=2, and the vertex configuration matches
// the known solid. This first slice builds 11 of the 13; the omnitruncated pair (truncated
// icosidodecahedron) and the two snubs are constructed separately (they need alternation / a snub angle).

import { PLATONIC_SOLIDS, type Polyhedron, type Vec3 } from "./platonicSolids";
import { facesFromVertices } from "./polyhedronFaces";

// ---- vector helpers ----------------------------------------------------------------------------------

function add(a: Vec3, b: Vec3): Vec3 {
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function sub(a: Vec3, b: Vec3): Vec3 {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: Vec3, b: Vec3): Vec3 {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Vec3, b: Vec3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function scale(a: Vec3, s: number): Vec3 {
	return [a[0] * s, a[1] * s, a[2] * s];
}
function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function dist(a: Vec3, b: Vec3): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function len(a: Vec3): number {
	return Math.hypot(a[0], a[1], a[2]);
}
function normalize(a: Vec3): Vec3 {
	const n = len(a) || 1;
	return [a[0] / n, a[1] / n, a[2] / n];
}

// ---- base-solid queries ------------------------------------------------------------------------------

/** Unique undirected edges of a polyhedron, as vertex-index pairs. */
function edgesOf(poly: Polyhedron): [number, number][] {
	const seen = new Set<string>();
	const out: [number, number][] = [];
	for (const f of poly.faces) {
		for (let k = 0; k < f.length; k++) {
			const a = f[k];
			const b = f[(k + 1) % f.length];
			const key = a < b ? `${a}-${b}` : `${b}-${a}`;
			if (!seen.has(key)) {
				seen.add(key);
				out.push([Math.min(a, b), Math.max(a, b)]);
			}
		}
	}
	return out;
}

/** Outward unit normal of a face (== centroid direction for an origin-centred regular solid). */
function faceNormal(poly: Polyhedron, face: number[]): Vec3 {
	let c: Vec3 = [0, 0, 0];
	for (const i of face) c = add(c, poly.vertices[i]);
	return normalize(c);
}

/** Edge length (all edges share it) and the "corner span" g = distance between the two neighbours that
 *  flank a vertex within one face (the diagonal skipping that vertex). Both are constants for a regular
 *  solid, and together give the exact truncation ratio. */
function edgeAndSpan(poly: Polyhedron): { e: number; g: number } {
	const [a, b] = edgesOf(poly)[0];
	const e = dist(poly.vertices[a], poly.vertices[b]);
	// In any face ring [.., w1, v, w2, ..], w1 and w2 are v's two in-face neighbours; their distance is g.
	const f = poly.faces[0];
	const g = dist(poly.vertices[f[0]], poly.vertices[f[2 % f.length]]);
	return { e, g };
}

// ---- construction operations -------------------------------------------------------------------------

/** Rectification: new vertices at every edge midpoint (cuboctahedron, icosidodecahedron). */
function rectifyVerts(poly: Polyhedron): Vec3[] {
	return edgesOf(poly).map(([a, b]) => scale(add(poly.vertices[a], poly.vertices[b]), 0.5));
}

/** Uniform truncation: two vertices per edge, cutting each corner at the exact ratio t = e/(2e+g) that
 *  makes the truncated 2p-gon and the new q-gon both regular. */
function truncateVerts(poly: Polyhedron): Vec3[] {
	const { e, g } = edgeAndSpan(poly);
	const t = e / (2 * e + g);
	const out: Vec3[] = [];
	for (const [a, b] of edgesOf(poly)) {
		out.push(lerp(poly.vertices[a], poly.vertices[b], t)); // truncation point near a
		out.push(lerp(poly.vertices[a], poly.vertices[b], 1 - t)); // near b
	}
	return out;
}

/** Cantellation (expand): one copy of each vertex per incident face, pushed out along that face's normal
 *  by d = e / |n_f − n_g| so the between-faces gap closes into a regular square (rhombicuboctahedron,
 *  rhombicosidodecahedron). */
function cantellateVerts(poly: Polyhedron): Vec3[] {
	const e = edgeAndSpan(poly).e;
	const normals = poly.faces.map((f) => faceNormal(poly, f));
	// Two faces sharing an edge — take face 0 and any face sharing one of its edges.
	const f0 = poly.faces[0];
	const edge0 = [f0[0], f0[1]];
	let adj = -1;
	for (let i = 1; i < poly.faces.length; i++) {
		const f = poly.faces[i];
		const has = (x: number) => f.includes(x);
		if (has(edge0[0]) && has(edge0[1])) {
			adj = i;
			break;
		}
	}
	const d = e / len(sub(normals[0], normals[adj]));
	const out: Vec3[] = [];
	for (let fi = 0; fi < poly.faces.length; fi++) {
		for (const vi of poly.faces[fi]) {
			out.push(add(poly.vertices[vi], scale(normals[fi], d)));
		}
	}
	return out;
}

// ---- numeric construction (omnitruncation, snub) -----------------------------------------------------
//
// The two remaining solids have no simple exact vertex formula, but both are UNIFORM (all edges one
// length). Each is parametrised by two shape knobs; the knob values that drive every edge to one length
// were found ONCE by a regularity solve (coordinate descent + golden-section on the coefficient of
// variation of the shortest E pairwise distances) and are inlined below as OMNI_* / SNUB_* — running the
// solve at module load cost ~13 s, so the converged constants are stored instead. Regularity is re-checked
// exactly in tests/archimedean-solids.test.ts (every face regular to 1e-6), which guards the constants if
// the construction ever changes.

// Omnitruncation (cantitruncation / bevel): one vertex per flag (vertex, edge, face). Inside each face,
// at each of its corners v, two vertices are placed — v pulled a fraction α toward each of its two in-face
// edges and β toward the face centroid — biasing one toward each edge. Total 4E vertices. (α,β) are solved
// for regularity. Gives the truncated cuboctahedron from the cube and the truncated icosidodecahedron from
// the dodecahedron.
function omnitruncateVerts(poly: Polyhedron, alpha: number, beta: number): Vec3[] {
	const out: Vec3[] = [];
	for (const f of poly.faces) {
		let c: Vec3 = [0, 0, 0];
		for (const i of f) c = add(c, poly.vertices[i]);
		c = scale(c, 1 / f.length);
		for (let k = 0; k < f.length; k++) {
			const v = poly.vertices[f[k]];
			const next = poly.vertices[f[(k + 1) % f.length]];
			const prev = poly.vertices[f[(k - 1 + f.length) % f.length]];
			const base = add(v, scale(sub(c, v), beta));
			out.push(add(base, scale(sub(next, v), alpha / 2)));
			out.push(add(base, scale(sub(prev, v), alpha / 2)));
		}
	}
	return out;
}

function rodrigues(v: Vec3, axis: Vec3, theta: number): Vec3 {
	const k = normalize(axis);
	const ct = Math.cos(theta);
	const st = Math.sin(theta);
	const kv = dot(k, v);
	return add(add(scale(v, ct), scale(cross(k, v), st)), scale(k, kv * (1 - ct)));
}

// Snub of a base solid: on each base face, place a regular polygon — the base face rotated about its
// normal by the snub twist θ, re-set to circumradius 1 at height h along the normal. The gaps fill with
// triangles; (h,θ) are solved for regularity, which fixes the (chiral) snub angle. Used for the snub
// dodecahedron (base = dodecahedron ⇒ 12 pentagons + 80 triangles).
function snubVerts(base: Polyhedron, h: number, theta: number): Vec3[] {
	const out: Vec3[] = [];
	for (const f of base.faces) {
		let c: Vec3 = [0, 0, 0];
		for (const i of f) c = add(c, base.vertices[i]);
		const n = normalize(c);
		for (const vi of f) {
			const r = rodrigues(base.vertices[vi], n, theta);
			const radial = sub(r, scale(n, dot(r, n)));
			out.push(add(normalize(radial), scale(n, h))); // circumradius 1, height h
		}
	}
	return out;
}

// ---- assemble a Polyhedron from a vertex cloud -------------------------------------------------------

/** The cyclic vertex configuration (e.g. "3.4.3.4") at a representative vertex: the sizes of the faces
 *  around vertex 0, in boundary order. Used for the display label and verified in tests. */
function vertexConfigOf(vertices: Vec3[], faces: number[][]): string {
	// Faces incident to vertex 0, ordered around it by their centroid angle in vertex 0's tangent plane.
	const v = normalize(vertices[0]);
	const ref: Vec3 = Math.abs(v[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
	const t1 = normalize([v[1] * ref[2] - v[2] * ref[1], v[2] * ref[0] - v[0] * ref[2], v[0] * ref[1] - v[1] * ref[0]]);
	const t2: Vec3 = [v[1] * t1[2] - v[2] * t1[1], v[2] * t1[0] - v[0] * t1[2], v[0] * t1[1] - v[1] * t1[0]];
	const incident = faces
		.filter((f) => f.includes(0))
		.map((f) => {
			let c: Vec3 = [0, 0, 0];
			for (const i of f) c = add(c, vertices[i]);
			const d = normalize(c);
			return { n: f.length, angle: Math.atan2(d[0] * t2[0] + d[1] * t2[1] + d[2] * t2[2], d[0] * t1[0] + d[1] * t1[1] + d[2] * t1[2]) };
		})
		.sort((a, b) => a.angle - b.angle);
	return incident.map((x) => x.n).join(".");
}

interface SolidMeta {
	id: string;
	name: string;
	vertexConfig: string; // the expected config, for the record + as a test oracle
}

function buildFromVerts(meta: SolidMeta, vertices: Vec3[]): Polyhedron {
	const faces = facesFromVertices(vertices);
	return {
		id: meta.id,
		schlafli: [0, 0], // Archimedean solids have no {p,q}; routing keys on id/vertexConfig instead
		vertexConfig: meta.vertexConfig,
		name: meta.name,
		vertices,
		faces,
	};
}

function bySolidId(id: string): Polyhedron {
	const p = PLATONIC_SOLIDS.find((s) => s.id === id);
	if (!p) throw new Error(`unknown base solid ${id}`);
	return p;
}

// ---- the 13 (this slice: 11) -------------------------------------------------------------------------

const TRUNCATED_TETRAHEDRON = buildFromVerts(
	{ id: "truncated-tetrahedron", name: "Truncated tetrahedron", vertexConfig: "3.6.6" },
	truncateVerts(bySolidId("tetrahedron")),
);
const TRUNCATED_CUBE = buildFromVerts(
	{ id: "truncated-cube", name: "Truncated cube", vertexConfig: "3.8.8" },
	truncateVerts(bySolidId("cube")),
);
const TRUNCATED_OCTAHEDRON = buildFromVerts(
	{ id: "truncated-octahedron", name: "Truncated octahedron", vertexConfig: "4.6.6" },
	truncateVerts(bySolidId("octahedron")),
);
const TRUNCATED_DODECAHEDRON = buildFromVerts(
	{ id: "truncated-dodecahedron", name: "Truncated dodecahedron", vertexConfig: "3.10.10" },
	truncateVerts(bySolidId("dodecahedron")),
);
const TRUNCATED_ICOSAHEDRON = buildFromVerts(
	{ id: "truncated-icosahedron", name: "Truncated icosahedron", vertexConfig: "5.6.6" },
	truncateVerts(bySolidId("icosahedron")),
);

const CUBOCTAHEDRON = buildFromVerts(
	{ id: "cuboctahedron", name: "Cuboctahedron", vertexConfig: "3.4.3.4" },
	rectifyVerts(bySolidId("cube")),
);
const ICOSIDODECAHEDRON = buildFromVerts(
	{ id: "icosidodecahedron", name: "Icosidodecahedron", vertexConfig: "3.5.3.5" },
	rectifyVerts(bySolidId("icosahedron")),
);

const RHOMBICUBOCTAHEDRON = buildFromVerts(
	{ id: "rhombicuboctahedron", name: "Rhombicuboctahedron", vertexConfig: "3.4.4.4" },
	cantellateVerts(bySolidId("cube")),
);
const RHOMBICOSIDODECAHEDRON = buildFromVerts(
	{ id: "rhombicosidodecahedron", name: "Rhombicosidodecahedron", vertexConfig: "3.4.5.4" },
	cantellateVerts(bySolidId("dodecahedron")),
);

// ---- coordinate-table solids (octahedral, exact) -----------------------------------------------------

const SQRT2 = Math.SQRT2;

/** All sign combinations of the given magnitudes (a 0 magnitude yields a single sign). */
function signs(mags: [number, number, number]): Vec3[] {
	const out: Vec3[] = [];
	const opts = (m: number) => (m === 0 ? [0] : [m, -m]);
	for (const x of opts(mags[0])) for (const y of opts(mags[1])) for (const z of opts(mags[2])) out.push([x, y, z]);
	return out;
}
/** The 3 even (cyclic) permutations of a coordinate triple, expanded over all sign combinations. */
function evenPermSigns(mags: [number, number, number]): Vec3[] {
	const [a, b, c] = mags;
	return [...signs([a, b, c]), ...signs([b, c, a]), ...signs([c, a, b])];
}

// Truncated cuboctahedron 4.6.8: all permutations of (±1, ±(1+√2), ±(1+2√2)), 48 vertices.
function truncatedCuboctahedronVerts(): Vec3[] {
	const a = 1;
	const b = 1 + SQRT2;
	const c = 1 + 2 * SQRT2;
	const out: Vec3[] = [];
	// all 6 permutations (the three values are distinct) over all signs
	for (const p of [
		[a, b, c],
		[a, c, b],
		[b, a, c],
		[b, c, a],
		[c, a, b],
		[c, b, a],
	] as [number, number, number][]) {
		out.push(...signs(p));
	}
	return out;
}
const TRUNCATED_CUBOCTAHEDRON = buildFromVerts(
	{ id: "truncated-cuboctahedron", name: "Truncated cuboctahedron", vertexConfig: "4.6.8" },
	truncatedCuboctahedronVerts(),
);

// Snub cube 3.3.3.3.4 (one chirality): even permutations of (±1, ±1/t, ±t) with an even number of minus
// signs, plus odd permutations with an odd number of minus signs, t = tribonacci constant.
const TRIBONACCI = (() => {
	// real root of t^3 = t^2 + t + 1
	let t = 1.8;
	for (let i = 0; i < 60; i++) {
		const f = t * t * t - t * t - t - 1;
		const df = 3 * t * t - 2 * t - 1;
		t -= f / df;
	}
	return t;
})();
function snubCubeVerts(): Vec3[] {
	const t = TRIBONACCI;
	const a = 1;
	const b = 1 / t;
	const c = t;
	const even: [number, number, number][] = [
		[a, b, c],
		[b, c, a],
		[c, a, b],
	];
	const odd: [number, number, number][] = [
		[a, c, b],
		[c, b, a],
		[b, a, c],
	];
	const out: Vec3[] = [];
	const emit = (perm: [number, number, number], wantEvenMinus: boolean) => {
		const opt = (m: number): [number, number] => [m, -m];
		for (const sx of opt(perm[0]))
			for (const sy of opt(perm[1]))
				for (const sz of opt(perm[2])) {
					const minus = (sx < 0 ? 1 : 0) + (sy < 0 ? 1 : 0) + (sz < 0 ? 1 : 0);
					if (minus % 2 === 0 === wantEvenMinus) out.push([sx, sy, sz]);
				}
	};
	for (const p of even) emit(p, true);
	for (const p of odd) emit(p, false);
	return out;
}
const SNUB_CUBE = buildFromVerts({ id: "snub-cube", name: "Snub cube", vertexConfig: "3.3.3.3.4" }, snubCubeVerts());

// ---- numerically-constructed solids (omnitruncation + snub) ------------------------------------------

// Truncated icosidodecahedron 4.6.10: omnitruncation of the dodecahedron. α = 2/5 and β = (5−√5)/10 make
// every face regular (solved values; both turn out to be closed-form).
const OMNI_ALPHA = 0.4;
const OMNI_BETA = (5 - Math.sqrt(5)) / 10;
const TRUNCATED_ICOSIDODECAHEDRON = buildFromVerts(
	{ id: "truncated-icosidodecahedron", name: "Truncated icosidodecahedron", vertexConfig: "4.6.10" },
	omnitruncateVerts(bySolidId("dodecahedron"), OMNI_ALPHA, OMNI_BETA),
);

// Snub dodecahedron 3.3.3.3.5: snub of the dodecahedron (one chirality). The height/twist are the
// (irrational) snub solution, stored to full double precision.
const SNUB_HEIGHT = 2.328706359686481;
const SNUB_TWIST = 0.2287498920220335;
const SNUB_DODECAHEDRON = buildFromVerts(
	{ id: "snub-dodecahedron", name: "Snub dodecahedron", vertexConfig: "3.3.3.3.5" },
	snubVerts(bySolidId("dodecahedron"), SNUB_HEIGHT, SNUB_TWIST),
);

// ---- registry --------------------------------------------------------------------------------------

/** All 13 Archimedean solids, in the conventional (octahedral-family then icosahedral-family) order. */
export const ARCHIMEDEAN_SOLIDS: Polyhedron[] = [
	TRUNCATED_TETRAHEDRON,
	CUBOCTAHEDRON,
	TRUNCATED_CUBE,
	TRUNCATED_OCTAHEDRON,
	RHOMBICUBOCTAHEDRON,
	TRUNCATED_CUBOCTAHEDRON,
	SNUB_CUBE,
	ICOSIDODECAHEDRON,
	TRUNCATED_DODECAHEDRON,
	TRUNCATED_ICOSAHEDRON,
	RHOMBICOSIDODECAHEDRON,
	TRUNCATED_ICOSIDODECAHEDRON,
	SNUB_DODECAHEDRON,
];

export function archimedeanById(id: string): Polyhedron | null {
	return ARCHIMEDEAN_SOLIDS.find((s) => s.id === id) ?? null;
}

export { vertexConfigOf };
