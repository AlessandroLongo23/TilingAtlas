// Builds a Tiling patch (a replicated grid of base tiles) from a fundamental cell. Lifted out of
// components/canvas.tsx so the WebGL views (components/islamic-canvas.tsx) can build the same patch the
// p5 canvas does without importing the p5 component (which would be a cycle). Behaviour-preserving.

import { Vector } from "@/classes/Vector";
import { Tiling } from "@/classes/Tiling";
import { GenericPolygon } from "@/classes/polygons/GenericPolygon";
import { starHue, starApexAngleDeg } from "@/lib/utils/renderTiling";
import type { TranslationalCellData } from "@/classes/algorithm/types";
import { MAX_FILL_RADIUS } from "@/lib/render/flatView";
import type { OrbitData } from "@/lib/services/orbitsFromExactSource";

export function buildTilingFromCell(cellData: TranslationalCellData, Ri: number, Rj: number, orbitData?: OrbitData | null): Tiling {
	const ri = Math.max(1, Math.min(MAX_FILL_RADIUS, Ri || 1));
	const rj = Math.max(1, Math.min(MAX_FILL_RADIUS, Rj || 1));
	const polyArray = cellData.p ?? cellData.cellPolygons ?? [];
	const basisRaw = cellData.b ?? cellData.basis ?? [[1, 0], [0, 1]];
	const [v1x, v1y] = basisRaw[0];
	const [v2x, v2y] = basisRaw[1];

	const t = new Tiling();
	t.nodes = [];

	// Build each distinct base tile ONCE. fromVertices is the expensive part (per-vertex angle, side
	// lengths, centroid, hue classification); every replicated cell is the same base tile translated by
	// i·v1 + j·v2, so the grid loop below clones by translation (translatedCopy) rather than
	// reconstructing each copy from scratch — the reconstruction is identical work for a shape that only
	// shifted. This is what keeps the parametric-angle slider (which rebuilds the whole grid every tick)
	// interactive: the cost drops from O(gridCells · perTileRebuild) to O(baseTiles · perTileRebuild)
	// plus a cheap per-copy vertex shift.
	//
	// maxRadius = largest centroid→vertex distance (world units). The draw-time off-screen cull tests
	// each tile by its CENTROID; a tile whose centroid is off-screen can still have a vertex on-screen,
	// but never further than this radius — so culling with a margin of zoom·maxRadius provably never
	// drops a partially-visible tile. It is translation-invariant, so the base tiles carry the global max.
	let maxRadius = 0;
	const basePolys: GenericPolygon[] = [];
	for (const polyData of polyArray) {
		const rawVerts = polyData.v ?? polyData.vertices ?? [];
		const vertices = rawVerts.map((v) =>
			Array.isArray(v) ? new Vector(v[0], v[1]) : new Vector(v.x, v.y),
		);
		if (vertices.length < 3) continue;
		const poly = GenericPolygon.fromVertices(vertices);
		// GenericPolygon colors by the regular log ramp; a star tile ({n}: n points, 2n vertices, or an
		// explicit `star` flag) uses the original StarPolygon hue instead.
		const nn = (polyData as { n?: number }).n ?? vertices.length;
		const isStar =
			(polyData as { star?: boolean }).star === true || (nn >= 3 && vertices.length === 2 * nn);
		if (isStar) poly.hue = starHue(nn, starApexAngleDeg(vertices));
		poly.isStar = isStar; // persist so the Islamic star-fill path can detect star tiles
		basePolys.push(poly);
		if (orbitData) poly.orbitOfCorner = poly.vertices.map((v) => orbitData.orbitAt(v.x, v.y));
		const c = poly.centroid;
		for (const vv of poly.vertices) {
			const d = Math.hypot(vv.x - c.x, vv.y - c.y);
			if (d > maxRadius) maxRadius = d;
		}
	}

	for (let i = -ri; i <= ri; i++) {
		for (let j = -rj; j <= rj; j++) {
			const ox = i * v1x + j * v2x;
			const oy = i * v1y + j * v2y;
			for (const base of basePolys) t.nodes.push(base.translatedCopy(ox, oy));
		}
	}
	t.maxRadius = maxRadius;
	return t;
}
