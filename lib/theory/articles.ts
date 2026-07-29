// The theory library: one entry per page under /theory, in two groups. This is the single source of
// truth for both the /theory index (the card grids) and the in-page sidebar nav, so adding a theory
// page is one entry here plus its own /theory/<slug> route.
//
// - Elements: the interactive catalogues of the pieces themselves (prototile shapes, vertex
//   configurations). Their routes are client galleries, not markdown.
// - Articles: the prose background, each route reading public/theory/<md>.
//
// Client-safe: slug + title + blurb only. The markdown filename lives on the server route that reads
// it (public/theory/<file>.md), never imported into the client bundle.

export interface TheoryArticle {
	/** URL slug: the route is /theory/<slug>. */
	slug: string;
	/** Card + sidebar title. */
	title: string;
	/** One-line description for the index card. */
	blurb: string;
}

export const THEORY_ELEMENTS: TheoryArticle[] = [
	{
		slug: "tiles",
		title: "Prototiles",
		blurb: "The individual tile shapes behind the tilings — regular, convex-irregular, star and isotoxal — as one browsable gallery.",
	},
	{
		slug: "configs",
		title: "Vertex configurations",
		blurb: "The configuration alphabet per palette: every realizable way the tiles fan around a single vertex, the layer between a palette and a tiling.",
	},
];

export const THEORY_ARTICLES: TheoryArticle[] = [
	{
		slug: "uniform-tilings",
		title: "The eleven uniform tilings",
		blurb: "The three regular and eight semiregular tilings of the plane, the angle equation that constrains them, and why there are exactly eleven.",
	},
	{
		slug: "freedraw",
		title: "Freedraw: the edges carry the tiling",
		blurb: "Marek Čtrnáct's edge-subset construction: fix a grid, choose which edges are drawn, and let the tiles fall out. Planar grids and all five Platonic solids.",
	},
	{
		slug: "islamic",
		title: "Islamic geometric patterns",
		blurb: "The design systems behind Islamic star patterns: the tessellations underneath, with interactive previews of the curated tilings.",
	},
	{
		slug: "hyperbolic",
		title: "Why the hyperbolic catalogue stops where it does",
		blurb: "The hyperbolic tilings never run out, so the enumeration is bounded by palette, valence and uniformity. What identifies a tiling when its vertex configuration cannot, and where the search hits its limit.",
	},
];

/** The two groups, in display order — what the index grid and the sidebar nav both iterate. */
export const THEORY_GROUPS: { id: string; label: string; items: TheoryArticle[] }[] = [
	{ id: "elements", label: "Elements", items: THEORY_ELEMENTS },
	{ id: "articles", label: "Articles", items: THEORY_ARTICLES },
];

export const theoryArticle = (slug: string): TheoryArticle | undefined =>
	[...THEORY_ELEMENTS, ...THEORY_ARTICLES].find((a) => a.slug === slug);
