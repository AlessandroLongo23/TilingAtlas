import { describe, it, expect } from "vitest";
import { PLATONIC_SOLIDS, polyhedronForSchlafli, type Polyhedron, type Vec3 } from "@/lib/render/platonicSolids";
import { classifyFace, edgeArcs, faceNormals, flatSolidTriangles, maxAdjacentNormalDot, solidEdges, straightEdges, vertexPoints } from "@/lib/render/sphericalGeometry";

// Expected combinatorics of the 5 Platonic solids: {p,q}, V, E, F. Euler: V − E + F = 2.
const EXPECTED = [
	{ id: "tetrahedron", p: 3, q: 3, V: 4, E: 6, F: 4 },
	{ id: "octahedron", p: 3, q: 4, V: 6, E: 12, F: 8 },
	{ id: "icosahedron", p: 3, q: 5, V: 12, E: 30, F: 20 },
	{ id: "cube", p: 4, q: 3, V: 8, E: 12, F: 6 },
	{ id: "dodecahedron", p: 5, q: 3, V: 20, E: 30, F: 12 },
] as const;

function norm(a: Vec3): number {
	return Math.hypot(a[0], a[1], a[2]);
}
function uniqueEdges(poly: Polyhedron): Set<string> {
	const s = new Set<string>();
	for (const f of poly.faces) {
		for (let k = 0; k < f.length; k++) {
			const a = f[k];
			const b = f[(k + 1) % f.length];
			s.add(a < b ? `${a}-${b}` : `${b}-${a}`);
		}
	}
	return s;
}

describe("Platonic solid registry", () => {
	it("has exactly the 5 solids", () => {
		expect(PLATONIC_SOLIDS).toHaveLength(5);
	});

	it("resolves each Schläfli symbol, and rejects non-spherical {p,q}", () => {
		for (const e of EXPECTED) {
			const solid = polyhedronForSchlafli(e.p, e.q);
			expect(solid?.id).toBe(e.id);
		}
		expect(polyhedronForSchlafli(6, 3)).toBeNull(); // Euclidean (1/p + 1/q = 1/2)
		expect(polyhedronForSchlafli(7, 3)).toBeNull(); // hyperbolic (< 1/2)
		expect(polyhedronForSchlafli(4, 4)).toBeNull(); // Euclidean
	});
});

describe.each(EXPECTED)("$id {$p,$q}", (e) => {
	const poly = polyhedronForSchlafli(e.p, e.q)!;

	it("has the right V / E / F and satisfies Euler's formula", () => {
		expect(poly.vertices).toHaveLength(e.V);
		expect(poly.faces).toHaveLength(e.F);
		expect(uniqueEdges(poly).size).toBe(e.E);
		expect(e.V - e.E + e.F).toBe(2);
	});

	it("every face is a p-gon", () => {
		for (const f of poly.faces) expect(f).toHaveLength(e.p);
	});

	it("every vertex has valence q", () => {
		for (let vi = 0; vi < poly.vertices.length; vi++) {
			const valence = poly.faces.filter((f) => f.includes(vi)).length;
			expect(valence).toBe(e.q);
		}
	});

	it("all vertices lie on a common circumsphere", () => {
		const r0 = norm(poly.vertices[0]);
		for (const v of poly.vertices) expect(norm(v)).toBeCloseTo(r0, 9);
	});

	it("each face is planar and regular", () => {
		for (const f of poly.faces) {
			const verts = f.map((i) => poly.vertices[i].map((c) => c / norm(poly.vertices[i])) as Vec3);
			const c: Vec3 = [0, 0, 0];
			for (const v of verts) {
				c[0] += v[0] / verts.length;
				c[1] += v[1] / verts.length;
				c[2] += v[2] / verts.length;
			}
			const d0 = norm([verts[0][0] - c[0], verts[0][1] - c[1], verts[0][2] - c[2]]);
			for (const v of verts) {
				expect(norm([v[0] - c[0], v[1] - c[1], v[2] - c[2]])).toBeCloseTo(d0, 6);
			}
			const lens = f.map((_, k) => {
				const a = verts[k];
				const b = verts[(k + 1) % verts.length];
				return norm([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
			});
			for (const l of lens) expect(l).toBeCloseTo(lens[0], 6);
		}
	});
});

describe.each(EXPECTED)("face normals for $id", (e) => {
	const poly = polyhedronForSchlafli(e.p, e.q)!;
	const normals = faceNormals(poly);

	it("has one unit normal per face", () => {
		expect(normals).toHaveLength(e.F);
		for (const n of normals) expect(norm(n)).toBeCloseTo(1, 9);
	});

	it("classifies each face's own centroid direction back to that face (argmax dot)", () => {
		for (let i = 0; i < normals.length; i++) {
			expect(classifyFace(normals[i], normals)).toBe(i);
		}
	});

	it("classifies a point nudged toward a neighbour to a DIFFERENT face across the edge", () => {
		// A direction 60% of the way from a face centre toward an adjacent face centre lands in the
		// neighbour, confirming the argmax boundary is the shared edge.
		const adjDot = maxAdjacentNormalDot(normals);
		let checked = 0;
		for (let i = 0; i < normals.length && checked < 3; i++) {
			for (let j = 0; j < normals.length; j++) {
				if (i === j) continue;
				const d = normals[i][0] * normals[j][0] + normals[i][1] * normals[j][1] + normals[i][2] * normals[j][2];
				if (Math.abs(d - adjDot) > 1e-6) continue; // only adjacent faces
				const mix: Vec3 = [
					normals[i][0] * 0.4 + normals[j][0] * 0.6,
					normals[i][1] * 0.4 + normals[j][1] * 0.6,
					normals[i][2] * 0.4 + normals[j][2] * 0.6,
				];
				expect(classifyFace(mix, normals)).toBe(j);
				checked++;
				break;
			}
		}
		expect(checked).toBeGreaterThan(0);
	});

	it("has adjacent-normal dot strictly between the extremes", () => {
		const adjDot = maxAdjacentNormalDot(normals);
		expect(adjDot).toBeGreaterThan(-1);
		expect(adjDot).toBeLessThan(1);
	});
});

describe.each(EXPECTED)("flat-solid facets for $id", (e) => {
	const poly = polyhedronForSchlafli(e.p, e.q)!;
	const R = 1.5;
	// A fan triangulation emits (len − 2) triangles per face; every face is a p-gon here.
	const triCount = poly.faces.reduce((sum, f) => sum + (f.length - 2), 0);

	it("emits a non-indexed triangle soup, one fan per face, all on the sphere", () => {
		const { positions, faceSizes } = flatSolidTriangles(poly, R);
		expect(positions).toHaveLength(triCount * 9); // 3 verts × 3 coords per triangle
		expect(faceSizes).toHaveLength(triCount);
		for (let i = 0; i < positions.length / 3; i++) {
			expect(Math.hypot(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])).toBeCloseTo(R, 5);
		}
	});

	it("labels every triangle with its source face's vertex count", () => {
		const { faceSizes } = flatSolidTriangles(poly);
		for (const s of faceSizes) expect(s).toBe(e.p);
		expect(faceSizes.filter((s) => s === e.p)).toHaveLength(triCount);
	});

	it("orients every triangle outward (normal points away from the centre)", () => {
		const { positions } = flatSolidTriangles(poly, 1);
		for (let t = 0; t < positions.length / 9; t++) {
			const a: Vec3 = [positions[t * 9], positions[t * 9 + 1], positions[t * 9 + 2]];
			const b: Vec3 = [positions[t * 9 + 3], positions[t * 9 + 4], positions[t * 9 + 5]];
			const c: Vec3 = [positions[t * 9 + 6], positions[t * 9 + 7], positions[t * 9 + 8]];
			const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
			const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
			const n: Vec3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
			const centroid: Vec3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
			// (b−a)×(c−a) is the CCW-front normal; for an outward-facing triangle it agrees with the radial dir.
			expect(n[0] * centroid[0] + n[1] * centroid[1] + n[2] * centroid[2]).toBeGreaterThan(0);
		}
	});

	it("each triangle's three vertices are coplanar with the source face centroid", () => {
		// A fan triangle lies in its face plane, so its normal is parallel to the face's radial normal.
		const { positions } = flatSolidTriangles(poly, 1);
		const normals = faceNormals(poly);
		for (let t = 0; t < positions.length / 9; t++) {
			const a: Vec3 = [positions[t * 9], positions[t * 9 + 1], positions[t * 9 + 2]];
			const b: Vec3 = [positions[t * 9 + 3], positions[t * 9 + 4], positions[t * 9 + 5]];
			const c: Vec3 = [positions[t * 9 + 6], positions[t * 9 + 7], positions[t * 9 + 8]];
			const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
			const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
			const n: Vec3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
			const nl = norm(n);
			expect(nl).toBeGreaterThan(1e-6); // non-degenerate triangle
			// |cos angle| between the triangle normal and SOME face normal must be ~1 (parallel).
			const best = normals.reduce((m, fn) => Math.max(m, Math.abs((n[0] * fn[0] + n[1] * fn[1] + n[2] * fn[2]) / nl)), 0);
			expect(best).toBeCloseTo(1, 6);
		}
	});
});

describe.each(EXPECTED)("solid edges for $id", (e) => {
	const poly = polyhedronForSchlafli(e.p, e.q)!;

	it("returns one deduped index pair per unique edge", () => {
		const edges = solidEdges(poly);
		expect(edges).toHaveLength(e.E);
		const seen = new Set(edges.map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`)));
		expect(seen.size).toBe(e.E); // no duplicates
	});

	it("every edge's endpoints share a face", () => {
		for (const [a, b] of solidEdges(poly)) {
			const shared = poly.faces.some((f) => {
				const ia = f.indexOf(a);
				if (ia < 0) return false;
				return f[(ia + 1) % f.length] === b || f[(ia - 1 + f.length) % f.length] === b;
			});
			expect(shared).toBe(true);
		}
	});
});

describe.each(EXPECTED)("straight edges for $id", (e) => {
	const poly = polyhedronForSchlafli(e.p, e.q)!;
	const R = 1.3;

	it("returns one straight chord (2 points) per unique edge, endpoints on the sphere", () => {
		const chords = straightEdges(poly, R);
		expect(chords).toHaveLength(e.E);
		for (const ch of chords) {
			expect(ch).toHaveLength(6); // exactly 2 points → straight, not a sampled arc
			expect(Math.hypot(ch[0], ch[1], ch[2])).toBeCloseTo(R, 5);
			expect(Math.hypot(ch[3], ch[4], ch[5])).toBeCloseTo(R, 5);
		}
	});

	it("extends each end past the vertices along the chord", () => {
		const plain = straightEdges(poly, R, 0);
		const ext = straightEdges(poly, R, 0.1);
		for (let i = 0; i < plain.length; i++) {
			const lp = Math.hypot(plain[i][3] - plain[i][0], plain[i][4] - plain[i][1], plain[i][5] - plain[i][2]);
			const le = Math.hypot(ext[i][3] - ext[i][0], ext[i][4] - ext[i][1], ext[i][5] - ext[i][2]);
			expect(le).toBeCloseTo(lp + 0.2, 5); // 0.1 past each of the two ends
		}
	});
});

describe.each(EXPECTED)("wireframe edges for $id", (e) => {
	const poly = polyhedronForSchlafli(e.p, e.q)!;
	const R = 1.5;

	it("emits one great-circle arc per unique edge, all points on the sphere", () => {
		const arcs = edgeArcs(poly, 12, R);
		expect(arcs).toHaveLength(e.E);
		for (const arc of arcs) {
			for (let i = 0; i < arc.length / 3; i++) {
				expect(Math.hypot(arc[i * 3], arc[i * 3 + 1], arc[i * 3 + 2])).toBeCloseTo(R, 5);
			}
		}
	});

	it("places one vertex point per vertex on the sphere", () => {
		const pts = vertexPoints(poly, R);
		expect(pts).toHaveLength(e.V);
		for (const p of pts) expect(norm(p)).toBeCloseTo(R, 6);
	});
});
