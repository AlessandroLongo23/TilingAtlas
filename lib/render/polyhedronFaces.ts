// Derive the face rings of a convex polyhedron from JUST its vertices. Every Archimedean (and Platonic)
// solid is edge-transitive-in-length: all edges share one length, the minimum pairwise vertex distance.
// So two vertices are adjacent iff their distance equals that minimum. Faces are then read off the
// combinatorial embedding: around each vertex the neighbours have a cyclic order (their angle in the
// vertex's tangent plane, the same trick platonicSolids.ts uses for the dodecahedron dual), and a face is
// traced by repeatedly "turning" from one directed edge to the next around the surface. Pure tuple math,
// no three.js — so it unit-tests headlessly and its output feeds the same Polyhedron the mesh builder
// already consumes. Robust for CONVEX solids with regular faces (the Archimedean/Platonic case); it does
// not handle non-convex or self-intersecting polyhedra.

import type { Vec3 } from "./platonicSolids";

function sub(a: Vec3, b: Vec3): Vec3 {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: Vec3, b: Vec3): Vec3 {
	return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Vec3, b: Vec3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function dist(a: Vec3, b: Vec3): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function normalize(a: Vec3): Vec3 {
	const n = Math.hypot(a[0], a[1], a[2]) || 1;
	return [a[0] / n, a[1] / n, a[2] / n];
}
function anyPerp(axis: Vec3): Vec3 {
	const ref: Vec3 = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
	return normalize(cross(axis, ref));
}

/**
 * Face rings of a convex polyhedron given its vertices, each ring listing vertex indices in cyclic
 * boundary order. `edgeTol` is the fractional tolerance on the (uniform) edge length when deciding
 * adjacency (default 2%). Throws if the vertex set is degenerate (a vertex with < 2 neighbours).
 */
export function facesFromVertices(vertices: Vec3[], edgeTol = 0.02): number[][] {
	const n = vertices.length;
	const unit = vertices.map(normalize);

	// Uniform edge length = the minimum pairwise distance (all edges share it on these solids).
	let minD = Infinity;
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			const d = dist(vertices[i], vertices[j]);
			if (d < minD) minD = d;
		}
	}
	const tol = edgeTol * minD;

	// Adjacency: vertices exactly one edge apart.
	const nbr: number[][] = Array.from({ length: n }, () => [] as number[]);
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			if (Math.abs(dist(vertices[i], vertices[j]) - minD) <= tol) {
				nbr[i].push(j);
				nbr[j].push(i);
			}
		}
	}

	// Cyclic (CCW-from-outside) order of each vertex's neighbours, by angle in its tangent plane.
	const ring: number[][] = unit.map((u, i) => {
		if (nbr[i].length < 2) throw new Error(`vertex ${i} has ${nbr[i].length} neighbours (degenerate)`);
		const t1 = anyPerp(u);
		const t2 = cross(u, t1); // right-handed tangent frame; +t1×t2 points outward (== +u)
		const ang = (k: number) => {
			const d = sub(unit[k], u);
			return Math.atan2(dot(d, t2), dot(d, t1));
		};
		return nbr[i].slice().sort((a, b) => ang(a) - ang(b));
	});

	// From directed edge a->b, the next edge of the same face is b->c where c is the neighbour of b just
	// BEFORE a in b's CCW ring (turning right traces one face CCW as seen from outside). Every directed
	// edge lies in exactly one face, so marking each used visits every face exactly once.
	const nextVert = (a: number, b: number): number => {
		const r = ring[b];
		const idx = r.indexOf(a);
		return r[(idx - 1 + r.length) % r.length];
	};

	const used = new Set<string>();
	const faces: number[][] = [];
	for (let i = 0; i < n; i++) {
		for (const j of nbr[i]) {
			if (used.has(`${i}->${j}`)) continue;
			const face: number[] = [];
			let a = i;
			let b = j;
			for (let guard = 0; guard <= n; guard++) {
				used.add(`${a}->${b}`);
				face.push(a);
				const c = nextVert(a, b);
				a = b;
				b = c;
				if (a === i && b === j) break;
			}
			faces.push(face);
		}
	}
	return faces;
}
