// The theory library: one entry per background article under /theory. This is the single source of
// truth for both the /theory index (the card grid) and the in-article sidebar nav, so adding a new
// theory page is one entry here plus its own /theory/<slug> route reading public/theory/<md>.
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

export const theoryArticle = (slug: string): TheoryArticle | undefined =>
	THEORY_ARTICLES.find((a) => a.slug === slug);
