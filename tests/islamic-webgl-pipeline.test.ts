// End-to-end headless check of the pipeline the WebGL IslamicCanvas runs each rebuild:
// buildTilingFromCell -> pool calculateIslamicSegments/islamicMarkers -> colorFacesAbc -> buildIslamicMesh.
// Guards the integration (real Polygon nodes, real construction) that a browser would otherwise be the
// first to exercise. Mirrors islamic-canvas.tsx's buildMesh exactly.
import { describe, it, expect } from "vitest";
import { buildTilingFromCell } from "@/lib/render/buildPatchTiling";
import { buildIslamicMesh } from "@/lib/render/buildIslamicMesh";
import { extractFaces, colorFacesAbc, type Segment, type Marker } from "@/utils/islamicArrangement";
import type { TranslationalCellData } from "@/classes/algorithm/types";

// A unit-square fundamental cell (one square, integer lattice) → the squares tiling, edges shared.
const SQUARE_CELL = {
	p: [{ v: [[0, 0], [1, 0], [1, 1], [0, 1]], n: 4 }],
	b: [[1, 0], [0, 1]],
} as unknown as TranslationalCellData;

function pipeline(cell: TranslationalCellData, ri: number, rj: number, thetaDeg: number, offset: number, count: number) {
	const patch = buildTilingFromCell(cell, ri, rj);
	const angle = (thetaDeg * Math.PI) / 180;
	const segments: Segment[] = [];
	const markers: Marker[] = [];
	for (const node of patch.nodes) {
		if (!node.vertices || !node.halfways) continue;
		for (const s of node.calculateIslamicSegments(angle, offset, count)) segments.push(s);
		for (const m of node.islamicMarkers()) markers.push(m);
	}
	const { faces, degenerate } = colorFacesAbc(extractFaces(segments, offset > 0 || count > 1), markers);
	return { mesh: buildIslamicMesh(faces, segments, degenerate), nodeCount: patch.nodes.length };
}

describe("WebGL Islamic pipeline (buildTilingFromCell → mesh)", () => {
	it("builds a replicated patch of the expected size", () => {
		const { nodeCount } = pipeline(SQUARE_CELL, 2, 2, 45, 0, 1);
		expect(nodeCount).toBe(5 * 5); // (2*2+1)^2 cells × 1 tile each
	});

	it("offset 0: a non-empty, finite mesh with A + B only (no C class)", () => {
		const { mesh } = pipeline(SQUARE_CELL, 2, 2, 45, 0, 1);
		expect(mesh.fillVertexCount).toBeGreaterThan(0);
		expect(mesh.strokeVertexCount).toBeGreaterThan(0);
		expect(Array.from(mesh.fillVerts).every(Number.isFinite)).toBe(true);
		const classes = new Set(Array.from(mesh.fillClass));
		expect(classes.has(0)).toBe(true); // A
		expect(classes.has(1)).toBe(true); // B
		expect(classes.has(2)).toBe(false); // no diamonds at offset 0
	});

	it("offset > 0: all three fill classes present (the diamonds open)", () => {
		const { mesh } = pipeline(SQUARE_CELL, 2, 2, 45, 0.35, 1);
		const classes = new Set(Array.from(mesh.fillClass));
		expect(classes).toEqual(new Set([0, 1, 2]));
		expect(Array.from(mesh.fillVerts).every(Number.isFinite)).toBe(true);
	});

	it("does not throw across the family/offset ranges the sliders expose", () => {
		for (const deg of [0, 30, 45, 60, 90]) for (const off of [0, 0.3, 0.6]) for (const cnt of [1, 2]) {
			expect(() => pipeline(SQUARE_CELL, 1, 1, deg, off, cnt)).not.toThrow();
		}
	});
});
