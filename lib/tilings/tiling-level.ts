// Marek Čtrnáct's five levels of increasing complexity for tilings by regular polygons, from his
// `tilings_exploration.txt` §2 ("Classification of hyperbolic tilings"), quoted verbatim:
//
//     Regular            - isohedral and uniform
//     Archimedean        - uniform, but not isohedral, with at least 2 kinds of polygons
//     Pseudo-Archimedean - non-uniform, but 1-Archimedean, with a single vertex configuration
//     Combination        - all vertices have the same combination of polygons, but their exact
//                          configuration varies
//     Hybrid             - vertices with different combinations of polygons exist
//
// So the ladder is a function of the pair (k, m) — k vertex ORBITS, m distinct vertex CONFIGURATIONS,
// m ≤ k, the pair the atlas already carries as `k` and `m` — plus ONE test the pair cannot supply:
// whether those configurations agree as MULTISETS of polygon sizes. That last test is the whole
// Combination/Hybrid boundary. 3.4.7.4 and 3.4.4.7 are two configurations of one combination {3,4,4,7};
// 4.7.14 is a different combination.
//
// WHY THIS IS A CURVED-GEOMETRY AXIS AND NOT A GLOBAL ONE. The ladder is only interesting because the
// EDGE FUNCTION constrains it. Every vertex combination forces its own edge length, so the first four
// levels are automatic: one combination, one length. A hybrid needs two DIFFERENT combinations whose
// edge functions land on the same value, which Marek calls "in general, quite rare, making hybrid
// tilings significant outliers". In E² that rarity evaporates — his own note: "hybrid symbols work even
// in Euclidean plane, where the edge resolves to 0" — so every Euclidean regular-polygon tiling with two
// combinations is trivially "hybrid" and the word carries nothing. The Euclidean catalogue also ships no
// per-orbit configurations (only `m` and `partition`, which already have their own filters), so the axis
// is scoped to the curved shelves by the mathematics and by the data alike.
//
// The named families of hybrid edge identities (the infinite AI1, AI2, AI3 and the finite AF1…AF5) are a
// DIFFERENT axis and are deliberately not modelled here. A level is computed from one tiling's own
// vertices; AI1 names the identity whose board a tiling was enumerated on, and one board hosts several
// levels — 4,751 of the 36,945 AI1 records are not hybrid at all, so nesting the families under "Hybrid"
// would misfile one record in eight. Detail: DEVELOPMENT_NOTES.md §"Marek's five levels".

/** The five levels, ascending in complexity. */
export type TilingLevel = "regular" | "archimedean" | "pseudo-archimedean" | "combination" | "hybrid";

export const TILING_LEVEL_ORDER: TilingLevel[] = [
	"regular",
	"archimedean",
	"pseudo-archimedean",
	"combination",
	"hybrid",
];

export const TILING_LEVEL_LABEL: Record<TilingLevel, string> = {
	regular: "Regular",
	archimedean: "Archimedean",
	"pseudo-archimedean": "Pseudo-Archimedean",
	combination: "Combination",
	hybrid: "Hybrid",
};

/** One sentence per level, in the (k, m, combination) terms the ladder is defined by. */
export const TILING_LEVEL_NOTE: Record<TilingLevel, string> = {
	regular: "Uniform and isohedral: one vertex orbit, one polygon size. The {p,q}.",
	archimedean: "Uniform, with two or more polygon sizes: k = 1.",
	"pseudo-archimedean": "Every vertex has the same configuration, but they fall in several orbits (m = 1, k > 1).",
	combination: "Every vertex has the same combination of polygons; only its cyclic order varies.",
	hybrid: "Combinations that differ as multisets coexist, so two edge functions agree at one length. Rare.",
};

/** Orbit lists arrive joined two ways: " + " on the shelves that list ONE CONFIGURATION PER ORBIT (the
 *  hyperbolic developed catalogue, both AI1 shelves), " / " on the solids, which list the DISTINCT
 *  configurations instead. Which one it is does not matter here, because the level needs only the
 *  distinct set and `k`, and `k` is always taken from the record. */
const ORBIT_SPLIT = /\s*[+/]\s*/;

/** A vertex configuration as a canonical tuple: the smallest rotation of either direction, so "3.4.10.4",
 *  "4.10.4.3" and "4.3.4.10" are one configuration while 3.4.4.10 stays a different one. Returns null
 *  when the string is not a dot-separated list of polygon sizes — a star "n*", an "α" family label, a
 *  freedraw tile count — or when it is a QUOTIENT figure too short to be a vertex (see `sp3-1-00001`,
 *  whose "3.4" is the cuboctahedron's figure modulo a 2-fold site rotation, not its 3.4.3.4 vertex). */
export function canonicalConfig(config: string): number[] | null {
	const parts = config.trim().split(".");
	if (parts.length < 3) return null;
	const a: number[] = [];
	for (const p of parts) {
		if (!/^\d+$/.test(p)) return null;
		const n = Number(p);
		// A digon is a drawn edge in the edge-system encoding, never a tile of a regular-polygon tiling.
		if (n < 3) return null;
		a.push(n);
	}
	const n = a.length;
	let best: number[] | null = null;
	for (const dir of [1, -1]) {
		for (let i = 0; i < n; i++) {
			const rot = Array.from({ length: n }, (_, s) => a[(((i + dir * s) % n) + n) % n]);
			if (best === null || cmpConfig(rot, best) < 0) best = rot;
		}
	}
	return best;
}

function cmpConfig(x: number[], y: number[]): number {
	if (x.length !== y.length) return x.length - y.length;
	for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
	return 0;
}

/** The level, from the tiling's vertex configurations and its orbit count `k`.
 *
 *  `configs` may be one entry per orbit or the deduplicated set; only its DISTINCT entries are used, and
 *  `k` always comes from the record. That is what keeps the solids honest: J37 lists the single
 *  configuration "3.4.4.4" and has k = 2, which is m = 1 < k, the Pseudo-Archimedean case — and J37 is
 *  the textbook member of it, uniform at every vertex yet not vertex-transitive.
 *
 *  Returns null when any entry fails to parse, or when the data contradicts itself with m > k, because a
 *  half-classified tiling is worse than an unclassified one. */
export function tilingLevelOf(configs: string[], k: number): TilingLevel | null {
	if (configs.length === 0 || !Number.isInteger(k) || k < 1) return null;
	const shapes: number[][] = [];
	for (const c of configs) {
		const canon = canonicalConfig(c);
		if (canon === null) return null;
		shapes.push(canon);
	}
	const m = new Set(shapes.map((s) => s.join("."))).size;
	if (m > k) return null;
	// Distinct COMBINATIONS: the configurations as multisets, so cyclic order stops mattering.
	const combos = new Set(shapes.map((s) => [...s].sort((x, y) => x - y).join(".")));
	if (k === 1) {
		// For a tiling by regular polygons, isohedral is one polygon size: the {p,q}.
		return new Set(shapes[0]).size === 1 ? "regular" : "archimedean";
	}
	if (m === 1) return "pseudo-archimedean";
	return combos.size === 1 ? "combination" : "hybrid";
}

/** The catalogue fields the ladder reads. Gating is on the payload FIELD, never on the shape of a label
 *  string: an edge-system record's `family` reads "6.6.7 · 4 tiles", whose first token would parse as a
 *  configuration and would then be classified as a tiling it is not. */
export interface LevelSource {
	k: number;
	family: string;
	/** Hyperbolic developed shelf: `family` is the orbit configurations joined with " + ". */
	developed?: unknown;
	/** The solids: `family` is the distinct configurations joined with " / ". */
	spherical?: unknown;
	/** The AI1 shelves: the configurations live on the payload, since `family` is a display label. */
	hypPoly?: { config: string };
	sphPoly?: { config: string };
	/** The shelves the ladder does NOT describe, listed so they are excluded by name. Their tiles are
	 *  merged polyforms, coloured copies, drawn-edge polyominoes or self-intersecting stars — none of
	 *  which the five levels are defined for. */
	hypEdges?: unknown;
	sphEdges?: unknown;
	hypColors?: unknown;
	sphColors?: unknown;
	freedraw?: unknown;
	colors?: unknown;
	schwarz?: unknown;
	sphericalFreedraw?: unknown;
	hollow?: unknown;
}

/** The vertex configurations to classify from, or null when this record is not a tiling by regular
 *  polygons in a curved geometry. */
export function levelConfigsOf(t: LevelSource): string[] | null {
	if (
		t.hypEdges || t.sphEdges || t.hypColors || t.sphColors ||
		t.freedraw || t.colors || t.schwarz || t.sphericalFreedraw || t.hollow
	) {
		return null;
	}
	if (t.hypPoly) return t.hypPoly.config.split(ORBIT_SPLIT);
	if (t.sphPoly) return t.sphPoly.config.split(ORBIT_SPLIT);
	if (t.developed || t.spherical) return t.family.split(ORBIT_SPLIT);
	return null;
}

/** The level of a catalogue record, or null when the ladder does not describe it. */
export function tilingLevel(t: LevelSource): TilingLevel | null {
	const configs = levelConfigsOf(t);
	return configs === null ? null : tilingLevelOf(configs, t.k);
}
