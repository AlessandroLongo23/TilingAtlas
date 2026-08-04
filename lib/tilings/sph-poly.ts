// The SPHERICAL members of the 3.4.n.4 family (Marek Čtrnáct, 2026-07-31 — his `ai1_3/4/5` solvers):
// tilings of S² by regular {3, 4, n, 2n}-gons at the edge arc ρ where the vertex figure 3.4.n.4 closes.
// The same object lib/tilings/hyp-poly.ts holds in H², on the other side of the curvature split — and
// the same identity α(3,ρ) + α(4,ρ) = α(2n,ρ) is what puts the 2n-gon in the alphabet, holding on the
// sphere to 1e-15 for n = 3, 4, 5. n = 6 is the Euclidean member; n ≥ 7 is the hyperbolic shelf.
//
// Every edge is a real tile boundary and every face its own tile, so this is a TILINGS shelf, not a
// decoration. It draws through buildIcoFreedraw — the three.js sphere every other spherical Čtrnáct
// shelf uses — via lib/render/sphPoly.ts, which groups the faces by POLYGON SIZE so one colour means
// one polygon, exactly as the hyperbolic half colours its disk. Decoded by
// tools/ctrnact-oracle/develop_ai1_sph.py.
//
// UNLIKE the uniform-polyhedron edge shelf, a record carries its OWN geometry. There is no shared
// board to index into: at k > 1 these are genuinely different solids — a mix of 3.4.n.4 and 4.n.2n
// vertices is neither uniform nor the board — and at 20 records in the whole family the geometry costs
// ~55 kB, so sharing one would be a lie told to save nothing.

import type { V3 } from "@/lib/render/icoFreedraw";

/** One board of the spherical family. */
export interface SphPolyBoard {
	/** The family parameter, 3, 4 or 5. The board id is its decimal string. */
	n: number;
	/** Every k the board ships. All of them are eager — the whole family is 55 kB. */
	ks: number[];
	/** Tilings per k. */
	counts: Record<number, number>;
}

export interface SphPolyPattern {
	/** "sp5-7-00002" — board n, k, index. */
	id: string;
	/**
	 * Vertex orbits under the SOLID's OWN isometry group, measured off the developed geometry by
	 * develop_ai1_sph.py::symmetry_orbits — not taken from the certificate. On this family the two agree
	 * on all 20 records, which is a real cross-check of Marek's k and not a tautology: the measurement
	 * is what separates the rhombicuboctahedron (|G| = 48, one orbit) from J37 (|G| = 16, two), a pair
	 * that agrees on V, E, F and on the vertex figure at every single vertex.
	 */
	k: number;
	/** The certificate's own vertex-orbit count, kept so the two claims stay separable. */
	certK: number;
	/** Board id, the decimal n. */
	base: string;
	/** Board label, "3.4.5.4". */
	family: string;
	/** Vertex figures of the k orbits, joined: "4.5.10 + 3.4.5.4 + 3.4.5.4". */
	config: string;
	/** The solid's name when it has one (derived from census + orbit count, never guessed). */
	solid?: string;
	/** The forced edge arc ρ. */
	edge: number;
	chiral?: boolean;
	/** Unit vectors, one per vertex. */
	vertices: V3[];
	/** Face rings of vertex indices. Mixed arity. */
	faces: number[][];
	/** Polygon size per face (parallel to `faces`) — the fill key. */
	faceSize: number[];
	/** Every edge, as a vertex-index pair. */
	edges: [number, number][];
	/** Certificate vertex-orbit label per vertex. */
	vorbit: number[];
	/** Measured symmetry-orbit label per vertex. */
	symOrbit: number[];
	stats: {
		verts: number;
		edges: number;
		faces: number;
		/** Order of the solid's isometry group, measured. */
		symmetryOrder: number;
		symmetryOrbits: number;
		/** The board's polygon sizes, ascending. */
		sizes: number[];
		/** How many faces of each size. */
		sizeCensus: number[];
		/** Every vertex figure the solid carries, with its multiplicity: [["3.4.5.4", 30], …]. */
		figures: [string, number][];
		/**
		 * Faces whose vertices lie on a GREAT CIRCLE. At n = 3 the hexagon's circumradius is exactly
		 * π/2 and its interior angle exactly π, so one of the three n = 3 solids has a face that is a
		 * hemisphere bounded by six arcs. That is the geometry of the board, not a decode failure.
		 */
		greatCircleFaces: number;
		certOrbits: number;
	};
}

/** The boards shipped today. The whole family is 20 tilings, so there is nothing to shard or defer.
 *
 *  COMPLETE AS SHIPPED, unusually for a Čtrnáct corpus: n = 3, 4, 5 are the only spherical members
 *  (3.4.6.4 is Euclidean and everything above it hyperbolic), and every certificate Marek sent for them
 *  develops. The k holes on n = 5 — nothing at k = 2, 5, 6, 10, 11, … — are the family, not a short
 *  run: `sphPolyKGaps` exists so a surface can say which, and here it is always the former. */
export const SPH_POLY_BOARDS: SphPolyBoard[] = [
	{ n: 3, ks: [1, 2], counts: { 1: 1, 2: 2 } },
	{ n: 4, ks: [1, 2, 3], counts: { 1: 2, 2: 1, 3: 1 } },
	{ n: 5, ks: [1, 3, 4, 7, 8, 9, 12, 14, 17, 27, 29], counts: { 1: 1, 3: 1, 4: 1, 7: 2, 8: 1, 9: 1, 12: 1, 14: 1, 17: 1, 27: 1, 29: 2 } },
];

export const SPH_POLY_BOARD_BY_ID = new Map(SPH_POLY_BOARDS.map((b) => [String(b.n), b]));

/** Board label: the vertex figure the family is defined by. */
export const sphPolyBoardLabel = (id: string): string => `3.4.${id}.4`;

/** The k values missing between a board's lowest and highest — a property of the family here, not a
 *  gap in Marek's run, since these three boards are the complete spherical half. */
export function sphPolyKGaps(b: SphPolyBoard): number[] {
	if (b.ks.length < 2) return [];
	const have = new Set(b.ks);
	const out: number[] = [];
	for (let k = b.ks[0] + 1; k < b.ks[b.ks.length - 1]; k++) if (!have.has(k)) out.push(k);
	return out;
}

export const sphPolyShardUrl = (n: string | number, k: number): string => `/spherical-poly/sp${n}-k${k}.json`;

/** The /play sub-axis key — namespaced against the spherical-freedraw solids, "sps-", "spc-", "spe-". */
export const sphPolySub = (p: SphPolyPattern): string => `spp-${p.base}`;
export const sphPolySubOfBoard = (b: SphPolyBoard): string => `spp-${b.n}`;

/** Card / search label. A named solid says its name; anything else says what it is made of, since
 *  guessing a Johnson number off a census is exactly the mistake the J27/J37 pair punishes. */
export function sphPolyFamilyLabel(p: SphPolyPattern): string {
	if (p.solid) return p.solid;
	const used = p.stats.sizes.filter((_, i) => p.stats.sizeCensus[i] > 0);
	return `${p.stats.faces} faces · ${used.join(" · ")}`;
}
