// The eleven uniform tilings, by their reference-atlas id.
//
// The atlas stores a compressed `family` per record ("3.4", "3.6"), which is not the vertex configuration
// and is not even unique among these eleven — t1008 and t1009 both read "3.4". The automata picker needs
// them named, and named correctly, because they are the tilings a reader arrives already knowing. The
// pairs are separated by their wallpaper group in the record: cmm/rhombic is the elongated triangular
// tiling, p4g/square the snub square; p6m is the trihexagonal, p6 the snub trihexagonal.

export interface UniformTiling {
	id: string;
	/** Vertex configuration — the identity of the tiling. */
	config: string;
	/** The name it is usually cited under. */
	name: string;
}

export const UNIFORM_TILINGS: UniformTiling[] = [
	{ id: "t1005", config: "4.4.4.4", name: "Square" },
	{ id: "t1011", config: "3.3.3.3.3.3", name: "Triangular" },
	{ id: "t1001", config: "6.6.6", name: "Hexagonal" },
	{ id: "t1007", config: "3.6.3.6", name: "Trihexagonal" },
	{ id: "t1002", config: "4.8.8", name: "Truncated square" },
	{ id: "t1004", config: "3.12.12", name: "Truncated hexagonal" },
	{ id: "t1003", config: "4.6.12", name: "Truncated trihexagonal" },
	{ id: "t1006", config: "3.4.6.4", name: "Rhombitrihexagonal" },
	{ id: "t1009", config: "3.3.4.3.4", name: "Snub square" },
	{ id: "t1008", config: "3.3.3.4.4", name: "Elongated triangular" },
	{ id: "t1010", config: "3.3.3.3.6", name: "Snub trihexagonal" },
];

export const UNIFORM_BY_ID = new Map(UNIFORM_TILINGS.map((t) => [t.id, t]));

/** Open here: on the square grid, B3/S23 IS Conway's Life, which is the anchor everything else varies. */
export const DEFAULT_TILING_ID = "t1005";
