/**
 * The background articles, each beside the explorer it explains: a shelf `/x` reads `/x/about`, and a
 * shelf with several articles reads the rest at `/x/about/<slug>`. The canvas's top-right corner
 * carries the way between explorer and article (components/about-corner-button.tsx), and the article's
 * left margin lists its section's other articles (components/article-index.tsx).
 *
 * A shelf's list may also hold tool pages (galleries, lookups) that sit beside its articles under
 * /x/about with routes of their own; they are listed so the article margin can reach them.
 *
 * Client-safe: titles and file names only. The markdown is read on the server (lib/about/load.ts) from
 * public/theory/<file>.md.
 */
export interface AboutArticle {
	/** URL segment after /about; the section's first article lives at /about itself. */
	slug: string;
	title: string;
	/** One line describing the page. */
	blurb: string;
	/** public/theory/<file>.md; absent for a tool page (a gallery or a lookup) with a route of its own. */
	file?: string;
	/** The page has its own route folder, so the shelf's catch-all article route must not claim it. */
	own?: true;
}

export interface AboutSection {
	/** The explorer's route, which is also its nav link. */
	section: string;
	/** What the corner button's tooltip names: "About <topic>". */
	topic: string;
	articles: AboutArticle[];
}

export const ABOUT: AboutSection[] = [
	{
		section: "/play",
		topic: "the catalogue",
		articles: [
			{
				slug: "geometries",
				title: "Three geometries",
				blurb:
					"Why the same polygons tile a sphere, a plane or a hyperbolic plane depending on how their angles add up at a vertex, and how the catalogue is split.",
				file: "geometries",
			},
			{
				slug: "uniform-tilings",
				title: "The eleven uniform tilings",
				blurb:
					"The three regular and eight semiregular tilings of the plane, the angle equation that constrains them, and why there are exactly eleven.",
				file: "uniform-tilings",
			},
			{
				slug: "k-uniform",
				title: "k-uniform tilings",
				blurb:
					"Tilings by regular polygons with k kinds of vertex: vertex configurations, vertex orbits, and the counts from Krötenheerdt and Chavey to Galebach and Čtrnáct.",
				file: "k-uniform",
			},
			{
				slug: "star-and-isotoxal",
				title: "Star and isotoxal polygons",
				blurb:
					"Tiles that bend inward: star polygons with a free angle, isotoxal polygons, and the tilings that mix them with regular ones.",
				file: "star-and-isotoxal",
			},
			{
				slug: "other-tiles",
				title: "Other tiles",
				blurb:
					"Two sizes of polygon, equilateral polygons, different edge lengths, half polygons, polyforms and topological types: the classes beyond one edge length.",
				file: "other-tiles",
			},
			{
				slug: "polyhedra",
				title: "Polyhedra as tilings of the sphere",
				blurb:
					"Platonic, Archimedean and Johnson solids read as tilings of the sphere, and the non-convex, star and toroidal solids beside them.",
				file: "polyhedra",
			},
			{
				slug: "noble",
				title: "Noble polyhedra",
				blurb:
					"Polyhedra whose faces are all alike and whose vertices are all alike: from Hess and Brückner to the families found in 2026.",
				file: "noble",
			},
			{
				slug: "hyperbolic",
				title: "Why the hyperbolic catalogue stops where it does",
				blurb:
					"The hyperbolic tilings never run out, so the enumeration is bounded by palette, valence and uniformity. What identifies a tiling when its vertex configuration cannot.",
				file: "hyperbolic-enumeration",
			},
			{
				slug: "islamic",
				title: "Islamic geometric patterns",
				blurb:
					"The design systems behind Islamic star patterns: the tessellations underneath, with interactive previews of the curated tilings.",
				file: "islamic-patterns",
			},
			{
				slug: "squared-rectangles",
				title: "Every polyhedron hides a squared rectangle",
				blurb:
					"Brooks, Smith, Stone and Tutte turned a rectangle cut into unequal squares into an electrical circuit, and the circuit into a convex polyhedron. Run backwards over this catalogue's solids.",
				file: "perfect-rectangles",
				// Its four-stage viewer lives at squared-rectangles/pipeline, so the folder is a real one.
				own: true,
			},
			{
				slug: "prototiles",
				title: "Prototiles",
				blurb:
					"The individual tile shapes behind the tilings (regular, convex-irregular, star and isotoxal) as one browsable gallery.",
				own: true,
			},
			{
				slug: "vertex-configurations",
				title: "Vertex configurations",
				blurb:
					"Every realizable way the tiles of a palette fan around a single vertex: the layer between a palette and a tiling.",
				own: true,
			},
			{
				slug: "vertex-lookup",
				title: "Vertex figure lookup",
				blurb:
					"Type a vertex figure such as 3.4.7.4 and get its geometry, its uniform tilings, and every board in the catalogue that carries it.",
				own: true,
			},
		],
	},
	{
		section: "/parquet",
		topic: "parquet deformations",
		articles: [
			{
				slug: "parquet",
				title: "Parquet deformations",
				blurb:
					"One tiling turning into another across the plane, and why changing every edge the same way on both sides never opens a gap.",
				file: "parquet",
			},
		],
	},
	{
		section: "/freedraw",
		topic: "freedraw",
		articles: [
			{
				slug: "freedraw",
				title: "Freedraw: the edges carry the tiling",
				blurb:
					"Marek Čtrnáct's edge-subset construction: fix a grid, choose which edges are drawn, and let the tiles fall out. Planar grids and all five Platonic solids.",
				file: "freedraw",
			},
		],
	},
	{
		section: "/colors",
		topic: "colorings",
		articles: [
			{
				slug: "colors",
				title: "Colorings of the regular grids",
				blurb:
					"Periodic colorings of the square, triangle and hexagon grids, counted by colored vertex classes, and what a coloring's symmetry has to preserve.",
				file: "colors",
			},
		],
	},
	{
		section: "/aperiodic",
		topic: "aperiodic tilings",
		articles: [
			{
				slug: "aperiodic",
				title: "Tilings that never repeat",
				blurb:
					"Substitution: Penrose's rhombs, the hat, the chair, the sphinx and the pinwheel, and how a rule that grows a patch forbids a period.",
				file: "aperiodic",
			},
			{
				slug: "multigrid",
				title: "De Bruijn's multigrid",
				blurb:
					"Five families of parallel lines, and a rhombus for every crossing: the Penrose tiling as a projection, and Sub Rosa's rhombs for any n.",
				file: "multigrid",
			},
		],
	},
	{
		section: "/isohedral",
		topic: "isohedral tilings",
		articles: [
			{
				slug: "isohedral",
				title: "The 93 isohedral types",
				blurb:
					"Tilings whose symmetries carry every tile to every other: Grünbaum and Shephard's classification, its 81 and 93, and Kaplan's Tactile.",
				file: "isohedral",
			},
		],
	},
	{
		section: "/pentagons",
		topic: "pentagon tilings",
		articles: [
			{
				slug: "pentagons",
				title: "The fifteen pentagons",
				blurb:
					"A century of convex pentagons that tile the plane, from Reinhardt in 1918 to Rao's proof in 2017 that the list of fifteen is complete.",
				file: "pentagons",
			},
		],
	},
	{
		section: "/automata",
		topic: "automata",
		articles: [
			{
				slug: "automata",
				title: "Life on a tiling that isn't the square grid",
				blurb:
					"Conway's rule needs a grid before it needs a rule. What is known about Life on hexagons, pentagons and Penrose tilings, and why a B/S string is undetermined when tiles differ in degree.",
				file: "automata",
			},
		],
	},
	{
		section: "/heesch",
		topic: "Heesch numbers",
		articles: [
			{
				slug: "heesch",
				title: "How far a shape gets",
				blurb:
					"Heesch's problem: shapes that cannot tile the plane but can be surrounded, ring after ring, a fixed number of times.",
				file: "heesch",
			},
		],
	},
	{
		section: "/frames",
		topic: "frames",
		articles: [
			{
				slug: "frames",
				title: "Frames",
				blurb:
					"Regions a single tile covers in exactly two ways, with no tile in the same place in both: Craig Knecht's frames and the smallest flips.",
				file: "frames",
			},
		],
	},
];

export const articleHref = (s: AboutSection, a: AboutArticle) =>
	a === s.articles[0] ? `${s.section}/about` : `${s.section}/about/${a.slug}`;

/** The section a path belongs to, and whether it is one of its articles (else the explorer). */
export function aboutAt(pathname: string): { section: AboutSection; reading: boolean } | null {
	const section = ABOUT.find((s) => pathname === s.section || pathname.startsWith(`${s.section}/about`));
	return section ? { section, reading: pathname !== section.section } : null;
}
