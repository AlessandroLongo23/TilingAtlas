/**
 * What the browse tree knows about tilings it has NOT loaded.
 *
 * The tree in components/sidebar/catalogue-list-panel.tsx builds its rows by grouping the records it
 * already holds, so a row can only exist once its data does — and the data only loads when its row
 * is clicked. That circularity is why ~84,388 tilings ship and cannot be reached by browsing: scaled
 * k3-k7, regular k8/9/10, euhalf k5-k9 and mixed k3-k4 are all held out of the eager load for their
 * payload, and nothing in the UI can offer them.
 *
 * The manifest breaks it: counts per (tile class, sub-family, k), generated at build time, so a row
 * can be drawn before its records exist and clicking it is what fetches them.
 *
 * DELIBERATELY NARROW. Everything below is a plain count keyed by the same three fields the tree
 * groups on, and `unloadedTiers` is a set difference. Nothing here knows where the numbers came
 * from, so replacing the generated file with a query changes only `loadAtlasManifest`.
 */

import type { TileClass } from "@/lib/services/referenceAtlas";

/** Which loader reaches a tier. `"ctrnact"` is loadReferenceAtlasShard; the rest are loadShelfShard. */
export type TierShelf = "ctrnact" | "scaled" | "euhalf" | "mixed";

export interface ManifestTier {
	cls: TileClass;
	sub: string;
	k: number;
	count: number;
	shelf: TierShelf;
}

export interface AtlasManifest {
	/** Schema version, so a stale file in a viewer's cache is ignored rather than misread. */
	manifest: 1;
	tiers: ManifestTier[];
}

/** A tier the tree should offer but has no records for. `key` is stable and safe as a React key. */
export interface UnloadedTier extends ManifestTier {
	key: string;
}

export const tierKey = (cls: string, sub: string, k: number) => `${cls} ${sub} ${k}`;

let cache: Promise<AtlasManifest | null> | null = null;

/**
 * Fetch the manifest once per session. Resolves to null rather than throwing: a missing manifest
 * must degrade to today's behaviour (rows appear as their data loads), never blank the tree.
 */
export function loadAtlasManifest(): Promise<AtlasManifest | null> {
	if (cache) return cache;
	cache = fetch("/atlas-manifest.json")
		.then((res) => (res.ok ? res.json() : null))
		.then((raw: AtlasManifest | null) => (raw && raw.manifest === 1 ? raw : null))
		.catch(() => null);
	return cache;
}

/**
 * The tiers in the manifest that the loaded records do not already cover.
 *
 * Keyed on (cls, sub, k) rather than on shelf identity because that is what the tree groups by: a
 * tier whose records have arrived under a different route must not reappear as an empty row.
 */
export function unloadedTiers(
	manifest: AtlasManifest | null,
	loaded: Iterable<{ cls: TileClass; sub: string; k: number }>,
): UnloadedTier[] {
	if (!manifest) return [];
	const have = new Set<string>();
	for (const t of loaded) have.add(tierKey(t.cls, t.sub, t.k));
	const out: UnloadedTier[] = [];
	for (const t of manifest.tiers) {
		const key = tierKey(t.cls, t.sub, t.k);
		if (have.has(key)) continue;
		out.push({ ...t, key });
	}
	return out;
}
