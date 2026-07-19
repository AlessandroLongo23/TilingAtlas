import { describe, it, expect } from "vitest";
import { PLATONIC_SOLIDS, type Polyhedron, type Vec3 } from "@/lib/render/platonicSolids";
import { sphericalIslamicArcs } from "@/lib/render/sphericalIslamic";

// The 5 solids with their edge counts. Every face contributes 2 rays per edge, and each edge is shared by
// two faces, so a fully-populated construction (no dropped rays — guaranteed by the D_n symmetry of a
// regular motif) yields 2·2·E = 4·E arcs, all four rays of an edge rooted at the same arc midpoint.
const SOLIDS = [
	{ id: "tetrahedron", E: 6 },
	{ id: "octahedron", E: 12 },
	{ id: "icosahedron", E: 30 },
	{ id: "cube", E: 12 },
	{ id: "dodecahedron", E: 30 },
] as const;

function bySolid(id: string): Polyhedron {
	const p = PLATONIC_SOLIDS.find((s) => s.id === id);
	if (!p) throw new Error(`missing solid ${id}`);
	return p;
}

function len(a: Vec3): number {
	return Math.hypot(a[0], a[1], a[2]);
}
function normalize(a: Vec3): Vec3 {
	const n = len(a) || 1;
	return [a[0] / n, a[1] / n, a[2] / n];
}
function dist(a: Vec3, b: Vec3): number {
	return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function firstPoint(arc: Float32Array): Vec3 {
	return [arc[0], arc[1], arc[2]];
}
function lastPoint(arc: Float32Array): Vec3 {
	const n = arc.length;
	return [arc[n - 3], arc[n - 2], arc[n - 1]];
}

// Face centroid directions of a solid (the point every ray converges to at angle π/2 — rays along the
// inward normal, the "dual tiling" limit of the from-the-edge angle convention).
function faceCentroids(poly: Polyhedron): Vec3[] {
	const unit = poly.vertices.map(normalize);
	return poly.faces.map((f) => {
		let c: Vec3 = [0, 0, 0];
		for (const i of f) c = [c[0] + unit[i][0], c[1] + unit[i][1], c[2] + unit[i][2]];
		return normalize(c);
	});
}

function quantKey(p: Vec3): string {
	const q = (x: number) => Math.round(x * 1e6);
	return `${q(p[0])},${q(p[1])},${q(p[2])}`;
}

describe("sphericalIslamicArcs — per-face ray counts", () => {
	for (const { id, E } of SOLIDS) {
		it(`${id}: 4·E arcs at a generic angle, none dropped`, () => {
			const poly = bySolid(id);
			const arcs = sphericalIslamicArcs(poly, { angleRad: (40 * Math.PI) / 180 });
			expect(arcs.length).toBe(4 * E);
		});
	}
});

describe("sphericalIslamicArcs — points lie on the sphere", () => {
	for (const { id } of SOLIDS) {
		it(`${id}: every sampled point is unit length, no NaN`, () => {
			const poly = bySolid(id);
			const arcs = sphericalIslamicArcs(poly, { angleRad: (35 * Math.PI) / 180, radius: 1 });
			for (const arc of arcs) {
				expect(arc.length % 3).toBe(0);
				for (let i = 0; i < arc.length; i += 3) {
					const p: Vec3 = [arc[i], arc[i + 1], arc[i + 2]];
					expect(Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2])).toBe(true);
					expect(len(p)).toBeCloseTo(1, 5);
				}
			}
		});
	}
});

describe("sphericalIslamicArcs — radius scales the arcs", () => {
	it("dodecahedron: points sit on the requested radius", () => {
		const poly = bySolid("dodecahedron");
		const arcs = sphericalIslamicArcs(poly, { angleRad: (35 * Math.PI) / 180, radius: 2.5 });
		for (const arc of arcs) {
			for (let i = 0; i < arc.length; i += 3) {
				expect(len([arc[i], arc[i + 1], arc[i + 2]])).toBeCloseTo(2.5, 4);
			}
		}
	});
});

describe("sphericalIslamicArcs — angle π/2 collapses to the face centroid", () => {
	for (const { id } of SOLIDS) {
		it(`${id}: every ray endpoint lands on a face centroid`, () => {
			const poly = bySolid(id);
			const centroids = faceCentroids(poly);
			const arcs = sphericalIslamicArcs(poly, { angleRad: Math.PI / 2 });
			for (const arc of arcs) {
				const end = normalize(lastPoint(arc));
				const nearest = Math.min(...centroids.map((c) => dist(end, c)));
				expect(nearest).toBeLessThan(1e-4);
			}
		});
	}
});

describe("sphericalIslamicArcs — cross-face continuity of ray origins", () => {
	for (const { id, E } of SOLIDS) {
		it(`${id}: at offset 0 the shared edge midpoint is one origin (distinct origins == E)`, () => {
			const poly = bySolid(id);
			// All 4 rays of an edge (2 per adjacent face) root at the SAME arc midpoint — so if the two faces
			// agree on the origin, the number of distinct origin points equals the edge count exactly. A
			// mismatch (each face rooting at its own chord-midpoint) would inflate this past E.
			const arcs = sphericalIslamicArcs(poly, { angleRad: (35 * Math.PI) / 180, edgeOffsetFrac: 0 });
			const origins = new Set(arcs.map((a) => quantKey(normalize(firstPoint(a)))));
			expect(origins.size).toBe(E);
		});

		it(`${id}: edge offset splits each edge into 2 shared origins (distinct origins == 2·E)`, () => {
			const poly = bySolid(id);
			const arcs = sphericalIslamicArcs(poly, { angleRad: (35 * Math.PI) / 180, edgeOffsetFrac: 0.4 });
			const origins = new Set(arcs.map((a) => quantKey(normalize(firstPoint(a)))));
			expect(origins.size).toBe(2 * E);
		});
	}
});

describe("sphericalIslamicArcs — intersection count never drops a ray", () => {
	for (const count of [1, 2, 3]) {
		it(`dodecahedron: count ${count} keeps all 4·E arcs`, () => {
			const poly = bySolid("dodecahedron");
			const arcs = sphericalIslamicArcs(poly, { angleRad: (40 * Math.PI) / 180, intersectionCount: count });
			expect(arcs.length).toBe(4 * 30);
		});
	}
});
