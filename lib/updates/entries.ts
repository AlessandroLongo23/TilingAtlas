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
