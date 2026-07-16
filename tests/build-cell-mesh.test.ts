import { describe, it, expect } from "vitest";
import { buildCellMesh } from "@/lib/render/buildCellMesh";
import { polygonFillHue, starApexAngleDeg, starHue } from "@/lib/utils/renderTiling";

// A unit square centred at the origin, CCW, in a unit-square lattice.
const squareVerts = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
const cell = { p: [{ v: squareVerts, n: 4 }], b: [[1, 0], [0, 1]] };

// A 4-point star ({4|α}): 8 vertices alternating outer tips (radius 1) and inner valleys (radius 0.5),
// deterministic concrete coordinates. n = point count = 4, vertices.length = 8.
const c = 0.3535533906; // 0.5 * cos(45°) — the inner-valley coordinate
const starVerts = [
	[1, 0], [c, c],
	[0, 1], [-c, c],
	[-1, 0], [-c, -c],
	[0, -1], [c, -c],
];

describe("buildCellMesh", () => {
	it("fan-triangulates one square into 4 triangles from the centroid", () => {
		const mesh = buildCellMesh(cell)!;
		expect(mesh).not.toBeNull();
		// 4 edges -> 4 triangles -> 12 vertices -> 24 floats.
		expect(mesh.fillVertexCount).toBe(12);
		expect(mesh.fillVerts.length).toBe(24);
		// First triangle is (centroid, v0, v1); centroid of the centred square is (0,0).
		expect(Array.from(mesh.fillVerts.slice(0, 6))).toEqual([0, 0, -0.5, -0.5, 0.5, -0.5]);
	});

	it("assigns the regular fill hue to every vertex of the square", () => {
		const mesh = buildCellMesh(cell)!;
		const expected = polygonFillHue(squareVerts.map(([x, y]) => ({ x, y })));
		expect(mesh.fillHue.length).toBe(mesh.fillVertexCount);
		// float32 attribute -> compare at 3 decimals, well above float32 ULP and below any real hue error
		for (const h of mesh.fillHue) expect(h).toBeCloseTo(expected, 3);
	});

	it("honours an explicit hue override over the regular ramp", () => {
		const override = { p: [{ v: squareVerts, n: 4, hue: 123 }], b: [[1, 0], [0, 1]] };
		const mesh = buildCellMesh(override)!;
		expect(mesh.fillHue.length).toBe(mesh.fillVertexCount);
		for (const h of mesh.fillHue) expect(h).toBe(123);
	});

	it("uses the star hue for star tiles", () => {
		const starCell = { p: [{ v: starVerts, n: 4, star: true }], b: [[3, 0], [0, 3]] };
		const mesh = buildCellMesh(starCell)!;
		const xy = starVerts.map(([x, y]) => ({ x, y }));
		const expected = starHue(4, starApexAngleDeg(xy));
		expect(Number.isFinite(expected)).toBe(true);
		// 8 vertices -> 8 triangles -> 24 vertices.
		expect(mesh.fillVertexCount).toBe(24);
		expect(mesh.fillHue.length).toBe(mesh.fillVertexCount);
		// float32 attribute -> compare at 3 decimals, well above float32 ULP and below any real hue error
		for (const h of mesh.fillHue) expect(h).toBeCloseTo(expected, 3);
	});

	it("returns the lattice basis", () => {
		const mesh = buildCellMesh(cell)!;
		expect(mesh.v1).toEqual([1, 0]);
		expect(mesh.v2).toEqual([0, 1]);
	});

	it("returns null for an empty / degenerate cell", () => {
		expect(buildCellMesh({ p: [], b: [[1, 0], [0, 1]] })).toBeNull();
		expect(buildCellMesh({ p: [{ v: squareVerts, n: 4 }], b: [[1, 0], [2, 0]] })).toBeNull(); // det 0
	});
});

describe("buildCellMesh stroke geometry", () => {
	it("emits two triangles (6 verts) per polygon edge as a quad", () => {
		const mesh = buildCellMesh(cell)!;
		// Square: 4 edges * 6 stroke verts = 24 stroke verts -> 48 position floats.
		expect(mesh.strokeVertexCount).toBe(24);
		expect(mesh.strokePos.length).toBe(48);
		expect(mesh.strokeNorm.length).toBe(48);
		expect(mesh.strokeSide.length).toBe(24);
	});

	it("edge 0's quad has the correct left-normal, positions, and side flags", () => {
		const mesh = buildCellMesh(cell)!;
		// Edge (-0.5,-0.5)->(0.5,-0.5): left normal (0,1); verts [a,a,b,b,a,b].
		expect(Array.from(mesh.strokePos.slice(0, 12))).toEqual([
			-0.5, -0.5,  -0.5, -0.5,  0.5, -0.5,  0.5, -0.5,  -0.5, -0.5,  0.5, -0.5,
		]);
		// `+ 0` canonicalises signed zero: nx = -dy/len is -0 for this horizontal edge (dy=0), identical to
		// +0 in the shader. A real left-normal sign error would flip ny to -1 and still fail here.
		expect(Array.from(mesh.strokeNorm.slice(0, 4)).map((v) => v + 0)).toEqual([0, 1, 0, 1]);
		expect(Array.from(mesh.strokeSide.slice(0, 6))).toEqual([-1, 1, -1, -1, 1, 1]);
	});
});
