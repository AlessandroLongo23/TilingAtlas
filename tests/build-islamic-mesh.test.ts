import { describe, it, expect } from "vitest";
import { Vector } from "@/classes";
import { buildIslamicMesh, buildInstancedIslamicMesh, buildInstancedCheckerMesh, latticeCellOf } from "@/lib/render/buildIslamicMesh";
import { hexToRgb } from "@/lib/render/islamicGL";
import type { AbcFace, Face, Segment } from "@/utils/islamicArrangement";

const sq = (cx: number, cy: number, r: number): Vector[] => [
	new Vector(cx - r, cy - r), new Vector(cx + r, cy - r), new Vector(cx + r, cy + r), new Vector(cx - r, cy + r),
];

describe("buildIslamicMesh", () => {
	const abc: AbcFace[] = [
		{ face: { vertices: sq(0, 0, 1) }, klass: "A", hue: 200 },
		{ face: { vertices: sq(3, 0, 1) }, klass: "B", hue: 0 },
		{ face: { vertices: sq(6, 0, 1) }, klass: "C", hue: 0 },
	];
	const segments: Segment[] = [[new Vector(0, 0), new Vector(1, 0)], [new Vector(1, 0), new Vector(1, 1)]];

	it("fans each face into (n) triangles = 3n verts; squares give 12 fill verts each", () => {
		const m = buildIslamicMesh(abc, segments, false);
		expect(m.fillVertexCount).toBe(3 * 4 * 3); // 3 faces × 4 tris × 3 verts
		expect(m.fillVerts.length).toBe(m.fillVertexCount * 2);
		expect(m.fillHue.length).toBe(m.fillVertexCount);
		expect(m.fillClass.length).toBe(m.fillVertexCount);
	});

	it("class per vertex is 0/1/2 for A/B/C; A carries its hue", () => {
		const m = buildIslamicMesh(abc, segments, false);
		// first face (A) → class 0, hue 200 on all 12 of its verts
		for (let i = 0; i < 12; i++) { expect(m.fillClass[i]).toBe(0); expect(m.fillHue[i]).toBe(200); }
		// second face (B) → class 1
		for (let i = 12; i < 24; i++) expect(m.fillClass[i]).toBe(1);
		// third face (C) → class 2
		for (let i = 24; i < 36; i++) expect(m.fillClass[i]).toBe(2);
	});

	it("degenerate collapses C to B (class 1), never 2", () => {
		const m = buildIslamicMesh(abc, segments, true);
		expect(Array.from(m.fillClass).some((c) => c === 2)).toBe(false);
		for (let i = 24; i < 36; i++) expect(m.fillClass[i]).toBe(1); // the C face now paints as B
	});

	it("each segment becomes a 6-vert quad with a unit normal", () => {
		const m = buildIslamicMesh(abc, segments, false);
		expect(m.strokeVertexCount).toBe(segments.length * 6);
		// segment (0,0)-(1,0) is horizontal → left normal (0,1)
		expect(m.strokeNorm[0]).toBeCloseTo(0);
		expect(m.strokeNorm[1]).toBeCloseTo(1);
		expect(Math.abs(m.strokeSide[0])).toBe(1);
	});

	it("no NaNs in the fill positions", () => {
		const m = buildIslamicMesh(abc, segments, false);
		expect(Array.from(m.fillVerts).every((x) => Number.isFinite(x))).toBe(true);
	});
});

describe("latticeCellOf", () => {
	const v1: [number, number] = [1, 0], v2: [number, number] = [0, 1];
	it("reduces a point to the lattice cell it falls in (round of its v1/v2 coords)", () => {
		expect(latticeCellOf(0.2, -0.3, v1, v2)).toEqual([0, 0]);
		expect(latticeCellOf(1.1, 0.0, v1, v2)).toEqual([1, 0]);
		expect(latticeCellOf(0.0, 2.4, v1, v2)).toEqual([0, 2]);
		expect(latticeCellOf(-0.9, -1.1, v1, v2)).toEqual([-1, -1]);
	});
	it("works on a sheared basis", () => {
		const a: [number, number] = [1, 0], b: [number, number] = [0.5, 1];
		// point = 2·a + 1·b = (2.5, 1) → cell [2, 1]
		expect(latticeCellOf(2.5, 1, a, b)).toEqual([2, 1]);
	});
	it("returns [0,0] for a degenerate (collinear) basis", () => {
		expect(latticeCellOf(3, 4, [1, 0], [2, 0])).toEqual([0, 0]);
	});
});

describe("buildInstancedIslamicMesh", () => {
	const v1: [number, number] = [1, 0], v2: [number, number] = [0, 1];
	// A 3×3 grid of unit-lattice A faces + segments — the same periodic class at every integer cell. Only
	// the origin-cell representative must survive (its lattice copies are the shader's other instances).
	const faces: AbcFace[] = [];
	const segments: Segment[] = [];
	for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
		faces.push({ face: { vertices: sq(i, j, 0.3) }, klass: "A", hue: 100 });
		segments.push([new Vector(i - 0.1, j), new Vector(i + 0.1, j)]);
	}

	it("keeps exactly the origin-cell face + segment (one representative per periodic class)", () => {
		const m = buildInstancedIslamicMesh(faces, segments, false, v1, v2);
		expect(m.fillVertexCount).toBe(12); // one square → 4 tris → 12 verts (not 9×12)
		expect(m.strokeVertexCount).toBe(6); // one segment → one quad
	});

	it("keeps the sole origin-cell face and drops the surrounding ring", () => {
		const m = buildInstancedIslamicMesh(faces, segments, false, v1, v2);
		// The kept face is the centred square (centroid 0,0): its first fan vertex is the centroid (0,0).
		expect(m.fillVerts[0]).toBeCloseTo(0);
		expect(m.fillVerts[1]).toBeCloseTo(0);
	});
});

describe("buildInstancedCheckerMesh", () => {
	const v1: [number, number] = [1, 0], v2: [number, number] = [0, 1];
	// The same 3×3 grid, but as plain Faces with a per-face two-colour index. Only the origin rep survives,
	// and it must carry ITS colour in fillClass (0/1), not the A/B/C classes.
	const faces: Face[] = [];
	const colors: number[] = [];
	for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
		faces.push({ vertices: sq(i, j, 0.3) });
		colors.push((i + j) & 1); // a checker parity so the origin cell is colour 0
	}
	const segments: Segment[] = [[new Vector(-0.1, 0), new Vector(0.1, 0)]];

	it("keeps the origin-cell face and carries its two-colour index in fillClass", () => {
		const m = buildInstancedCheckerMesh(faces, colors, segments, v1, v2);
		expect(m.fillVertexCount).toBe(12); // one square only
		// origin face (i=j=0) has colour (0+0)&1 = 0 → fillClass 0 on every vertex
		for (let k = 0; k < 12; k++) expect(m.fillClass[k]).toBe(0);
	});

	it("maps colour index 1 to fillClass 1", () => {
		// Shift the parity so the origin cell is colour 1.
		const c1 = faces.map((_, idx) => {
			const i = Math.floor(idx / 3) - 1, j = (idx % 3) - 1;
			return ((i + j) & 1) ^ 1;
		});
		const m = buildInstancedCheckerMesh(faces, c1, segments, v1, v2);
		for (let k = 0; k < 12; k++) expect(m.fillClass[k]).toBe(1);
	});
});

describe("hexToRgb", () => {
	it("parses #rrggbb and #rgb, normalised to 0..1", () => {
		expect(hexToRgb("#ffffff")).toEqual([1, 1, 1]);
		expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
		expect(hexToRgb("#fff")).toEqual([1, 1, 1]);
		const [r, g, b] = hexToRgb("#3a4a52");
		expect(r).toBeCloseTo(0x3a / 255); expect(g).toBeCloseTo(0x4a / 255); expect(b).toBeCloseTo(0x52 / 255);
	});
	it("falls back to mid-grey on garbage", () => {
		expect(hexToRgb("nope")).toEqual([0.5, 0.5, 0.5]);
	});
});
