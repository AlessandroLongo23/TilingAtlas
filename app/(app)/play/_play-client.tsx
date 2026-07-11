"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Canvas } from "@/components/canvas";
import { Sidebar } from "@/components/sidebar";
import { useCatalogueSelection } from "@/lib/hooks/useCatalogueSelection";
import { useSymmetryData } from "@/lib/hooks/useSymmetryData";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { loadReferenceAtlas, referenceToCatalogue } from "@/lib/services/referenceAtlas";
import { evaluateParamCell } from "@/lib/utils/paramCell";
import type { TranslationalCellData } from "@/classes/algorithm/types";

interface PlayClientProps {
	tilings: CatalogueTiling[];
}

export function PlayClient({ tilings }: PlayClientProps) {
	const searchParams = useSearchParams();
	const requestedKey = searchParams.get("tiling");
	const canvasWrapRef = useRef<HTMLDivElement | null>(null);
	const [size, setSize] = useState({ w: 0, h: 0 });

	// The working list is ALWAYS the oracle atlas (lazy-fetched client-side, mapped to the
	// CatalogueTiling shape) — /play browses every tiling however you arrive (direct nav or a library
	// click). The Supabase certified catalogue is only a fallback while the atlas loads; it is
	// currently empty (the certified/reference split was retired, the library is unified).
	const [refList, setRefList] = useState<CatalogueTiling[] | null>(null);
	useEffect(() => {
		let alive = true;
		loadReferenceAtlas()
			.then((atlas) => alive && setRefList(atlas.map(referenceToCatalogue)))
			.catch(() => alive && setRefList([]));
		return () => {
			alive = false;
		};
	}, []);

	const working = refList ?? tilings;

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

	// One-parameter (free-alpha) family entries carry a proven parametric cell: alpha becomes a live
	// slider and the rendered cell is re-evaluated at the slider position (evaluateParamCell — real
	// tilings at every alpha, the formal closure is alpha-independent). Alpha resets to the family's
	// default whenever the selection changes.
	const paramCell = selected?.paramCell;
	const [alphaDeg, setAlphaDeg] = useState<number | null>(null);
	useEffect(() => {
		setAlphaDeg(paramCell ? paramCell.params[0].defaultAlphaDeg : null);
	}, [selected?.canonicalKey, paramCell]);
	const paramInfo = paramCell ? paramCell.params[0] : null;
	const effAlpha = paramInfo ? (alphaDeg ?? paramInfo.defaultAlphaDeg) : null;
	const liveCell = useMemo(() => {
		if (!paramCell || effAlpha === null) return null;
		return evaluateParamCell(paramCell, effAlpha);
	}, [paramCell, effAlpha]);

	// useCatalogueSelection seeds selection at mount; the atlas list arrives AFTER mount (async fetch),
	// so apply the requested key (or the first entry) once the atlas lands.
	useEffect(() => {
		if (sorted.length > 0 && !selected) {
			setSelected(sorted.find((t) => t.canonicalKey === requestedKey) ?? sorted[0]);
		}
	}, [sorted, selected, requestedKey, setSelected]);

	// Jump to a uniformly random tiling from the full atlas, excluding the current one so the view
	// always visibly changes. No-op with fewer than two tilings. Client-only, so Math.random is fine.
	const selectRandom = useCallback(() => {
		const pool = selected
			? sorted.filter((t) => t.canonicalKey !== selected.canonicalKey)
			: sorted;
		if (pool.length === 0) return;
		setSelected(pool[Math.floor(Math.random() * pool.length)]);
	}, [sorted, selected, setSelected]);

	// "R" reshuffles — but not while typing in a field or dragging a control with a modifier held.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "r" && e.key !== "R") return;
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			const el = e.target as HTMLElement | null;
			if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
			e.preventDefault();
			selectRandom();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [selectRandom]);

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
				onRandom={selectRandom}
				mode={refList ? "reference" : "certified"}
			/>
			<div ref={canvasWrapRef} className="flex-1 min-w-0 relative">
				<Canvas
					width={size.w}
					height={size.h}
					translationalCell={
						(liveCell ?? selected?.renderCell ?? null) as TranslationalCellData | null
					}
					translationalCellId={
						selected
							? liveCell
								? `${selected.canonicalKey}@a=${effAlpha?.toFixed(2)}`
								: selected.canonicalKey
							: null
					}
					symmetryData={symmetryData}
					showTilingRuleInput={false}
				/>
				{paramInfo && effAlpha !== null ? (
					<div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-lg border border-line bg-surface-overlay/80 px-4 py-2.5 backdrop-blur-sm shadow-lg">
						<span className="text-xs font-medium text-violet-400 whitespace-nowrap">
							α = {effAlpha.toFixed(1)}°
						</span>
						<input
							type="range"
							min={paramInfo.alpha0Deg + paramInfo.deltaRangeDeg[0]}
							max={paramInfo.alpha0Deg + paramInfo.deltaRangeDeg[1]}
							step={0.1}
							value={effAlpha}
							onChange={(e) => setAlphaDeg(Number(e.target.value))}
							className="w-56 accent-violet-400"
							aria-label="family parameter alpha (degrees)"
						/>
						<span className="text-[10px] text-fg-disabled whitespace-nowrap font-mono">
							({paramInfo.alphaRangeDegOpen[0].toFixed(0)}°, {paramInfo.alphaRangeDegOpen[1].toFixed(0)}°)
						</span>
					</div>
				) : null}
			</div>
		</div>
	);
}
