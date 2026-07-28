// The /aperiodic shelf's index. Adding a construction — Wang tiles, another substitution out of the
// encyclopedia — is an entry here plus a component; the client renders whatever this lists, and the
// sidebar groups by `group` in the order the groups first appear.

export type AperiodicViewId = "subrosa" | "penrose" | "hat" | "multigrid";

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
