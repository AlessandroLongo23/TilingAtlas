"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Camera, Maximize, Minimize } from "lucide-react";
import { SCREENSHOT_BUTTONS_ENABLED } from "@/lib/utils/featureFlags";
import { Canvas } from "@/components/canvas";
import { InversiveCanvas } from "@/components/inversive-canvas";
import { HyperbolicCanvas } from "@/components/hyperbolic-canvas";
import { HyperbolicDevelopedCanvas } from "@/components/hyperbolic-developed-canvas";
import { SphericalCanvas } from "@/components/spherical-canvas";
import { Sidebar } from "@/components/sidebar";
import { Tooltip } from "@/components/ui/tooltip";
import { useConfiguration, type ConfigurationState } from "@/stores/configuration";
import { useImmersive } from "@/stores/immersive";
import { cn } from "@/lib/utils/cn";
import type { TranslationalCellData as InversiveCellData } from "@/lib/utils/renderTiling";
import { useCatalogueSelection } from "@/lib/hooks/useCatalogueSelection";
import { useSymmetryData } from "@/lib/hooks/useSymmetryData";
import { useVertexOrbits } from "@/lib/hooks/useVertexOrbits";
import { buildTilingSpec } from "@/lib/services/tilingSpec";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import {
	loadComposableAtlasShard,
	loadIsotoxalAtlasShard,
	loadReferenceAtlas,
	loadReferenceAtlasShard,
	referenceToCatalogue,
	tileClassOf,
	geometryOf,
	type Geometry,
	COMPOSABLE_SHARD_KS,
	ISOTOXAL_SHARD_KS,
} from "@/lib/services/referenceAtlas";
import { resolveAlphaDegs } from "@/lib/utils/paramCell";
import { useFamilyAlphas } from "@/stores/familyAlphas";
import { ParamSliderPanel } from "@/components/param-slider-panel";
import { pickStratified } from "@/lib/utils/pickStratified";
import { polygonClassSupportsIslamic } from "@/lib/utils/tilingLabel";
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

	// Geometry is the catalogue's top-level split AND a browse mode: random/prev/next roam only within the
	// active geometry, and switching it jumps the canvas to that geometry's first tiling. The toggle state
	// follows the selection (see the sync effect below), so a deep-link or "R" that lands on another
	// geometry flips it automatically. Default euclidean — the bulk of the atlas and the initial selection.
	const [geometry, setGeometry] = useState<Geometry>("euclidean");
	// Per-geometry tiling counts (labels the segments; a zero disables its segment until the lazy shard
	// merges in). Derived once per atlas change, not per geometry switch.
	const geometryCounts = useMemo(() => {
		const c: Record<Geometry, number> = { euclidean: 0, hyperbolic: 0, spherical: 0 };
		for (const t of sorted) c[geometryOf(t)] += 1;
		return c;
	}, [sorted]);
	// The active geometry's slice, in the same (k, key) order — the catalogue list, the nav count, and the
	// scope for random/prev/next all read this.
	const geometryList = useMemo(() => sorted.filter((t) => geometryOf(t) === geometry), [sorted, geometry]);
	// Dev-only: expose the catalogue selection so the Playwright visual/parity tools (see CLAUDE.md) can
	// pick specific tilings, e.g. window.__play.select(window.__play.list.find(t => t.star)).
	useEffect(() => {
		if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(window as any).__play = { list: geometryList, select: setSelected, selected };
	}, [geometryList, setSelected, selected]);
	// Switch geometry from the toggle: set the mode and jump to that geometry's first tiling so the canvas
	// follows. Reads `sorted` (not `geometryList`, which still holds the OLD geometry this render).
	const onGeometryChange = useCallback(
		(g: Geometry) => {
			if (g === geometry) return;
			setGeometry(g);
			const first = sorted.find((t) => geometryOf(t) === g);
			if (first) setSelected(first);
		},
		[geometry, sorted, setSelected],
	);
	// Keep the toggle in sync with the selection's geometry — covers deep-links, the initial atlas load, and
	// any path that sets `selected` outside the toggle. When the toggle drives the change, `selected` is
	// already in `g`, so this is a no-op.
	useEffect(() => {
		if (!selected) return;
		const g = geometryOf(selected);
		if (g !== geometry) setGeometry(g);
	}, [selected, geometry]);

	// Exact wallpaper-symmetry analysis of the selected tiling (fetched cell_codec → analyzeSymmetry),
	// memoized per canonicalKey; drives the two canvas overlays. Null while loading / for tilings with
	// no exact cell.
	const symmetryData = useSymmetryData(selected);

	// Vertex-orbit ids for the selected tiling (exactSource → orbitsFromExactSource), memoized per
	// canonicalKey; drives the "Show Vertex Orbits" overlay. Null while loading / for tilings with no
	// exact cell.
	const orbitData = useVertexOrbits(selected);
	// The geometry-aware spec for the info card. Rebuilt only when the selection or its live analyses
	// change — never per frame. Null while nothing is selected.
	const tilingSpec = useMemo(
		() => (selected ? buildTilingSpec(selected, symmetryData, orbitData) : null),
		[selected, symmetryData, orbitData],
	);

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
		fa.resetLive(); // reseed the eased render tuple for the NEW family — never glide across two families
	}, [selected?.canonicalKey, paramCell]);

	// The Islamic construction applies to every flat/spherical class now, so this force-off only fires for a
	// selection that supports it via neither the class gate nor `wythoff` — effectively never for the shipped
	// catalogue. Kept as a safety net so the render path can't draw the fill for a tiling whose sidebar hides
	// the control.
	useEffect(() => {
		if (selected && !polygonClassSupportsIslamic(selected) && !selected.wythoff && useConfiguration.getState().isIslamic) {
			useConfiguration.getState().set({ isIslamic: false });
		}
	}, [selected]);

	// A hyperbolic {p,q} tiling swaps the flat p5 renderer for the Poincaré-disk WebGL view. Set the
	// store flag (canvas.tsx reads it to blank the flat layer and disable zoom) and force off Euclidean-
	// only render modes so their now-hidden sidebar controls can't leave a stale render behind.
	const isHyperbolic = !!selected?.wythoff || !!selected?.developed;
	// A spherical (Platonic {p,q}) tiling swaps the flat p5 renderer for the three.js sphere view. Set the
	// store flag (canvas.tsx reads it to blank the flat layer) and force off the other render modes so their
	// now-hidden sidebar controls can't leave a stale render behind. The sphere renderer owns its own input.
	const isSpherical = !!selected?.spherical;
	useEffect(() => {
		const cfg = useConfiguration.getState();
		if (isSpherical) {
			// Islamic is NOT force-cleared here — the sphere canvas renders the construction as great-circle
			// ribbons, and polygonClassSupportsIslamic now admits the spherical class, so the toggle persists.
			cfg.set({
				spherical: true,
				hyperbolic: false,
				inversive: false,
				circlePacking: false,
				isTilingRegularOnly: false,
			});
		} else if (cfg.spherical) {
			cfg.set({ spherical: false });
		}
	}, [isSpherical, selected]);
	useEffect(() => {
		const cfg = useConfiguration.getState();
		if (isHyperbolic) {
			// Two-tone parity is only defined for the REGULAR 2-colourable tilings (q even); the uniform forms
			// are multi-tile-type, so force it off for them and for odd q. Islamic strapwork now works for
			// EVERY hyperbolic tiling (regular, uniform, snub), so isIslamic is never force-cleared here.
			const w = selected?.wythoff;
			const parityOk = !!w && w.rings[0] && !w.rings[1] && !w.rings[2] && w.q % 2 === 0;
			cfg.set({
				hyperbolic: true,
				circlePacking: false,
				isTilingRegularOnly: false,
				...(!parityOk && cfg.hyperbolicShading === "parity" ? { hyperbolicShading: "tiles" as const } : {}),
			});
		} else if (cfg.hyperbolic) {
			cfg.set({ hyperbolic: false });
		}
	}, [isHyperbolic, selected]);

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
		const pick = pickStratified(geometryList, {
			bucketOf: (t) => `${tileClassOf(t)}::${t.k}`,
			keyOf: (t) => t.canonicalKey,
			excludeKey: selected?.canonicalKey ?? null,
		});
		if (pick) setSelected(pick);
	}, [geometryList, selected, setSelected]);

	// Step through the linear `sorted` order (k, then key), wrapping at both ends so arrow-key browsing
	// never dead-ends. From no selection, forward lands on the first entry and backward on the last.
	const step = useCallback(
		(dir: -1 | 1) => {
			if (geometryList.length === 0) return;
			const idx = selected ? geometryList.findIndex((t) => t.canonicalKey === selected.canonicalKey) : -1;
			const next = idx === -1 ? (dir === 1 ? 0 : geometryList.length - 1) : (idx + dir + geometryList.length) % geometryList.length;
			setSelected(geometryList[next]);
		},
		[geometryList, selected, setSelected],
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
			b: "showPolygonFill",
			p: "showPolygonPoints",
			i: "isIslamic",
			s: "showSymmetryElements",
			d: "showFundamentalDomain",
			// C and V are the Catalogue / View-options tab shortcuts now (handled in tilings-tab). Inversive
			// moved off V to X; Circle Packing (was C) is hidden, so it has no key.
			x: "inversive",
			t: "tilingTransition",
			o: "showVertexOrbits",
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			const el = e.target as HTMLElement | null;
			if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
			// Spherical view: Fill/Wireframe is a single mutually-exclusive toggle (the quaternion trackball
			// owns rotation, so the flat overlays don't apply). Both W and B flip it — W = Wireframe, B = Fill,
			// either key swaps the pair. Intercept before the flat toggles so B here means the spherical fill,
			// not the global Polygon-fill flag (which is hidden in this view).
			if (!!selected?.spherical && (e.key === "w" || e.key === "W" || e.key === "b" || e.key === "B")) {
				e.preventDefault();
				const c = useConfiguration.getState();
				c.set({ sphericalWireframe: !c.sphericalWireframe });
				return;
			}
			if (e.key === "r" || e.key === "R") {
				e.preventDefault();
				selectRandom();
			} else if (e.key === "ArrowLeft") {
				e.preventDefault();
				step(-1);
			} else if (e.key === "ArrowRight") {
				e.preventDefault();
				step(1);
			} else if (e.key === "f" || e.key === "F") {
				// Toggle immersive (fullscreen-canvas) mode: hides the header + sidebar.
				e.preventDefault();
				useImmersive.getState().toggle();
			} else if (e.key === "Escape") {
				// Esc only exits immersive; otherwise leave it for whatever else handles it.
				if (useImmersive.getState().immersive) {
					e.preventDefault();
					useImmersive.getState().set(false);
				}
			} else if ((e.key === "y" || e.key === "Y") && !!selected?.wythoff && selected.wythoff.rings[0] && !selected.wythoff.rings[1] && !selected.wythoff.rings[2] && selected.wythoff.q % 2 === 0) {
				// "Y" cycles the hyperbolic shading (coloured tiles ⇄ two-tone parity) — only for a hyperbolic
				// tiling whose vertices have an even tile count (q even), the 2-colourable case.
				e.preventDefault();
				const c = useConfiguration.getState();
				c.set({ hyperbolicShading: c.hyperbolicShading === "tiles" ? "parity" : "tiles" });
			} else {
				const field = TOGGLES[e.key.toLowerCase()];
				const c = useConfiguration.getState();
				// Circle Packing only exists for regular-only tilings, and Islamic applies to every flat/spherical
				// class (hyperbolic draws it through its own shader); symmetry elements / fundamental domain /
				// transition / vertex orbits are flat-canvas only and hidden in hyperbolic; vertex orbits also need
				// the tiling's exact cell (the sidebar disables the checkbox without one). Ignore each key where the
				// sidebar hides/disables the control.
				const isHyperbolic = !!selected?.wythoff || !!selected?.developed;
				const blocked =
					(field === "circlePacking" && !c.isTilingRegularOnly) ||
					(field === "isIslamic" && !!selected && !polygonClassSupportsIslamic(selected) && !isHyperbolic) ||
					(field === "showVertexOrbits" && !selected?.exactSource) ||
					((field === "showSymmetryElements" || field === "showFundamentalDomain" || field === "tilingTransition" || field === "showVertexOrbits") && isHyperbolic);
				if (field && !blocked) {
					e.preventDefault();
					c.set({ [field]: !c[field] } as Partial<ConfigurationState>);
				}
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [selectRandom, step, selected]);

	// Inversive (experimental) view: a WebGL overlay renders the same cell through a conformal map.
	const inversive = useConfiguration((s) => s.inversive);

	// Immersive (fullscreen-canvas) mode: collapses the header + sidebar so the canvas fills the window.
	const immersive = useImmersive((s) => s.immersive);
	// The symmetry-info badge (a Canvas overlay) also sits top-right, but it insets itself left of this
	// fixed-width control column (see canvas.tsx `right-16`), so the two never overlap — the controls keep
	// their natural corner position regardless of how tall the badge grows with its cell diagram(s).
	// Leave immersive mode when navigating away from /play, so a collapsed header/sidebar never persists
	// onto another route (which has no toggle to restore them).
	useEffect(() => () => useImmersive.getState().set(false), []);
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
			{/* Immersive mode collapses this wrapper's width to 0 (the sidebar stays mounted, just clipped),
			    which lets the canvas-wrap grow; the canvas resizes to fill via its ResizeObserver. */}
			<div
				className={cn(
					"h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out",
					immersive ? "w-0" : "w-80",
				)}
			>
				<Sidebar
					selected={selected}
					onSelect={setSelected}
					onRandom={selectRandom}
					onPrev={onPrev}
					onNext={onNext}
					geometry={geometry}
					geometryList={geometryList}
					geometryCounts={geometryCounts}
					onGeometryChange={onGeometryChange}
				/>
			</div>
			<div ref={canvasWrapRef} className="flex-1 min-w-0 relative">
				<Canvas
					width={size.w}
					height={size.h}
					translationalCell={renderCell}
					translationalCellId={renderCellId}
					paramCell={paramCell ?? null}
					symmetryData={symmetryData}
					orbitData={orbitData}
					spec={tilingSpec}
					showTilingRuleInput={false}
				/>
				{/* Exactly one WebGL overlay at a time: the three.js sphere for a spherical tiling (it owns its
				    own pointer input via ArcballControls, so it sits on top and captures drag/wheel itself),
				    the Poincaré disk for a hyperbolic tiling, else the inversive conformal view when toggled
				    on. The flat p5 Canvas above stays mounted (blanked) as the input layer for the other two. */}
				{isSpherical && selected?.spherical ? (
					<SphericalCanvas width={size.w} height={size.h} solidId={selected.spherical.solid} />
				) : selected?.developed ? (
					// Engine-developed tiling: explicit Poincaré geometry from the Čtrnáct SU(1,1) developer,
					// drawn as geodesic polygons with the same store-driven pan. Handles the arbitrary
					// regular-faced tilings the (2,p,q) fold shader cannot.
					<HyperbolicDevelopedCanvas width={size.w} height={size.h} patchId={selected.developed.patch} />
				) : isHyperbolic && selected?.wythoff ? (
					// The infinite fold-shader tiling — it now also renders the Islamic A/B/C fill per pixel
					// (crossing-parity) for regular {p,q}, so there's no separate mesh view: same dimming,
					// exact geodesic arcs, full rim.
					<HyperbolicCanvas width={size.w} height={size.h} wythoff={selected.wythoff} />
				) : inversive ? (
					<InversiveCanvas
						width={size.w}
						height={size.h}
						translationalCell={renderCell as unknown as InversiveCellData | null}
						translationalCellId={renderCellId}
						paramCell={paramCell ?? null}
					/>
				) : null}
				{paramCell ? <ParamSliderPanel paramCell={paramCell} /> : null}
				{/* Fullscreen toggle: collapses the header + sidebar. Stays visible while immersive so it can
				    exit. Keeps the top-right corner; the symmetry-info badge insets itself to the left of this
				    control column (canvas.tsx), so they never overlap however tall the badge grows. */}
				<Tooltip
					label={immersive ? "Exit fullscreen" : "Fullscreen canvas"}
					shortcut={immersive ? "F or Esc" : "F"}
					side="left"
					delay={0}
				>
					<button
						type="button"
						onClick={() => useImmersive.getState().toggle()}
						aria-label={immersive ? "Exit fullscreen" : "Enter fullscreen"}
						aria-pressed={immersive}
						className={cn(
							"absolute top-4 right-4 z-30 flex items-center justify-center rounded-lg p-2 text-fg-muted bg-surface-overlay/80 backdrop-blur-sm border border-line hover:text-fg hover:border-line-strong transition-colors",
						)}
					>
						{immersive ? <Minimize size={16} /> : <Maximize size={16} />}
					</button>
				</Tooltip>
				{/* Screenshot: canvas.tsx runs the capture (createGraphics patch → preview modal) when it sees
				    takeScreenshot flip; hovering frames the crop region via screenshotButtonHover. Sits just
				    below the fullscreen toggle in the same top-right stack. Hidden until the capture is ready. */}
				{SCREENSHOT_BUTTONS_ENABLED ? (
					<button
						type="button"
						onClick={() => useConfiguration.getState().set({ takeScreenshot: true })}
						onMouseEnter={() => useConfiguration.getState().set({ screenshotButtonHover: true })}
						onMouseLeave={() => useConfiguration.getState().set({ screenshotButtonHover: false })}
						title="Screenshot"
						aria-label="Take screenshot"
						className={cn(
							"absolute top-16 right-4 z-30 flex items-center justify-center rounded-lg p-2 text-fg-muted bg-surface-overlay/80 backdrop-blur-sm border border-line hover:text-fg hover:border-line-strong transition-colors",
						)}
					>
						<Camera size={16} />
					</button>
				) : null}
			</div>
		</div>
	);
}
