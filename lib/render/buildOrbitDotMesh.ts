// Vertex-orbit dots for the flat WebGL renderer (M3), the GPU port of Tiling.drawVertexOrbits. Reuses
// the fill's fundamental cell (parseBaseCell): each polygon corner that IS a tiling vertex gets a
// screen-constant disk, coloured by its orbit id and instanced across the lattice by the SAME grid as the
// fill. Orbit membership is translation-invariant, so orbitData.orbitAt(corner) is correct for every
// lattice image — instancing reproduces the whole orbit partition from one cell. Corners with orbit -1
// (not a tiling vertex, e.g. a star dent) are skipped, exactly as drawVertexOrbits skips them.

import type { OrbitData } from "@/lib/services/orbitsFromExactSource";
import { parseBaseCell, type TranslationalCellData } from "@/lib/utils/renderTiling";

export interface OrbitDotMesh {
	// Per orbit dot a 6-vertex quad (billboarded to a screen-constant disk in the shader).
	pos: Float32Array;    // 2 floats/vert — the vertex world position (shared with the fill's lattice)
	corner: Float32Array; // 2 floats/vert — unit-quad corner in [-1,1] (SDF disk + rim in the shader)
	orbit: Float32Array;  // 1 float/vert — orbit id; drives the hue (id*360/k) and the hover-grow lookup
	vertexCount: number;  // = pos.length / 2
	k: number;            // orbit count (hue spacing); from orbitData.k
	// The distinct dots (one per emitted quad), for the CPU hover hit-test: the mouse world position is
	// reduced modulo the lattice and matched against these base-cell dots to find the hovered orbit.
	dots: { x: number; y: number; orbit: number }[];
}

const QUAD: readonly [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];

export function buildOrbitDotMesh(
	cell: TranslationalCellData | null,
	orbitData: OrbitData | null,
): OrbitDotMesh | null {
	if (!cell || !orbitData) return null;
	const base = parseBaseCell(cell);
	if (!base) return null;

	// Collect the distinct-per-polygon corners that are tiling vertices. Shared corners between adjacent
	// polygons are emitted once per polygon (harmless overdraw — the disks are opaque and identical),
	// mirroring drawVertexOrbits' per-node corner loop.
	const dots: { x: number; y: number; orbit: number }[] = [];
	for (const poly of base.polys) {
		for (const v of poly.vertices) {
			const o = orbitData.orbitAt(v.x, v.y);
			if (o >= 0) dots.push({ x: v.x, y: v.y, orbit: o });
		}
	}
	if (dots.length === 0) return null;

	const pos = new Float32Array(dots.length * 6 * 2);
	const corner = new Float32Array(dots.length * 6 * 2);
	const orbit = new Float32Array(dots.length * 6);
	let vi = 0;
	for (const d of dots) {
		for (const [qx, qy] of QUAD) {
			pos[vi * 2] = d.x; pos[vi * 2 + 1] = d.y;
			corner[vi * 2] = qx; corner[vi * 2 + 1] = qy;
			orbit[vi] = d.orbit;
			vi++;
		}
	}

	return { pos, corner, orbit, vertexCount: vi, k: Math.max(1, orbitData.k), dots };
}
