// lib/services/orbitsFromExactSource.ts
import type { Cyclotomic, CyclotomicRing } from "@/classes/Cyclotomic";
import type { Polygon } from "@/classes/polygons/Polygon";
import { deserializeCell } from "@/classes/algorithm/cellCodec";
import { reconstructOracleCell } from "@/classes/algorithm/oracleCellReconstruct";
import { KUniformityChecker } from "@/classes/algorithm/KUniformityChecker";
import type { PeriodCell } from "@/classes/algorithm/PeriodSolver";
import type { ExactCellSource } from "@/lib/services/cellCodecService";
import { starCellFromExact } from "@/lib/services/starExactCell";
import { components, minimalBlocks } from "@/classes/algorithm/delaney/DSymbol";
import { cellMap } from "@/lib/tilings/dsymFromMap";
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

export type OrbitData = {
	/** Number of vertex orbits (= k for a k-uniform tiling). */
	k: number;
	/** Orbit id at an absolute float vertex position, or -1 if no vertex maps there. */
	orbitAt: (x: number, y: number) => number;
	/** Show the dots whatever the Vertex orbits toggle says: the symmetry panel's hover (orbifold-morph-controls). */
	force?: boolean;
	/** Dots that are not tile corners (tile centres, edge midpoints), in cell coordinates. GPU path only. */
	extra?: { x: number; y: number; orbit: number }[];
	/** Edge orbits: how many, and the orbit of the edge whose midpoint is at (x, y) (-1 for none). Absent when
	 *  the tiling is not edge-to-edge or the exact checks fail (KUniformityChecker.edgeFaceOrbits). */
	edges?: FeatureLookup;
	/** Tile orbits: how many, and the orbit of the tile whose centroid (vertex mean) is at (x, y). */
	faces?: FeatureLookup;
};
export type FeatureLookup = { count: number; at: (x: number, y: number) => number };

// Absolute-position key. renderCell and the reconstructed exact cell share one coordinate frame
// (verified empirically), and tiling edges are unit length, so quantizing to 1e-4 keys every distinct
// vertex uniquely with a ~5000x margin over the vertex spacing.
const key = (x: number, y: number) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;

/** The exact period cell an exact source describes, or null. The caller must have set the active ring. */
export function exactCellOf(ring: CyclotomicRing, id: string, source: ExactCellSource): PeriodCell | null {
	if (source.kind === "startiles") return (starCellFromExact(ring, source.exact) as unknown as PeriodCell) ?? null;
	if (source.kind === "seed") {
		const rec = reconstructOracleCell(ring, id, { T1: source.T1, T2: source.T2, Seed: source.Seed });
		return "error" in rec ? null : rec.cell;
	}
	return deserializeCell(ring, source.cell);
}

/**
 * Orbit id per vertex of an oracle tiling, computed from its exact cell. Mirrors
 * symmetryFromExactSource: the caller must have set the active ring to `ring`. Returns null when the
 * cell cannot be reconstructed or the orbit gate is degenerate (caller then draws no orbit partition).
 */
export function orbitsFromExactSource(ring: CyclotomicRing, id: string, source: ExactCellSource): OrbitData | null {
	const cell = exactCellOf(ring, id, source);
	if (!cell) return null;
	const checker = new KUniformityChecker();
	const [u, v] = cell.basisExact;
	const res = checker.vertexOrbits(cell.cellPolygons, u, v);
	if (!res) return null;
	const ef = checker.edgeFaceOrbits(cell.cellPolygons, u, v, res);

	// Key every vertex, edge midpoint and tile centroid of the replicated block by absolute position. The
	// block spans a ±3-cell window, so it covers the whole base cell (and then some): every base polygon the
	// canvas draws is found.
	const lookup = (points: (p: Polygon) => Cyclotomic[], orbitOf: (z: Cyclotomic) => number | null) => {
		const map = new Map<string, number>();
		for (const poly of res.block)
			for (const z of points(poly)) {
				const o = orbitOf(z);
				if (o == null) continue;
				const p = z.toVector();
				map.set(key(p.x, p.y), o);
			}
		return (x: number, y: number) => map.get(key(x, y)) ?? -1;
	};
	const data: OrbitData = { k: res.orbits, orbitAt: lookup((p) => p.exactVertices ?? [], res.orbitOf) };
	if (ef) {
		data.edges = { count: ef.edges.count, at: lookup((p) => p.exactHalfways ?? [], ef.edges.orbitOf) };
		data.faces = {
			count: ef.faces.count,
			at: lookup((p) => (p.exactCentroid ? [p.exactCentroid] : []), ef.faces.orbitOf),
		};
	}
	return data;
}

/**
 * The same orbits read off the tiling's Delaney–Dress symbol (dsymFromMap.cellMap, folded by minimalBlocks): each
 * chamber's vertex, edge and tile orbit is its block's component in the minimal symbol, and the map says where the
 * chamber's vertex, edge midpoint and tile centre are drawn. Linear in the cell, where the exact checker replicates a
 * block of cells and searches it: 2 s on 42 polygons, past two minutes on the 596 of a k = 48 face-homogeneous
 * tiling. Points are keyed modulo the lattice, so every translate the canvas draws finds its orbit.
 */
export function orbitsFromCell(cell: TranslationalCellData): OrbitData | null {
	const map = cellMap(cell);
	const basis = cell.basis ?? cell.b;
	if (!map?.at || !basis) return null;
	const { sym, block } = minimalBlocks(map.sym);
	const [[a, b], [c, d]] = basis;
	const det = a * d - b * c;
	const mod1 = (t: number) => Math.round((t - Math.floor(t)) * 1e4) % 1e4;
	const torus = (x: number, y: number) => `${mod1((x * d - y * c) / det)},${mod1((a * y - b * x) / det)}`;
	const lookup = (i: 0 | 1, j: 1 | 2, at: "v" | "e" | "f"): FeatureLookup => {
		const orbit = new Array<number>(sym.n);
		const comps = components(sym, i, j);
		comps.forEach((cs, o) => cs.forEach((x) => (orbit[x] = o)));
		const byPoint = new Map<string, number>();
		map.at!.forEach((p, x) => byPoint.set(torus(p[at][0], p[at][1]), orbit[block[x]]));
		return { count: comps.length, at: (x, y) => byPoint.get(torus(x, y)) ?? -1 };
	};
	const vertex = lookup(1, 2, "v");
	return { k: vertex.count, orbitAt: vertex.at, edges: lookup(0, 2, "e"), faces: lookup(0, 1, "f") };
}
