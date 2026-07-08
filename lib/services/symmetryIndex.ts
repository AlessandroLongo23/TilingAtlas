import type { LatticeShape, WallpaperGroup } from "@/lib/classes/symmetry/types";

// The exact wallpaper-group + Bravais lattice-shape per certified tiling, precomputed in ℤ[ζ₂₄] by
// scripts/precompute-symmetry.ts into the static asset public/symmetry-index.json (keyed by
// canonicalKey). Lazy-fetched once per session and joined into the certified catalogue to power the
// wallpaper-group / lattice-shape library filters. Absent entries ⇒ a tiling with no known symmetry
// (e.g. not yet in the snapshot the index was built from) — such tilings drop out of a symmetry filter.
export interface SymmetryIndexEntry {
	group: WallpaperGroup;
	latticeShape: LatticeShape;
	k: number;
}
export type SymmetryIndex = Record<string, SymmetryIndexEntry>;

let cache: SymmetryIndex | null = null;
let inflight: Promise<SymmetryIndex> | null = null;

export async function loadSymmetryIndex(): Promise<SymmetryIndex> {
	if (cache) return cache;
	if (inflight) return inflight;
	inflight = fetch("/symmetry-index.json")
		.then((res) => {
			if (!res.ok) throw new Error(`symmetry-index.json: HTTP ${res.status}`);
			return res.json() as Promise<SymmetryIndex>;
		})
		.then((data) => {
			cache = data;
			inflight = null;
			return data;
		})
		.catch((err) => {
			inflight = null;
			throw err;
		});
	return inflight;
}
