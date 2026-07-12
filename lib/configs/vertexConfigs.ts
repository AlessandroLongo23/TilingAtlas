// The vertex-configuration ALPHABET of a palette: each entry is one locally-valid vertex figure (a cyclic
// word of corners whose interior angles sum to 360°, from gen_alphabet's enum_configs — the SAME set the
// solver consumes). Emitted by tools/ctrnact-oracle/alphabets/export_vertex_configs.py into
// public/vertex-configs/<name>.json, with the tiles PLACED around the vertex so the page can draw them
// fanned around a point (overlaps visible). These are candidate vertex-figures, NOT tilings.

export type TileKind = "regular" | "convex-isotoxal" | "star";

export interface ConfigPoly {
	kind: TileKind;
	n: number;
	/** Placed tile boundary, unit-edge float [x, y] pairs; the vertex sits at the origin. */
	verts: [number, number][];
}

export interface VertexConfig {
	/** Readable corner word, e.g. "3·4·6·4" or "4*p4·cx8-120.150@0·4*p4·cx8-120.150@0". */
	word: string;
	/** Interior angle (degrees) each corner contributes; sums to 360. */
	corners: number[];
	polys: ConfigPoly[];
}

export interface PaletteConfigs {
	name: string;
	displayName: string;
	D: number;
	/** configs = the count actually shipped, i.e. the overlap-free (realizable) ones; overlapping figures
	 *  are pruned out entirely by the exporter and never reach the app. */
	counts: { tiles: number; classes: number; configs: number };
	comment: string;
	configs: VertexConfig[];
}

// The palettes, in growth order so the alphabet size is visible as you step across them. Each ships only
// its realizable (overlap-free) vertex figures. The full union's raw alphabet is huge but most of it is
// unrealizable, so it ships as its overlap-free remainder like every other palette.
export const CONFIG_PALETTES: { name: string; label: string; blurb: string }[] = [
	{ name: "regular-z24", label: "Regular", blurb: "regular {3,4,6,8,12} only" },
	{ name: "regular-isotoxal-z24", label: "Regular + isotoxal", blurb: "+ convex isotoxal tiles" },
	{ name: "star24", label: "Regular + star", blurb: "+ star (concave isotoxal) tiles" },
	{ name: "isotoxal-star60-z24", label: "Combined (reduced)", blurb: "regular + isotoxal + large-point stars" },
	{ name: "isotoxal-star-z24", label: "Combined (full)", blurb: "regular + isotoxal + all stars" },
];

const cache = new Map<string, PaletteConfigs>();
const inflight = new Map<string, Promise<PaletteConfigs>>();

export async function loadPaletteConfigs(name: string): Promise<PaletteConfigs> {
	const cached = cache.get(name);
	if (cached) return cached;
	const existing = inflight.get(name);
	if (existing) return existing;
	const p = fetch(`/vertex-configs/${name}.json`)
		.then((res) => {
			if (!res.ok) throw new Error(`vertex-configs/${name}.json: HTTP ${res.status}`);
			return res.json() as Promise<PaletteConfigs>;
		})
		.then((data) => {
			cache.set(name, data);
			inflight.delete(name);
			return data;
		})
		.catch((err) => {
			inflight.delete(name);
			throw err;
		});
	inflight.set(name, p);
	return p;
}
