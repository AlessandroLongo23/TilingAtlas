// The engine-developed hyperbolic catalogue (public/hyperbolic-developed.json.gz, the star tilings in
// hyperbolic-developed-stars.json.gz): its record type and its one loader. The disk itself is drawn by
// the per-pixel walk (lib/render/hyperbolicPerPixelGL.ts).

import type { Darts } from "@/lib/render/hyperbolicDevelopClient";
import type { HypFamily } from "@/lib/render/hypStarFamily";
import { shardBody } from "@/lib/services/atlasCodec";

export type { Darts } from "@/lib/render/hyperbolicDevelopClient";

/**
 * A row of the shipped catalogue: the tiling's quotient half-edge structure and its forced edge length,
 * with NO baked geometry. Every render path works from the darts under the current view, so a baked copy
 * would be dead weight (at ~1000 tilings a 10 MB eager fetch against 0.2 MB for the darts).
 */
export interface CataloguePatch {
	id: string;
	name: string;
	config: string;
	edge: number;
	/** Tiles in the reference development — a size hint for the UI, not geometry. */
	tiles: number;
	darts: Darts;
	/** A star family's free point angle (lib/render/hypStarFamily.ts); `darts` and `edge` are its default. */
	family?: HypFamily;
}

/** Developed geometry, what HyperbolicDeveloper.develop() hands back: Poincaré vertices and the closed
 *  faces over them, under no view (the overlay and the tests read it in world coordinates). */
export interface DevelopedPatch {
	id: string;
	name: string;
	config: string;
	edge: number;
	vertices: [number, number][];
	faces: number[][];
	tiles: number;
	darts?: Darts;
}

const cache = new Map<string, Promise<Record<string, CataloguePatch>>>();

/** A star patch id names a star tile ("hyp-3-8s-8s", "hyp-k2-3-3-4s-8s__3-4s-8s"); nothing else does. */
export const isStarPatchId = (id: string) => /\d+s(?=[-_]|$)/.test(id);

/** One patch by id. The star patches are their own shard (two thirds of the parsed bytes), fetched the
 *  first time a star tiling is opened, so no other hyperbolic view pays for them. */
export function loadDevelopedPatch(id: string): Promise<CataloguePatch | null> {
	const url = isStarPatchId(id) ? "/hyperbolic-developed-stars.json.gz" : "/hyperbolic-developed.json.gz";
	let shard = cache.get(url);
	if (!shard) {
		shard = fetch(url)
			.then((r) => shardBody(r) as Promise<CataloguePatch[]>)
			.then((arr) => Object.fromEntries(arr.map((p) => [p.id, p])));
		cache.set(url, shard);
	}
	return shard.then((m) => m[id] ?? null);
}
