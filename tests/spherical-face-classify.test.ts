import { describe, it, expect } from "vitest";
import { PLATONIC_SOLIDS, type Polyhedron, type Vec3 } from "@/lib/render/platonicSolids";
import { ARCHIMEDEAN_SOLIDS } from "@/lib/render/archimedeanSolids";
import { faceExitNormals } from "@/lib/render/sphericalGeometry";

// This mirrors the baker's per-texel classification: the face whose exit-normal N_f the direction most
// aligns with. If this reproduces every face's interior, the baked surface's colours and edges line up
// with the real faces. The bug it guards: unit-normal (insphere) classification erases the small far-out
// faces of Archimedean solids (e.g. the truncated dodecahedron's vertex triangles) and misplaces edges.
function dot(a: Vec3, b: Vec3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function normalize(a: Vec3): Vec3 {
	const n = Math.hypot(a[0], a[1], a[2]) || 1;
	return [a[0] / n, a[1] / n, a[2] / n];
}
function classify(dir: Vec3, N: Vec3[]): number {
	let best = -Infinity;
	let idx = -1;
	for (let i = 0; i < N.length; i++) {
		const d = dot(dir, N[i]);
		if (d > best) {
			best = d;
			idx = i;
		}
	}
	return idx;
}
function centroid(verts: Vec3[], face: number[]): Vec3 {
	let x = 0,
		y = 0,
		z = 0;
	for (const i of face) {
		x += verts[i][0];
		y += verts[i][1];
		z += verts[i][2];
	}
	return [x / face.length, y / face.length, z / face.length];
}

const ALL: Polyhedron[] = [...PLATONIC_SOLIDS, ...ARCHIMEDEAN_SOLIDS];

describe("exit-normal classification reproduces every face (Platonic + Archimedean)", () => {
	for (const solid of ALL) {
		it(`${solid.id}: every face's interior directions classify to that face`, () => {
			const N = faceExitNormals(solid);
			solid.faces.forEach((f, fi) => {
				const c = centroid(solid.vertices, f);
				// The face centre points at its own face.
				expect(classify(normalize(c), N)).toBe(fi);
				// So does every point along a radius from the centre toward each corner (convex ⇒ interior),
				// short of the corner itself (a shared vertex is a boundary).
				for (const vi of f) {
					const v = solid.vertices[vi];
					for (const t of [0.25, 0.5, 0.8]) {
						const p: Vec3 = [c[0] + (v[0] - c[0]) * t, c[1] + (v[1] - c[1]) * t, c[2] + (v[2] - c[2]) * t];
						expect(classify(normalize(p), N)).toBe(fi);
					}
				}
			});
		});
	}
});
