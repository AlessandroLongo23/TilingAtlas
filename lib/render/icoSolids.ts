// The Platonic-solid freedraw manifest: which solids carry a spherical-freedraw catalogue, and how many
// patterns each has per k. The per-k counts are LOAD-BEARING — they name the files that exist under
// public/freedraw-ico/ ({id}-k{k}.json), so both the /freedraw spherical arm and the /play catalogue
// loader derive their fetch list from here rather than probing for files. One source of truth: a new
// solid or k lands in this array and both surfaces pick it up.
//
// counts come from the independent enumeration (= Marek Čtrnáct's solver, cross-checked to the unit).

export interface IcoSolidCfg {
	/** Polyhedron id AND the {id}-k{k}.json file prefix. */
	id: string;
	/** Short chip label for the /freedraw solid picker ("tetra"). */
	label: string;
	/** Full display name for the /play catalogue sub-level ("Tetrahedron"). */
	name: string;
	schlafli: string;
	/** Pattern count per k; its keys ARE the k values that have a shard file. */
	counts: Record<number, number>;
}

export const ICO_SOLIDS: IcoSolidCfg[] = [
	{ id: "tetrahedron", label: "tetra", name: "Tetrahedron", schlafli: "{3,3}", counts: { 1: 3, 2: 2 } },
	{ id: "octahedron", label: "octa", name: "Octahedron", schlafli: "{3,4}", counts: { 1: 5, 2: 8, 3: 15, 4: 12, 5: 2, 6: 7 } },
	{ id: "cube", label: "cube", name: "Cube", schlafli: "{4,3}", counts: { 1: 4, 2: 5, 3: 4, 4: 3, 6: 1 } },
	{
		id: "dodecahedron",
		label: "dodeca",
		name: "Dodecahedron",
		schlafli: "{5,3}",
		counts: { 1: 2, 2: 5, 3: 7, 4: 15, 5: 7, 6: 26, 7: 51, 8: 10, 10: 236, 12: 472 },
	},
	{
		id: "icosahedron",
		label: "icosa",
		name: "Icosahedron",
		schlafli: "{3,5}",
		counts: { 1: 5, 2: 39, 3: 61, 4: 257, 5: 257, 6: 6727, 8: 11304 },
	},
];

/** A solid's available k values, ascending. */
export const icoSolidKs = (s: IcoSolidCfg): number[] =>
	Object.keys(s.counts).map(Number).sort((a, b) => a - b);

export const ICO_SOLID_BY_ID = new Map(ICO_SOLIDS.map((s) => [s.id, s]));
