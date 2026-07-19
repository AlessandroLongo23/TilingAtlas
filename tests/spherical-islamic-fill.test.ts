import { describe, it, expect } from "vitest";
import { PLATONIC_SOLIDS, type Polyhedron } from "@/lib/render/platonicSolids";
import { sphericalIslamicFaceData } from "@/lib/render/sphericalIslamic";
import { triangulateFillCell } from "@/lib/render/sphericalIslamicFill";
import { extractFaces, colorFacesAbc, pointInPolygon, signedArea, type Marker, type Segment } from "@/lib/utils/islamicArrangement";
import { polygonHue } from "@/lib/utils/renderTiling";
import { Vector } from "@/classes/Vector";

const SOLIDS = [
	{ id: "tetrahedron", p: 3, F: 4 },
	{ id: "octahedron", p: 3, F: 8 },
	{ id: "icosahedron", p: 3, F: 20 },
	{ id: "cube", p: 4, F: 6 },
	{ id: "dodecahedron", p: 5, F: 12 },
] as const;

function bySolid(id: string): Polyhedron {
	const p = PLATONIC_SOLIDS.find((s) => s.id === id);
	if (!p) throw new Error(`missing solid ${id}`);
	return p;
}

// The fill module's segment set: the construction rays + the closed face boundary.
function faceSegments(fd: { rays: Array<[number, number, number, number]>; boundary: Array<[number, number]> }): Segment[] {
	const segs: Segment[] = [];
	for (const [ox, oy, ex, ey] of fd.rays) segs.push([new Vector(ox, oy), new Vector(ex, ey)]);
	for (let i = 0; i < fd.boundary.length; i++) {
		const a = fd.boundary[i];
		const b = fd.boundary[(i + 1) % fd.boundary.length];
		segs.push([new Vector(a[0], a[1]), new Vector(b[0], b[1])]);
	}
	return segs;
}

describe("sphericalIslamicFaceData — shape", () => {
	for (const { id, p, F } of SOLIDS) {
		it(`${id}: one entry per face, boundary is the p-gon, 2·p rays`, () => {
			const poly = bySolid(id);
			const data = sphericalIslamicFaceData(poly, { angleRad: (40 * Math.PI) / 180 });
			expect(data.length).toBe(F);
			for (const fd of data) {
				expect(fd.boundary.length).toBe(p);
				expect(fd.rays.length).toBe(2 * p); // 2 rays per edge, none dropped for a regular motif
				// The tangent frame is orthonormal.
				expect(fd.u[0] * fd.C[0] + fd.u[1] * fd.C[1] + fd.u[2] * fd.C[2]).toBeCloseTo(0, 6);
				expect(fd.v[0] * fd.C[0] + fd.v[1] * fd.C[1] + fd.v[2] * fd.C[2]).toBeCloseTo(0, 6);
				expect(Math.hypot(fd.u[0], fd.u[1], fd.u[2])).toBeCloseTo(1, 6);
			}
		});
	}
});

describe("sphericalIslamicFaceData — cells partition each face (no gaps / overlaps)", () => {
	// Every cell traced from (rays + boundary) is inside the face's boundary polygon, and the cell areas
	// sum to the boundary area — so the fill tiles the face exactly, with no holes and no double-cover.
	for (const angleDeg of [25, 45, 60]) {
		for (const { id } of SOLIDS) {
			it(`${id} @ ${angleDeg}°: Σ cell area ≈ boundary area`, () => {
				const poly = bySolid(id);
				const data = sphericalIslamicFaceData(poly, { angleRad: (angleDeg * Math.PI) / 180 });
				for (const fd of data) {
					const boundaryArea = Math.abs(signedArea(fd.boundary.map(([x, y]) => new Vector(x, y))));
					const cells = extractFaces(faceSegments(fd), false);
					let sum = 0;
					for (const cell of cells) sum += Math.abs(signedArea(cell.vertices));
					expect(sum).toBeGreaterThan(0);
					expect(Math.abs(sum - boundaryArea) / boundaryArea).toBeLessThan(0.02);
				}
			});
		}
	}
});

describe("sphericalIslamicFaceData — A/B/C classification anchors a star body per face", () => {
	// The single centroid marker (projection origin, the face centre) must land inside a cell so every face
	// gets an A star body; otherwise the fill has no tile-hued centre. Guards the marker wiring.
	for (const { id } of SOLIDS) {
		it(`${id} @ 40°: every face has an A cell and the classes partition`, () => {
			const poly = bySolid(id);
			const data = sphericalIslamicFaceData(poly, { angleRad: (40 * Math.PI) / 180 });
			for (const fd of data) {
				const markers: Marker[] = [{ point: new Vector(0, 0), kind: "centroid", hue: polygonHue(fd.boundary.length) }];
				const { faces } = colorFacesAbc(extractFaces(faceSegments(fd), false), markers);
				expect(faces.length).toBeGreaterThan(0);
				expect(faces.filter((f) => f.klass === "A").length).toBeGreaterThan(0);
				// Every cell is classified (A, B or C).
				for (const f of faces) expect(["A", "B", "C"]).toContain(f.klass);
			}
		});
	}
});

describe("triangulateFillCell — never folds over a concave cell", () => {
	// At extreme contact angles the star bodies / side fields go strongly concave, and a fan from the
	// vertex-average centroid folds over (apex outside the polygon) — the fan triangles spill outside the
	// cell, overlap the neighbour and z-fight into a hatched moiré. Ear-clipping must keep every triangle
	// inside its cell. Guards the low/high-angle fill artefact (real screenshots at 5°). Checked at the
	// worst angle (5°), where ~⅔ of the icosahedron's cells have their centroid outside themselves.
	for (const angleDeg of [5, 45, 88]) {
		it(`icosahedron @ ${angleDeg}°: every fill triangle stays inside its cell and areas sum exactly`, () => {
			const poly = bySolid("icosahedron");
			const data = sphericalIslamicFaceData(poly, { angleRad: (angleDeg * Math.PI) / 180 });
			for (const fd of data) {
				for (const cell of extractFaces(faceSegments(fd), false)) {
					const cellArea = signedArea(cell.vertices); // CCW ⇒ positive
					const tris = triangulateFillCell(cell.vertices);
					expect(tris.length).toBeGreaterThanOrEqual(cell.vertices.length - 2);
					let triAreaSum = 0;
					for (const [a, b, c] of tris) {
						const area = signedArea([a, b, c]);
						expect(area).toBeGreaterThan(-1e-9); // no back-wound (folded) triangle
						triAreaSum += area;
						// The triangle centroid lies inside the cell — a folded fan triangle would fall outside.
						const cx = (a.x + b.x + c.x) / 3;
						const cy = (a.y + b.y + c.y) / 3;
						expect(pointInPolygon(cell.vertices, new Vector(cx, cy))).toBe(true);
					}
					// The triangulation covers the cell exactly — no missing or double-covered area.
					expect(Math.abs(triAreaSum - cellArea) / Math.abs(cellArea)).toBeLessThan(0.001);
				}
			}
		});
	}
});

describe("sphericalIslamicFaceData — edge offset still partitions", () => {
	for (const { id } of SOLIDS) {
		it(`${id}: offset 0.3 (split crossings) tiles the face`, () => {
			const poly = bySolid(id);
			const data = sphericalIslamicFaceData(poly, { angleRad: (45 * Math.PI) / 180, edgeOffsetFrac: 0.3 });
			for (const fd of data) {
				const boundaryArea = Math.abs(signedArea(fd.boundary.map(([x, y]) => new Vector(x, y))));
				const cells = extractFaces(faceSegments(fd), true); // splitCrossings for offset > 0
				let sum = 0;
				for (const cell of cells) sum += Math.abs(signedArea(cell.vertices));
				expect(Math.abs(sum - boundaryArea) / boundaryArea).toBeLessThan(0.03);
			}
		});
	}
});
