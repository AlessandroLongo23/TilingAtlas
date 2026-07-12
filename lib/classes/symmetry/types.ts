// Geometry in SymmetryData is FLOAT (render-only). Every value here is derived from an EXACT
// decision in WallpaperSymmetry.ts; nothing downstream re-decides symmetry from these floats.
export type LatticeShape = "square" | "hexagonal" | "rhombic" | "rectangular" | "oblique";

export const WALLPAPER_GROUPS = [
	"p1", "p2", "pm", "pg", "cm", "pmm", "pmg", "pgg", "cmm",
	"p4", "p4m", "p4g", "p3", "p3m1", "p31m", "p6", "p6m",
] as const;
export type WallpaperGroup = (typeof WALLPAPER_GROUPS)[number];

// Crystallographic realizability: which wallpaper groups can sit on each Bravais lattice shape. A
// group is realizable on a lattice iff its point group is a subgroup of that lattice's holohedry with
// compatible centering — a lattice may carry accidental higher symmetry, so the constraint is one-way
// (lattice ⊇ group), not equality. Consequences: p1/p2 (no point symmetry) fit every lattice; an
// n-fold rotation with n∈{4} pins the square lattice and n∈{3,6} the hexagonal one; primitive mirror
// groups (pm/pg/pmm/pmg/pgg) need a primitive rectangular cell, centred ones (cm/cmm) a rhombic one,
// and a square cell admits both. This is a THEORY table, independent of which tilings are loaded.
// Source: the 2D Bravais holohedry hierarchy (G&S *Tilings and Patterns* §1.3, International Tables).
// Edge note: cm/cmm are also realizable on a hexagonal-metric cell, but by the conventional
// crystal-system assignment centred-mirror groups belong to the rhombic system, so they are listed
// under `rhombic` only — flip them into `hexagonal` here if you want the looser point-group rule.
export const LATTICE_REALIZABLE_GROUPS: Record<LatticeShape, readonly WallpaperGroup[]> = {
	oblique: ["p1", "p2"],
	rectangular: ["p1", "p2", "pm", "pg", "pmm", "pmg", "pgg"],
	rhombic: ["p1", "p2", "cm", "cmm"],
	square: ["p1", "p2", "pm", "pg", "cm", "pmm", "pmg", "pgg", "cmm", "p4", "p4m", "p4g"],
	hexagonal: ["p1", "p2", "p3", "p3m1", "p31m", "p6", "p6m"],
};

/** True iff wallpaper group `group` is crystallographically realizable on lattice `lattice`. */
export function isGroupOnLattice(group: WallpaperGroup, lattice: LatticeShape): boolean {
	return LATTICE_REALIZABLE_GROUPS[lattice].includes(group);
}

// Conway/Thurston orbifold signature per group: digits before * = gyration (cone-point) orders, * =
// mirror boundary, digits after * = corner-reflector orders (mirror intersections), × = glide, o =
// torus. This IS the symmetry inventory read off directly, and it fixes the fundamental-domain shape.
export const ORBIFOLD_SIGNATURE: Record<WallpaperGroup, string> = {
	p1: "o", p2: "2222", pm: "**", pg: "××", cm: "*×",
	pmm: "*2222", pmg: "22*", pgg: "22×", cmm: "2*22",
	p4: "442", p4m: "*442", p4g: "4*2",
	p3: "333", p3m1: "*333", p31m: "3*3",
	p6: "632", p6m: "*632",
};

export interface Vec2 {
	x: number;
	y: number;
}

export interface Axis {
	// A full line in world coordinates: point `p` on the line + unit direction `d`.
	p: Vec2;
	d: Vec2;
	kind: "mirror" | "glide";
}

export interface Center {
	z: Vec2;
	order: 2 | 3 | 4 | 6;
}

export interface SymmetryData {
	group: WallpaperGroup;
	orbifold: string; // Conway orbifold signature of `group` (e.g. "2*22" for cmm)
	latticeShape: LatticeShape;
	pointGroupOrder: number; // |point group| — used to check FD area = cellArea / this
	axes: Axis[];
	centers: Center[];
	fd: Vec2[]; // fundamental-domain polygon, CCW
	// The `pointGroupOrder` fundamental-domain copies tiling the drawn cell (`subdivision[0] === fd`, the
	// emphasized copy). SELF-VERIFIED area-exact; on the rare failure this is just [fd] so the overlay never
	// draws a wrong/partial subdivision.
	subdivision: Vec2[][];
	cell: [Vec2, Vec2]; // lattice basis (T1,T2 reduced) — drives axis line length + cell area, NOT the outline
	cellPolygon: Vec2[]; // the DRAWN cell: Wigner–Seitz cell of the lattice (rectangle/square/hexagon), or the
	// mirror-aligned rhombus for cm/cmm. Centred on the anchor; its union === the subdivision.
	cellOrigin: Vec2; // the FD anchor (cell centre / kaleidoscope point)
}
