// SPHERICAL STAR POLYHEDRA — tilings of S² by self-intersecting regular {n/d} faces (2026-08-17).
//
// This is the spherical sibling of the Euclidean `hollow` shelf (lib/hollow/pattern.ts). Same tile:
// {5/2} is the modern star polygon, five vertices and five edges that cross, and the crossings are NOT
// vertices — a different shape from the concave isotoxal |n/d| the `star` and `isotoxal` shelves carry
// (docs/TILE_TAXONOMY.md §2.1). Same density notion, on a closed surface instead of the plane: a star
// polyhedron covers its circumsphere D times, and D > 1 is what puts a record on this shelf.
//
// Produced by the Čtrnáct engine, not by a table lookup. `alphabets/palettes/star-ico*.json` +
// `star-wide.json` carry the {n/d} tiles, eu_solver/eu_pruner enumerate the vertex figures, and
// tools/ctrnact-oracle/develop_spherical.py realizes each one on S² by SO(3) flood-fill, solving the
// edge arc ρ from Σ angle = 2π·d_v. Exported by emit_sph_star_shelf.py.
//
// WHY χ IS NOT THE CERTIFICATE HERE. Every other spherical shelf checks V − E + F = 2. Two of the four
// Kepler–Poinsot solids close at −6 (genus 4, degree-3 branched covers of the sphere), so the developer
// certifies Σ face area = 4π·D for a positive integer D instead — Cayley's density-weighted Euler
// relation, d_v·V − E + d_f·F = 2D, in geometric form.

import type { V3 } from "@/lib/render/icoFreedraw";

/** A face type: `n` boundary edges winding `d` times about the centre. d = 1 is an ordinary convex
 *  n-gon; d > 1 is a star polygon whose boundary crosses itself. */
export type StarFaceType = [n: number, d: number];

/** One star polyhedron, as shipped in public/spherical-star/<id>.json. Each record carries its own
 *  geometry: unlike a Schwarz board or a decorated solid there is nothing shared to index into, since
 *  every record here IS a different polyhedron. The whole shelf is under half a megabyte. */
export interface SphStarPattern {
	/** "ss-12-30-12-d3" — vertices, edges, faces, density. Unique, and readable without a lookup. */
	id: string;
	/** Vertex figure as the engine found it, "5/2.5/2.5/2.5/2.5/2"; " + "-joined at k > 1. */
	config: string;
	/**
	 * Vertex orbits of the finished solid, MEASURED off the developed geometry and required to agree
	 * with the certificate's k before the record ships.
	 *
	 * It was 1 for every record while this shelf held only uniform polyhedra, since uniform means
	 * vertex-transitive. It is not a property of the shelf: the pentagrammic pyramid is a regular-faced
	 * star polyhedron that is not uniform — apex 3⁵, five base vertices 5/2.3.3 — the star analogue of
	 * a Johnson solid, and there is no published enumeration of that space at all.
	 */
	k: number;
	/**
	 * How many times the solid covers its circumsphere. Measured off the developed geometry as
	 * Σ_f (n·α − (n−2d)·π) / 4π and required to be a positive integer, never read off a table.
	 *
	 * A RETROGRADE face subtracts covering instead of adding it, so its area enters negative. Scoring
	 * it with the complementary polygon's positive area instead inflates D by exactly one per
	 * retrograde face, which is how the snub icosidodecadodecahedron first read as 28 instead of 4.
	 */
	density: number;
	/** The forced edge arc, radians. Two solids can share a vertex word and differ only in this. */
	rho: number;
	/** The solid's name, present ONLY where the (V, E, F, face census, density) signature was checked
	 *  against the published catalogue by hand. Never inferred: U69 and U74 agree on all five. */
	solid?: string;
	/** Unit vectors, one per vertex. */
	vertices: V3[];
	/** Face rings of vertex indices, in TRAVERSAL order — for a {5/2} that is v0, v2, v4, v1, v3, so
	 *  consecutive entries are the star's real edges and the ring is not a simple polygon. */
	faces: number[][];
	/** Face type per face, parallel to `faces`. The fill key: one colour per {n/d}. */
	faceType: StarFaceType[];
	/** Every edge, as a vertex-index pair. All of them are real tile boundaries. */
	edges: [number, number][];
	stats: {
		verts: number;
		edges: number;
		faces: number;
		/** Order of the measured isometry group, and its vertex-orbit count. The shelf only admits
		 *  records with ONE orbit: a uniform polyhedron is vertex-transitive by definition, and the
		 *  solver's combinatorial k = 1 is a claim about the certificate, not about the geometry. */
		symmetryOrder: number;
		symmetryOrbits: number;
		/** Face census as [n, d, count], ascending. */
		types: [number, number, number][];
		/**
		 * Set when `density` came out 1 on a solid that HAS a self-intersecting face. Retrograde faces
		 * enter the area sum negative, so they can cancel a genuine covering number down to 1; the great
		 * truncated cuboctahedron 8/3.6.4 is the case. The record is a star polyhedron either way, but
		 * its density is not to be presented as the covering number.
		 */
		densitySuspect?: boolean;
	};
}

/** Index row: everything a card, a facet or a search needs before the geometry is fetched. */
export type SphStarEntry = Omit<SphStarPattern, "vertices" | "faces" | "faceType" | "edges">;

export const sphStarShardUrl = (id: string): string => `/spherical-star/${id}.json`;

/**
 * Is this record's density the covering number, or an artefact?
 *
 * Retrograde faces enter the signed-area sum negative, so they can cancel a genuine covering number
 * down to 1. `emit_sph_star_shelf.py` sets `densitySuspect` when that happens on a solid that has a
 * self-intersecting face, with the instruction that the UI must not present the result as a density.
 *
 * ⚑ Nothing read the flag until 2026-08-19, when Marek Čtrnáct asked why 8/3.6.4 was filed at density
 * 1 and pointed out that a density-1 polyhedron is convex by definition, which that one plainly is
 * not. He is right, the record is right, and only the label was wrong. One record is affected:
 * ss-48-72-26-d1, the only density-1 entry on the shelf.
 */
export const densityUnresolved = (p: { density: number; stats: { densitySuspect?: boolean } }): boolean =>
	p.stats.densitySuspect === true;

/** The /play sub-axis key, namespaced against "sps-"/"spc-"/"spe-"/"spp-". A record whose density did
 *  not resolve groups apart from the honest ones, so no row promises a number it cannot stand behind. */
export const sphStarSub = (p: { density: number; stats?: { densitySuspect?: boolean } }): string =>
	p.stats?.densitySuspect ? "sst-dx" : `sst-d${p.density}`;

/** Sub-axis label: the shelf is grouped by DENSITY, which is the one number that orders this space and
 *  the one an ordinary tiling does not have. */
export const sphStarSubLabel = (density: number, unresolved = false): string =>
	unresolved ? "density unresolved" : `density ${density}`;

/** Card / search label. A named solid says its name; anything else says what it is made of, since a
 *  U-number guessed off a census is exactly the error the naming table refuses to make. */
export function sphStarFamilyLabel(p: SphStarEntry): string {
	if (p.solid) return p.solid;
	const parts = p.stats.types.map(([n, d, c]) => `${c}{${d > 1 ? `${n}/${d}` : n}}`);
	// Same refusal as sphStarSubLabel: the census is always true, the density is not.
	return `${parts.join(" + ")} · ${densityUnresolved(p) ? "density unresolved" : `density ${p.density}`}`;
}

/** Whether any face of the record actually crosses itself. Every record on this shelf has density > 1,
 *  but not all of them have star FACES: the great dodecahedron and the great icosahedron are built from
 *  ordinary pentagons and triangles and are star polyhedra because their vertex figures wind twice.
 *  ⚑ The "every record has density > 1" in the first line is not true: ss-48-72-26-d1 measures 1, which
 *  is exactly the cancellation `densityUnresolved` exists to flag. */
export const hasStarFace = (p: SphStarEntry): boolean => p.stats.types.some(([, d]) => d > 1);

/** Distinct face types present, for the /library size facet. */
export function sphStarFaceSizes(p: SphStarEntry): number[] {
	return [...new Set(p.stats.types.map(([n]) => n))].sort((a, b) => a - b);
}

/** Every star polyhedron shipped under public/spherical-star/, generated by emit_sph_star_shelf.py.
 *  Geometry is fetched per record; `rho` is 0 here and carried by the shard. */
export const SPH_STAR_INDEX: SphStarEntry[] = [
	{ id: "ss-48-72-26-d1", config: "8/3.6.4", k: 1, density: 1, rho: 0, solid: undefined, stats: { verts: 48, edges: 72, faces: 26, symmetryOrder: 48, symmetryOrbits: 1, types: [[4, 1, 12], [6, 1, 8], [8, 3, 6]], densitySuspect: true } },
	{ id: "ss-10-15-7-d2", config: "5/2.4.4", k: 1, density: 2, rho: 0, solid: "pentagrammic prism", stats: { verts: 10, edges: 15, faces: 7, symmetryOrder: 20, symmetryOrbits: 1, types: [[4, 1, 5], [5, 2, 2]] } },
	{ id: "ss-10-20-12-d2", config: "5/2.3.3.3", k: 1, density: 2, rho: 0, solid: "pentagrammic antiprism", stats: { verts: 10, edges: 20, faces: 12, symmetryOrder: 20, symmetryOrbits: 1, types: [[3, 1, 10], [5, 2, 2]] } },
	{ id: "ss-14-21-9-d2", config: "7/2.4.4", k: 1, density: 2, rho: 0, solid: "heptagrammic prism {7/2}", stats: { verts: 14, edges: 21, faces: 9, symmetryOrder: 28, symmetryOrbits: 1, types: [[4, 1, 7], [7, 2, 2]] } },
	{ id: "ss-14-28-16-d2", config: "7/2.3.3.3", k: 1, density: 2, rho: 0, solid: "heptagrammic antiprism {7/2}", stats: { verts: 14, edges: 28, faces: 16, symmetryOrder: 28, symmetryOrbits: 1, types: [[3, 1, 14], [7, 2, 2]] } },
	{ id: "ss-20-60-32-d2", config: "5/2.3.5/2.3.5/2.3", k: 1, density: 2, rho: 0, solid: "small ditrigonal icosidodecahedron (U30)", stats: { verts: 20, edges: 60, faces: 32, symmetryOrder: 120, symmetryOrbits: 1, types: [[3, 1, 20], [5, 2, 12]] } },
	{ id: "ss-24-48-20-d2", config: "8.4.8.3", k: 1, density: 2, rho: 0, solid: undefined, stats: { verts: 24, edges: 48, faces: 20, symmetryOrder: 48, symmetryOrbits: 1, types: [[3, 1, 8], [4, 1, 6], [8, 1, 6]] } },
	{ id: "ss-60-120-44-d2", config: "10.5.10.3", k: 1, density: 2, rho: 0, solid: undefined, stats: { verts: 60, edges: 120, faces: 44, symmetryOrder: 120, symmetryOrbits: 1, types: [[3, 1, 20], [5, 1, 12], [10, 1, 12]] } },
	{ id: "ss-60-120-52-d2", config: "5/2.6.3.6", k: 1, density: 2, rho: 0, solid: "small icosicosidodecahedron (U31)", stats: { verts: 60, edges: 120, faces: 52, symmetryOrder: 120, symmetryOrbits: 1, types: [[3, 1, 20], [5, 2, 12], [6, 1, 20]] } },
	{ id: "ss-60-180-112-d2", config: "5/2.3.3.3.3.3", k: 1, density: 2, rho: 0, solid: "small snub icosicosidodecahedron (U32)", stats: { verts: 60, edges: 180, faces: 112, symmetryOrder: 120, symmetryOrbits: 1, types: [[3, 1, 100], [5, 2, 12]] } },
	{ id: "ss-10-20-12-d3", config: "5/2.3.3.3", k: 1, density: 3, rho: 0, solid: "pentagrammic crossed antiprism", stats: { verts: 10, edges: 20, faces: 12, symmetryOrder: 20, symmetryOrbits: 1, types: [[3, 1, 10], [5, 2, 2]] } },
	{ id: "ss-12-30-12-d3", config: "5.5.5.5.5", k: 1, density: 3, rho: 0, solid: "great dodecahedron {5,5/2}", stats: { verts: 12, edges: 30, faces: 12, symmetryOrder: 120, symmetryOrbits: 1, types: [[5, 1, 12]] } },
	{ id: "ss-12-30-12-d3-r20344", config: "5/2.5/2.5/2.5/2.5/2", k: 1, density: 3, rho: 0, solid: "small stellated dodecahedron {5/2,5}", stats: { verts: 12, edges: 30, faces: 12, symmetryOrder: 120, symmetryOrbits: 1, types: [[5, 2, 12]] } },
	{ id: "ss-14-21-9-d3", config: "7/3.4.4", k: 1, density: 3, rho: 0, solid: "heptagrammic prism {7/3}", stats: { verts: 14, edges: 21, faces: 9, symmetryOrder: 28, symmetryOrbits: 1, types: [[4, 1, 7], [7, 3, 2]] } },
	{ id: "ss-14-28-16-d3", config: "7/3.3.3.3", k: 1, density: 3, rho: 0, solid: "heptagrammic antiprism {7/3}", stats: { verts: 14, edges: 28, faces: 16, symmetryOrder: 28, symmetryOrbits: 1, types: [[3, 1, 14], [7, 3, 2]] } },
	{ id: "ss-16-24-10-d3", config: "8/3.4.4", k: 1, density: 3, rho: 0, solid: "octagrammic prism", stats: { verts: 16, edges: 24, faces: 10, symmetryOrder: 32, symmetryOrbits: 1, types: [[4, 1, 8], [8, 3, 2]] } },
	{ id: "ss-16-32-18-d3", config: "8/3.3.3.3", k: 1, density: 3, rho: 0, solid: "octagrammic antiprism", stats: { verts: 16, edges: 32, faces: 18, symmetryOrder: 32, symmetryOrbits: 1, types: [[3, 1, 16], [8, 3, 2]] } },
	{ id: "ss-20-30-12-d3", config: "10/3.4.4", k: 1, density: 3, rho: 0, solid: "decagrammic prism", stats: { verts: 20, edges: 30, faces: 12, symmetryOrder: 40, symmetryOrbits: 1, types: [[4, 1, 10], [10, 3, 2]] } },
	{ id: "ss-20-40-22-d3", config: "10/3.3.3.3", k: 1, density: 3, rho: 0, solid: "decagrammic antiprism", stats: { verts: 20, edges: 40, faces: 22, symmetryOrder: 40, symmetryOrbits: 1, types: [[3, 1, 20], [10, 3, 2]] } },
	{ id: "ss-30-60-24-d3", config: "5/2.5.5/2.5", k: 1, density: 3, rho: 0, solid: "dodecadodecahedron (U36)", stats: { verts: 30, edges: 60, faces: 24, symmetryOrder: 120, symmetryOrbits: 1, types: [[5, 1, 12], [5, 2, 12]] } },
	{ id: "ss-60-90-24-d3", config: "5/2.10.10", k: 1, density: 3, rho: 0, solid: "truncated great dodecahedron (U37)", stats: { verts: 60, edges: 90, faces: 24, symmetryOrder: 120, symmetryOrbits: 1, types: [[5, 2, 12], [10, 1, 12]] } },
	{ id: "ss-60-120-54-d3", config: "5/2.4.5.4", k: 1, density: 3, rho: 0, solid: "rhombidodecadodecahedron (U38)", stats: { verts: 60, edges: 120, faces: 54, symmetryOrder: 120, symmetryOrbits: 1, types: [[4, 1, 30], [5, 1, 12], [5, 2, 12]] } },
	{ id: "ss-60-150-84-d3", config: "5/2.3.5.3.3", k: 1, density: 3, rho: 0, solid: "snub dodecadodecahedron (U40)", stats: { verts: 60, edges: 150, faces: 84, symmetryOrder: 60, symmetryOrbits: 1, types: [[3, 1, 60], [5, 1, 12], [5, 2, 12]] } },
	{ id: "ss-120-180-54-d3", config: "10/3.10.4", k: 1, density: 3, rho: 0, solid: undefined, stats: { verts: 120, edges: 180, faces: 54, symmetryOrder: 120, symmetryOrbits: 1, types: [[4, 1, 30], [10, 1, 12], [10, 3, 12]] } },
	{ id: "ss-14-28-16-d4", config: "7/3.3.3.3", k: 1, density: 4, rho: 0, solid: "heptagrammic crossed antiprism", stats: { verts: 14, edges: 28, faces: 16, symmetryOrder: 28, symmetryOrbits: 1, types: [[3, 1, 14], [7, 3, 2]] } },
	{ id: "ss-24-48-20-d4", config: "8/3.4.8/3.3", k: 1, density: 4, rho: 0, solid: "great cubicuboctahedron (U14)", stats: { verts: 24, edges: 48, faces: 20, symmetryOrder: 48, symmetryOrbits: 1, types: [[3, 1, 8], [4, 1, 6], [8, 3, 6]] } },
	{ id: "ss-48-72-20-d4", config: "8/3.8.6", k: 1, density: 4, rho: 0, solid: "cubitruncated cuboctahedron (U16)", stats: { verts: 48, edges: 72, faces: 20, symmetryOrder: 48, symmetryOrbits: 1, types: [[6, 1, 8], [8, 1, 6], [8, 3, 6]] } },
	{ id: "ss-60-120-44-d4", config: "10/3.5.10/3.3", k: 1, density: 4, rho: 0, solid: "small ditrigonal dodecicosidodecahedron (U43)", stats: { verts: 60, edges: 120, faces: 44, symmetryOrder: 120, symmetryOrbits: 1, types: [[3, 1, 20], [5, 1, 12], [10, 3, 12]] } },
	{ id: "ss-60-120-44-d4-r5894", config: "5/2.10.3.10", k: 1, density: 4, rho: 0, solid: undefined, stats: { verts: 60, edges: 120, faces: 44, symmetryOrder: 120, symmetryOrbits: 1, types: [[3, 1, 20], [5, 2, 12], [10, 1, 12]] } },
	{ id: "ss-60-120-44-d4-r7752", config: "5/2.6.5.6", k: 1, density: 4, rho: 0, solid: undefined, stats: { verts: 60, edges: 120, faces: 44, symmetryOrder: 120, symmetryOrbits: 1, types: [[5, 1, 12], [5, 2, 12], [6, 1, 20]] } },
	{ id: "ss-60-180-104-d4", config: "5/2.3.5.3.3.3", k: 1, density: 4, rho: 0, solid: "snub icosidodecadodecahedron (U46)", stats: { verts: 60, edges: 180, faces: 104, symmetryOrder: 60, symmetryOrbits: 1, types: [[3, 1, 80], [5, 1, 12], [5, 2, 12]] } },
	{ id: "ss-120-180-44-d4", config: "10/3.10.6", k: 1, density: 4, rho: 0, solid: "icositruncated dodecadodecahedron (U45)", stats: { verts: 120, edges: 180, faces: 44, symmetryOrder: 120, symmetryOrbits: 1, types: [[6, 1, 20], [10, 1, 12], [10, 3, 12]] } },
	{ id: "ss-16-32-18-d5", config: "8/3.3.3.3", k: 1, density: 5, rho: 0, solid: undefined, stats: { verts: 16, edges: 32, faces: 18, symmetryOrder: 32, symmetryOrbits: 1, types: [[3, 1, 16], [8, 3, 2]] } },
	{ id: "ss-24-48-26-d5", config: "4.4.4.3", k: 1, density: 5, rho: 0, solid: undefined, stats: { verts: 24, edges: 48, faces: 26, symmetryOrder: 48, symmetryOrbits: 1, types: [[3, 1, 8], [4, 1, 18]] } },
	{ id: "ss-20-60-32-d6", config: "5.3.5.3.5.3", k: 1, density: 6, rho: 0, solid: "great ditrigonal icosidodecahedron (U47)", stats: { verts: 20, edges: 60, faces: 32, symmetryOrder: 120, symmetryOrbits: 1, types: [[3, 1, 20], [5, 1, 12]] } },
	{ id: "ss-60-120-52-d6", config: "6.5.6.3", k: 1, density: 6, rho: 0, solid: undefined, stats: { verts: 60, edges: 120, faces: 52, symmetryOrder: 120, symmetryOrbits: 1, types: [[3, 1, 20], [5, 1, 12], [6, 1, 20]] } },
	{ id: "ss-12-30-20-d7", config: "3.3.3.3.3", k: 1, density: 7, rho: 0, solid: "great icosahedron {3,5/2}", stats: { verts: 12, edges: 30, faces: 20, symmetryOrder: 120, symmetryOrbits: 1, types: [[3, 1, 20]] } },
	{ id: "ss-20-30-12-d7", config: "5/2.5/2.5/2", k: 1, density: 7, rho: 0, solid: "great stellated dodecahedron {5/2,3}", stats: { verts: 20, edges: 30, faces: 12, symmetryOrder: 120, symmetryOrbits: 1, types: [[5, 2, 12]] } },
	{ id: "ss-24-36-14-d7", config: "8/3.8/3.3", k: 1, density: 7, rho: 0, solid: "stellated truncated hexahedron (U19)", stats: { verts: 24, edges: 36, faces: 14, symmetryOrder: 48, symmetryOrbits: 1, types: [[3, 1, 8], [8, 3, 6]] } },
	{ id: "ss-30-60-32-d7", config: "5/2.3.5/2.3", k: 1, density: 7, rho: 0, solid: "great icosidodecahedron (U54)", stats: { verts: 30, edges: 60, faces: 32, symmetryOrder: 120, symmetryOrbits: 1, types: [[3, 1, 20], [5, 2, 12]] } },
	{ id: "ss-60-90-32-d7", config: "5/2.6.6", k: 1, density: 7, rho: 0, solid: "great truncated icosahedron (U55)", stats: { verts: 60, edges: 90, faces: 32, symmetryOrder: 120, symmetryOrbits: 1, types: [[5, 2, 12], [6, 1, 20]] } },
	{ id: "ss-60-150-92-d7", config: "5/2.3.3.3.3", k: 1, density: 7, rho: 0, solid: "great snub icosidodecahedron (U57)", stats: { verts: 60, edges: 150, faces: 92, symmetryOrder: 60, symmetryOrbits: 1, types: [[3, 1, 80], [5, 2, 12]] } },
	{ id: "ss-60-90-24-d9", config: "10/3.10/3.5", k: 1, density: 9, rho: 0, solid: "small stellated truncated dodecahedron (U58)", stats: { verts: 60, edges: 90, faces: 24, symmetryOrder: 120, symmetryOrbits: 1, types: [[5, 1, 12], [10, 3, 12]] } },
	{ id: "ss-60-150-84-d9", config: "5/2.3.5.3.3", k: 1, density: 9, rho: 0, solid: "inverted snub dodecadodecahedron (U60)", stats: { verts: 60, edges: 150, faces: 84, symmetryOrder: 60, symmetryOrbits: 1, types: [[3, 1, 60], [5, 1, 12], [5, 2, 12]] } },
	{ id: "ss-60-120-44-d10", config: "10/3.5/2.10/3.3", k: 1, density: 10, rho: 0, solid: undefined, stats: { verts: 60, edges: 120, faces: 44, symmetryOrder: 120, symmetryOrbits: 1, types: [[3, 1, 20], [5, 2, 12], [10, 3, 12]] } },
	{ id: "ss-60-90-32-d13", config: "10/3.10/3.3", k: 1, density: 13, rho: 0, solid: "great stellated truncated dodecahedron (U66)", stats: { verts: 60, edges: 90, faces: 32, symmetryOrder: 120, symmetryOrbits: 1, types: [[3, 1, 20], [10, 3, 12]] } },
	{ id: "ss-60-120-62-d13", config: "5/2.4.3.4", k: 1, density: 13, rho: 0, solid: undefined, stats: { verts: 60, edges: 120, faces: 62, symmetryOrder: 120, symmetryOrbits: 1, types: [[3, 1, 20], [4, 1, 30], [5, 2, 12]] } },
	{ id: "ss-60-150-92-d13", config: "5/2.3.3.3.3", k: 1, density: 13, rho: 0, solid: undefined, stats: { verts: 60, edges: 150, faces: 92, symmetryOrder: 60, symmetryOrbits: 1, types: [[3, 1, 80], [5, 2, 12]] } },
	{ id: "ss-120-180-62-d13", config: "10/3.6.4", k: 1, density: 13, rho: 0, solid: "great truncated icosidodecahedron (U68)", stats: { verts: 120, edges: 180, faces: 62, symmetryOrder: 120, symmetryOrbits: 1, types: [[4, 1, 30], [6, 1, 20], [10, 3, 12]] } },
	{ id: "ss-60-150-92-d37", config: "5/2.3.3.3.3", k: 1, density: 37, rho: 0, solid: undefined, stats: { verts: 60, edges: 150, faces: 92, symmetryOrder: 60, symmetryOrbits: 1, types: [[3, 1, 80], [5, 2, 12]] } },
	{ id: "ss-60-180-112-d38", config: "5/2.3.3.3.3.3", k: 1, density: 38, rho: 0, solid: undefined, stats: { verts: 60, edges: 180, faces: 112, symmetryOrder: 120, symmetryOrbits: 1, types: [[3, 1, 100], [5, 2, 12]] } },
	{ id: "ss-6-10-6-d2", config: "5/2.3.3 + 3.3.3.3.3", k: 2, density: 2, rho: 0, solid: "pentagrammic pyramid", stats: { verts: 6, edges: 10, faces: 6, symmetryOrder: 10, symmetryOrbits: 2, types: [[3, 1, 5], [5, 2, 1]] } },
	{ id: "ss-8-14-8-d2", config: "7/2.3.3 + 3.3.3.3.3.3.3", k: 2, density: 2, rho: 0, solid: "heptagrammic pyramid {7/2}", stats: { verts: 8, edges: 14, faces: 8, symmetryOrder: 14, symmetryOrbits: 2, types: [[3, 1, 7], [7, 2, 1]] } },
	{ id: "ss-8-14-8-d3", config: "7/3.3.3 + 3.3.3.3.3.3.3", k: 2, density: 3, rho: 0, solid: "heptagrammic pyramid {7/3}", stats: { verts: 8, edges: 14, faces: 8, symmetryOrder: 14, symmetryOrbits: 2, types: [[3, 1, 7], [7, 3, 1]] } },
];

export const SPH_STAR_BY_ID = new Map(SPH_STAR_INDEX.map((e) => [e.id, e]));

/** Distinct densities present, ascending — the shelf's sub-axis. */
export const sphStarDensities = (): number[] =>
	[...new Set(SPH_STAR_INDEX.map((e) => e.density))].sort((a, b) => a - b);
