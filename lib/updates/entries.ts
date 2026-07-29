// The update notes: one entry per release, newest first. The single source of truth for the
// "what's new" modal, the /updates page, and the version the app reports.
//
// Written by the release ritual (.claude/skills/release-notes/SKILL.md), never by hand in a hurry.
// Client-safe: plain data, no imports, so both the shell modal and the static page read the same
// array. Same shape of registry as lib/theory/articles.ts.
//
// House rules for `text`, taken from the commit subjects, which already read the way these should:
//   - one line, the concrete number IN the line, no trailing period beyond the sentence's own
//   - **bold** the key noun, nothing else — the modal renders that and only that
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
		version: "1.10.1",
		date: "2026-07-29",
		title: "Theory splits in two",
		commit: "cd8a1b7",
		changes: [
			{
				kind: "changed",
				text: "**Theory** is now two shelves under one tab — Elements for the browsable pieces, Articles for the prose.",
				href: "/theory",
			},
		],
	},
	{
		version: "1.10.0",
		date: "2026-07-29",
		title: "The Schwarz family",
		commit: "1556d96",
		changes: [
			{
				kind: "content",
				text: "**Nine Schwarz boards** — 135,157 edge systems, in all three geometries at once.",
				href: "/freedraw",
			},
			{
				kind: "content",
				text: "**(2,3,4) reruns to k=11** — 842 certificates become 5,974, contiguous from k=3.",
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
				text: "**Deeper patches** — Penrose reaches 143,010 rhombi and the hat 54,289 tiles, both at full frame rate.",
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
				text: "**The {6,3} grid lands** — 36,062 edge systems and 23,977 colorings on the honeycomb.",
				href: "/freedraw",
			},
			{
				kind: "content",
				text: "**Four new hyperbolic colour bases** — {8,3}, {5,4}, {6,4} and {4,5} take the class from 2 to 6.",
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
				text: "**Hollow tilings** join the atlas as a Euclidean tile class — self-intersecting star polygons with open centres.",
				href: "/library?class=hollow",
			},
			{
				kind: "changed",
				text: "**Six entries were one family** — coupled two-parameter families now get a 2-D region pad, and the mixed shelf reads 83.",
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
		title: "The mixed shelf, widened",
		commit: "124fd92",
		changes: [
			{
				kind: "content",
				text: "**41 mixed families were cut short** — widening them to their true limits opens 3,015° of new sweep.",
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
		title: "The decoration axis, and two new constructors",
		commit: "af07c83",
		changes: [
			{
				kind: "feature",
				text: "**Every shelf now says what kind of thing it holds** — tilings, edge systems or colorings, in all three geometries.",
				href: "/library",
			},
			{
				kind: "feature",
				text: "**A live Sub Rosa editor** — substitution tilings with 10-, 14-, 18- and 22-fold symmetry, built by hand.",
				href: "/aperiodic?view=subrosa",
			},
			{
				kind: "feature",
				text: "**De Bruijn multigrids**, with a split view linking each grid to the tiling it generates.",
				href: "/aperiodic?view=multigrid",
			},
			{
				kind: "changed",
				text: "**448 duplicate isotoxal families** were absorbed — 4,690 shipped entries become 4,239 distinct ones.",
				tilings: ["ctrnact-isotoxal-family-k1-01", "ctrnact-isotoxal-family-k1-02"],
			},
		],
	},
	{
		version: "1.5.0",
		date: "2026-07-24",
		title: "The hyperbolic shelf, and colorings",
		commit: "cd0c982",
		changes: [
			{
				kind: "content",
				text: "**28,453 hyperbolic tilings** — every completed sweep box, where the shelf held 59 that morning.",
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
		title: "A front door, and the edges carry the tiling",
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
				text: "**Freedraw joins the atlas** as a tile class — 14,718 patterns where a chosen subset of grid edges makes the tiling.",
				href: "/freedraw",
			},
			{
				kind: "content",
				text: "**Hyperbolic tilings render from a certified Dirichlet domain**, so the disk stays exact at any zoom.",
			},
			{
				kind: "changed",
				text: "**A squared, monochrome design system** across every page — one hairline wall, no stray radii.",
			},
		],
	},
	{
		version: "1.3.0",
		date: "2026-07-20",
		title: "Islamic patterns on the GPU, and the sphere",
		commit: "11044c0",
		changes: [
			{
				kind: "feature",
				text: "**Islamic strapwork** draws on the GPU in four styles — interlace, outline, emboss and zellij two-tone.",
				tilings: ["isl-reg-3.4.6.4", "isl-reg-4.6.12", "isl-4a-488"],
			},
			{
				kind: "content",
				text: "**The spherical shelf reaches 40** — the inscribable Johnson solids up to k=8, plus ten prism and antiprism families.",
				href: "/library?geo=spherical",
			},
			{
				kind: "feature",
				text: "**Theory pages** for the eleven uniform tilings and for Islamic patterns, with tilings you can drive inside the prose.",
				href: "/theory",
			},
			{
				kind: "feature",
				text: "**Geometry is a filter now** — Euclidean, hyperbolic and spherical across the sidebar and the library.",
			},
		],
	},
	{
		version: "1.2.0",
		date: "2026-07-16",
		title: "The hyperbolic plane, and a GPU renderer",
		commit: "9428805",
		changes: [
			{
				kind: "content",
				text: "**Hyperbolic tilings in the Poincaré disk** — 15 uniform tilings, including the chiral snubs.",
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
		title: "The pieces get their own pages",
		commit: "1d4006c",
		changes: [
			{
				kind: "feature",
				text: "**A prototile catalogue and a vertex-configuration page** — the pieces a tiling is made of, browsable on their own.",
				href: "/theory",
			},
			{
				kind: "content",
				text: "**Isotoxal and mixed tile classes** reach the library and /play, k=1 through k=4.",
				tilings: ["ctrnact-isotoxal-family-k1-01", "ctrnact-mixed-family-k1-01"],
			},
			{
				kind: "content",
				text: "**The composable shelf takes k=3** — 905 entries become 1,220.",
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
		title: "Every tiling shows its symmetry",
		commit: "f9053f0",
		changes: [
			{
				kind: "feature",
				text: "**Mirror and glide axes, rotation centres and the fundamental domain** draw over any tiling, computed exactly.",
				tilings: ["t1006", "t1011"],
			},
			{
				kind: "feature",
				text: "**Filter the library by wallpaper group and lattice shape** — all 17 groups, with the Conway orbifold signature beside each name.",
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
