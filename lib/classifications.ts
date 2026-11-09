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
}

export const CLASSIFICATIONS: Classification[] = [
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
];

export const CLASSIFICATION_BY_SLUG = new Map(CLASSIFICATIONS.map((c) => [c.slug, c]));

/** One entry of a member list: the source's own label for the tiling, if it numbers them, and the Atlas tiling it
 *  is, if shipped, with its Delaney–Dress symbol in Delgado-Friedrichs' compressed form. */
export interface ListMember {
	ref?: number;
	/** edge orbits, the parameter Galebach counts along */
	e: number;
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
			.then(({ members, records }) => {
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
