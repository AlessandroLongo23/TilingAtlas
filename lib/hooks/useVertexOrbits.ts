"use client";
import { useEffect, useState } from "react";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { createClient } from "@/lib/supabase/client";
import { fetchCellCodec } from "@/lib/services/cellCodecService";
import { orbitsFromExactSource, type OrbitData } from "@/lib/services/orbitsFromExactSource";
import type { CatalogueTiling } from "@/lib/services/catalogueService";

// Session cache keyed on canonicalKey. null = "no exact cell / gate failed", cached so it is not
// recomputed. Computed ONCE per tiling (on selection change), never per frame.
const cache = new Map<string, OrbitData | null>();

export function useVertexOrbits(tiling: CatalogueTiling | null): OrbitData | null {
  const [data, setData] = useState<OrbitData | null>(
    tiling ? cache.get(tiling.canonicalKey) ?? null : null,
  );
  useEffect(() => {
    if (!tiling) {
      setData(null);
      return;
    }
    const k = tiling.canonicalKey;
    if (cache.has(k)) {
      setData(cache.get(k) ?? null);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const ring = CyclotomicRing.create(24);
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
