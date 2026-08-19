// The update notes: one entry per release, newest first. The single source of truth for the
// "what's new" modal, the /updates page, and the version the app reports.
//
// Written by the release ritual (.claude/skills/release-notes/SKILL.md), never by hand in a hurry.
// Client-safe: plain data, no imports, so both the shell modal and the static page read the same
// array. Same shape of registry as lib/theory/articles.ts.
//
// House rules for `text`, taken from the commit subjects, which already read the way these should:
//   - one line, the concrete number IN the line, no trailing period beyond the sentence's own
//   - **bold** the key noun, nothing else; the modal renders that and only that
//   - NO em dashes. The "**key noun** — gloss" shape is where they breed; use a colon, a comma, a
//     semicolon, or two sentences. tests/updates.test.ts fails the build over one.
//   - say what a visitor can now do or see; never "improved the experience"
//   - the unlisted /defense route, the ledgers, the solver internals and the thesis never appear
//
// PICTURES ARE NOT OPTIONAL (AL directive, 2026-08-15). This is visual work, and a release that is a
// wall of text gets closed without being read. Every change that adds tilings to the atlas carries
// `tilings` with a few examples, never a gallery: 2 to 4, the maximum the guard allows. Pick them to
// show the RANGE the change covers, one per board or one per end of the k span, not four near-identical
// ones. A change about a page or a control takes `href`, and takes `tilings` too whenever a tiling can
// stand for what it does. Only a change with genuinely nothing to show goes bare.
//   - previews come from any reference-atlas shard, lazy k-shards included: scripts/gen-updates-data.ts
//     reads the lazy ones on demand for ids the eager set cannot answer, so a k=7 example is fair game
//   - the preview renderer draws a EUCLIDEAN translational cell. Hyperbolic and spherical shelves
//     (the half-tile boards, the edge-marked boards) carry no such cell and cannot be previewed yet;
//     those releases stay text-only until a curved preview path exists, and that is a gap, not a style
//   - after editing this file run `pnpm updates:data`, which rebuilds public/updates-cells.json for the
//     newest six releases. The modal reads that asset; the /updates page resolves every release itself
//
// Versions: MINOR = a new capability (page, tile class, editor, geometry). PATCH = more tilings in
// a family that already shipped, fixes, perf, restructuring. See lib/updates/version.ts.
//
// Entries from 2026-07-08 to 2026-07-29 were backfilled on 2026-07-29 from the commit log, and are
// coarser than a live release would be: each covers a day or more of work. `commit` is the sha the
// release is cut at, and it is what scripts/draft-update.mjs uses to bound the next range.

export type ChangeKind = "content" | "feature" | "changed" | "perf" | "fix";

export interface Change {
	kind: ChangeKind;
	/** One line. Inline **bold** on the key noun; no other markup. */
	text: string;
	/**
	 * Bullets under `text`, same markup rules. For a change that carries a short table of numbers —
	 * per-board counts, per-k splits — which reads as a wall inside one sentence. Keep it to a
	 * handful; a change needing more than that is two changes.
	 */
	items?: string[];
	/** Atlas ids to show as clickable previews. Keep to 4 — this is not a gallery. */
	tilings?: string[];
	/** For a change that is a page, not a tiling. */
	href?: string;
}

export interface UpdateEntry {
	/** MAJOR.MINOR.PATCH. */
	version: string;
	/** ISO date, YYYY-MM-DD. */
	date: string;
	/** A few words. Shown as the entry's heading on /updates. */
	title: string;
	/** The commit this release was cut at — the next range starts here. */
	commit: string;
	changes: Change[];
}

/** Newest first. tests/updates.test.ts asserts that ordering, and every id below. */
export const UPDATES: UpdateEntry[] = [
	{
		version: "1.33.0",
		date: "2026-08-19",
		title: "Parametric edge lengths",
		commit: "369d3ab",
		changes: [
			{
				kind: "feature",
				text: "**58 families whose slider is an edge length instead of a corner angle**, so a tile's side can be met by two neighbours at any ratio you set.",
				href: "/library",
				tilings: ["plen-pythagorean", "plen-tri-hex-shutter", "plen-hex", "plen-strip-st"],
			},
			{
				kind: "content",
				text: "**Twenty of the 58 take a single parameter and four take six**, with the vertex-orbit count running from 1 to 8 across the shelf.",
			},
		],
	},
	{
		version: "1.32.0",
		date: "2026-08-19",
		title: "Life on any tiling",
		commit: "6652174",
		changes: [
			{
				kind: "feature",
				text: "**Conway's Life runs on any Euclidean tiling in the catalogue**, on the unbounded plane, at 17 to 77 million cell updates a second.",
				href: "/automata",
				tilings: ["t1005", "t1011", "t1001", "t1006"],
			},
			{
				kind: "feature",
				text: "**All five flat surfaces ship**, which is the complete list: a board is a 2D Euclidean space form, and Gauss-Bonnet rules out the projective plane.",
			},
			{
				kind: "feature",
				text: "**An article on what Life becomes off the square grid**, where a cell can have three neighbours or twelve.",
				href: "/theory/automata",
			},
		],
	},
	{
		version: "1.31.0",
		date: "2026-08-19",
		title: "Image export and the homology class",
		commit: "9e3983b",
		changes: [
			{
				kind: "feature",
				text: "**The camera button exports what you are actually looking at**, at its live zoom, pan and rotation, in place of the fixed 300 by 300 patch it used to save.",
				href: "/play",
				tilings: ["t1005", "t1008"],
			},
			{
				kind: "feature",
				text: "**The homology class is now a dial on the Options tab**, with snap-to-integral, a fundamental-domain overlay and a button that finds the richest class.",
				href: "/play",
			},
		],
	},
	{
		version: "1.30.0",
		date: "2026-08-19",
		title: "Squared rectangles from polyhedra",
		commit: "cc51ab7",
		changes: [
			{
				kind: "feature",
				text: "**667 squared rectangles across 105 solids**, where a polyhedron's skeleton becomes an electrical network and the currents in it are the sides of the squares. Eleven of the 105 square perfectly.",
				href: "/theory/perfect-rectangles",
			},
			{
				kind: "feature",
				text: "**All four steps sit on one screen** on the pipeline page: click an edge and the polyhedron, the embedding, the Smith diagram and the tiling re-solve together.",
				href: "/theory/perfect-rectangles/pipeline",
			},
			{
				kind: "content",
				text: "**On the torus there is no battery edge**, so the choice becomes a direction you drag: 24 records, snapping to the exact integer classes.",
			},
		],
	},
	{
		version: "1.29.0",
		date: "2026-08-18",
		title: "Deformation by basis vectors",
		commit: "bae8824",
		changes: [
			{
				kind: "feature",
				text: "**Drag a tiling's two basis vectors** and the whole plane deforms under any 2 by 2 linear map, live at the frame cap.",
				href: "/play",
				tilings: ["t1006", "tri45x-k2-069"],
			},
			{
				kind: "content",
				text: "**84,424 tilings that ship but were never loaded** now appear in the browse tree, each row showing its real count with a download glyph.",
				href: "/library",
				tilings: ["euhhexv-k4-0001", "planigon-k4-001"],
			},
		],
	},
	{
		version: "1.28.1",
		date: "2026-08-18",
		title: "Smaller shelf files",
		commit: "6bca8a2",
		changes: [
			{
				kind: "perf",
				text: "**The shelf files are 80% smaller**, 210.5 MB down to 42.4 MB, so a page that opens 118 of them stops paying for the wait.",
				href: "/library",
			},
			{
				kind: "perf",
				text: "**Two filter chips were rebuilding the whole corpus to fill themselves**: 47 seconds becomes 3 milliseconds.",
			},
			{
				kind: "perf",
				text: "**Shelf files now carry an hour of browser cache**, so a reload no longer revalidates 118 of them one at a time.",
			},
			{
				kind: "fix",
				text: "**342,693 tilings were invisible in the library.** The Edge patterns and Colorings chips fetched nothing and reported no matches, while the same shelves were fully populated on the play page.",
				href: "/library",
			},
		],
	},
	{
		version: "1.28.0",
		date: "2026-08-18",
		title: "Tilings that are not edge-to-edge",
		commit: "9b56de1",
		changes: [
			{
				kind: "feature",
				text: "**A tile's edge can now be met by two neighbours instead of one**, the T-junction case Marek Čtrnáct pointed out, and it was missing from every shelf whose tiles have an edge as long as two others.",
				href: "/library",
				tilings: ["tri45x-k2-072", "euhtri-k1-0005", "euhsqmid-k1-0002"],
			},
			{
				kind: "content",
				text: "**The 45-45-90 shelf goes from 5,313 tilings to 16,964**, and every one it carried before is still on it.",
				href: "/library",
				tilings: ["tri45a-k2-155", "tri45x-k3-413"],
			},
			{
				kind: "content",
				text: "**The domino tiles the plane 496 ways**, where matching every edge whole allows exactly one: running bond, herringbone and basketweave all need a long side met by two tiles.",
				tilings: ["euhsqmid-k1-0002", "euhhexv-k2-0006"],
			},
			{
				kind: "fix",
				text: "**A fifth of the 45-45-90 shelf was being discarded before it shipped.** That shelf recognised two tilings as the same by comparing a small patch of each, and at 16 tiles per cell a patch that size cannot tell them apart; the comparison is now exact.",
			},
			{
				kind: "fix",
				text: "**Squares on that shelf were filed as triangles**, so picking the square in the polygon filter never found them.",
			},
			{
				kind: "changed",
				text: "**27,362 half-polygon tilings have been withdrawn.** They were real, but they came from a search that could not divide an edge, so the slices holding them counted a subset while reading as a complete enumeration.",
				items: [
					"the halved hexagon now stops at k = 6 and the halved pentagon at k = 9: each board lists only the k it can enumerate with divided edges allowed",
					"nothing else changed shelf: the halved triangle, the second hexagon cut and the domino were already inside their own ceiling",
				],
			},
		],
	},
	{
		version: "1.27.1",
		date: "2026-08-15",
		title: "The mixed shelf reaches k = 4",
		commit: "00949c2",
		changes: [
			{
				kind: "content",
				text: "**700 new mixed-family tilings** take that shelf from 83 entries to 783, with the ceiling now at k = 4.",
				href: "/library",
				tilings: ["ctrnact-mixed-family-k1-03", "ctrnact-mixed-family-k1-05"],
			},
			{
				kind: "content",
				text: "**The scaled shelf holds 43,405 tilings**, out to k = 7.",
				href: "/library",
				tilings: ["d-ctrnact-01_3t-4cs-1", "d-ctrnact-07_3t-2al_2am_2an_2ao_2ap2_4cr3_6bc_6bh_6bm_6br-1"],
			},
			{
				kind: "fix",
				text: "**Five old links work again.** A de-duplication pass had absorbed those families into more general ones without leaving a redirect, so each one opened on nothing.",
			},
		],
	},
	{
		version: "1.27.0",
		date: "2026-08-15",
		title: "Half-tiles in the hyperbolic plane",
		commit: "adc8539",
		changes: [
			{
				kind: "content",
				text: "**23,372 tilings by half a hyperbolic tile**, on six boards, where a regular {p,q} tile is cut in two and both halves tile on their own.",
				items: [
					"{3,7} and {3,8} cut by an altitude; {4,5}, {5,4}, {6,4} and {4,6} cut by a diagonal.",
					"Which boards exist at all is a counting question: a vertex-transitive tiling needs 2q/p diagonal ends at the average vertex, so it has to be a whole number.",
				],
				href: "/library",
			},
		],
	},
	{
		version: "1.26.0",
		date: "2026-08-15",
		title: "Regular polygons cut in half",
		commit: "52e33b1",
		changes: [
			{
				kind: "content",
				text: "**27,728 tilings by half a regular polygon**, cut either across two opposite vertices or across two opposite edge midpoints.",
				items: [
					"Half hexagon on the long diagonal, 27,159 tilings to k = 13.",
					"Half pentagon, 567 tilings to k = 14. A regular pentagon cannot tile the plane; half of one does, at k = 1, and twice over.",
					"Half hexagon on the edge midpoints, and the domino, one tiling each.",
				],
				href: "/library",
				tilings: ["euhhexv-k1-0001", "euhpent-k1-0001", "euhhexm-k2-0001", "euhsqmid-k1-0001"],
			},
			{
				kind: "content",
				text: "**The family is exactly six boards**, and that is settled rather than merely unexplored: the angles force the side count to divide 8, and an edge-parity count empties everything else.",
			},
		],
	},
	{
		version: "1.25.0",
		date: "2026-08-15",
		title: "Half-tiles on the sphere",
		commit: "3ffd2c6",
		changes: [
			{
				kind: "content",
				text: "**Four spherical half-tile boards**: the octahedron, cube, icosahedron and dodecahedron faces cut by an altitude or a diagonal.",
				items: ["16 tilings in total. The sphere runs out of angle budget quickly, so the count is small and complete."],
				href: "/library",
			},
		],
	},
	{
		version: "1.24.0",
		date: "2026-08-15",
		title: "Planigons, 45-45-90 and Penrose",
		commit: "c7e66df",
		changes: [
			{
				kind: "content",
				text: "**10,873 tilings on three new boards** whose tiles have more than one edge length: 1,055 planigon tilings, 5,313 on the 45-45-90 board, 4,505 Penrose kite and dart.",
				href: "/library",
				tilings: ["planigon-k1-001", "tri45-k1-001", "penrose-k1-001"],
			},
			{
				kind: "changed",
				text: "**Each tile set is its own folder** in the library instead of sharing one, so choosing there means choosing a shape.",
				href: "/library",
			},
		],
	},
	{
		version: "1.23.0",
		date: "2026-08-15",
		title: "The period shelf",
		commit: "d2306a8",
		changes: [
			{
				kind: "content",
				text: "**427 parametric families** whose parameter space is solved as you drag, so a slider sweeps the whole family including the shapes where tiles turn concave.",
				href: "/library",
				tilings: ["period-k1-001", "period-k2-044", "period-k2-045"],
			},
			{
				kind: "changed",
				text: "**The slider panel collapses past four rows.** One of these families flexes on 19 angles at once, which turned the overlay into a wall.",
				href: "/play",
			},
		],
	},
	{
		version: "1.22.0",
		date: "2026-08-15",
		title: "Thirty new edge-marked boards",
		commit: "4973a72",
		changes: [
			{
				kind: "content",
				text: "**540,379 edge-marked patterns** on 30 boards that were not there before, across the hyperbolic and spherical shelves.",
				items: [
					"393,527 spherical on 10 boards, 91,410 hyperbolic on 10 boards.",
					"33,800 more hyperbolic polygon patterns on 9 boards, and 21,642 on a new Schwarz board.",
				],
				href: "/library",
			},
			{
				kind: "fix",
				text: "**Curved tiles with a deeply bowed edge draw correctly.** Bending one far enough cut a notch the old triangulation could not see, and it painted outside the tile.",
			},
		],
	},
	{
		version: "1.21.0",
		date: "2026-08-15",
		title: "Error pages that draw a tiling",
		commit: "a6f3573",
		changes: [
			{
				kind: "feature",
				text: "**The error and 404 walls open on a real tiling** instead of a blank page, with a live pick from the atlas replacing the seeded one as soon as it loads.",
			},
		],
	},
	{
		version: "1.20.0",
		date: "2026-08-15",
		title: "Parquet deformation fields",
		commit: "c21956a",
		changes: [
			{
				kind: "feature",
				text: "**The parquet deformation takes a field**, so how far along the evolution a point sits can follow a direction or seeded noise instead of one fixed sweep.",
				href: "/parquet",
			},
			{
				kind: "changed",
				text: "**A seed reproduces a figure exactly**, in the canvas and in the exported SVG alike.",
				href: "/parquet",
			},
		],
	},
	{
		version: "1.19.0",
		date: "2026-08-15",
		title: "Truchet figures on any tiling",
		commit: "c974bc8",
		changes: [
			{
				kind: "feature",
				text: "**Truchet tile figures draw over any tiling**, cutting every edge into thirds and wiring the middle third across the tile.",
				items: [
					"A triangle has 2 wirings, a square 14, a hexagon 132, so a seed picks one and the picture changes with it.",
					"Carlson's multi-scale Truchet construction from Bridges 2018, generalised off the square.",
				],
				href: "/play",
				tilings: ["t1006", "t1011"],
			},
		],
	},
	{
		version: "1.18.0",
		date: "2026-08-15",
		title: "Filter by tile species",
		commit: "8aa215d",
		changes: [
			{
				kind: "feature",
				text: "**The library filters by tile species**, so finding every tiling that uses a pentagram is a choice and not a scroll.",
				href: "/library",
				tilings: ["ctrnact-star-5fold-k1-01", "ctrnact-star-9fold-k1-01"],
			},
			{
				kind: "feature",
				text: "**Each species is drawn at chip size** in the picker, which is quicker to read than its name.",
				href: "/library",
			},
		],
	},
	{
		version: "1.17.0",
		date: "2026-08-15",
		title: "The other hand of a chiral tiling",
		commit: "59c7d20",
		changes: [
			{
				kind: "feature",
				text: "**A chiral tiling can be flipped to its mirror** on /play. The catalogue counts a tiling and its mirror once, so one of the two hands had nowhere to be seen.",
				href: "/play",
				tilings: ["ctrnact-07_34-4o_4u2_5d3_5f-1", "ctrnact-07_34-4r_5d3_5f2_6g-1"],
			},
			{
				kind: "feature",
				text: "**Handedness is a filter** in the library, read off the wallpaper group.",
				href: "/library",
			},
		],
	},
	{
		version: "1.16.1",
		date: "2026-08-09",
		title: "The star shelf reaches k = 9",
		commit: "2511586",
		changes: [
			{
				kind: "content",
				text: "**12,788 new star tilings** take the shelf from 172 to 12,960, with the ceiling now at k = 9.",
				items: [
					"235 at k = 4, 436 at k = 5, 897 at k = 6, 1,728 at k = 7, 3,364 at k = 8, 6,123 at k = 9.",
				],
				href: "/library",
				tilings: [
					"ctrnact-star-k4-n001",
					"ctrnact-star-k6-n0001",
					"ctrnact-star-9fold-k5-n003",
					"ctrnact-star-9fold-k7-n002",
				],
			},
			{
				kind: "feature",
				text: "**Symmetry and vertex orbits** now draw on star tilings: 12,916 of them carry an exact cell, where none did before.",
				href: "/play",
			},
			{
				kind: "content",
				text: "**The nine-fold star family** grows from 11 tilings to 72, across k = 1 to k = 9.",
			},
		],
	},
	{
		version: "1.16.0",
		date: "2026-08-05",
		title: "The twelve isohedral types that live in their marks",
		commit: "afb4610",
		changes: [
			{
				kind: "content",
				text: "**The twelve marked isohedral types** draw now: IH19, IH35, IH48, IH60, IH63, IH65, IH70, IH75, IH80, IH87, IH89 and IH92. The shelf listed all 93 types and drew 81.",
				items: [
					"Every edge of these tiles lies on a mirror of the tiling, which forces the outline to a regular hexagon, a rhombus, a rectangle, a square or a triangle. What separates the types is the motif inside: six marks per tile on IH19, one on IH48, IH80 and IH87.",
				],
				href: "/isohedral",
				tilings: ["isohedral-ih19", "isohedral-ih63", "isohedral-ih89", "isohedral-ih92"],
			},
			{
				kind: "feature",
				text: "**A Marks panel** gives each of the twelve its tile group, wallpaper group and aspect count, and puts the rectangle proportion of IH48, IH60 and IH65 on a slider.",
				href: "/isohedral",
			},
			{
				kind: "fix",
				text: "**Bowing an edge** no longer moves where the inversive lens fades its lines. The lens sized features by segment length, so a straight edge counted as one segment and a curved one as ten, and the thresholds jumped by a decade of zoom the moment a slider left zero.",
				href: "/isohedral",
			},
			{
				kind: "changed",
				text: "**Lines thin** toward the rim of the lens instead of fading out at full width, so a pattern greys through its own texture.",
			},
		],
	},
	{
		version: "1.15.0",
		date: "2026-08-05",
		title: "The inversive view on the isohedral and pentagon families",
		commit: "a521c08",
		changes: [
			{
				kind: "feature",
				text: "**The inversive view** now works on the parametric families: 81 isohedral types and 15 pentagon types, seen through a circle inversion, a Möbius map or a spiral. Press X, or turn it on under View.",
				href: "/isohedral",
			},
			{
				kind: "fix",
				text: "**Curved edges** keep their shape under the lens. A J or S edge bowed with the sliders used to snap back to a straight chord there, while the flat view drew it correctly.",
				href: "/isohedral",
			},
			{
				kind: "fix",
				text: "**Line weight** matches the flat view at the same slider setting. Near the rim of the lens it drew 7 pixels of ink where the flat view drew 2, and thinned to hairlines toward the centre.",
			},
			{
				kind: "fix",
				text: "**Tile colours** survive the lens. The isohedral three colouring, the pentagon unit colours and the polyomino pieces all came out in a single flat colour before.",
				href: "/pentagons",
			},
			{
				kind: "fix",
				text: "**Curves stay smooth** toward the edge of the view, which is where an inversion magnifies most and where their straight segments used to become visible.",
			},
		],
	},
	{
		version: "1.14.1",
		date: "2026-08-05",
		title: "Clearer lines on the hyperbolic disk",
		commit: "5d0853d",
		changes: [
			{
				kind: "fix",
				text: "**Grid lines** hold one contrast from the centre of the disk to the rim. They used to fade into the background about halfway out and read inverted past it, because the disk's shading fell on the tiles and not on the lines over them.",
				href: "/library?geo=hyperbolic",
			},
			{
				kind: "fix",
				text: "**Hyperbolic edge patterns** draw the disk as one smooth gradient, so the base polygons show only when you turn Grid on.",
				href: "/library?geo=hyperbolic",
			},
			{
				kind: "fix",
				text: "**Line thickness** varies continuously along an edge and across the vertices where edges meet, instead of stepping from one edge to the next.",
				href: "/library?geo=hyperbolic",
			},
		],
	},
	{
		version: "1.14.0",
		date: "2026-08-05",
		title: "Eight new boards across three geometries",
		commit: "0012b89",
		changes: [
			{
				kind: "content",
				text: "**Six more isohedral families**: IH05 to IH10, 33,238 edge systems on hexagons you reshape with the sliders.",
				items: [
					"IH10 is the regular hexagon, whose one edge class leaves nothing to dial.",
				],
				href: "/library",
			},
			{
				kind: "content",
				text: "**The octagonal antiprism** joins the spherical edge shelf, carrying 21,558 edge systems on its 3.3.3.8 vertices.",
				href: "/library?geo=spherical",
			},
			{
				kind: "content",
				text: "**The 3.4.13.4 tilings** fill the gap at n = 13, 2,360 of them, the last hole below n = 14.",
				href: "/library?geo=hyperbolic",
			},
			{
				kind: "feature",
				text: "**The library filters by board** now, 93 of them, grouped as the viewer groups them.",
				items: [
					"The pentagon, isohedral and 3.4.n.4 boards had no filter at all before, so their tilings could not be reached from the library.",
				],
				href: "/library",
			},
			{
				kind: "fix",
				text: "**Curved-geometry tilings** open with the controls their renderer actually has, instead of the flat-plane set.",
				href: "/library?geo=hyperbolic",
			},
		],
	},
	{
		version: "1.13.0",
		date: "2026-08-04",
		title: "Edge systems on parametric tiles",
		commit: "5dec644",
		changes: [
			{
				kind: "feature",
				text: "**Edge systems on a parametric pentagon**: 17,993 of them on the Kershner type 1 board, with the five parameters of the family live on sliders.",
				items: [
					"The record carries no geometry at all, so the same decoration redraws at every shape you dial.",
					"Vertex orbits k = 2, 4, 6, 8, 10.",
				],
				href: "/library",
			},
			{
				kind: "feature",
				text: "**Four isohedral edge boards**, IH01 to IH04, carry 48,998 edge systems on tiles whose corners and edge curves you can drag.",
				href: "/library",
			},
			{
				kind: "content",
				text: "**Sixteen spherical edge boards** arrive with 309,061 edge systems, from the triangular prism to the snub cube.",
				items: [
					"The snub cube is the first chiral board on the shelf.",
				],
				href: "/library?geo=spherical",
			},
			{
				kind: "content",
				text: "**Hyperbolic gains two shelves**: 15,017 edge systems on the (6,6,8) board, k = 1 to 9, and 36,945 tilings by 3.4.n.4 polygons over fourteen boards.",
				href: "/library?geo=hyperbolic",
			},
			{
				kind: "feature",
				text: "**A five-level filter** sorts the catalogue by regular, Archimedean, pseudo-Archimedean, combination and hybrid, the classification Marek Čtrnáct uses.",
				href: "/library",
			},
			{
				kind: "content",
				text: "**The isohedral and pentagon pages go fullscreen**, with the prototile drawn above its own sliders and the arrow keys walking the type grid.",
				items: [
					"The five wallpaper-group diagrams that were missing, p1, p2, pg, pm and cm, now draw on the square and hexagonal cells.",
				],
				href: "/isohedral",
			},
			{
				kind: "fix",
				text: "**The (2,3,4) Schwarz board** was missing every tiling that draws its longest edge class: k = 3 goes 5 → 10 and k = 4 goes 2 → 13.",
				href: "/freedraw",
			},
		],
	},
	{
		version: "1.12.0",
		date: "2026-07-31",
		title: "Two new shelves: isohedral and pentagons",
		commit: "49d62ef",
		changes: [
			{
				kind: "feature",
				text: "**The ninety-three isohedral types** get a shelf, IH1 to IH93, with every vertex parameter and edge shape live on a slider.",
				items: [
					"Eighty-one draw from their boundary alone; the twelve that need a marked interior are listed and named.",
				],
				href: "/isohedral",
				tilings: ["isohedral-ih01", "isohedral-ih44", "isohedral-ih84"],
			},
			{
				kind: "feature",
				text: "**The fifteen convex pentagons** that tile the plane, Reinhardt in 1918 through the last type found in 2015, each one a family you can move.",
				items: [
					"Type 1 has five free parameters, Types 14 and 15 have none.",
					"Wikipedia's side condition for Type 15 does not close: the tile needs d = a√(2+√3), about 1.932a, not the 0.966a printed there.",
				],
				href: "/pentagons",
				tilings: ["pentagon-t1", "pentagon-t5", "pentagon-t15"],
			},
			{
				kind: "content",
				text: "**Sixteen cards on the landing wall**, up from twelve, every one drawing real geometry.",
				items: [
					"The Aperiodic card is a live hat patch of 7,921 tiles.",
					"Isohedral and Pentagons replace the last coming-soon placeholders.",
				],
				href: "/",
			},
			{
				kind: "fix",
				text: "**Tile outlines in the aperiodic shelf** are drawn as geometry, so corners meet cleanly instead of biting out at small tile sizes.",
				href: "/aperiodic",
			},
			{
				kind: "content",
				text: "**The 27 hyperbolic Schwarz patterns** render per-pixel in the disk now, like every other hyperbolic shelf.",
				items: [
					"A white pinhole where a drawn edge ran straight through a vertex is gone from every hyperbolic edge shelf.",
				],
				href: "/freedraw",
			},
		],
	},
	{
		version: "1.11.0",
		date: "2026-07-29",
		title: "Corrections to the Schwarz counts",
		commit: "a0e0c39",
		changes: [
			{
				kind: "content",
				text: "**Four Schwarz boards** were re-derived from Marek Čtrnáct's corrected solvers.",
				items: [
					"(2,3,6): 43 → 462 tilings",
					"(2,4,5): 7 → 23",
					"(2,2,3): 2,297 → 2,347",
					"(2,2,4): 65,257, unchanged",
				],
				href: "/freedraw",
			},
			{
				kind: "content",
				text: "Every tiling that **draws the longest edge** of a Schwarz triangle had been missing. The shelf goes 135,157 → 135,636.",
			},
			{
				kind: "fix",
				text: "The **(2,3,6) k=5 slice** is gone: it came from a solver build that has been retired.",
			},
			{
				kind: "feature",
				text: "**Update notes** now say what changed in each release.",
				href: "/updates",
			},
			{
				kind: "changed",
				text: "The **aperiodic tab** shows a hat tile as its icon.",
				href: "/aperiodic",
			},
		],
	},
	{
		version: "1.10.1",
		date: "2026-07-29",
		title: "Theory splits into Elements and Articles",
		commit: "cd8a1b7",
		changes: [
			{
				kind: "changed",
				text: "**Theory** is now two shelves under one tab: Elements for the browsable pieces, Articles for the prose.",
				href: "/theory",
			},
		],
	},
	{
		version: "1.10.0",
		date: "2026-07-29",
		title: "Nine Schwarz boards",
		commit: "1556d96",
		changes: [
			{
				kind: "content",
				text: "**Nine Schwarz boards** carry 135,157 edge systems, in all three geometries at once.",
				href: "/freedraw",
			},
			{
				kind: "content",
				text: "**(2,3,4) reruns to k=11**: 842 certificates become 5,974, contiguous from k=3.",
			},
			{
				kind: "fix",
				text: "The **board picker** now names the gaps in each board's coverage instead of hiding them.",
			},
		],
	},
	{
		version: "1.9.0",
		date: "2026-07-28",
		title: "The aperiodic shelf",
		commit: "f11e349",
		changes: [
			{
				kind: "feature",
				text: "**Penrose, the hat, Sub Rosa and the multigrids** share one page and one set of controls.",
				href: "/aperiodic",
			},
			{
				kind: "perf",
				text: "**Deeper patches**: Penrose reaches 143,010 rhombi and the hat 54,289 tiles, both at full frame rate.",
			},
			{
				kind: "feature",
				text: "The **conformal lens** now accepts every Euclidean tile class, not just the regular ones.",
			},
		],
	},
	{
		version: "1.8.0",
		date: "2026-07-27",
		title: "The hexagonal grid",
		commit: "eaef205",
		changes: [
			{
				kind: "content",
				text: "**The {6,3} grid lands**, with 36,062 edge systems and 23,977 colorings on the honeycomb.",
				href: "/freedraw",
			},
			{
				kind: "content",
				text: "**Four new hyperbolic colour bases**, {8,3}, {5,4}, {6,4} and {4,5}, take the class from 2 to 6.",
				href: "/colors",
			},
			{
				kind: "content",
				text: "**All 14 hollow tilings** are reproduced, where the shelf carried 7.",
			},
			{
				kind: "feature",
				text: "The **landing page** draws live tilings you can pan and zoom, instead of baked thumbnails.",
				href: "/",
			},
		],
	},
	{
		version: "1.7.0",
		date: "2026-07-26",
		title: "Hollow tilings",
		commit: "e43d5b2",
		changes: [
			{
				kind: "content",
				text: "**Hollow tilings** join the atlas as a Euclidean tile class: self-intersecting star polygons with open centres.",
				href: "/library?class=hollow",
			},
			{
				kind: "changed",
				text: "**Six entries were one family**. Coupled two-parameter families now get a 2-D region pad, and the mixed shelf reads 83.",
				tilings: ["ctrnact-mixed-family-k1-01", "ctrnact-mixed-family-k1-02"],
			},
			{
				kind: "perf",
				text: "**Angle drags** hit the display refresh cap in every view, not just the flat one.",
			},
		],
	},
	{
		version: "1.6.1",
		date: "2026-07-25",
		title: "The mixed shelf grows to 83",
		commit: "124fd92",
		changes: [
			{
				kind: "content",
				text: "**41 mixed families were cut short**; widening them to their true limits opens 3,015° of new sweep.",
				tilings: ["ctrnact-mixed-family-k1-01", "ctrnact-mixed-family-k1-03"],
			},
			{
				kind: "content",
				text: "**12 new families** from the 30/150 rhombus take the shelf from 71 to 83.",
			},
			{
				kind: "changed",
				text: "**Families that join** now share one continuous slider instead of appearing as separate entries.",
			},
		],
	},
	{
		version: "1.6.0",
		date: "2026-07-25",
		title: "The decoration axis",
		commit: "af07c83",
		changes: [
			{
				kind: "feature",
				text: "**Every shelf now says what kind of thing it holds**: tilings, edge systems or colorings, in all three geometries.",
				href: "/library",
			},
			{
				kind: "feature",
				text: "**A live Sub Rosa editor** for substitution tilings with 10-, 14-, 18- and 22-fold symmetry, built by hand.",
				href: "/aperiodic?view=subrosa",
			},
			{
				kind: "feature",
				text: "**De Bruijn multigrids**, with a split view linking each grid to the tiling it generates.",
				href: "/aperiodic?view=multigrid",
			},
			{
				kind: "changed",
				text: "**448 duplicate isotoxal families** were absorbed, so 4,690 shipped entries become 4,239 distinct ones.",
				tilings: ["ctrnact-isotoxal-family-k1-01", "ctrnact-isotoxal-family-k1-02"],
			},
		],
	},
	{
		version: "1.5.0",
		date: "2026-07-24",
		title: "Hyperbolic tilings and colorings",
		commit: "cd0c982",
		changes: [
			{
				kind: "content",
				text: "**28,453 hyperbolic tilings**: every completed sweep box, where the shelf held 59 that morning.",
				href: "/library?geo=hyperbolic",
			},
			{
				kind: "content",
				text: "**Colored tilings** become a class of their own: 226,337 of them, over grid and palette size.",
				href: "/colors",
			},
			{
				kind: "feature",
				text: "**Variant families group by default** in the library, and hyperbolic filters take intervals.",
			},
			{
				kind: "feature",
				text: "**Arrow keys** walk the thumbnail grids.",
			},
		],
	},
	{
		version: "1.4.0",
		date: "2026-07-22",
		title: "Freedraw and a new landing page",
		commit: "cf5a501",
		changes: [
			{
				kind: "feature",
				text: "**The landing page** is itself a 4.6.12 tiling, with live counts read from the atlas, not typed in.",
				href: "/",
				tilings: ["t1003"],
			},
			{
				kind: "content",
				text: "**Freedraw joins the atlas** as a tile class: 14,718 patterns where a chosen subset of grid edges makes the tiling.",
				href: "/freedraw",
			},
			{
				kind: "content",
				text: "**Hyperbolic tilings render from a certified Dirichlet domain**, so the disk stays exact at any zoom.",
			},
			{
				kind: "changed",
				text: "**A squared, monochrome design system** across every page: one hairline wall, no stray radii.",
			},
		],
	},
	{
		version: "1.3.0",
		date: "2026-07-20",
		title: "Islamic patterns and the spherical shelf",
		commit: "11044c0",
		changes: [
			{
				kind: "feature",
				text: "**Islamic strapwork** draws on the GPU in four styles: interlace, outline, emboss and zellij two-tone.",
				tilings: ["isl-reg-3.4.6.4", "isl-reg-4.6.12", "isl-4a-488"],
			},
			{
				kind: "content",
				text: "**The spherical shelf reaches 40**, the inscribable Johnson solids up to k=8 plus ten prism and antiprism families.",
				href: "/library?geo=spherical",
			},
			{
				kind: "feature",
				text: "**Theory pages** for the eleven uniform tilings and for Islamic patterns, with tilings you can drive inside the prose.",
				href: "/theory",
			},
			{
				kind: "feature",
				text: "**Geometry is a filter now**: Euclidean, hyperbolic and spherical across the sidebar and the library.",
			},
		],
	},
	{
		version: "1.2.0",
		date: "2026-07-16",
		title: "Hyperbolic tilings and a GPU renderer",
		commit: "9428805",
		changes: [
			{
				kind: "content",
				text: "**Hyperbolic tilings in the Poincaré disk**: 15 uniform ones, including the chiral snubs.",
				href: "/play?tiling=hyp-3-3-3-3-7",
			},
			{
				kind: "perf",
				text: "**The flat view renders on the GPU** by default; panning and zooming stop costing frames.",
			},
			{
				kind: "feature",
				text: "**Vertex orbits** show as coloured dots, and hovering one grows its whole orbit.",
				tilings: ["t1006", "t1007"],
			},
			{
				kind: "feature",
				text: "**Command-drag scrubs** a parametric family's angles straight on the canvas.",
			},
		],
	},
	{
		version: "1.1.0",
		date: "2026-07-12",
		title: "Prototile and vertex-configuration pages",
		commit: "1d4006c",
		changes: [
			{
				kind: "feature",
				text: "**A prototile catalogue and a vertex-configuration page**: the pieces a tiling is made of, browsable on their own.",
				href: "/theory",
			},
			{
				kind: "content",
				text: "**Isotoxal and mixed tile classes** reach the library and /play, k=1 through k=4.",
				tilings: ["ctrnact-isotoxal-family-k1-01", "ctrnact-mixed-family-k1-01"],
			},
			{
				kind: "content",
				text: "**The composable shelf takes k=3**: 905 entries become 1,220.",
				tilings: ["composable-k1-000"],
			},
			{
				kind: "feature",
				text: "**Immersive mode** hides the header and sidebar so the canvas fills the screen.",
			},
		],
	},
	{
		version: "1.0.0",
		date: "2026-07-09",
		title: "Symmetry overlays",
		commit: "f9053f0",
		changes: [
			{
				kind: "feature",
				text: "**Mirror and glide axes, rotation centres and the fundamental domain** draw over any tiling, computed exactly.",
				tilings: ["t1006", "t1011"],
			},
			{
				kind: "feature",
				text: "**Filter the library by wallpaper group and lattice shape**: all 17 groups, with the Conway orbifold signature beside each name.",
				href: "/library",
			},
		],
	},
];

/** The version this build reports. What the modal compares a visitor's stored marker against. */
export const CURRENT_VERSION = UPDATES[0].version;

/** Newest release date, for the landing footer line. */
export const CURRENT_DATE = UPDATES[0].date;

/** Display order for the grouped modal and page. Empty groups are omitted at render time. */
export const KIND_ORDER: ChangeKind[] = ["content", "feature", "changed", "perf", "fix"];

export const KIND_LABEL: Record<ChangeKind, string> = {
	content: "New in the atlas",
	feature: "New features",
	changed: "Changed",
	perf: "Faster",
	fix: "Fixed",
};
