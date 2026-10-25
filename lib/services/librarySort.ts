import type { WallpaperGroup } from "@/lib/classes/symmetry/types";
import { polygonSpeciesOf } from "@/lib/services/polygonSpecies";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";
import { vcsOf } from "@/lib/services/vertexConfig";

// The library's sort orders. Each one is a property a researcher compares tilings by; a key no tiling in
// view carries (symmetry under H², ℓ in the plane) is not offered. A tiling WITHOUT the value always goes
// last, whichever the direction, so flipping the order never floods the top of the page with blanks.

export type SortKey = "catalogue" | "k" | "m" | "tiles" | "polygon" | "symmetry" | "edge" | "vertex";
export type SortDir = "asc" | "desc";

/** Order of the point group: how much symmetry a wallpaper group has, p1 = 1 up to p6m = 12. */
const POINT_GROUP_ORDER: Record<WallpaperGroup, number> = {
	p1: 1,
	p2: 2,
	pm: 2,
	pg: 2,
	cm: 2,
	pmm: 4,
	pmg: 4,
	pgg: 4,
	cmm: 4,
	p4: 4,
	p4m: 8,
	p4g: 8,
	p3: 3,
	p3m1: 6,
	p31m: 6,
	p6: 6,
	p6m: 12,
};

/** Distinct vertex configurations: shipped as m on the Euclidean atlas, counted off the figures elsewhere. */
export const distinctConfigsOf = (t: ReferenceTiling) => t.m ?? vcsOf(t)?.length;

const largestPolygon = (t: ReferenceTiling) => {
	let max = 0;
	for (const s of polygonSpeciesOf(t)) {
		const n = parseInt(s, 10);
		if (n > max) max = n;
	}
	return max || undefined;
};

/** Each key's value for a tiling, numeric or textual; undefined when the tiling does not carry it. */
const VALUE: Record<Exclude<SortKey, "catalogue">, (t: ReferenceTiling) => number | string | undefined> = {
	k: (t) => t.k,
	m: distinctConfigsOf,
	tiles: (t) => polygonSpeciesOf(t).length || undefined,
	polygon: largestPolygon,
	symmetry: (t) => (t.wallpaperGroup ? POINT_GROUP_ORDER[t.wallpaperGroup] : undefined),
	edge: (t) => t.edge,
	vertex: (t) => vcsOf(t)?.[0],
};

export const SORT_LABEL: Record<SortKey, string> = {
	catalogue: "Catalogue order",
	k: "Vertex orbits (k)",
	m: "Distinct configurations (m)",
	tiles: "Tile types",
	polygon: "Largest polygon",
	symmetry: "Symmetry order",
	edge: "Edge length ℓ",
	vertex: "Vertex configuration",
};

/** Which direction each key reads best in first: most symmetric and largest first, counts ascending. */
export const SORT_DEFAULT_DIR: Record<SortKey, SortDir> = {
	catalogue: "asc",
	k: "asc",
	m: "asc",
	tiles: "asc",
	polygon: "desc",
	symmetry: "desc",
	edge: "asc",
	vertex: "asc",
};

export const SORT_KEYS = Object.keys(SORT_LABEL) as SortKey[];

/** The keys at least one of these tilings has a value for (catalogue order always). */
export function availableSortKeys(tilings: readonly ReferenceTiling[]): SortKey[] {
	return SORT_KEYS.filter((key) => key === "catalogue" || tilings.some((t) => VALUE[key](t) !== undefined));
}

const cmp = (a: number | string, b: number | string) =>
	typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "en", { numeric: true });

/**
 * Sort a copy of `tilings` by `key`, ties broken by the catalogue order the list arrived in (it is
 * already in that order, and the sort is stable).
 */
export function sortTilings(tilings: readonly ReferenceTiling[], key: SortKey, dir: SortDir): ReferenceTiling[] {
	if (key === "catalogue") return dir === "asc" ? [...tilings] : [...tilings].reverse();
	const value = VALUE[key];
	const sign = dir === "asc" ? 1 : -1;
	const keyed = tilings.map((t) => ({ t, v: value(t) }));
	keyed.sort((a, b) => {
		if (a.v === undefined || b.v === undefined) return a.v === undefined ? (b.v === undefined ? 0 : 1) : -1;
		return sign * cmp(a.v, b.v);
	});
	return keyed.map((x) => x.t);
}
