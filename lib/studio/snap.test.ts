import { describe, expect, it } from "vitest";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";
import { tilingToPatch } from "./patch";
import {
	constructionPoints,
	faceCentroid,
	faceRing,
	nearestPoint,
	pickEdge,
	pickFace,
	pickVertex,
	vertexAt,
} from "./snap";
import type { StudioPatch } from "./types";

/**
 * The thing worth testing here is the LATTICE part, not the arithmetic. Every pick has to work when
 * the cursor is many periods from the cell, and has to come back with the offset of the copy that was
 * actually hit, because that offset is what puts the edit back where the user is pointing. A pick that
 * only works near the origin passes a naive test and fails the moment anyone pans.
 */

const fourSquares: TranslationalCellData = {
	p: [
		{ v: [[0, 0], [1, 0], [1, 1], [0, 1]], n: 4 },
		{ v: [[1, 0], [2, 0], [2, 1], [1, 1]], n: 4 },
		{ v: [[0, 1], [1, 1], [1, 2], [0, 2]], n: 4 },
		{ v: [[1, 1], [2, 1], [2, 2], [1, 2]], n: 4 },
	],
	b: [[2, 0], [0, 2]],
};

/** A skewed cell, so nothing here can pass by accident on axis-aligned geometry. */
const H = Math.sqrt(3) / 2;
const hexCell: TranslationalCellData = {
	p: [{ v: [[1, 0], [0.5, H], [-0.5, H], [-1, 0], [-0.5, -H], [0.5, -H]], n: 6 }],
	b: [[1.5, H], [0, 2 * H]],
};

function patchOf(cell: TranslationalCellData): StudioPatch {
	const r = tilingToPatch(cell);
	if (!r.ok) throw new Error(r.reason);
	return r.patch;
}

const squares = patchOf(fourSquares);
const hexes = patchOf(hexCell);

/** World position of a lattice translation. */
const shift = (p: StudioPatch, i: number, j: number): [number, number] => [
	i * p.T1[0] + j * p.T2[0],
	i * p.T1[1] + j * p.T2[1],
];

describe("constructionPoints", () => {
	it("emits one point per vertex, per edge and per face", () => {
		const pts = constructionPoints(squares);
		expect(pts.filter((p) => p.kind === "vertex")).toHaveLength(squares.verts.length);
		expect(pts.filter((p) => p.kind === "midpoint")).toHaveLength(squares.edges.length);
		expect(pts.filter((p) => p.kind === "centroid")).toHaveLength(squares.rings.length);
	});

	it("emits a midpoint once per edge, not once per incident face", () => {
		const mids = constructionPoints(squares).filter((p) => p.kind === "midpoint");
		const at = mids.map((m) => `${m.at[0].toFixed(6)},${m.at[1].toFixed(6)}`);
		expect(new Set(at).size).toBe(at.length);
	});

	it("labels in the c / h / v vocabulary drawConstructionPoints uses", () => {
		const pts = constructionPoints(hexes);
		expect(pts.some((p) => p.label === "v1")).toBe(true);
		expect(pts.some((p) => p.label === "h1")).toBe(true);
		expect(pts.some((p) => p.label === "c1")).toBe(true);
	});

	it("puts every midpoint halfway along its own edge", () => {
		for (const m of constructionPoints(hexes).filter((p) => p.kind === "midpoint")) {
			if (m.ref.kind !== "midpoint") continue;
			// By KEY, which is how the ref names its edge, so this also asserts the key resolves.
			const i = hexes.edgeKeys.indexOf(m.ref.edge);
			expect(i).toBeGreaterThanOrEqual(0);
			const [va, vb, dx, dy] = hexes.edges[i];
			const A = vertexAt(hexes, va, [0, 0]);
			const B = vertexAt(hexes, vb, [dx, dy]);
			expect(m.at[0]).toBeCloseTo((A[0] + B[0]) / 2, 9);
			expect(m.at[1]).toBeCloseTo((A[1] + B[1]) / 2, 9);
		}
	});
});

describe("nearestPoint", () => {
	const pts = constructionPoints(squares);

	it("snaps to a point in the origin cell", () => {
		const target = pts.find((p) => p.kind === "vertex")!;
		const hit = nearestPoint(squares, pts, [target.at[0] + 0.01, target.at[1] - 0.01], 0.2);
		expect(hit).not.toBeNull();
		expect(hit!.kind).toBe("vertex");
		expect(hit!.ref.off).toEqual([0, 0]);
	});

	it("snaps to a copy five periods out and reports that copy's offset", () => {
		const target = pts.find((p) => p.kind === "centroid")!;
		const [sx, sy] = shift(squares, 5, -3);
		const hit = nearestPoint(squares, pts, [target.at[0] + sx + 0.02, target.at[1] + sy], 0.2);
		expect(hit).not.toBeNull();
		expect(hit!.ref.off).toEqual([5, -3]);
		// And the reported position is the copy's, not the representative's.
		expect(hit!.at[0]).toBeCloseTo(target.at[0] + sx, 9);
		expect(hit!.at[1]).toBeCloseTo(target.at[1] + sy, 9);
	});

	it("returns null past the radius", () => {
		// Deliberately not a construction point: (0.5, 0.5) IS face 0's centroid, so a zero distance
		// would hit at any radius and the test would assert nothing.
		expect(nearestPoint(squares, pts, [0.37, 0.21], 1e-6)).toBeNull();
	});

	it("honours a kind filter, which is how a cut endpoint stays on a boundary", () => {
		const c = pts.find((p) => p.kind === "centroid")!;
		const onlyBoundary = nearestPoint(squares, pts, c.at, 0.6, ["vertex", "midpoint"]);
		expect(onlyBoundary).not.toBeNull();
		expect(onlyBoundary!.kind).not.toBe("centroid");
	});

	it("snaps on a skewed lattice too", () => {
		const hpts = constructionPoints(hexes);
		const target = hpts.find((p) => p.kind === "vertex")!;
		const [sx, sy] = shift(hexes, -2, 4);
		const hit = nearestPoint(hexes, hpts, [target.at[0] + sx, target.at[1] + sy], 0.3);
		expect(hit).not.toBeNull();
		expect(hit!.ref.off).toEqual([-2, 4]);
	});
});

describe("pickFace", () => {
	it("finds the face under a point in the origin cell", () => {
		const hit = pickFace(squares, [0.5, 0.5]);
		expect(hit).not.toBeNull();
		expect(faceRing(squares, hit!.face, hit!.off).length).toBeGreaterThanOrEqual(3);
	});

	it("finds the same face in a distant copy, with that copy's offset", () => {
		const near = pickFace(squares, [0.5, 0.5])!;
		const [sx, sy] = shift(squares, 7, 11);
		const far = pickFace(squares, [0.5 + sx, 0.5 + sy]);
		expect(far).not.toBeNull();
		expect(far!.face).toBe(near.face);
		expect(far!.off).toEqual([7, 11]);
	});

	it("distinguishes the four faces of the 2x2 cell", () => {
		const hits = [
			pickFace(squares, [0.5, 0.5]),
			pickFace(squares, [1.5, 0.5]),
			pickFace(squares, [0.5, 1.5]),
			pickFace(squares, [1.5, 1.5]),
		];
		expect(hits.every((h) => h !== null)).toBe(true);
		expect(new Set(hits.map((h) => h!.face)).size).toBe(4);
	});

	it("finds a face on the skewed lattice", () => {
		const c = faceCentroid(hexes, 0)!;
		const hit = pickFace(hexes, c);
		expect(hit).not.toBeNull();
		expect(hit!.face).toBe(0);
	});
});

describe("pickEdge and pickVertex", () => {
	it("picks the edge the cursor sits on, in a distant copy", () => {
		const [sx, sy] = shift(squares, -4, 2);
		// The midpoint of some edge, translated out. It must resolve to a real edge key.
		const mid = constructionPoints(squares).find((p) => p.kind === "midpoint")!;
		const hit = pickEdge(squares, [mid.at[0] + sx, mid.at[1] + sy], 0.3);
		expect(hit).not.toBeNull();
		expect(squares.edgeKeys).toContain(hit!.key);
		expect(hit!.t).toBeGreaterThan(0.2);
		expect(hit!.t).toBeLessThan(0.8);
	});

	it("picks the vertex the cursor sits on, in a distant copy", () => {
		const [sx, sy] = shift(hexes, 3, -5);
		const v = hexes.verts[1];
		const hit = pickVertex(hexes, [v[0] + sx + 0.01, v[1] + sy], 0.2);
		expect(hit).not.toBeNull();
		expect(hit!.vi).toBe(1);
		expect(hit!.off).toEqual([3, -5]);
	});

	it("returns null past the radius", () => {
		expect(pickVertex(squares, [0.37, 0.21], 1e-6)).toBeNull();
		expect(pickEdge(squares, [0.37, 0.21], 1e-6)).toBeNull();
	});
});
