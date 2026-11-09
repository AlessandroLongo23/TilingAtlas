// Vertex-orbit dots for the flat WebGL renderer (M3), the GPU port of Tiling.drawVertexOrbits. Reuses
// the fill's fundamental cell (parseBaseCell): each polygon corner that IS a tiling vertex gets a
// screen-constant disk, coloured by its orbit id and instanced across the lattice by the SAME grid as the
// fill. Orbit membership is translation-invariant, so orbitData.orbitAt(corner) is correct for every
// lattice image — instancing reproduces the whole orbit partition from one cell. Corners with orbit -1
// (not a tiling vertex, e.g. a star dent) are skipped, exactly as drawVertexOrbits skips them.

import type { OrbitData } from "@/lib/services/orbitsFromExactSource";
import { buildCellMesh } from "@/lib/render/buildCellMesh";
import { ORBIT_MARK_FLOATS } from "@/lib/render/flatTilingGL";
import type { OrbitSegment, OrbitTile } from "@/lib/render/orbitHover";
import { parseBaseCell, type TranslationalCellData } from "@/lib/utils/renderTiling";

export interface OrbitDotMesh {
	// Per dot a 6-vertex quad of ORBIT_MARK_FLOATS floats a vertex (OrbitMarkPass): position, the same
	// position as the mark's other end, the unit-quad corner, and the orbit id.
	marks: Float32Array;
	vertexCount: number; // = marks.length / ORBIT_MARK_FLOATS
	k: number; // orbit count (hue spacing); from orbitData.k
	force: boolean; // drawn whatever the Vertex orbits toggle says (orbitData.force)
	// The distinct dots (one per emitted quad), for the CPU hover hit-test: the mouse world position is
	// reduced modulo the lattice and matched against these base-cell dots to find the hovered orbit.
	dots: { x: number; y: number; orbit: number }[];
	// Edge mode: a round-capped bar per polygon side (in the same mark layout); tile mode: an orbit id per
	// fill vertex (buildCellMesh's order). Each with the orbit count and the base cell's edges or tiles for
	// the hover hit-test. Null when the orbit data has no edge or tile orbits (not edge-to-edge).
	edges: { marks: Float32Array; count: number; features: OrbitSegment[] } | null;
	faces: { orbit: Float32Array; count: number; features: OrbitTile[] } | null;
}

const QUAD: readonly [number, number][] = [
	[-1, -1],
	[1, -1],
	[1, 1],
	[-1, -1],
	[1, 1],
	[-1, 1],
];

/** Six mark vertices per segment (a dot is a segment of length 0). */
function marksOf(segs: OrbitSegment[]): Float32Array {
	const out = new Float32Array(segs.length * 6 * ORBIT_MARK_FLOATS);
	let i = 0;
	for (const s of segs)
		for (const [qx, qy] of QUAD) out.set([s.ax, s.ay, s.bx, s.by, qx, qy, s.orbit], i++ * ORBIT_MARK_FLOATS);
	return out;
}

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
	for (const d of orbitData.extra ?? []) dots.push(d);
	if (dots.length === 0) return null;

	// Edges: every side of every polygon, so each edge of the tiling is drawn twice (once per tile it
	// bounds), like the dots.
	let edges: OrbitDotMesh["edges"] = null;
	if (orbitData.edges) {
		const segs: OrbitSegment[] = [];
		for (const poly of base.polys)
			poly.vertices.forEach((a, k) => {
				const b = poly.vertices[(k + 1) % poly.vertices.length];
				const o = orbitData.edges!.at((a.x + b.x) / 2, (a.y + b.y) / 2);
				if (o >= 0) segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, orbit: o });
			});
		edges = { marks: marksOf(segs), count: orbitData.edges.count, features: segs };
	}
	// Tiles: one orbit per polygon, spread over its fill vertices through the cell mesh's own tile index.
	let faces: OrbitDotMesh["faces"] = null;
	const fillTile = orbitData.faces ? buildCellMesh(cell)?.fillTile : undefined;
	if (orbitData.faces && fillTile) {
		const tiles = base.polys.map((poly) => {
			const n = poly.vertices.length;
			const cx = poly.vertices.reduce((s, v) => s + v.x, 0) / n;
			const cy = poly.vertices.reduce((s, v) => s + v.y, 0) / n;
			return { ring: poly.vertices, cx, cy, orbit: orbitData.faces!.at(cx, cy) };
		});
		const orbit = new Float32Array(fillTile.length / 2);
		for (let v = 0; v < orbit.length; v++) orbit[v] = tiles[fillTile[v * 2]].orbit;
		faces = { orbit, count: orbitData.faces.count, features: tiles.filter((t) => t.orbit >= 0) };
	}

	const marks = marksOf(dots.map((d) => ({ ax: d.x, ay: d.y, bx: d.x, by: d.y, orbit: d.orbit })));
	return {
		marks,
		vertexCount: marks.length / ORBIT_MARK_FLOATS,
		k: Math.max(1, orbitData.k),
		force: !!orbitData.force,
		dots,
		edges,
		faces,
	};
}
