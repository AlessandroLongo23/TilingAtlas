import { Cyclotomic, type CyclotomicRing } from "@/classes/Cyclotomic";
import { RegularPolygon } from "@/classes/polygons/RegularPolygon";
import { ExactStarPolygon } from "@/classes/polygons/ExactStarPolygon";
import type { Polygon } from "@/classes";

/**
 * Exact cell of a STAR tiling, as emitted by tools/ctrnact-oracle/export_atlas_cells.py.
 *
 * The /play symmetry and orbit overlays refuse to run on floats by design — analyzeSymmetry and
 * KUniformityChecker.vertexOrbits both take exact ZZ[zeta_24] input. Star tilings had no exact
 * payload (the regular-only cell codec cannot represent them), so both overlays returned null and
 * the UI drew nothing. This is the star-aware path that the codec comment called follow-up work.
 *
 * It ships the ARGUMENTS to the exact constructors rather than vertex lists — about 11 integers per
 * tile against 8 per vertex, so it is smaller than the float vertex list beside it. Rebuilding in
 * the browser from the float renderCell is not an option: ZZ[zeta_24] is dense in C, so
 * nearest-point decoding of a vertex is ill-posed.
 *
 * The exporter self-gates: it replays this exact walk and drops `exactCell` from the record unless
 * the result reproduces the developed face vertex-for-vertex. A record therefore either carries a
 * verified descriptor or none at all, never a plausible-but-wrong one.
 */
export type StarExactCell = {
	/**
	 * Order of the cyclotomic ring, i.e. the number of unit directions. 24 for the in-ring star
	 * palette; 18 for the 9-fold and 20 for the 5-fold out-of-ring shelves. Absent means 24, so
	 * records exported before the out-of-ring shelves gained exact cells still read correctly.
	 */
	D?: number;
	/** Period basis, integer coefficients over {zeta^0 .. zeta^(phi(D)-1)}. */
	T1: number[];
	T2: number[];
	tiles: {
		/** Regular: number of sides. Star: number of POINTS (so a 2n-gon boundary). */
		n: number;
		/** Anchor vertex, same basis as T1/T2. For a star this is a convex point, the constructor's vertex 0. */
		anchor: number[];
		/** Direction of the outgoing edge at the anchor, as a zeta exponent in [0, 24). */
		dir: number;
		star?: true;
		/** Point interior angle in 2*pi/D units. Present iff star. */
		alphaU?: number;
	}[];
};

const cyc = (ring: CyclotomicRing, v: number[]): Cyclotomic =>
	new Cyclotomic(ring, v.map((c) => BigInt(c)));

/**
 * Rebuild the exact polygons and basis on the ring the record names. Returns null if the caller's ring
 * does not match, or if any tile is inadmissible for its constructor — the caller then shows no overlay
 * rather than a wrong one.
 */
export function starCellFromExact(
	ring: CyclotomicRing,
	ec: StarExactCell,
): { cellPolygons: Polygon[]; basisExact: [Cyclotomic, Cyclotomic] } | null {
	// The record dictates the ring, not the caller: a 9-fold tile is not expressible at N=24 (its
	// symmetry order does not divide 24), so building it on the wrong ring would either throw or, worse,
	// silently produce a different tile.
	if ((ec.D ?? 24) !== ring.N) return null;
	try {
		const cellPolygons = ec.tiles.map((t) =>
			t.star
				? (ExactStarPolygon.isotoxal(t.n, t.alphaU!, cyc(ring, t.anchor), t.dir) as Polygon)
				: (RegularPolygon.fromAnchorAndDirExact(t.n, cyc(ring, t.anchor), t.dir) as Polygon),
		);
		if (!cellPolygons.every((p) => p.hasExact())) return null;
		return { cellPolygons, basisExact: [cyc(ring, ec.T1), cyc(ring, ec.T2)] };
	} catch {
		return null;
	}
}

/**
 * Ring order to analyse a tiling on. Only a star record names one; everything else is the ZZ[zeta_24]
 * default that the rest of the pipeline assumes.
 */
export function ringOrderOf(t: { exactSource?: { kind: string; exact?: StarExactCell } } | null): number {
	const src = t?.exactSource;
	if (src && src.kind === "startiles" && src.exact) return src.exact.D ?? 24;
	return 24;
}
