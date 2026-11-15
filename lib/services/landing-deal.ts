import type { CataloguePatch } from "@/lib/tilings/hyp-developed";
import type { LandingPayload, LandingSpecimen } from "./landing-core";

// The landing page's per-visit picks, dealt in the browser (components/landing/dealt.tsx) from the pools the
// prerendered page ships. Nothing here imports at runtime, so the landing's client bundle stays free of
// landing-core's atlas code.

/** What a deal draws from: the baked pools, and the fixed picks to fall back on if a pool is empty. */
export type LandingPools = Pick<
	LandingPayload,
	| "euclideanPool"
	| "hyperbolicPool"
	| "hyperbolicPatches"
	| "sphericalPool"
	| "play"
	| "hyperbolicPatch"
	| "sphericalSolid"
>;

export interface LandingDeal {
	/** The hero's rotation; the first is on stage at load. */
	heroPool: LandingSpecimen[];
	/** The Catalogue card's 3×3 mosaic. */
	mosaic: LandingSpecimen[];
	/** The Viewer card's interactive patch. */
	play: LandingSpecimen;
	/** The Hyperbolic card's developed patch, and its record, so the card renders without fetching the
	 *  9.9 MB developed catalogue to read one entry. */
	hyperbolicPatch: string | null;
	hyperbolicPatchData: CataloguePatch | null;
	/** The Spherical card's solid. */
	sphericalSolid: string | null;
}

/** Distinct random picks (Fisher–Yates prefix) — rng injectable for tests. */
export function pickDistinct<T>(pool: T[], n: number, rng: () => number = Math.random): T[] {
	const arr = [...pool];
	const take = Math.min(n, arr.length);
	for (let i = 0; i < take; i++) {
		const j = i + Math.floor(rng() * (arr.length - i));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr.slice(0, take);
}

/** One visit's picks. Hero and mosaic pick independently from the same pool; a tiling in both is harmless and rare. */
export function dealLanding(p: LandingPools, rng: () => number = Math.random): LandingDeal {
	const heroPool = pickDistinct(p.euclideanPool, 14, rng);
	const mosaic = pickDistinct(p.euclideanPool, 9, rng);
	const play = pickDistinct(p.euclideanPool, 1, rng)[0] ?? p.play;
	const hyperbolicPatch = pickDistinct(p.hyperbolicPool, 1, rng)[0] ?? p.hyperbolicPatch;
	const sphericalSolid = pickDistinct(p.sphericalPool, 1, rng)[0] ?? p.sphericalSolid;
	return {
		heroPool,
		mosaic,
		play,
		hyperbolicPatch,
		hyperbolicPatchData: (hyperbolicPatch && p.hyperbolicPatches?.[hyperbolicPatch]) || null,
		sphericalSolid,
	};
}
