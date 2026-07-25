/**
 * Hollow tilings — tilings by SELF-INTERSECTING regular star polygons `{n/d}`.
 *
 * `{5/2}` here is the modern star polygon: 5 vertices, 5 edges that cross each other, and the
 * crossings are NOT vertices. That is a different tile from the concave isotoxal `|n/d|` 2n-gon
 * the `star` and `isotoxal` shelves carry (see `docs/TILE_TAXONOMY.md` §2.1).
 *
 * The space is Grünbaum, Miller & Shephard, *Uniform Tilings with Hollow Tiles* (The Geometric
 * Vein — The Coxeter Festschrift, Springer 1981, 17–64), restated as *Tilings and Patterns* §12.3.
 *
 * Faces overlap by construction: measured along one chord of `{n/d}`, the star's own interior lies
 * on one side for ~76% of the length and the other side for ~24%, so it straddles its own edge and
 * anything glued edge-to-edge along the full chord double-covers a point tip. There is therefore no
 * cell-polygon decomposition for the flat renderer to consume — the face list IS the tiling.
 *
 * Produced by `tools/hollow/` (exact ℤ[ζ₂₄]) and exported by `tools/hollow/export_atlas.py`.
 */

/** One face: the closed path of a `{n/d}` star polygon, `n` vertices in traversal order. */
export interface HollowFace {
	/** Vertex count. */
	n: number;
	/** Step. `d = 1` is an ordinary convex `n`-gon; `d > n/2` is the retrograde traversal. */
	d: number;
	/** The `n` corners as `[x, y]`, in traversal order. Edges are the closed cycle over them. */
	v: [number, number][];
}

/** The geometry payload, fetched from `public/hollow/<id>.json` when a tiling is opened. */
export interface HollowPatch {
	/** Vertex configuration, e.g. `"4.8/3.8/7"`. */
	cfg: string;
	/**
	 * Constant areal density: the total winding number over all faces, which is the same integer at
	 * every point. May be negative (the whole tiling traversed the other way) or zero (positive and
	 * negative winding cancel). Both are proper values for a hollow tiling, not defects.
	 */
	density: number;
	/** Minimum distance between distinct vertices. A tiling's vertex set is discrete; this proves it. */
	separation: number;
	/** Radius out to which every face covering a point is guaranteed present. */
	safeR: number;
	/** Two independent translations `[[x,y],[x,y]]` generating the period lattice, or null if uncertified. */
	lattice: [[number, number], [number, number]] | null;
	faces: HollowFace[];
	/** Distinct tile types present, e.g. `["4", "8/3", "8/7"]`. */
	tiles: string[];
}

/** The shelf-row summary carried on `ReferenceTiling.hollow` (the patch itself is lazy-fetched). */
export interface HollowPattern {
	/** Id of the patch file under `public/hollow/`. */
	patch: string;
	density: number;
	tiles: string[];
	/** True iff a translation lattice was certified, so the renderer may replicate the patch. */
	periodic: boolean;
	/** Grünbaum-Miller-Shephard figure number when this is one of theirs, else null. */
	gms: string | null;
}

/** Display label for a `{n/d}` tile: `"8"` for convex, `"8/3"` for a star or retrograde face. */
export function tileLabel(n: number, d: number): string {
	return d === 1 ? String(n) : `${n}/${d}`;
}

/** True iff this face is traversed retrograde (its corner takes the reflex angle at each vertex). */
export function isRetrograde(n: number, d: number): boolean {
	return d > n / 2;
}

/** True iff this face genuinely self-intersects (a star proper, not a convex polygon either way). */
export function isSelfIntersecting(n: number, d: number): boolean {
	const dd = Math.min(d, n - d);
	return dd >= 2;
}

let cache: Map<string, Promise<HollowPatch>> | null = null;

/** Fetch a patch from `public/hollow/`, memoised per id. */
export function loadHollowPatch(id: string): Promise<HollowPatch> {
	if (!cache) cache = new Map();
	const hit = cache.get(id);
	if (hit) return hit;
	const p = fetch(`/hollow/${id}.json`).then((res) => {
		if (!res.ok) throw new Error(`hollow/${id}.json: HTTP ${res.status}`);
		return res.json() as Promise<HollowPatch>;
	});
	cache.set(id, p);
	return p;
}
