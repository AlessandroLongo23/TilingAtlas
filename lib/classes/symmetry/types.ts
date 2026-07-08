// Geometry in SymmetryData is FLOAT (render-only). Every value here is derived from an EXACT
// decision in WallpaperSymmetry.ts; nothing downstream re-decides symmetry from these floats.
export type LatticeShape = "square" | "hexagonal" | "rhombic" | "rectangular" | "oblique";

export const WALLPAPER_GROUPS = [
	"p1", "p2", "pm", "pg", "cm", "pmm", "pmg", "pgg", "cmm",
	"p4", "p4m", "p4g", "p3", "p3m1", "p31m", "p6", "p6m",
] as const;
export type WallpaperGroup = (typeof WALLPAPER_GROUPS)[number];

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
	cell: [Vec2, Vec2]; // (T1, T2) as world vectors, anchored at the cell origin
	cellOrigin: Vec2; // where to anchor the cell parallelogram for drawing
}
