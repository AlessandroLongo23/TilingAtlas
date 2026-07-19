// The 5 Platonic solids as spherical tilings — the finite ("above Euclidean", 1/p + 1/q > 1/2) end of
// the regular {p,q} family the hyperbolic disk covers below it. Each solid is stored as a generic
// Polyhedron (vertices + ordered face rings), NOT three.js geometry, so the pure mesh builder
// (lib/render/sphericalGeometry.ts) and its tests can consume it without a WebGL context. The generic
// shape is deliberate: Archimedean / other spherical tilings slot in later as more Polyhedron data, no
// renderer change.
//
// Coordinates are the standard canonical ones (tetra/cube/octa/icosa direct; dodeca derived as the dual
// of the icosahedron so its 12 pentagon rings are computed, never hand-transcribed). Vertices need not be
// unit length here — the mesh builder normalises every vertex onto the sphere.

export type Vec3 = [number, number, number];

export interface Polyhedron {
	id: string;
	/** Schläfli symbol {p,q}: p-gon faces, q meeting at each vertex. */
	schlafli: [number, number];
	/** Vertex configuration string, the atlas "family" label (e.g. "3.3.3.3.3" for the icosahedron). */
	vertexConfig: string;
	/** Display name. */
	name: string;
	vertices: Vec3[];
	/** One entry per face: the vertex indices in cyclic boundary order (each adjacent pair is an edge). */
	faces: number[][];
}

// ---- small vector helpers (tuple-based, no external dep) ---------------------------------------------

function sub(a: Vec3, b: Vec3): Vec3 {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add(a: Vec3, b: Vec3): Vec3 {
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function cross(a: Vec3, b: Vec3): Vec3 {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Vec3, b: Vec3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function norm(a: Vec3): number {
	return Math.hypot(a[0], a[1], a[2]);
}
function normalize(a: Vec3): Vec3 {
	const n = norm(a) || 1;
	return [a[0] / n, a[1] / n, a[2] / n];
}

const PHI = (1 + Math.sqrt(5)) / 2;

// ---- the four directly-specified solids --------------------------------------------------------------

const TETRAHEDRON: Polyhedron = {
	id: "tetrahedron",
	schlafli: [3, 3],
	vertexConfig: "3.3.3",
	name: "Tetrahedron",
	// Alternate corners of the cube.
	vertices: [
		[1, 1, 1],
		[1, -1, -1],
		[-1, 1, -1],
		[-1, -1, 1],
	],
	// Every pair of the 3 face vertices is an edge, so any winding is a valid ring for a triangle; the
	// builder orients each triangle outward via the radial normal.
	faces: [
		[0, 1, 2],
		[0, 2, 3],
		[0, 3, 1],
		[1, 3, 2],
	],
};

const CUBE: Polyhedron = {
	id: "cube",
	schlafli: [4, 3],
	vertexConfig: "4.4.4",
	name: "Cube",
	vertices: [
		[-1, -1, -1], // 0
		[1, -1, -1], // 1
		[1, 1, -1], // 2
		[-1, 1, -1], // 3
		[-1, -1, 1], // 4
		[1, -1, 1], // 5
		[1, 1, 1], // 6
		[-1, 1, 1], // 7
	],
	faces: [
		[0, 1, 2, 3], // z = -1
		[4, 5, 6, 7], // z = +1
		[0, 1, 5, 4], // y = -1
		[3, 2, 6, 7], // y = +1
		[0, 3, 7, 4], // x = -1
		[1, 2, 6, 5], // x = +1
	],
};

const OCTAHEDRON: Polyhedron = {
	id: "octahedron",
	schlafli: [3, 4],
	vertexConfig: "3.3.3.3",
	name: "Octahedron",
	vertices: [
		[1, 0, 0], // 0
		[-1, 0, 0], // 1
		[0, 1, 0], // 2
		[0, -1, 0], // 3
		[0, 0, 1], // 4
		[0, 0, -1], // 5
	],
	faces: [
		[4, 0, 2],
		[4, 2, 1],
		[4, 1, 3],
		[4, 3, 0],
		[5, 2, 0],
		[5, 1, 2],
		[5, 3, 1],
		[5, 0, 3],
	],
};

const ICOSAHEDRON: Polyhedron = {
	id: "icosahedron",
	schlafli: [3, 5],
	vertexConfig: "3.3.3.3.3",
	name: "Icosahedron",
	// The canonical icosphere seed (cyclic permutations of (0, ±1, ±φ)); face list from the same source.
	vertices: [
		[-1, PHI, 0], // 0
		[1, PHI, 0], // 1
		[-1, -PHI, 0], // 2
		[1, -PHI, 0], // 3
		[0, -1, PHI], // 4
		[0, 1, PHI], // 5
		[0, -1, -PHI], // 6
		[0, 1, -PHI], // 7
		[PHI, 0, -1], // 8
		[PHI, 0, 1], // 9
		[-PHI, 0, -1], // 10
		[-PHI, 0, 1], // 11
	],
	faces: [
		[0, 11, 5],
		[0, 5, 1],
		[0, 1, 7],
		[0, 7, 10],
		[0, 10, 11],
		[1, 5, 9],
		[5, 11, 4],
		[11, 10, 2],
		[10, 7, 6],
		[7, 1, 8],
		[3, 9, 4],
		[3, 4, 2],
		[3, 2, 6],
		[3, 6, 8],
		[3, 8, 9],
		[4, 9, 5],
		[2, 4, 11],
		[6, 2, 10],
		[8, 6, 7],
		[9, 8, 1],
	],
};

// ---- the dual construction (dodecahedron = dual of icosahedron) --------------------------------------

// Any perpendicular to a unit axis, chosen to stay well-conditioned (avoid the near-parallel reference).
function anyPerp(axis: Vec3): Vec3 {
	const ref: Vec3 = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
	return normalize(cross(axis, ref));
}

// The dual of a convex polyhedron: one dual vertex per original face (its normalised centroid), one dual
// face per original vertex (the ring of faces around it, ordered cyclically in the vertex's tangent
// plane). Correct-by-construction — this is how the dodecahedron's pentagon rings are obtained instead of
// hand-transcribing 12 five-tuples.
function dualPolyhedron(
	poly: Polyhedron,
	meta: { id: string; schlafli: [number, number]; vertexConfig: string; name: string },
): Polyhedron {
	// Dual vertex i = centroid direction of original face i.
	const dualVerts: Vec3[] = poly.faces.map((f) => {
		let c: Vec3 = [0, 0, 0];
		for (const vi of f) c = add(c, normalize(poly.vertices[vi]));
		return normalize(c);
	});

	// Dual face for each original vertex v: the faces incident to v, ordered by angle around v.
	const faces: number[][] = poly.vertices.map((v, vi) => {
		const axis = normalize(v);
		const t1 = anyPerp(axis);
		const t2 = cross(axis, t1); // completes a right-handed tangent frame
		const incident = poly.faces
			.map((f, fi) => ({ fi, f }))
			.filter(({ f }) => f.includes(vi))
			.map(({ fi }) => {
				const d = dualVerts[fi];
				return { fi, angle: Math.atan2(dot(d, t2), dot(d, t1)) };
			})
			.sort((a, b) => a.angle - b.angle);
		return incident.map((x) => x.fi);
	});

	return { id: meta.id, schlafli: meta.schlafli, vertexConfig: meta.vertexConfig, name: meta.name, vertices: dualVerts, faces };
}

const DODECAHEDRON: Polyhedron = dualPolyhedron(ICOSAHEDRON, {
	id: "dodecahedron",
	schlafli: [5, 3],
	vertexConfig: "5.5.5",
	name: "Dodecahedron",
});

// ---- registry + lookup -------------------------------------------------------------------------------

export const PLATONIC_SOLIDS: Polyhedron[] = [TETRAHEDRON, OCTAHEDRON, ICOSAHEDRON, CUBE, DODECAHEDRON];

// Resolve the solid for a Schläfli symbol {p,q}. The 5 Platonic {p,q} are the complete set with
// 1/p + 1/q > 1/2, so this returns null for every non-spherical (Euclidean / hyperbolic) symbol.
export function polyhedronForSchlafli(p: number, q: number): Polyhedron | null {
	return PLATONIC_SOLIDS.find((s) => s.schlafli[0] === p && s.schlafli[1] === q) ?? null;
}
