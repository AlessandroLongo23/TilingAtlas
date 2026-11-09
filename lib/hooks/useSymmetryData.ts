"use client";
import { useEffect, useState } from "react";
import { CyclotomicRing, setActiveRing } from "@/classes/Cyclotomic";
import { fetchCellCodec, seedFromCell, type ExactCellSource } from "@/lib/services/cellCodecService";
import { analyzeSymmetry } from "@/lib/classes/symmetry/WallpaperSymmetry";
import type { SymmetryData } from "@/lib/classes/symmetry/types";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { ringOrderOf } from "@/lib/services/starExactCell";

// Session cache keyed on canonicalKey. A null entry means "no cell_codec / analysis failed" — cached
// so we don't refetch (e.g. reference-mode tilings that carry no exact cell yet). Detection runs ONCE
// per tiling here (on selection change), never per frame.
const cache = new Map<string, SymmetryData | null>();

// A tiling with an inline exact cell is analysed in a worker (symmetry.worker.ts): 2 s on the 596 polygons of a
// k = 48 face-homogeneous tiling. One job at a time: a new selection ends the job before it, which rejects, so the
// tiling left behind is not cached as having no symmetry.
let worker: Worker | null = null;
let pending: { id: number; done: (r: SymmetryData | null) => void; fail: (e: Error) => void } | null = null;
let jobId = 0;
function analyseInWorker(N: number, key: string, source: ExactCellSource): Promise<SymmetryData | null> {
	if (pending) {
		worker?.terminate();
		worker = null;
		pending.fail(new Error("superseded"));
	}
	if (!worker) {
		const w = new Worker(new URL("../services/symmetry.worker.ts", import.meta.url), { type: "module" });
		w.onmessage = (e: MessageEvent<{ id: number; result: SymmetryData | null }>) => {
			if (pending?.id !== e.data.id) return;
			pending.done(e.data.result);
			pending = null;
		};
		w.onerror = () => {
			pending?.fail(new Error("symmetry worker failed"));
			pending = null;
			worker = null;
		};
		worker = w;
	}
	const id = ++jobId;
	const w = worker;
	return new Promise((done, fail) => {
		pending = { id, done, fail };
		w.postMessage({ id, N, key, source });
	});
}

export function useSymmetryData(tiling: CatalogueTiling | null): SymmetryData | null {
	const [data, setData] = useState<SymmetryData | null>(tiling ? (cache.get(tiling.canonicalKey) ?? null) : null);
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
		const key = tiling.canonicalKey;
		if (cache.has(key)) return;
		let alive = true;
		(async () => {
			try {
				// The ring comes from the tiling, not a constant: out-of-ring 9-fold tilings live in
				// ZZ[zeta_18] and 5-fold in ZZ[zeta_20], and their tiles are not expressible at N=24.
				const N = ringOrderOf(tiling);
				// Oracle tilings (Reference shelf) have no Supabase cell_codec; they carry the exact cell
				// inline and are reconstructed locally.
				if (tiling.exactSource) {
					const result = await analyseInWorker(N, key, tiling.exactSource);
					cache.set(key, result);
					if (alive) setData(result);
					return;
				}
				const ring = CyclotomicRing.create(N);
				setActiveRing(ring);
				// Imported here, not at the top: only a tiling without an inline exact cell reaches Supabase, and
				// a static import put the Supabase client on every page that shows symmetry.
				const { createClient } = await import("@/lib/supabase/client");
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
