"use client";
import { useEffect, useState } from "react";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { createClient } from "@/lib/supabase/client";
import { fetchCellCodec, seedFromCell } from "@/lib/services/cellCodecService";
import { analyzeSymmetry } from "@/lib/classes/symmetry/WallpaperSymmetry";
import { symmetryFromExactSource } from "@/lib/services/oracleSymmetry";
import type { SymmetryData } from "@/lib/classes/symmetry/types";
import type { CatalogueTiling } from "@/lib/services/catalogueService";

// Session cache keyed on canonicalKey. A null entry means "no cell_codec / analysis failed" — cached
// so we don't refetch (e.g. reference-mode tilings that carry no exact cell yet). Detection runs ONCE
// per tiling here (on selection change), never per frame.
const cache = new Map<string, SymmetryData | null>();

export function useSymmetryData(tiling: CatalogueTiling | null): SymmetryData | null {
	const [data, setData] = useState<SymmetryData | null>(
		tiling ? cache.get(tiling.canonicalKey) ?? null : null,
	);
	useEffect(() => {
		if (!tiling) {
			setData(null);
			return;
		}
		const key = tiling.canonicalKey;
		if (cache.has(key)) {
			setData(cache.get(key) ?? null);
			return;
		}
		let alive = true;
		(async () => {
			try {
				const ring = CyclotomicRing.create(24);
				setActiveRing(ring);
				// Oracle tilings (Reference shelf) have no Supabase cell_codec; they carry the exact cell
				// inline and are reconstructed locally.
				if (tiling.exactSource) {
					const result = symmetryFromExactSource(ring, key, tiling.exactSource);
					cache.set(key, result);
					if (alive) setData(result);
					return;
				}
				const codec = await fetchCellCodec(createClient(), key);
				if (!codec) {
					cache.set(key, null);
					if (alive) setData(null);
					return;
				}
				const { T1, T2, seed } = seedFromCell(ring, codec);
				const result = analyzeSymmetry(ring, T1, T2, seed);
				cache.set(key, result);
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
