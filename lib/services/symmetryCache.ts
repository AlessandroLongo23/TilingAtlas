// Wallpaper-symmetry analysis for an embedded preview, computed once per tiling and kept.
//
// The analysis comes from the exact cell, the same route /play takes (useSymmetryData), so a card's
// fundamental domain is the atlas's fundamental domain rather than a second opinion. Deriving it runs
// exact cyclotomic arithmetic and is slow enough to notice, and the result never changes for a given
// id, so a module-level map is all the caching needed. Failures are cached too: a tiling whose exact
// source will not reconstruct fails the same way every time, and retrying on every toggle would stall
// the page. The sibling of lib/defense/orbitCache.ts, in services because both /theory and the deck
// use it.

import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import type { ExactCellSource } from "@/lib/services/cellCodecService";
import { symmetryFromExactSource } from "@/lib/services/oracleSymmetry";
import type { SymmetryData } from "@/lib/classes/symmetry/types";

const cache = new Map<string, SymmetryData | null>();

export function symmetryFor(id: string, source: ExactCellSource): SymmetryData | null {
	const hit = cache.get(id);
	if (hit !== undefined) return hit;
	let result: SymmetryData | null = null;
	try {
		const ring = CyclotomicRing.create(24);
		setActiveRing(ring);
		result = symmetryFromExactSource(ring, id, source);
	} catch {
		result = null;
	}
	cache.set(id, result);
	return result;
}
