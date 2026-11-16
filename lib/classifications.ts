// Classifications: lists that someone proved complete for one property, pointing at tilings that live on the
// shelves (AL, 2026-11-06). A classification owns no records. Every member keeps its one home shelf (the
// "every tiling appears once" rule), and the classification holds what a filter has no place for: the
// published count, who proved the list complete, and how far the Atlas has checked it. One exception: the
// face-homogeneous tilings above the shelf's k (17 to 54) are on no shelf, and their list file is their home
// (AL, 2026-11-09).
//
// Admission: a named source that proved the list complete (the Atlas's own searches count), or an exact property
// checked on every tiling of a shelf that is complete to some k, with that k in the title. Anything else stays a
// filter.
//
// Members come from a list, a data file a script derives from the atlas and checks against the source
// (scripts/classify-{krotenheerdt,edge-homogeneous,face-homogeneous}.ts). Each member carries its Delaney–Dress
// symbol, the one the Atlas's own homogeneous search found (tools/ctrnact-oracle/homogeneous.py). The file also
// carries the records of the members past the eager base atlas (k ≥ 8), so picking a classification does not pull
// the shards they live in; the page's store keeps one record per id.
import { decodeAtlas, fetchData, shardBody } from "@/lib/services/atlasCodec";
import type { ReferenceTiling } from "@/lib/services/referenceAtlas";
import { hydrateRenderCells } from "@/lib/services/renderCellDerive";

export interface Classification {
	/** URL value: /catalogue?set=<slug> */
	slug: string;
	title: string;
	/** The browse tree's cell it is listed in, "<geometry>|<decoration>": where its members live. */
	cell: string;
	/** Who proved it, in a few words, for the tree's row. */
	by: string;
	/** The property, in one sentence. */
	definition: string;
	/** The work that credits the list, and where to read it: the link `history` places at "{source}". */
	source: { text: string; url: string };
	/** How many tilings the source lists. */
	count: number;
	/** The count's history and its credits, in a sentence or two, with "{source}" where the link goes. */
	history: string;
	/** URL of the member list. */
	list: string;
	/** A part of another classification's list, a row under it in the tree: the parent's slug, and the `part` of the
	 *  members it keeps. */
	of?: { parent: string; part: string };
}

const LISTS: Classification[] = [
	{
		slug: "krotenheerdt",
		title: "Krötenheerdt tilings",
		cell: "euclidean|tilings",
		by: "Krötenheerdt, 1969–1970",
		definition:
			"k-uniform tilings by regular polygons with k different vertex types, so no two vertex orbits look alike.",
		source: {
			text: "Otto Krötenheerdt, Die homogenen Mosaike n-ter Ordnung in der euklidischen Ebene I–III (1969–1970); OEIS A068600",
			url: "https://oeis.org/A068600",
		},
		count: 135,
		history: "Proved complete by {source}. Confirmed in 2026 by the Atlas's own search, which has no bound on k.",
		list: "/classifications/krotenheerdt.json.br",
	},
	{
		slug: "edge-homogeneous",
		title: "Edge-homogeneous tilings",
		cell: "euclidean|tilings",
		by: "Galebach",
		definition:
			"Tilings by regular polygons in which two edges with the same surroundings, the polygons round both of their ends, are always images of each other under a symmetry.",
		source: {
			text: "Brian Galebach, Edge-Homogeneous Tilings",
			url: "http://probabilitysports.com/edgeproof.html",
		},
		count: 203,
		history:
			"Proved complete by exhaustive search in {source}. Confirmed in 2026 by the Atlas's own search, which has no bound on k.",
		list: "/classifications/edge-homogeneous.json.br",
	},
	{
		slug: "strongly-edge-homogeneous",
		title: "Strongly edge-homogeneous tilings",
		cell: "euclidean|tilings",
		by: "Galebach's 203",
		definition:
			"Tilings by regular polygons in which every edge class has its own pair of polygons, the two that share the edge: two edges between the same two kinds of polygon are always images of each other under a symmetry.",
		source: {
			text: "Brian Galebach's 203 edge-homogeneous tilings",
			url: "http://probabilitysports.com/edgeproof.html",
		},
		count: 22,
		history:
			"The property is Darrah Chavey's, from his 1984 thesis, whose list is reported to hold 20. The Atlas found 22 in 2026, all among {source}.",
		list: "/classifications/strongly-edge-homogeneous.json.br",
	},
	{
		slug: "face-homogeneous",
		title: "Face-homogeneous tilings",
		cell: "euclidean|tilings",
		by: "the Atlas, 2026",
		definition:
			"Tilings by regular polygons in which two tiles with the same surroundings, every polygon that shares a corner with the tile, are always images of each other under a symmetry. A surrounding and its mirror image count as the same.",
		source: {
			text: "the Atlas's face-figure search",
			url: "https://github.com/AlessandroLongo23/TilingAtlas/blob/master/tools/ctrnact-oracle/homogeneous.py",
		},
		count: 13144,
		history:
			"The property is Brian Galebach's. Proved complete in 2026 by {source}, a Delaney–Dress search with no bound on k; the largest has k = 54. Filtering every k-uniform tiling to k = 11 finds the same list.",
		list: "/classifications/face-homogeneous.json.br",
	},
	{
		slug: "simple-face-homogeneous",
		title: "Simple-face-homogeneous tilings",
		cell: "euclidean|tilings",
		by: "the Atlas, 2026",
		definition:
			"Tilings by regular polygons in which two tiles with the same neighbours across their sides, the polygons that share a whole edge with the tile, are always images of each other under a symmetry. A surrounding and its mirror image count as the same.",
		source: {
			text: "the Atlas's face-figure search",
			url: "https://github.com/AlessandroLongo23/TilingAtlas/blob/master/tools/ctrnact-oracle/homogeneous.py",
		},
		count: 346,
		history:
			"Proved complete in 2026 by {source}, a Delaney–Dress search with no bound on k; the largest has k = 14. Every one is also face-homogeneous, since two tiles with the same corners have the same sides. Filtering every k-uniform tiling to k = 12 finds the same list.",
		list: "/classifications/simple-face-homogeneous.json.br",
	},
	{
		slug: "equitransitive",
		title: "Equitransitive tilings",
		cell: "euclidean|tilings",
		by: "Debroey and Landuyt, 1981",
		definition:
			"Tilings by regular polygons in which any two tiles of the same kind of polygon are images of each other under a symmetry: one tile class per polygon.",
		source: {
			text: "Ingrid Debroey and Françoise Landuyt, Equitransitive edge-to-edge tilings by regular convex polygons, Geometriae Dedicata 11 (1981) 47–60",
			url: "https://doi.org/10.1007/BF00183189",
		},
		count: 22,
		history:
			"Proved complete by {source}, where Grünbaum and Shephard had conjectured 19. Confirmed in 2026 by the Atlas's own search, which has no bound on k; the largest has k = 4. Every one is also simple-face-homogeneous.",
		list: "/classifications/equitransitive.json.br",
	},
	{
		slug: "amalgamas",
		title: "Amalgamas",
		cell: "euclidean|tilings",
		by: "the Atlas, 2026",
		definition:
			"Tilings by regular polygons, alone or with one kind of isotoxal star, that hold every vertex type those tiles can form in a periodic tiling: every way they meet at a vertex, all in one tiling. A vertex type that never shares a tiling with another is left out.",
		source: {
			text: "the Atlas's searches with the Tiling Searcher",
			url: "https://github.com/AlessandroLongo23/TilingAtlas/tree/master/tools/searcher",
		},
		count: 153,
		history:
			"Each palette's list is complete to its k, by {source}: the regular polygons first at k = 24 (136 to k = 34), with the 12-pointed 60° star at 42 (4 to k = 43), the 12-pointed 30° star at 43 (4 to k = 43), the 6-pointed 30° star at 44 (1 to k = 44, holding the 17 of its 19 vertex types that can share a tiling) and the 12-pointed 90° star at 50 (8 to k = 50). The first ones are p6m, except the 12-pointed 30° star's, which are pmm.",
		list: "/classifications/amalgamas.json.br",
	},
];

/** The amalgamas by palette, a row each under the list. */
const AMALGAMA_PARTS: [part: string, title: string, count: number, history: string][] = [
	[
		"regular",
		"Regular polygons",
		136,
		"Every one to k = 34, by {source}: the first at k = 24, and every one to k = 29 p6m.",
	],
	[
		"a12p60",
		"With the 12-pointed 60° star",
		4,
		"Every one to k = 43, by {source}: two at k = 42 and two at 43, all p6m.",
	],
	[
		"a12p30",
		"With the 12-pointed 30° star",
		4,
		"Every one to k = 43, by {source}: four, all at k = 43 and all pmm, the one palette whose first amalgamas are not p6m.",
	],
	[
		"a6p30",
		"With the 6-pointed 30° star",
		1,
		"Every one to k = 44, by {source}: one, at k = 44, p6m. It holds 17 of the star's 19 vertex types; the other two never share a tiling with another.",
	],
	["a12p90", "With the 12-pointed 90° star", 8, "Every one to k = 50, by {source}: eight, all at k = 50 and p6m."],
];
const amalgamas = LISTS.find((c) => c.slug === "amalgamas")!;

export const CLASSIFICATIONS: Classification[] = [
	...LISTS,
	...AMALGAMA_PARTS.map(([part, title, count, history]) => ({
		...amalgamas,
		slug: `amalgamas-${part}`,
		title,
		count,
		history,
		of: { parent: amalgamas.slug, part },
	})),
];

export const CLASSIFICATION_BY_SLUG = new Map(CLASSIFICATIONS.map((c) => [c.slug, c]));

/** One entry of a member list: the source's own label for the tiling, if it numbers them, and the Atlas tiling it
 *  is, if shipped, with its Delaney–Dress symbol in Delgado-Friedrichs' compressed form. */
export interface ListMember {
	ref?: number;
	/** edge orbits, the parameter Galebach counts along (shown only for a member the Atlas lacks) */
	e?: number;
	/** The part of its list it belongs to (Classification.of), as an amalgama's palette. */
	part?: string;
	id?: string;
	k?: number;
	dsym?: string;
}
interface MemberList {
	members: ListMember[];
	byId: Map<string, ListMember>;
	/** The members on the lazy shards, as records. */
	records: ReferenceTiling[];
}

const lists = new Map<string, MemberList>();
const inflight = new Map<string, Promise<MemberList | null>>();

/** Fetch a classification's members once. Resolves null for an unknown slug. */
export function loadClassification(slug: string): Promise<MemberList | null> {
	const c = CLASSIFICATION_BY_SLUG.get(slug);
	if (!c) return Promise.resolve(null);
	const have = lists.get(slug);
	if (have) return Promise.resolve(have);
	let p = inflight.get(slug);
	if (!p) {
		p = fetchData(c.list)
			.then((res) => {
				if (!res.ok) throw new Error(`${c.list}: HTTP ${res.status}`);
				return shardBody<{ members: ListMember[]; records?: unknown }>(res);
			})
			.then(({ members: all, records }) => {
				const members = c.of ? all.filter((m) => m.part === c.of!.part) : all;
				const l = {
					members,
					byId: new Map(members.flatMap((m) => (m.id ? [[m.id, m] as const] : []))),
					records: records ? hydrateRenderCells(decodeAtlas<ReferenceTiling>(records)) : [],
				};
				lists.set(slug, l);
				return l;
			})
			.finally(() => inflight.delete(slug));
		inflight.set(slug, p);
	}
	return p;
}

/** The members of a classification, once loaded. */
export const classificationList = (slug: string): ListMember[] | undefined => lists.get(slug)?.members;

/** A tiling's entry in a classification, if it belongs. Undefined while the list is not loaded: the filter never
 *  passes a tiling it cannot vouch for. */
export const classificationMember = (slug: string, id: string): ListMember | undefined => lists.get(slug)?.byId.get(id);

/** Whether a tiling belongs. */
export const inClassification = (slug: string, t: { id: string }): boolean => !!classificationMember(slug, t.id);
