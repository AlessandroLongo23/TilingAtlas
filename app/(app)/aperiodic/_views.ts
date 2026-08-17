// The /aperiodic shelf's index. Adding a construction — Wang tiles, another substitution out of the
// encyclopedia — is an entry here plus a component; the client renders whatever this lists, and the
// sidebar groups by `group` in the order the groups first appear.

export type AperiodicViewId =
	| "subrosa"
	| "penrose"
	| "hat"
	| "chair"
	| "sphinx"
	| "half-hex"
	| "pinwheel"
	| "half-hex-3"
	| "multigrid";

/** How the tiling is built — the taxonomy the sidebar groups by. */
export type ConstructionGroup = "Substitution" | "Projection";

export interface AperiodicViewDef {
	id: AperiodicViewId;
	label: string;
	/** One line under the label in the sidebar list. */
	blurb: string;
	group: ConstructionGroup;
}

export const APERIODIC_VIEWS: AperiodicViewDef[] = [
	{
		id: "subrosa",
		label: "Sub Rosa",
		blurb: "2n-fold rhombic, any n",
		group: "Substitution",
	},
	{
		id: "penrose",
		label: "Penrose",
		blurb: "P3 rhombi, by deflation",
		group: "Substitution",
	},
	{
		id: "hat",
		label: "The hat",
		blurb: "the aperiodic monotile",
		group: "Substitution",
	},
	// From the Tilings Encyclopedia. Both are rep-tiles: one prototile that tiles a copy of itself
	// scaled by 2. Unlike the three above they carry no bespoke engine — the rule is data and the
	// inflation is generic (lib/substitution/), so the next encyclopedia entry costs a literal.
	{
		id: "chair",
		label: "Chair",
		blurb: "L-tromino, rep-4",
		group: "Substitution",
	},
	{
		id: "sphinx",
		label: "Sphinx",
		blurb: "hexiamond, rep-4",
		group: "Substitution",
	},
	{
		id: "half-hex",
		label: "Half-hex",
		blurb: "half hexagon, rep-4",
		group: "Substitution",
	},
	{
		id: "pinwheel",
		label: "Pinwheel",
		blurb: "√5, infinite rotations",
		group: "Substitution",
	},
	{
		id: "half-hex-3",
		label: "Half-hex ×3",
		blurb: "random, 2 rules",
		group: "Substitution",
	},
	{
		id: "multigrid",
		label: "Multigrid",
		blurb: "de Bruijn's dual grids",
		group: "Projection",
	},
];

const IDS = new Set<string>(APERIODIC_VIEWS.map((v) => v.id));

export const DEFAULT_VIEW: AperiodicViewId = "subrosa";

export const isViewId = (s: string | null): s is AperiodicViewId => s !== null && IDS.has(s);

/** The groups in the order they first appear above, each with its views. */
export function groupedViews(): { group: ConstructionGroup; views: AperiodicViewDef[] }[] {
	const out: { group: ConstructionGroup; views: AperiodicViewDef[] }[] = [];
	for (const v of APERIODIC_VIEWS) {
		let g = out.find((x) => x.group === v.group);
		if (!g) out.push((g = { group: v.group, views: [] }));
		g.views.push(v);
	}
	return out;
}
