// Hyperbolic edge-system tilings (Marek Čtrnáct, 2026-07): the freedraw object moved to H². A pattern
// is a periodic subset of the edges of a hyperbolic uniform tiling, with drawn edges modelled as
// DIGONS inserted into the vertex figure; the tiles are the regions that fall out when base faces are
// merged across UNDRAWN edges. `k` counts VERTEX orbits of the decorated tiling (Marek's "Number of
// vertices"), the same convention his Euclidean edge solvers use.
//
// Decoded and developed by tools/ctrnact-oracle/develop_hyp_edges.py to public/hyperbolic-edges/. A
// record ships the quotient half-edge structure (`darts`) and the forced edge length, NOT baked
// geometry — every render path re-develops from the darts under the live view
// (lib/render/hyperbolicDevelopClient.ts::developEdges), exactly as the plain hyperbolic shelf does.
//
// Unlike planar freedraw there is NO lattice and NO bitmask: H² has no translation lattice, so the
// tiling is the dart structure, and a drawn edge's status is recovered from the polygon sizes
// (drawn[h] ⇔ the polygon on either side of h is a digon), not stored per edge.

import type { Darts } from "@/lib/render/hyperbolicDevelopClient";

/** The base uniform tiling an edge system decorates — the sub-axis, one value per solver family. */
export interface HypEdgesBase {
	/** Stable id used in record ids and the sub-axis key, e.g. "667". */
	id: string;
	/** Display label, e.g. "6.6.7" or "{3,7}". */
	label: string;
	/** k slices eager-loaded on entering the Hyperbolic geometry (small — a few MB total across bases). */
	eagerKs: number[];
	/** k slices loaded on demand when their k row / chip is opened (the dense high-k shards). */
	lazyKs: number[];
}

export interface HypEdgesPattern {
	/** Stable catalogue id, e.g. "he667-5-00012" (base 667, k=5, 12th solution). */
	id: string;
	/** Number of vertex orbits of the decorated tiling. */
	k: number;
	/** Base tiling id (the sub-axis), e.g. "667". */
	base: string;
	/** Base tiling label, e.g. "6.6.7". */
	config: string;
	/** Forced edge length ℓ solving Σ α(pᵢ, ℓ) = 2π for the base tiling. */
	edge: number;
	/** A chiral solution (from an `_o_` certificate file); its mirror image is implied, not listed. */
	chiral?: boolean;
	/** Per-pixel renderability (shipped in the shards already). False = the Dirichlet certificate fails,
	 *  so the client must go straight to the 2D developed renderer. Absent = untried → attempt it. */
	certified?: boolean;
	/** Reference-development tile count — a size hint, not geometry. */
	tiles: number;
	/** Quotient half-edge structure, the sole render input (re-developed under the view). */
	darts: Darts;
	/** Tile / edge census used by the card label and the /library facets. */
	stats: {
		tileOrbits: number;
		/** Merged-tile orbits that closed to a finite polyform. */
		finite: number;
		/** Merged-tile orbits that never closed within the develop cap (unbounded, incl. geodesic bands). */
		unbounded: number;
		/** Base-face count per tile orbit; -1 = unbounded. */
		sizes: number[];
		edgeOrbits: number;
		drawnEdgeOrbits: number;
	};
}

/** The base tilings shipped today. One entry per corpus decoded under public/hyperbolic-edges/. Adding a
 *  solver family is one row here plus one BASES row in develop_hyp_edges.py. `6.6.7` (semiregular) runs
 *  deep; the twelve regular {p,q} bases carry k≤2 (they explode past that — {3,8}/{4,6} already give tens
 *  of thousands of k=2 tilings), enough to make the shelf a real multi-base catalogue.
 *  The per-base eager/lazy k arrays are finalized from the decoded shard sizes (small = eager, big = lazy). */
export const HYP_EDGES_BASES: HypEdgesBase[] = [
	// Depth tracks growth rate: the q=3 / small-q bases barely branch and run deep; the high-valence ones
	// ({3,7} {3,8} {4,5} {4,6} {6,5} {8,4}) explode by k=2–3 and stay shallow. Big tails are lazy.
	{ id: "667", label: "6.6.7", eagerKs: [1, 5, 7, 8, 9], lazyKs: [12, 13] },
	// 6.6.8 (Marek's 2026-07-31 drop). Its census file stops at k=10 with no MAX line, so the board is
	// budget-capped there, not exhausted; k=10 is a further 53,417 tilings (~85 MB) and is omitted.
	{ id: "668", label: "6.6.8", eagerKs: [1, 2, 3, 4, 5, 6], lazyKs: [7, 8, 9] },
	{ id: "37", label: "{3,7}", eagerKs: [1, 2], lazyKs: [] }, // k=3 is 29k tilings (~40 MB) — omitted
	{ id: "38", label: "{3,8}", eagerKs: [1], lazyKs: [] }, // k=2 is 13.5k (~13 MB) — omitted
	{ id: "45", label: "{4,5}", eagerKs: [1, 2], lazyKs: [] },
	{ id: "46", label: "{4,6}", eagerKs: [1], lazyKs: [] }, // k=2 is 56k (~42 MB) — omitted
	{ id: "54", label: "{5,4}", eagerKs: [1, 2, 3], lazyKs: [4] }, // 2,47,576,3562; k=5 is 60k — omitted
	{ id: "55", label: "{5,5}", eagerKs: [1, 2], lazyKs: [] },
	{ id: "64", label: "{6,4}", eagerKs: [1, 2], lazyKs: [3] }, // 16,387,9869 (k=3 ~8 MB)
	{ id: "65", label: "{6,5}", eagerKs: [1], lazyKs: [2] }, // k=2 is 5.8 MB → lazy
	{ id: "73", label: "{7,3}", eagerKs: [1, 2, 3, 4, 5, 6], lazyKs: [7] }, // 2,2,27,31,211,342,3047 (glacial)
	{ id: "74", label: "{7,4}", eagerKs: [1, 2, 3], lazyKs: [] }, // 2,126,542; k=4 is 51k — omitted
	{ id: "83", label: "{8,3}", eagerKs: [1, 2, 3, 4, 5], lazyKs: [6] }, // 4,15,118,607,2137,12514
	{ id: "84", label: "{8,4}", eagerKs: [1, 2], lazyKs: [] }, // k=3 is 50k (~40 MB) — omitted
];

/** Lazy (base, k) shards to fetch when vertex-count `k` comes into view under the Hyperbolic geometry —
 *  the per-base analogue the shelf and /play use to trigger on-demand loads. */
export function hypEdgesLazyShardsForK(k: number): { base: string; k: number }[] {
	return HYP_EDGES_BASES.filter((b) => b.lazyKs.includes(k)).map((b) => ({ base: b.id, k }));
}

export const hypEdgesBaseOf = (p: HypEdgesPattern): string => p.base;

/** Display label for a base id ("73" → "{7,3}"), from HYP_EDGES_BASES; falls back to the id. Keeps the
 *  card family label in the same notation as the /play sub-axis rows (the baked record `config` uses an
 *  ASCII form like "7^3"). */
export function hypEdgesBaseLabel(baseId: string): string {
	return HYP_EDGES_BASES.find((b) => b.id === baseId)?.label ?? baseId;
}

/** The sub-axis key for the /play tree and SUB_ORDER — namespaced so it can't collide with a freedraw
 *  grid or colors sub. "hyp-667". */
export const hypEdgesSub = (p: HypEdgesPattern): string => `hyp-${p.base}`;

/** Card / search label: what the tiles ARE, since there is no vertex configuration to name it by. The
 *  finite tiles are "polyforms" (mixed 6-/7-gons, no single-family noun fits). "3 polyforms + 1
 *  unbounded", "1 polyform". */
export function hypEdgesFamilyLabel(p: HypEdgesPattern): string {
	const { finite, unbounded } = p.stats;
	const parts: string[] = [];
	if (finite) parts.push(`${finite} polyform${finite === 1 ? "" : "s"}`);
	if (unbounded) parts.push(`${unbounded} unbounded`);
	return parts.join(" + ") || "empty";
}
