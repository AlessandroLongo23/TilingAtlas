// Building one pipeline record: everything the four-stage page shows for a single choice of battery.
//
// Shared by scripts/build-squaring-shelf.ts and by the page itself, which recomputes live whenever the
// reader clicks a different edge. That sharing is the point of the module: the alternative is the build
// emitting one record per edge, which would be the same numbers stored 27 times over, and two code
// paths that can disagree about what a battery choice means.
//
// Running this in the browser is affordable because the expensive-looking part is not expensive at
// these sizes. The curated set tops out at 26 vertices, so the Bareiss elimination is a 24x24 integer
// solve, and the whole record — potentials, currents, stream function, the tiling, its certification
// and a Tutte embedding — comes back in single-digit milliseconds. Nothing here touches node.

import { bouwkampCode, isPerfect, isSimple, order, tiledArea, tilesExactly } from "./classify";
import { integerDet } from "./linalg";
import { planarMapFromFaces, type PlanarMap } from "./planarMap";
import { squaringFrom, type Squaring } from "./smith";
import { outerFaceForBattery, tutteEmbedding } from "./tutte";
import type { PipelineRecord, PolyhedronSquarings, SquaringRecord } from "./shelf";

/** The parts of a record that do not depend on which edge carries the battery. */
export interface PipelineBase {
	id: string;
	name: string;
	source: PolyhedronSquarings["source"];
	vertices: [number, number, number][];
	faces: number[][];
	symmetryOrder: number | null;
}

/** Turn a solved squaring into its shipped form. */
export function toSquaringRecord(s: Squaring): SquaringRecord {
	const distinct = new Set(s.squares.map((q) => q.side.toString())).size;
	return {
		battery: s.battery,
		width: s.width.toString(),
		height: s.height.toString(),
		squares: s.squares.map((q) => ({
			x: q.x.toString(),
			y: q.y.toString(),
			side: q.side.toString(),
			edge: q.edge,
		})),
		degenerate: s.degenerate,
		order: order(s),
		distinct,
		perfect: isPerfect(s),
		simple: isSimple(s),
		bouwkamp: bouwkampCode(s),
	};
}

/** Spanning trees of the whole graph, by Kirchhoff: any cofactor of the Laplacian. */
export function spanningTrees(map: PlanarMap): bigint {
	const n = map.vertexCount;
	if (n < 2) return 1n;
	const L: bigint[][] = Array.from({ length: n - 1 }, () => new Array<bigint>(n - 1).fill(0n));
	for (const [u, v] of map.edges) {
		if (u < n - 1) L[u][u] += 1n;
		if (v < n - 1) L[v][v] += 1n;
		if (u < n - 1 && v < n - 1) {
			L[u][v] -= 1n;
			L[v][u] -= 1n;
		}
	}
	return integerDet(L);
}

export interface PipelineFailure {
	stage: "map" | "squaring" | "cover" | "outerFace" | "embedding";
	detail: string;
}

/**
 * Solve one polyhedron with one edge as the battery.
 *
 * Certifies as it goes and returns a failure instead of a half-built record, so a caller can say what
 * went wrong. The build treats any failure as fatal; the page shows it and keeps the previous view.
 *
 * @param base    the polyhedron, independent of the battery choice
 * @param battery the edge to remove and replace with a battery, or omitted to use the first edge
 */
export function buildPipelineRecord(
	base: PipelineBase,
	battery: [number, number],
): { ok: true; record: PipelineRecord } | { ok: false; error: PipelineFailure } {
	const map = planarMapFromFaces(base.faces, base.vertices.length);
	if (!map) return { ok: false, error: { stage: "map", detail: "face rings are not an oriented planar map" } };

	const squaring = squaringFrom(map, battery);
	if (!squaring) {
		return {
			ok: false,
			error: { stage: "squaring", detail: `no squaring for battery ${battery[0]}–${battery[1]}` },
		};
	}
	if (tiledArea(squaring) !== squaring.width * squaring.height || !tilesExactly(squaring)) {
		return {
			ok: false,
			error: { stage: "cover", detail: `battery ${battery[0]}–${battery[1]} does not tile its rectangle` },
		};
	}

	const outer = outerFaceForBattery(map, squaring.battery);
	if (outer === null) return { ok: false, error: { stage: "outerFace", detail: "battery edge borders no face" } };

	const embedding = tutteEmbedding(map, outer);
	if (!embedding) return { ok: false, error: { stage: "embedding", detail: "Tutte embedding did not solve" } };
	// Tutte's theorem promises the drawing stays inside the pinned polygon with every face convex, so a
	// vertex outside it means the solve went wrong, not that the solid is unusual.
	for (const [x, y] of embedding.positions) {
		if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) > 1.0001) {
			return { ok: false, error: { stage: "embedding", detail: `vertex at (${x}, ${y}) escaped the boundary` } };
		}
	}

	return {
		ok: true,
		record: {
			id: base.id,
			name: base.name,
			source: base.source,
			counts: { vertices: map.vertexCount, edges: map.edges.length, faces: map.faces.length },
			symmetryOrder: base.symmetryOrder,
			vertices: base.vertices,
			faces: map.faces,
			edges: map.edges,
			battery: squaring.battery,
			potential: squaring.potential.map((v) => v.toString()),
			currents: squaring.currents.map((e) => ({ from: e.from, to: e.to, value: e.value.toString() })),
			tutte: embedding.positions,
			outerFace: embedding.outerFace,
			spanningTrees: spanningTrees(map).toString(),
			squaring: toSquaringRecord(squaring),
		},
	};
}

/**
 * A stable fingerprint for "which rectangle is this", used to tell the reader whether the edge they
 * picked gives a genuinely different tiling or the same one another edge already produced. Edges in
 * one orbit of the solid's symmetry group give identical rectangles, which is why an edge-transitive
 * solid has exactly one however many edges it has.
 */
export const squaringFingerprint = (r: SquaringRecord): string =>
	`${r.width}x${r.height}:${[...r.squares.map((s) => s.side)].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1)).join(",")}`;
