"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Canvas } from "@/components/canvas";
import { Sidebar } from "@/components/sidebar";
import { useCatalogueSelection } from "@/lib/hooks/useCatalogueSelection";
import { useSymmetryData } from "@/lib/hooks/useSymmetryData";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { loadReferenceAtlas, referenceToCatalogue } from "@/lib/services/referenceAtlas";
import type { TranslationalCellData } from "@/classes/algorithm/types";

interface PlayClientProps {
	tilings: CatalogueTiling[];
}

export function PlayClient({ tilings }: PlayClientProps) {
	const searchParams = useSearchParams();
	const requestedKey = searchParams.get("tiling");
	const referenceMode = searchParams.get("source") === "reference";
	const canvasWrapRef = useRef<HTMLDivElement | null>(null);
	const [size, setSize] = useState({ w: 0, h: 0 });

	// In reference mode the working list is the oracle atlas (lazy-fetched client-side, mapped to the
	// CatalogueTiling shape), NOT the Supabase catalogue passed from the server.
	const [refList, setRefList] = useState<CatalogueTiling[] | null>(null);
	useEffect(() => {
		if (!referenceMode) return;
		let alive = true;
		loadReferenceAtlas()
			.then((atlas) => alive && setRefList(atlas.map(referenceToCatalogue)))
			.catch(() => alive && setRefList([]));
		return () => {
			alive = false;
		};
	}, [referenceMode]);

	const working = referenceMode ? (refList ?? []) : tilings;

	// Deterministic default (lowest k, then key) so the first paint is stable, not random.
	const sorted = useMemo(
		() => [...working].sort((a, b) => a.k - b.k || (a.canonicalKey < b.canonicalKey ? -1 : 1)),
		[working],
	);

	const { selected, setSelected } = useCatalogueSelection(sorted, requestedKey);

	// Exact wallpaper-symmetry analysis of the selected tiling (fetched cell_codec → analyzeSymmetry),
	// memoized per canonicalKey; drives the two canvas overlays. Null while loading / for tilings with
	// no exact cell.
	const symmetryData = useSymmetryData(selected);

	// useCatalogueSelection seeds selection at mount; in reference mode the list arrives AFTER mount
	// (async fetch), so apply the requested key (or the first entry) once the atlas lands.
	useEffect(() => {
		if (referenceMode && sorted.length > 0 && !selected) {
			setSelected(sorted.find((t) => t.canonicalKey === requestedKey) ?? sorted[0]);
		}
	}, [referenceMode, sorted, selected, requestedKey, setSelected]);

	useEffect(() => {
		const el = canvasWrapRef.current;
		if (!el) return;
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				setSize({ w: Math.floor(width), h: Math.floor(height) });
			}
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	return (
		<div className="flex-1 flex min-h-0 overflow-hidden">
			<Sidebar
				tilings={sorted}
				selected={selected}
				onSelect={setSelected}
				mode={referenceMode ? "reference" : "certified"}
			/>
			<div ref={canvasWrapRef} className="flex-1 min-w-0 relative">
				<Canvas
					width={size.w}
					height={size.h}
					translationalCell={(selected?.renderCell ?? null) as TranslationalCellData | null}
					translationalCellId={selected?.canonicalKey ?? null}
					symmetryData={symmetryData}
					showTilingRuleInput={false}
				/>
			</div>
		</div>
	);
}
