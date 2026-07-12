"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Canvas } from "@/components/canvas";
import { InversiveCanvas } from "@/components/inversive-canvas";
import { Sidebar } from "@/components/sidebar";
import { useConfiguration, type ConfigurationState } from "@/stores/configuration";
import type { TranslationalCellData as InversiveCellData } from "@/lib/utils/renderTiling";
import { useCatalogueSelection } from "@/lib/hooks/useCatalogueSelection";
import { useSymmetryData } from "@/lib/hooks/useSymmetryData";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import {
	loadComposableAtlasShard,
	loadIsotoxalAtlasShard,
	loadReferenceAtlas,
	loadReferenceAtlasShard,
	referenceToCatalogue,
	COMPOSABLE_SHARD_KS,
	ISOTOXAL_SHARD_KS,
} from "@/lib/services/referenceAtlas";
import { resolveAlphaDegs } from "@/lib/utils/paramCell";
import { useFamilyAlphas } from "@/stores/familyAlphas";
import { ParamSliderPanel } from "@/components/param-slider-panel";
import { pickStratified } from "@/lib/utils/pickStratified";
import { polygonClassLabel } from "@/lib/utils/tilingLabel";
import type { TranslationalCellData } from "@/classes/algorithm/types";

// Higher-k demo shards held out of the eager main atlas (convex k3, isotoxal k3/k4). We pull them all into
// the browse list on mount — see the eager-merge effect below.
const KNOWN_HIGHER_TIERS: { source: "composable" | "isotoxal"; k: number }[] = [
	...COMPOSABLE_SHARD_KS.map((k) => ({ source: "composable" as const, k })),
	...ISOTOXAL_SHARD_KS.map((k) => ({ source: "isotoxal" as const, k })),
];

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
			.then((atlas) => {
				if (!alive) return;
				const mapped = atlas.map(referenceToCatalogue);
				// Union-by-key, not overwrite: the composable-shard effect below can resolve FIRST (the
				// k3 shard is far smaller than the base atlas), so preserve any entries it already merged.
				setRefList((prev) => {
					if (!prev) return mapped;
					const have = new Set(mapped.map((t) => t.canonicalKey));
					const extra = prev.filter((t) => !have.has(t.canonicalKey));
					return extra.length ? [...mapped, ...extra] : mapped;
				});
			})
			.catch(() => alive && setRefList((prev) => prev ?? []));
		return () => {
			alive = false;
		};
	}, []);

	// Eagerly pull the higher-k demo shards (convex k3, isotoxal k3/k4) into the browse list on mount, so
	// every tier shows up for browsing — no click-to-load, no k4-without-k3 asymmetry. The eager base atlas
	// is already ~13 MB, so gating these behind a click bought little; each shard background-merges as it
	// resolves (base atlas still paints first), deduped by key. Loaders are module-cached, so the deep-link
	// effects below dedupe against this. (Regular k≥8 stays deep-link-only — those shards total ~130 MB.)
	useEffect(() => {
		let alive = true;
		for (const { source, k } of KNOWN_HIGHER_TIERS) {
			const loader = source === "composable" ? loadComposableAtlasShard : loadIsotoxalAtlasShard;
			loader(k)
				.then((data) => {
					if (!alive || data.length === 0) return;
					setRefList((prev) => {
						const base = prev ?? [];
						const have = new Set(base.map((t) => t.canonicalKey));
						const add = data.map(referenceToCatalogue).filter((t) => !have.has(t.canonicalKey));
						return add.length ? [...base, ...add] : base;
					});
				})
				.catch(() => {});
		}
		return () => {
			alive = false;
		};
	}, []);

	// Composable k≥3 tilings live in lazy shards (public/reference-atlas-composable-k{k}.json), not the
	// main atlas loadReferenceAtlas pulls. If we arrived directly at one (id "composable-k{n}-…", e.g. a
	// click from the /library convex-irregular shelf), fetch that shard and merge it in so the requested tiling
	// is in the working list. Best-effort: a missing shard resolves to [] in the loader; dedup by key so
	// navigating between composable-k3 tilings doesn't append the shard twice.
	useEffect(() => {
		const m = requestedKey?.match(/^composable-k(\d+)-/);
		if (!m) return;
		const k = Number(m[1]);
		if (!Number.isFinite(k) || k < 3) return;
		let alive = true;
		loadComposableAtlasShard(k)
			.then((data) => {
				if (!alive || data.length === 0) return;
				setRefList((prev) => {
					const base = prev ?? [];
					const have = new Set(base.map((t) => t.canonicalKey));
					const add = data.map(referenceToCatalogue).filter((t) => !have.has(t.canonicalKey));
					return add.length ? [...base, ...add] : base;
				});
			})
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, [requestedKey]);

	// Isotoxal α-family k≥3 tilings live in lazy shards (public/reference-atlas-isotoxal-k{k}.json). A direct
	// arrival at one (id "ctrnact-isotoxal-family-k{n}-…", a click from the /library isotoxal shelf) fetches
	// that shard and merges it in. Best-effort, dedup by key — same shape as the composable deep-link above.
	useEffect(() => {
		const m = requestedKey?.match(/^ctrnact-isotoxal-family-k(\d+)-/);
		if (!m) return;
		const k = Number(m[1]);
		if (!Number.isFinite(k) || k < 3) return;
		let alive = true;
		loadIsotoxalAtlasShard(k)
			.then((data) => {
				if (!alive || data.length === 0) return;
				setRefList((prev) => {
					const base = prev ?? [];
					const have = new Set(base.map((t) => t.canonicalKey));
					const add = data.map(referenceToCatalogue).filter((t) => !have.has(t.canonicalKey));
					return add.length ? [...base, ...add] : base;
				});
			})
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, [requestedKey]);

	// Higher-k regular tilings (Čtrnáct, k≥8, id "ctrnact-{kk}_…") live in lazy per-k shards
	// (public/reference-atlas-k{k}.json), not the base atlas. If we arrived directly at one (a click from
	// the /library higher-k shelf), fetch its shard and merge it in so the requested key resolves —
	// otherwise useCatalogueSelection can't find it and silently falls back to the first tiling. Best-
	// effort; dedup by key so navigating between k≥8 tilings doesn't append the shard twice.
	useEffect(() => {
		const m = requestedKey?.match(/^ctrnact-(\d+)_/);
		if (!m) return;
		const k = Number(m[1]);
		if (!Number.isFinite(k) || k < 8) return;
		let alive = true;
		loadReferenceAtlasShard(k)
			.then((data) => {
				if (!alive || data.length === 0) return;
				setRefList((prev) => {
					const base = prev ?? [];
					const have = new Set(base.map((t) => t.canonicalKey));
					const add = data.map(referenceToCatalogue).filter((t) => !have.has(t.canonicalKey));
					return add.length ? [...base, ...add] : base;
				});
			})
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, [requestedKey]);

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

	// Free-angle family entries carry a proven parametric cell — each parameter becomes a live slider (a
	// separable isotoxal family has one per independent tile). The rendered cell is re-evaluated at the
	// slider tuple (evaluateParamCell — a real tiling at every position; the formal closure is
	// angle-independent). The slider values live in the configuration store (`familyAlphas`), NOT in
	// React state here: the canvas draw loops read them imperatively each frame, so dragging updates the
	// tiling with zero re-render of this page or the sidebar (the same reason the rotation slider is
	// smooth). ParamSliderPanel is the only subscriber that re-renders on a drag.
	const paramCell = selected?.paramCell;

	// Persist the slider position across tiling selections instead of snapping back to the family
	// default: on a new selection, reconcile the stored tuple into THIS family's valid range (clamped
	// per parameter; parameters the stored tuple doesn't cover fall back to their default). Only runs on
	// selection change, never on a drag. Non-parametric selections leave `familyAlphas` untouched so the
	// position survives a detour through a rigid tiling.
	useEffect(() => {
		if (!paramCell) return;
		const fa = useFamilyAlphas.getState();
		fa.set(resolveAlphaDegs(paramCell, fa.values));
	}, [selected?.canonicalKey, paramCell]);

	// useCatalogueSelection seeds selection at mount; the atlas list arrives AFTER mount (async fetch),
	// so apply the requested key (or the first entry) once the atlas lands.
	useEffect(() => {
		if (sorted.length > 0 && !selected) {
			setSelected(sorted.find((t) => t.canonicalKey === requestedKey) ?? sorted[0]);
		}
	}, [sorted, selected, requestedKey, setSelected]);

	// Jump to a random tiling, stratified by (polygon class × k) so fat buckets (e.g. regular k=10)
	// don't swamp thin ones (e.g. star k=1): each class×k combination is equally likely, then a tiling
	// uniformly within it. Excludes the current selection so the view always changes. Client-only, so
	// Math.random is fine.
	const selectRandom = useCallback(() => {
		const pick = pickStratified(sorted, {
			bucketOf: (t) => `${polygonClassLabel(t.family)}::${t.k}`,
			keyOf: (t) => t.canonicalKey,
			excludeKey: selected?.canonicalKey ?? null,
		});
		if (pick) setSelected(pick);
	}, [sorted, selected, setSelected]);

	// Step through the linear `sorted` order (k, then key), wrapping at both ends so arrow-key browsing
	// never dead-ends. From no selection, forward lands on the first entry and backward on the last.
	const step = useCallback(
		(dir: -1 | 1) => {
			if (sorted.length === 0) return;
			const idx = selected ? sorted.findIndex((t) => t.canonicalKey === selected.canonicalKey) : -1;
			const next = idx === -1 ? (dir === 1 ? 0 : sorted.length - 1) : (idx + dir + sorted.length) % sorted.length;
			setSelected(sorted[next]);
		},
		[sorted, selected, setSelected],
	);

	// Stable handlers so the memoized Sidebar doesn't re-render on every parametric-angle slider tick
	// (inline arrows would give it a new prop identity each render, defeating the memo).
	const onPrev = useCallback(() => step(-1), [step]);
	const onNext = useCallback(() => step(1), [step]);

	// "R" reshuffles, ←/→ step prev/next, and single letters toggle the sidebar options (badges shown in
	// the sidebar) — but not while a field or slider is focused (its own arrow handling wins) or a
	// modifier is held.
	useEffect(() => {
		// Shortcut key → the boolean config field it toggles (matches the Kbd badges in the sidebar).
		const TOGGLES: Record<string, keyof ConfigurationState> = {
			f: "showPolygonFill",
			p: "showPolygonPoints",
			i: "isIslamic",
			s: "showSymmetryElements",
			d: "showFundamentalDomain",
			v: "inversive",
			c: "circlePacking",
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			const el = e.target as HTMLElement | null;
			if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
			if (e.key === "r" || e.key === "R") {
				e.preventDefault();
				selectRandom();
			} else if (e.key === "ArrowLeft") {
				e.preventDefault();
				step(-1);
			} else if (e.key === "ArrowRight") {
				e.preventDefault();
				step(1);
			} else {
				const field = TOGGLES[e.key.toLowerCase()];
				const c = useConfiguration.getState();
				// Circle Packing only exists for regular-only tilings; ignore its key otherwise.
				if (field && !(field === "circlePacking" && !c.isTilingRegularOnly)) {
					e.preventDefault();
					c.set({ [field]: !c[field] } as Partial<ConfigurationState>);
				}
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [selectRandom, step]);

	// Inversive (experimental) view: a WebGL overlay renders the same cell through a conformal map.
	const inversive = useConfiguration((s) => s.inversive);
	// The alpha-independent base cell + id. For a parametric family the canvases derive the live cell
	// from `paramCell` + the store's `familyAlphas` in their own draw loops (they append the alpha
	// signature to this base id), so nothing alpha-dependent flows through this render.
	const renderCell = (selected?.renderCell ?? null) as TranslationalCellData | null;
	const renderCellId = selected?.canonicalKey ?? null;

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
				onPrev={onPrev}
				onNext={onNext}
				mode={refList ? "reference" : "certified"}
			/>
			<div ref={canvasWrapRef} className="flex-1 min-w-0 relative">
				<Canvas
					width={size.w}
					height={size.h}
					translationalCell={renderCell}
					translationalCellId={renderCellId}
					paramCell={paramCell ?? null}
					symmetryData={symmetryData}
					showTilingRuleInput={false}
				/>
				{inversive ? (
					<InversiveCanvas
						width={size.w}
						height={size.h}
						translationalCell={renderCell as unknown as InversiveCellData | null}
						translationalCellId={renderCellId}
						paramCell={paramCell ?? null}
					/>
				) : null}
				{paramCell ? <ParamSliderPanel paramCell={paramCell} /> : null}
			</div>
		</div>
	);
}
