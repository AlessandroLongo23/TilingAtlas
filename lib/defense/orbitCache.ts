// Vertex orbits for a talk slide, computed once per tiling and kept.
//
// The partition itself comes from the exact cell, the same route /play takes, so a card's orbits are
// the atlas's orbits, not a second opinion. Deriving it is slow enough that recomputing on
// every slide change would show, and the result never changes for a given id, so a module-level map
// is all the caching needed. Failures are cached too: a tiling with no usable exact source will fail
// the same way every time, and retrying it each render would stall the deck.

import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import type { ExactCellSource } from "@/lib/services/cellCodecService";
import { orbitsFromExactSource, type OrbitData } from "@/lib/services/orbitsFromExactSource";

const cache = new Map<string, OrbitData | null>();

export function orbitsFor(id: string, source: ExactCellSource): OrbitData | null {
	const hit = cache.get(id);
	if (hit !== undefined) return hit;
	let result: OrbitData | null = null;
	try {
		const ring = CyclotomicRing.create(24);
		setActiveRing(ring);
		result = orbitsFromExactSource(ring, id, source);
	} catch {
		result = null;
	}
	cache.set(id, result);
	return result;
}
