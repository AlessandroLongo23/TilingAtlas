"use client";
import { useEffect, useState } from "react";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { createClient } from "@/lib/supabase/client";
import { fetchCellCodec } from "@/lib/services/cellCodecService";
import { orbitsFromExactSource, type OrbitData } from "@/lib/services/orbitsFromExactSource";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { ringOrderOf } from "@/lib/services/starExactCell";

// Session cache keyed on canonicalKey. null = "no exact cell / gate failed", cached so it is not
// recomputed. Computed ONCE per tiling (on selection change), never per frame.
const cache = new Map<string, OrbitData | null>();

export function useVertexOrbits(tiling: CatalogueTiling | null): OrbitData | null {
	const [data, setData] = useState<OrbitData | null>(tiling ? (cache.get(tiling.canonicalKey) ?? null) : null);
	// A new tiling that needs no fetch (none, or already cached) takes its value during render; an
	// uncached one keeps the previous value until the effect below resolves it.
	const [prevTiling, setPrevTiling] = useState(tiling);
	if (tiling !== prevTiling) {
		setPrevTiling(tiling);
		if (!tiling) setData(null);
		else if (cache.has(tiling.canonicalKey)) setData(cache.get(tiling.canonicalKey) ?? null);
	}
	useEffect(() => {
		if (!tiling) return;
		const k = tiling.canonicalKey;
		if (cache.has(k)) return;
		let alive = true;
		(async () => {
			try {
				// The ring comes from the tiling, not a constant — see useSymmetryData.
				const ring = CyclotomicRing.create(ringOrderOf(tiling));
				setActiveRing(ring);
				if (tiling.exactSource) {
					const result = orbitsFromExactSource(ring, k, tiling.exactSource);
					cache.set(k, result);
					if (alive) setData(result);
					return;
				}
				const codec = await fetchCellCodec(createClient(), k);
				if (!codec) {
					cache.set(k, null);
					if (alive) setData(null);
					return;
				}
				const result = orbitsFromExactSource(ring, k, { kind: "cell", cell: codec });
				cache.set(k, result);
				if (alive) setData(result);
			} catch {
				if (alive) setData(null);
			}
		})();
		return () => {
			alive = false;
		};
	}, [tiling]);
	return data;
}
