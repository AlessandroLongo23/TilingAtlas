"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTypingTarget } from "@/lib/hooks/useKeyShortcuts";
import { useSearchParams } from "next/navigation";
import { Camera, Check, Link2, Maximize, Minimize } from "lucide-react";
import { SCREENSHOT_BUTTONS_ENABLED } from "@/lib/utils/featureFlags";
import { Canvas } from "@/components/canvas";
import { InversiveCanvas } from "@/components/inversive-canvas";
import { HyperbolicDevelopedCanvas } from "@/components/hyperbolic-developed-canvas";
import { HyperbolicEdgesCanvas } from "@/components/hyperbolic-edges-canvas";
import { HyperbolicColorsCanvas } from "@/components/hyperbolic-colors-canvas";
import { SphericalCanvas } from "@/components/spherical-canvas";
import { SphericalColorsCanvas } from "@/components/spherical-colors-canvas";
import { FreedrawPlayCanvas } from "@/components/freedraw-play-canvas";
import { TruchetOverlay } from "@/components/truchet-overlay";
import { truchetPattern as buildTruchetPattern } from "@/lib/render/truchetTiling";
import { ColorsPlayCanvas } from "@/components/colors-play-canvas";
import { HollowCanvas } from "@/components/hollow/hollow-canvas";
import { IcoFreedrawCanvas } from "@/components/freedraw/ico-freedraw-canvas";
import { SphSchwarzCanvas } from "@/components/freedraw/sph-schwarz-canvas";
import { SphPolyCanvas } from "@/components/freedraw/sph-poly-canvas";
import { Sidebar } from "@/components/sidebar";
import { Tooltip } from "@/components/ui/tooltip";
import { useConfiguration, type ConfigurationState } from "@/stores/configuration";
import { isChiralTiling, reflectRenderCell } from "@/lib/services/chirality";
import { useImmersive } from "@/stores/immersive";
import { cn } from "@/lib/utils/cn";
import { useInversiveCell } from "@/lib/hooks/useInversiveCell";
import { useCatalogueSelection } from "@/lib/hooks/useCatalogueSelection";
import { useSymmetryData } from "@/lib/hooks/useSymmetryData";
import { useVertexOrbits } from "@/lib/hooks/useVertexOrbits";
import { buildTilingSpec } from "@/lib/services/tilingSpec";
import type { CatalogueTiling } from "@/lib/services/catalogueService";
import { lensAppliesTo, surfaceOf } from "@/lib/services/shelfRegistry";
import {
	loadComposableAtlasShard,
	loadIsotoxalAtlasShard,
	loadPeriodAtlasShard,
	loadTri45AtlasShard,
	loadPenroseAtlasShard,
	loadReferenceAtlas,
	loadReferenceAtlasShard,
	loadFreedrawShardsForK,
	loadColorsShardsForK,
	loadSphericalFreedrawAtlas,
	loadHyperbolicEdgesAtlas,
	loadHyperbolicEdgesShard,
	loadSphericalSchwarzAtlas,
	loadHyperbolicSchwarzAtlas,
	loadSchwarzShard,
	loadHyperbolicColorsAtlas,
	loadHyperbolicColorsShard,
	loadSphericalColorsAtlas,
	loadSphericalColorsShard,
	loadSphericalEdgesAtlas,
	loadSphericalEdgesShard,
	loadSphericalPolyAtlas,
	loadPentagonEdgesAtlas,
	loadPentagonEdgesShard,
	loadIsohedralEdgesAtlas,
	loadIsohedralEdgesShard,
	loadHyperbolicPolyAtlas,
	loadHyperbolicPolyShard,
	loadHyperbolicHalfShard,
	referenceToCatalogue,
	tileClassOf,
	compareCatalogueDisplayOrder,
	geometryOf,
	decorationOf,
	type Geometry,
	type Decoration,
	type ReferenceTiling,
	COMPOSABLE_SHARD_KS,
	ISOTOXAL_SHARD_KS,
	PERIOD_SHARD_KS,
	TRI45_SHARD_KS,
	PENROSE_SHARD_KS,
	resolveMergedFamilyKey,
} from "@/lib/services/referenceAtlas";
import { hypEdgesLazyShardsForK } from "@/lib/freedraw/hyp-edges";
import { hypSchwarzMeta, schwarzLazyShardsForK } from "@/lib/freedraw/schwarz";
import { sphEdgesLazyShardsForK } from "@/lib/freedraw/sph-edges";
import { hypPolyLazyShardsForK, hypPolyMeta } from "@/lib/tilings/hyp-poly";
import { SPH_HALF_BOARDS } from "@/lib/tilings/sph-half";
import { pentEdgeLazyShardsForK } from "@/lib/pentagon/edge-shelf";
import { ihEdgeLazyShardsForK } from "@/lib/isohedral/edge-shelf";
import { PentagonEdgesCanvas } from "@/components/pentagon-edges-canvas";
import { IsohedralEdgesCanvas } from "@/components/isohedral-edges-canvas";
import { PentagonEdgesControls } from "@/components/pentagon-edges-controls";
import { IsohedralEdgesControls } from "@/components/isohedral-edges-controls";
import { hypColorsLazyShardsForK } from "@/lib/colors/hyp-colors";
import { sphColorsLazyShardsForK, SPH_COLORS_SOLIDS } from "@/lib/colors/sph-colors";
import { resolveAlphaDegs } from "@/lib/utils/paramCell";
import { parsePlayState, serializePlayState } from "@/lib/services/playUrlState";
import { useFamilyAlphas } from "@/stores/familyAlphas";
import { ParamSliderPanel } from "@/components/param-slider-panel";
import { pickStratified } from "@/lib/utils/pickStratified";
import { polygonClassSupportsIslamic } from "@/lib/utils/tilingLabel";
import type { TranslationalCellData } from "@/classes/algorithm/types";

// Higher-k demo shards held out of the eager main atlas (convex k3, isotoxal k3/k4). We pull them all into
// the browse list on mount — see the eager-merge effect below.
//
// The 45-45-90 shelf joins them: its k=3 and k=4 are 1.5 and 7.7 MB, against the 19.5 MB isotoxal k=4
// already on this list, so it is well inside the budget this table already spends — and deep-link-only
// would mean the shelf's 5,137 deeper tilings are unreachable by browsing, which is what it was before.
const KNOWN_HIGHER_TIERS: { source: "composable" | "isotoxal" | "period" | "tri45" | "penrose"; k: number }[] = [
	...COMPOSABLE_SHARD_KS.map((k) => ({ source: "composable" as const, k })),
	...ISOTOXAL_SHARD_KS.map((k) => ({ source: "isotoxal" as const, k })),
	...PERIOD_SHARD_KS.map((k) => ({ source: "period" as const, k })),
	...TRI45_SHARD_KS.map((k) => ({ source: "tri45" as const, k })),
	...PENROSE_SHARD_KS.map((k) => ({ source: "penrose" as const, k })),
];

const SHARD_LOADER = {
	composable: loadComposableAtlasShard,
	isotoxal: loadIsotoxalAtlasShard,
	period: loadPeriodAtlasShard,
	tri45: loadTri45AtlasShard,
	penrose: loadPenroseAtlasShard,
} as const;

// Trailing debounce on the URL mirror. WebKit caps history.replaceState at 100 calls / 30s, then throws
// SecurityError and DISABLES the method for a while — so the rate has to stay under it, one call per
// 300ms (github.com/sveltejs/kit/issues/365). The sliders here (islamicAngle, hueOffset, the spherical
// wire knobs) fire per pointermove, so an undebounced mirror would trip it in a single drag. Trailing
// means a drag writes nothing until it settles; sustained interaction caps at 75 writes / 30s.
const URL_MIRROR_DEBOUNCE_MS = 400;

interface PlayClientProps {
	tilings: CatalogueTiling[];
}

export function PlayClient({ tilings }: PlayClientProps) {
	const searchParams = useSearchParams();
	// No measured-size state here on purpose: every renderer below (p5, the flat/Islamic/inversive/
	// hyperbolic WebGL canvases, the three.js sphere) measures its own host box inside its frame loop —
	// see lib/render/canvasSize.ts. Routing the size through React made the tiling stretch and snap back
	// while the fullscreen toggle animated the layout, and re-rendered this whole tree (sidebar included)
	// on every frame of the animation.

	// ── URL ⇆ view state (spec: docs/superpowers/specs/2026-07-22-play-url-state-design.md) ──
	// Parse the URL exactly once, on mount. After this the query string is WRITE-only (the mirror effect
	// below), so browser back/forward inside the page is not a state source — same contract as the
	// library shelf.
	// resolveMergedFamilyKey redirects a link naming a family that a merge absorbed onto the entry that now
	// carries it, carrying the angle across to the merged coordinate. A no-op for every other key.
	const [initialUrl] = useState(() => {
		const parsed = parsePlayState(searchParams);
		return { ...parsed, ...resolveMergedFamilyKey({ tiling: parsed.tiling, alphas: parsed.alphas }) };
	});
	const requestedKey = initialUrl.tiling;
	// Guards the mirror against firing before the link has been applied (which would overwrite the link
	// with defaults). Effects run in declaration order, so the apply below already precedes the mirror;
	// the ref makes that independent of ordering.
	const hydrated = useRef(false);

	// Apply the link. parsePlayState returns the WHOLE whitelist — the URL's value where present, the
	// store default everywhere else — so a bare /play always means the default view and a visitor with a
	// warm store from an earlier session sees what the link says, not what they left behind.
	useEffect(() => {
		useConfiguration.getState().set(initialUrl.config);
		if (initialUrl.alphas) useFamilyAlphas.getState().set(initialUrl.alphas);
		hydrated.current = true;
	}, [initialUrl]);

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
			const loader = SHARD_LOADER[source];
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

	// Period-p k≥3 tilings live in lazy shards (public/reference-atlas-period-k{k}.json). A direct arrival
	// at one (id "period-family-k{n}-…") fetches that shard. Same shape as the two deep-links below.
	useEffect(() => {
		const m = requestedKey?.match(/^period-family-k(\d+)-/);
		if (!m) return;
		const k = Number(m[1]);
		if (!Number.isFinite(k) || k < 3) return;
		let alive = true;
		loadPeriodAtlasShard(k)
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

	// Hexagonal-grid decorations run deeper than the atlas ships eagerly: edge systems to k=9 (ids
	// "fdh-{k}-…") and 3-colorings to k=8 ("colh3-{k}-…"). A direct arrival at one of the lazy slices
	// fetches it — same best-effort, dedup-by-key shape as the shards above. loadFreedrawShardsForK /
	// loadColorsShardsForK return [] when that k needs nothing, so no gate on the number is needed here.
	useEffect(() => {
		const m = requestedKey?.match(/^(fdh|colh3)-(\d+)-/);
		if (!m) return;
		const k = Number(m[2]);
		if (!Number.isFinite(k)) return;
		let alive = true;
		const load = m[1] === "fdh" ? loadFreedrawShardsForK : loadColorsShardsForK;
		load(k)
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

	// The catalogue's ONE canonical order — the same class → sub → k → key order the sidebar renders (see
	// compareCatalogueDisplayOrder). Making this THE order means arrow-key / prev-next browsing steps through
	// the visible list, and the default first paint + a geometry switch both land on that geometry's first
	// sidebar row. Deterministic (never random), so the first paint is still stable.
	const sorted = useMemo(() => [...working].sort(compareCatalogueDisplayOrder), [working]);

	const { selected, setSelected } = useCatalogueSelection(sorted, requestedKey);

	// Geometry is the catalogue's top-level split AND a browse mode: random/prev/next roam only within the
	// active geometry, and switching it jumps the canvas to that geometry's first tiling. The toggle state
	// follows the selection (see the sync effect below), so a deep-link or "R" that lands on another
	// geometry flips it automatically. Default euclidean — the bulk of the atlas and the initial selection.
	const [geometry, setGeometry] = useState<Geometry>("euclidean");
	// Decoration is the split BELOW geometry and the same kind of thing: a browse mode as well as a filter.
	// Tilings / Edge patterns / Colorings — see decorationOf. Default "tilings", which is where the initial
	// Euclidean selection lands.
	const [decoration, setDecoration] = useState<Decoration>("tilings");
	// Per-geometry tiling counts (labels the segments; a zero disables its segment until the lazy shard
	// merges in). Derived once per atlas change, not per geometry switch.
	const geometryCounts = useMemo(() => {
		const c: Record<Geometry, number> = { euclidean: 0, hyperbolic: 0, spherical: 0 };
		for (const t of sorted) c[geometryOf(t)] += 1;
		return c;
	}, [sorted]);
	// Decoration counts WITHIN the active geometry — the segment row is scoped to it, and the hyperbolic /
	// spherical edge + colour shards load lazily, so a segment starts empty (disabled) and fills in.
	const decorationCounts = useMemo(() => {
		const c: Record<Decoration, number> = { tilings: 0, edges: 0, colorings: 0 };
		for (const t of sorted) if (geometryOf(t) === geometry) c[decorationOf(t)] += 1;
		return c;
	}, [sorted, geometry]);
	// The active (geometry, decoration) cell, in the same class → sub → k → key display order — the catalogue
	// list, the nav count, and the scope for random/prev/next all read this.
	const geometryList = useMemo(
		() => sorted.filter((t) => geometryOf(t) === geometry && decorationOf(t) === decoration),
		[sorted, geometry, decoration],
	);
	// Dev-only: expose the catalogue selection so the Playwright visual/parity tools (see CLAUDE.md) can
	// pick specific tilings, e.g. window.__play.select(window.__play.list.find(t => t.star)).
	useEffect(() => {
		if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(window as any).__play = { list: geometryList, select: setSelected, selected };
	}, [geometryList, setSelected, selected]);
	// Switch geometry from the toggle: set the mode and jump to that geometry's first tiling so the canvas
	// follows. Reads `sorted` (not `geometryList`, which still holds the OLD cell this render).
	//
	// The decoration carries across when the target cell has anything in it, so switching Euclidean →
	// Hyperbolic while browsing colorings keeps you on colorings. It falls back to Tilings when the cell is
	// empty, which is the case for a geometry whose edge/colour shard has not been fetched yet — without
	// the fallback the switch would land on an empty list and a disabled segment.
	const onGeometryChange = useCallback(
		(g: Geometry) => {
			if (g === geometry) return;
			setGeometry(g);
			const keepsDecoration = sorted.some((t) => geometryOf(t) === g && decorationOf(t) === decoration);
			const d = keepsDecoration ? decoration : "tilings";
			setDecoration(d);
			const first = sorted.find((t) => geometryOf(t) === g && decorationOf(t) === d);
			if (first) setSelected(first);
		},
		[geometry, decoration, sorted, setSelected],
	);
	// Switch decoration from the toggle: same move one level down, within the active geometry.
	const onDecorationChange = useCallback(
		(d: Decoration) => {
			if (d === decoration) return;
			setDecoration(d);
			const first = sorted.find((t) => geometryOf(t) === geometry && decorationOf(t) === d);
			if (first) setSelected(first);
		},
		[decoration, geometry, sorted, setSelected],
	);
	// Keep both toggles in sync with the selection — covers deep-links, the initial atlas load, and any path
	// that sets `selected` outside the toggles ("R", ←/→, a click in the list). When a toggle drives the
	// change, `selected` already sits in the new cell, so this is a no-op.
	useEffect(() => {
		if (!selected) return;
		const g = geometryOf(selected);
		if (g !== geometry) setGeometry(g);
		const d = decorationOf(selected);
		if (d !== decoration) setDecoration(d);
	}, [selected, geometry, decoration]);

	// Spherical freedraw (~19.5k patterns, ~10 MB across 30 shards) is deliberately NOT in the base atlas —
	// loading it up front would tax every /play visit for a shelf many never open. Pull it once the Spherical
	// geometry is entered, or when a deep-link to an "sfd-…" key arrives, then background-merge it (deduped by
	// key) so it joins the browse tree under Spherical → Freedraw and the requested key resolves. The loader
	// is module-cached, so re-running this on every geometry change is free after the first fetch.
	useEffect(() => {
		if (geometry !== "spherical" && !requestedKey?.startsWith("sfd-")) return;
		let alive = true;
		loadSphericalFreedrawAtlas()
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
	}, [geometry, requestedKey]);

	// Hyperbolic edge systems: same lazy pattern as spherical freedraw. The eager k ≤ 9 slice (~3.6 MB)
	// loads once the Hyperbolic geometry is entered (or a deep-link to an "he…" key arrives); the dense
	// high-k shards (k = 12/13/14) are pulled per-k by loadHyperbolicEdgesShard when their k row is opened.
	useEffect(() => {
		if (geometry !== "hyperbolic" && !requestedKey?.startsWith("he")) return;
		let alive = true;
		const merge = (data: Awaited<ReturnType<typeof loadHyperbolicEdgesAtlas>>) => {
			if (!alive || data.length === 0) return;
			setRefList((prev) => {
				const base = prev ?? [];
				const have = new Set(base.map((t) => t.canonicalKey));
				const add = data.map(referenceToCatalogue).filter((t) => !have.has(t.canonicalKey));
				return add.length ? [...base, ...add] : base;
			});
		};
		loadHyperbolicEdgesAtlas().then(merge).catch(() => {});
		// A deep-link to a lazy-shard he… key (he667-13-…, he46-2-…) also needs its shard fetched so the key
		// resolves. Attempt only when that (base, k) is actually a lazy shard.
		const m = requestedKey?.match(/^he(\d+)-(\d+)-/);
		if (m && hypEdgesLazyShardsForK(Number(m[2])).some((s) => s.base === m[1])) {
			loadHyperbolicEdgesShard(m[1], Number(m[2])).then(merge).catch(() => {});
		}
		return () => {
			alive = false;
		};
	}, [geometry, requestedKey]);

	// Schwarz boards — same lazy pattern again, but this shelf spans BOTH curved geometries, so the effect
	// runs under either and pulls that geometry's boards. Record ids are "ss<board>-…" (spherical) and
	// "hs<board>-…" (hyperbolic), which is what a deep-link is matched on; the two dense tails ((2,2,4) k=10,
	// (2,3,3) k=7) are fetched per-k when their key is requested or their row is opened.
	useEffect(() => {
		const wantSph = geometry === "spherical" || !!requestedKey?.startsWith("ss");
		const wantHyp = geometry === "hyperbolic" || !!requestedKey?.startsWith("hs");
		if (!wantSph && !wantHyp) return;
		let alive = true;
		const merge = (data: Awaited<ReturnType<typeof loadSphericalSchwarzAtlas>>) => {
			if (!alive || data.length === 0) return;
			setRefList((prev) => {
				const base = prev ?? [];
				const have = new Set(base.map((t) => t.canonicalKey));
				const add = data.map(referenceToCatalogue).filter((t) => !have.has(t.canonicalKey));
				return add.length ? [...base, ...add] : base;
			});
		};
		if (wantSph) loadSphericalSchwarzAtlas().then(merge).catch(() => {});
		if (wantHyp) loadHyperbolicSchwarzAtlas().then(merge).catch(() => {});
		// A deep-link into a lazy shard needs that shard fetched or the key never resolves.
		const m = requestedKey?.match(/^(?:ss|hs)(\d+)-(\d+)-/);
		if (m) {
			const geo = requestedKey!.startsWith("ss") ? "spherical" : "hyperbolic";
			if (schwarzLazyShardsForK(geo, Number(m[2])).some((b) => b.id === m[1])) {
				loadSchwarzShard(m[1], Number(m[2])).then(merge).catch(() => {});
			}
		}
		return () => {
			alive = false;
		};
	}, [geometry, requestedKey]);

	// Uniform-polyhedron edge systems (prisms, antiprisms, truncated tetrahedron, cuboctahedron, J27) and
	// the 3.4.n.4 hyperbolic tilings — the same lazy pattern once more, one shelf per curved geometry.
	// Record ids are "xe<board>-k-i" and "hp<n>-k-i", which is what a deep-link is matched on.
	useEffect(() => {
		const wantSph = geometry === "spherical" || !!requestedKey?.startsWith("xe") || !!requestedKey?.startsWith("sp");
		const wantHyp = geometry === "hyperbolic" || !!requestedKey?.startsWith("hp");
		// The pentagon edge shelf is EUCLIDEAN — a plane tiling — so it rides this effect's default
		// geometry rather than one of the curved ones.
		const wantEuc = geometry === "euclidean" || !!requestedKey?.startsWith("pe");
		if (!wantSph && !wantHyp && !wantEuc) return;
		let alive = true;
		const merge = (data: Awaited<ReturnType<typeof loadSphericalEdgesAtlas>>) => {
			if (!alive || data.length === 0) return;
			setRefList((prev) => {
				const base = prev ?? [];
				const have = new Set(base.map((t) => t.canonicalKey));
				const add = data.map(referenceToCatalogue).filter((t) => !have.has(t.canonicalKey));
				return add.length ? [...base, ...add] : base;
			});
		};
		if (wantSph) {
			loadSphericalEdgesAtlas().then(merge).catch(() => {});
			loadSphericalPolyAtlas().then(merge).catch(() => {});
		}
		if (wantHyp) loadHyperbolicPolyAtlas().then(merge).catch(() => {});
		if (wantEuc) loadPentagonEdgesAtlas().then(merge).catch(() => {});
		if (wantEuc) loadIsohedralEdgesAtlas().then(merge).catch(() => {});
		const pe = requestedKey?.match(/^pe(.+?)-(\d+)-/);
		if (pe && pentEdgeLazyShardsForK(Number(pe[2])).some((b) => b.id === pe[1])) {
			loadPentagonEdgesShard(pe[1], Number(pe[2])).then(merge).catch(() => {});
		}
		const ie = requestedKey?.match(/^ie(.+?)-(\d+)-/);
		if (ie && ihEdgeLazyShardsForK(Number(ie[2])).some((b) => b.id === ie[1])) {
			loadIsohedralEdgesShard(ie[1], Number(ie[2])).then(merge).catch(() => {});
		}
		const xe = requestedKey?.match(/^xe(.+)-(\d+)-/);
		if (xe && sphEdgesLazyShardsForK(Number(xe[2])).some((b) => b.id === xe[1])) {
			loadSphericalEdgesShard(xe[1], Number(xe[2])).then(merge).catch(() => {});
		}
		// `hpt7-…` as well as `hp7-…`: the shelf carries two families and only the ai2 half is prefixed.
		const hp = requestedKey?.match(/^hp(t?\d+)-(\d+)-/);
		if (hp && hypPolyLazyShardsForK(Number(hp[2])).some((b) => b.id === hp[1])) {
			loadHyperbolicPolyShard(hp[1], Number(hp[2])).then(merge).catch(() => {});
		}
		return () => {
			alive = false;
		};
	}, [geometry, requestedKey]);

	// Colored tilings in H² and on S² — the same lazy pattern. The per-base/solid eager slices load once the
	// matching geometry is entered (or a deep-link "hc…"/"sc…" key arrives); dense shards load per-k below.
	useEffect(() => {
		if (geometry !== "hyperbolic" && !requestedKey?.startsWith("hc")) return;
		let alive = true;
		const merge = (data: ReferenceTiling[]) => {
			if (!alive || data.length === 0) return;
			setRefList((prev) => {
				const base = prev ?? [];
				const have = new Set(base.map((t) => t.canonicalKey));
				const add = data.map(referenceToCatalogue).filter((t) => !have.has(t.canonicalKey));
				return add.length ? [...base, ...add] : base;
			});
		};
		loadHyperbolicColorsAtlas().then(merge).catch(() => {});
		const m = requestedKey?.match(/^hc(\d+)-(\d+)-/);
		if (m && hypColorsLazyShardsForK(Number(m[2])).some((s) => s.base === m[1])) {
			loadHyperbolicColorsShard(m[1], Number(m[2])).then(merge).catch(() => {});
		}
		return () => {
			alive = false;
		};
	}, [geometry, requestedKey]);

	useEffect(() => {
		if (geometry !== "spherical" && !requestedKey?.startsWith("sc")) return;
		let alive = true;
		const merge = (data: ReferenceTiling[]) => {
			if (!alive || data.length === 0) return;
			setRefList((prev) => {
				const base = prev ?? [];
				const have = new Set(base.map((t) => t.canonicalKey));
				const add = data.map(referenceToCatalogue).filter((t) => !have.has(t.canonicalKey));
				return add.length ? [...base, ...add] : base;
			});
		};
		loadSphericalColorsAtlas().then(merge).catch(() => {});
		const m = requestedKey?.match(/^sc([a-z]+)-(\d+)-/);
		if (m) {
			const solid = SPH_COLORS_SOLIDS.find((s) => s.id.startsWith(m![1]));
			if (solid && sphColorsLazyShardsForK(Number(m[2])).some((s) => s.solid === solid.id)) {
				loadSphericalColorsShard(solid.id, Number(m[2])).then(merge).catch(() => {});
			}
		}
		return () => {
			alive = false;
		};
	}, [geometry, requestedKey]);

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

	// Build the query string for the CURRENT view, read imperatively from the stores. Alphas only travel
	// for a parametric selection: familyAlphas deliberately persists across selections, so a rigid tiling
	// would otherwise carry a stale tuple from whatever family you passed through.
	const selectedKey = selected?.canonicalKey ?? null;
	const hasParamCell = !!paramCell;
	const currentQuery = useCallback(
		() =>
			serializePlayState(
				useConfiguration.getState(),
				hasParamCell ? useFamilyAlphas.getState().values : null,
				selectedKey,
			),
		[hasParamCell, selectedKey],
	);

	// Mirror the view into the URL without navigating, so a reload restores it. replaceState (not
	// router.replace) keeps this off the Next router — no server-component re-run, no history spam.
	//
	// The subscription is IMPERATIVE on purpose: useConfiguration() has no selector, so the hook form
	// would re-render this page (catalogue list included) on every option change. Same reasoning that put
	// familyAlphas in its own store.
	const lastWritten = useRef<string | null>(null);
	useEffect(() => {
		if (!hydrated.current) return;
		let timer: ReturnType<typeof setTimeout> | null = null;
		const write = () => {
			timer = null;
			const q = currentQuery();
			// Skip a no-op write: several store fields that never reach the URL still fire subscribers
			// (hyperbolicClick on every canvas click, the screenshot hover flags), and each redundant
			// replaceState eats into WebKit's budget for no gain.
			if (q === lastWritten.current) return;
			lastWritten.current = q;
			window.history.replaceState(null, "", q ? `${window.location.pathname}?${q}` : window.location.pathname);
		};
		const schedule = () => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(write, URL_MIRROR_DEBOUNCE_MS);
		};
		schedule(); // the selection changed (R / arrows / a deep link resolving) — keep `tiling` honest
		const unsubConfig = useConfiguration.subscribe(schedule);
		const unsubAlphas = useFamilyAlphas.subscribe(schedule);
		return () => {
			if (timer) clearTimeout(timer);
			unsubConfig();
			unsubAlphas();
		};
	}, [currentQuery]);

	// Share: copy a link to exactly this view. Serializes fresh instead of reading window.location.href,
	// so a slider moved less than URL_MIRROR_DEBOUNCE_MS ago is still included — the debounce then only
	// ever serves reload-restore, never the clipboard.
	const [shared, setShared] = useState(false);
	const shareResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const copyLink = useCallback(() => {
		const q = currentQuery();
		const url = `${window.location.origin}${window.location.pathname}${q ? `?${q}` : ""}`;
		navigator.clipboard
			.writeText(url)
			.then(() => {
				setShared(true);
				if (shareResetRef.current) clearTimeout(shareResetRef.current);
				shareResetRef.current = setTimeout(() => setShared(false), 1500);
			})
			.catch(() => {
				/* clipboard blocked (insecure origin or denied permission) — silently no-op */
			});
	}, [currentQuery]);
	useEffect(
		() => () => {
			if (shareResetRef.current) clearTimeout(shareResetRef.current);
		},
		[],
	);

	// The Islamic construction now applies to EVERY class (hyperbolic included — the developed renderer
	// bakes the plain Hankin field, lib/render/hyperbolicIslamic.ts). This guard only fires if a future
	// class opts out of polygonClassSupportsIslamic, so a stale render can't linger when the sidebar
	// hides the control.
	useEffect(() => {
		if (selected && !polygonClassSupportsIslamic(selected) && useConfiguration.getState().isIslamic) {
			useConfiguration.getState().set({ isIslamic: false });
		}
	}, [selected]);

	// WHICH RENDERER OWNS THE CANVAS, answered once for this file and for the Options tab both, in
	// lib/services/shelfRegistry.ts. The two files used to answer it separately from two hand-maintained
	// lists of shelf fields, and the lists had drifted apart: this one folded `hypPoly` into the disk and
	// `sphPoly` into the sphere, the sidebar's did neither, so those records got the flat p5 control block
	// over a canvas this file had already blanked.
	const surface = surfaceOf(selected);
	// An engine-developed hyperbolic tiling swaps the flat p5 renderer for the per-pixel Poincaré-disk shader.
	// Set the store flag (canvas.tsx reads it to blank the flat layer and disable zoom) and force off
	// Euclidean-only render modes so their now-hidden sidebar controls can't leave a stale render behind.
	const isHyperbolic = surface === "disk";
	// A hyperbolic edge-system pattern is Čtrnáct's freedraw moved to H². Like the developed tiling it rides
	// the `hyperbolic` store flag (blank the flat p5 layer, disable zoom) but routes to its own 2D
	// developed-edge canvas instead of the per-pixel shader.
	// A SCHWARZ board is the same object on a (p,q,r) mirror board, so it rides its geometry's flags: the
	// hyperbolic boards behave exactly like the {p,q} edge systems here, the spherical ones like the ico
	// freedraw below. The registry resolves that per record, so no flag here has to fold it in.
	const isHyperbolicEdges = surface === "diskEdges";
	// A hyperbolic COLORED tiling (colors class, hyperbolic geometry): rides the `hyperbolic` store flag like
	// the developed tilings and edge systems, but routes to the per-pixel disk shader in colors mode. The
	// 3.4.n.4 tilings ride it too — same canvas, polygon size standing in for colour index.
	const isHyperbolicColors = surface === "diskColors";
	// A spherical COLORED tiling (colors class, spherical geometry): a three.js overlay like the sphere/ico.
	const isSphColors = surface === "sphereColors";
	// A spherical (Platonic {p,q}) tiling swaps the flat p5 renderer for the three.js sphere view. Set the
	// store flag (canvas.tsx reads it to blank the flat layer) and force off the other render modes so their
	// now-hidden sidebar controls can't leave a stale render behind. The sphere renderer owns its own input.
	const isSpherical = surface === "sphere";
	// A spherical-freedraw pattern is a drawn edge subset of a Platonic solid — a three.js overlay like the
	// Platonic sphere, but with no polygon cell of its own. It shares the sphere's flat-layer blanking (below)
	// while routing to its own IcoFreedrawCanvas in the dispatch chain. The uniform polyhedra, the spherical
	// Schwarz boards and the 3.4.n.4 solids all draw on that same canvas, so they share this flag.
	const isSphericalFreedraw = surface === "sphereEdges";
	// A freedraw pattern swaps the flat p5 renderer for the 2D grid view. It has no polygon cell at all, so
	// force off every mode that would try to draw one and every overlay derived from tiles — the Options tab
	// hides those controls, and this keeps a stale render from surviving the switch.
	//
	// The FIELD, not the surface, and deliberately: the two parametric boards share the grid2d surface but
	// do NOT set this store flag. They draw an opaque layer over the flat p5 canvas and leave it mounted as
	// the input surface (see the dispatch chain below), where setting `freedraw` would blank it.
	const isFreedraw = !!selected?.freedraw;
	// A colored tiling is the same shape of thing: its own 2D canvas, no polygon cell, so it force-clears
	// every mode and tile-derived overlay the flat renderer would otherwise try to draw.
	const isColors = surface === "colors2d";
	useEffect(() => {
		const cfg = useConfiguration.getState();
		if (isColors) {
			cfg.set({
				colors: true,
				hyperbolic: false,
				spherical: false,
				// `inversive` is NOT cleared any more: a coloring has a periodic cell of its own
				// (lib/render/periodic/colorings.ts), so the lens renders it like any other Euclidean class.
				circlePacking: false,
				isTilingRegularOnly: false,
				isIslamic: false,
				showSymmetryElements: false,
				showFundamentalDomain: false,
				showVertexOrbits: false,
			});
		} else if (cfg.colors) {
			cfg.set({ colors: false });
		}
	}, [isColors, selected]);
	// A hollow tiling is the same shape of thing as freedraw/colors: its own 2D canvas, no polygon cell
	// (its faces overlap and self-intersect), so it force-clears every mode and tile-derived overlay the
	// flat renderer would otherwise draw underneath it.
	const isHollow = !!selected?.hollow;
	useEffect(() => {
		const cfg = useConfiguration.getState();
		if (isHollow) {
			cfg.set({
				hollow: true,
				hyperbolic: false,
				spherical: false,
				// `inversive` is NOT cleared any more: hollow faces go through the lens as nonzero-winding,
				// translucent prims (lib/render/periodic/hollow.ts), so the overlaps still accumulate.
				circlePacking: false,
				isTilingRegularOnly: false,
				isIslamic: false,
				showSymmetryElements: false,
				showFundamentalDomain: false,
				showVertexOrbits: false,
			});
		} else if (cfg.hollow) {
			cfg.set({ hollow: false });
		}
	}, [isHollow, selected]);
	useEffect(() => {
		const cfg = useConfiguration.getState();
		if (isFreedraw) {
			cfg.set({
				freedraw: true,
				hyperbolic: false,
				spherical: false,
				// `inversive` is NOT cleared any more: an edge pattern has a periodic cell of its own
				// (lib/render/periodic/edges.ts) — cell fills by face, plus scaffold and drawn strokes.
				circlePacking: false,
				isTilingRegularOnly: false,
				isIslamic: false,
				showSymmetryElements: false,
				showFundamentalDomain: false,
				showVertexOrbits: false,
			});
		} else if (cfg.freedraw) {
			cfg.set({ freedraw: false });
		}
	}, [isFreedraw, selected]);
	useEffect(() => {
		const cfg = useConfiguration.getState();
		// Spherical freedraw rides the same flag: it too is a three.js overlay that must blank the flat p5 layer.
		if (isSpherical || isSphericalFreedraw || isSphColors) {
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
	}, [isSpherical, isSphericalFreedraw, isSphColors, selected]);
	useEffect(() => {
		const cfg = useConfiguration.getState();
		// Hyperbolic edges + colors ride the same flag as the developed tilings: blank the flat layer, disable zoom.
		if (isHyperbolic || isHyperbolicEdges || isHyperbolicColors) {
			cfg.set({ hyperbolic: true, circlePacking: false, isTilingRegularOnly: false });
		} else if (cfg.hyperbolic) {
			cfg.set({ hyperbolic: false });
		}
	}, [isHyperbolic, isHyperbolicEdges, isHyperbolicColors, selected]);

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

	// Step through `geometryList` in its display order (the sidebar's class → sub → k → key), wrapping at both
	// ends so arrow-key browsing never dead-ends. From no selection, forward lands on the first entry and
	// backward on the last.
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
			m: "mirrorFlip",
		};
		// The freedraw view's own trio, shadowing the table above whenever a freedraw pattern is selected.
		const FREEDRAW_TOGGLES: Record<string, keyof ConfigurationState> = {
			g: "freedrawScaffold",
			p: "freedrawLattice",
			o: "freedrawVertices",
			a: "freedrawArcs",
		};
		// The colors view's trio, on the same three keys: G = tile edges, P = period lattice, O = orbit dots.
		const COLORS_TOGGLES: Record<string, keyof ConfigurationState> = {
			g: "colorsEdges",
			p: "colorsLattice",
			o: "colorsVertices",
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.metaKey || e.ctrlKey || e.altKey) return;
			if (isTypingTarget(e)) return;
			const el = e.target as HTMLElement | null;
			// A widget that declares role="application" owns its own arrow keys (the parametric family's 2-D
			// region pad nudges the angle pair with them). Without this, ArrowRight both nudged the angle AND
			// stepped the catalogue to the next tiling, which unmounted the pad mid-gesture.
			if (el?.closest?.('[role="application"]')) return;
			// Spherical view: Fill/Wireframe is a single mutually-exclusive toggle (the quaternion trackball
			// owns rotation, so the flat overlays don't apply). Both W and B flip it — W = Wireframe, B = Fill,
			// either key swaps the pair. Intercept before the flat toggles so B here means the spherical fill,
			// not the global Polygon-fill flag (which is hidden in this view).
			// Freedraw: O toggles ITS orbit dots (freedrawVertices), not the flat canvas's showVertexOrbits.
			// Same key, same idea — orbits of whatever the view is actually made of. G and P do the same for
			// the scaffold and the period lattice. All three are intercepted before the TOGGLES table, which
			// is dead here (a freedraw pattern has no tiles for any of it to act on) — so P meaning the
			// lattice in this view never fights showPolygonPoints.
			// The parametric-pentagon shelf draws through the same 2D grid renderer off the same three store
			// fields, so it takes the same three keys. Gating this on `freedraw` alone left G, P and O dead
			// on that shelf while its own Options block showed the checkboxes they drive.
			// A ("Truchet tiles") applies to a PLAIN tiling as well: every edge counts as connected there,
			// so the overlay has something to draw on any flat shelf. G comes with it once the overlay is
			// up — it is the scaffold that layer draws, and its checkbox sits in the same block. P and O
			// stay scoped to the boards that have a period overlay and grid-point orbits to show.
			const key = e.key.toLowerCase();
			// Read the overlay flag from the STORE, not from the closure: this effect is keyed on the
			// selection, so a value captured here would still be whatever it was when the tiling was
			// picked — which is exactly why G did nothing after A turned the overlay on.
			const arcsUp = useConfiguration.getState().freedrawArcs;
			const freedrawField =
				!!selected?.freedraw || !!selected?.pentEdges || !!selected?.ihEdges
					? FREEDRAW_TOGGLES[key]
					: key === "a" || (key === "g" && arcsUp)
						? FREEDRAW_TOGGLES[key]
						: undefined;
			if (freedrawField) {
				e.preventDefault();
				const c = useConfiguration.getState();
				c.set({ [freedrawField]: !c[freedrawField] } as Partial<ConfigurationState>);
				return;
			}
			// Colors: same interception, same reasoning — a coloring has no tiles for the flat table to act on.
			const colorsField = !!selected?.colors ? COLORS_TOGGLES[e.key.toLowerCase()] : undefined;
			if (colorsField) {
				e.preventDefault();
				const c = useConfiguration.getState();
				c.set({ [colorsField]: !c[colorsField] } as Partial<ConfigurationState>);
				return;
			}
			// Spherical freedraw: one overlay, one key. G = the faint edge grid — the same letter the planar
			// scaffold uses above, and the one both /freedraw arms bind.
			if ((!!selected?.sphericalFreedraw || selected?.schwarz?.geometry === "spherical") && (e.key === "g" || e.key === "G")) {
				e.preventDefault();
				const c = useConfiguration.getState();
				c.set({ sphericalFreedrawGrid: !c.sphericalFreedrawGrid });
				return;
			}
			// Hyperbolic edge system: G toggles the base-tiling scaffold (the faint undrawn edges), the same
			// letter every other freedraw scaffold uses. Its canvas reads freedrawScaffold, so flip that. This
			// is a distinct branch because a hyp-edge pattern lives in the `hypEdges` field, not `freedraw`, so
			// the FREEDRAW_TOGGLES table above never sees it.
			if ((!!selected?.hypEdges || selected?.schwarz?.geometry === "hyperbolic") && (e.key === "g" || e.key === "G")) {
				e.preventDefault();
				const c = useConfiguration.getState();
				c.set({ freedrawScaffold: !c.freedrawScaffold });
				return;
			}
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
			} else {
				const field = TOGGLES[e.key.toLowerCase()];
				const c = useConfiguration.getState();
				// Circle Packing only exists for regular-only tilings, and Islamic applies to every class
				// (hyperbolic bakes the plain Hankin field into its per-pixel shader); symmetry elements /
				// fundamental domain / transition / vertex orbits are flat-canvas only and hidden in hyperbolic;
				// vertex orbits also need the tiling's exact cell (the sidebar disables the checkbox without
				// one). Ignore each key where the sidebar hides/disables the control.
				const isHyperbolic = !!selected?.developed;
				// A freedraw pattern or coloring has no tiles, so every TILE-derived toggle is a dead control
				// there (the Options tab hides them and shows that class's own trio instead). The lens is the
				// exception: it draws those classes from their own periodic cell, so X stays live — matching
				// the checkbox, which is gated on `lensApplies`, not `isFlat`.
				const blocked =
					((!!selected?.freedraw || !!selected?.colors || !!selected?.pentEdges || !!selected?.ihEdges) &&
						field !== "inversive") ||
					(field === "circlePacking" && !c.isTilingRegularOnly) ||
					(field === "isIslamic" && !!selected && !polygonClassSupportsIslamic(selected)) ||
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
	// Spherical-freedraw Display controls (View options tab): mode = polyhedron/sphere, grid = faint edge grid.
	const sphericalFreedrawMode = useConfiguration((s) => s.sphericalFreedrawMode);
	const sphericalFreedrawGrid = useConfiguration((s) => s.sphericalFreedrawGrid);
	// The Tiles overlay and its knobs. On a plain tiling these drive the Truchet reading below; on a
	// freedraw pattern the canvas reads them itself, which is why only the seed is consumed here.
	const freedrawArcs = useConfiguration((s) => s.freedrawArcs);
	const freedrawArcWiring = useConfiguration((s) => s.freedrawArcWiring);
	const freedrawArcTwist = useConfiguration((s) => s.freedrawArcTwist);
	const truchetSeed = useConfiguration((s) => s.truchetSeed);

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
	const baseRenderCell = (selected?.renderCell ?? null) as TranslationalCellData | null;
	// Mirror view. The catalogue counts a chiral tiling and its mirror as one entry, so the other hand is
	// shown by reflecting the render cell here — the single point every flat canvas draws from. The id
	// gets a suffix because the canvases cache parsed geometry by id; without it the flip would not
	// repaint. Reflecting an achiral tiling is a no-op up to a rotation, so leaving it enabled is safe.
	// Never applied to a tiling known to be ACHIRAL: its mirror is congruent to itself, so the flip would
	// be a no-op that leaves the control looking broken, and a `true` left over from a chiral selection
	// must not follow the user onto the next tiling.
	const mirrorFlipCfg = useConfiguration((s) => s.mirrorFlip);
	const mirrorFlip = mirrorFlipCfg && isChiralTiling(selected ?? { wallpaperGroup: undefined }) !== false;
	const renderCell = useMemo(
		() => (mirrorFlip && baseRenderCell ? (reflectRenderCell(baseRenderCell) as TranslationalCellData) : baseRenderCell),
		[mirrorFlip, baseRenderCell],
	);
	const renderCellId = selected?.canonicalKey ? `${selected.canonicalKey}${mirrorFlip ? "#mirror" : ""}` : null;
	// What the conformal lens draws: the selection reduced to the shared periodic-cell IR. One hook covers
	// every Euclidean class, so the lens is no longer limited to the plain polygon-cell tilings.
	// The Truchet reading of a PLAIN tiling: only built while the overlay is up and the selection is one
	// of the shelves the flat canvas draws, so nothing is spent on it otherwise. `truchetSeed` and the
	// wiring chips are both in the key — a reshuffle is a new seed, and the un-shuffled comparison is
	// seed 0, which applies the named wiring to every tile instead of drawing them independently.
	// Deps are VALUES, never `selected` itself: that object's identity changes on renders where the
	// selection has not, and rebuilding here means 36 copies of the cell re-drawn — plus, with the
	// publish effect below keyed on the result, a set/render/rebuild loop that hung the page.
	const truchetOwnCanvas = !!selected?.freedraw || !!selected?.colors;
	const truchetPattern = useMemo(() => {
		if (!freedrawArcs || !renderCell || truchetOwnCanvas) return null;
		return buildTruchetPattern(renderCell, {
			seed: truchetSeed,
			rule: truchetSeed === 0 ? { wiring: freedrawArcWiring, twist: freedrawArcTwist ? 1 : 0 } : null,
		});
	}, [freedrawArcs, renderCell, truchetOwnCanvas, truchetSeed, freedrawArcWiring, freedrawArcTwist]);

	// Publish it for canvas.tsx, which blanks the flat layer while the figures are the picture. Keyed on
	// the BOOLEAN, so it writes when the overlay appears or goes, not on every rebuild of the pattern.
	const truchetActive = !!truchetPattern;
	useEffect(() => {
		useConfiguration.getState().set({ truchetActive });
	}, [truchetActive]);

	const { cell: inversiveCell, cellId: inversiveCellId } = useInversiveCell(
		selected ?? null,
		renderCell,
		truchetPattern,
	);
	// The lens is Euclidean-only: the hyperbolic and spherical shelves have no period lattice to reduce
	// into, and each owns its own renderer below. Same predicate the Options tab uses to decide whether to
	// OFFER the toggle, so a checkbox can no longer appear for a shelf this refuses to honour.
	const lensActive = inversive && !!inversiveCell && lensAppliesTo(selected);
	// Colorings, edge patterns and hollow carry a throwaway translational cell; tell the input layer so
	// click-to-centre doesn't hit-test geometry that isn't on screen.
	const cellHasTiles = !(
		selected?.colors || selected?.freedraw || selected?.hollow || selected?.pentEdges || selected?.ihEdges
	);

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
					decoration={decoration}
					decorationCounts={decorationCounts}
					onDecorationChange={onDecorationChange}
				/>
			</div>
			<div className="flex-1 min-w-0 relative">
				<Canvas
					translationalCell={renderCell}
					translationalCellId={renderCellId}
					paramCell={paramCell ?? null}
					symmetryData={symmetryData}
					orbitData={orbitData}
					spec={tilingSpec}
					showTilingRuleInput={false}
					cellHasTiles={cellHasTiles}
				/>
				{/* Exactly one WebGL overlay at a time: the three.js sphere for a spherical tiling (it owns its
				    own pointer input via ArcballControls, so it sits on top and captures drag/wheel itself),
				    the Poincaré disk for a hyperbolic tiling, else the inversive conformal view when toggled
				    on. The flat p5 Canvas above stays mounted (blanked) as the input layer for the other two. */}
				{lensActive ? (
					// The conformal lens owns the canvas whenever it is on and the selection is Euclidean. It used
					// to sit at the BOTTOM of this chain, which is why every decoration below it silently lost the
					// lens; each Euclidean class now has a periodic-cell representation, so the lens goes first.
					<InversiveCanvas cell={inversiveCell} cellId={inversiveCellId} paramCell={paramCell ?? null} />
				) : selected?.hollow ? (
					// Hollow tiling: self-intersecting {n/d} star polygons whose faces overlap by construction,
					// so there is no polygon cell for the flat canvas to draw. Strokes each closed face path and
					// fills translucently with the nonzero winding rule, so the overlaps accumulate and the
					// density structure shows. Owns its pan/zoom, like freedraw and colors.
					<div className="absolute inset-0 z-10">
						<HollowCanvas patchId={selected.hollow.patch} />
					</div>
				) : selected?.schwarz ? (
					// Schwarz board: Čtrnáct's freedraw on the board cut by a (p,q,r) reflection group. The one
					// shelf that spans two geometries, so it dispatches on its own: a spherical board is finite
					// and draws on the three.js sphere (same canvas as the Platonic freedraw), a hyperbolic one
					// re-develops in the disk through the same per-pixel reducer as every other hyperbolic shelf.
					selected.schwarz.geometry === "spherical" ? (
						<SphSchwarzCanvas
							pattern={selected.schwarz}
							mode={sphericalFreedrawMode}
							showGrid={sphericalFreedrawGrid}
						/>
					) : (
						<HyperbolicEdgesCanvas pattern={hypSchwarzMeta(selected.schwarz)} />
					)
				) : selected?.pentEdges ? (
					// Edge system on a PARAMETRIC pentagon. The record carries no geometry at all, so this canvas
					// solves the Kershner type 1 board at the store's parameter point, recovers the period lattice
					// from the develop, and hands the result to the SAME freedraw renderer every other Euclidean
					// edge system uses — so it pans, zooms and fills like them, off the same store fields. The
					// lens above draws the same period through the same adapter.
					// Owns its own layer like freedraw, colors and hollow do: the flat p5 canvas stays mounted
					// underneath as the input surface, so a plain child would render behind it.
					// Opaque: the flat p5 canvas stays mounted underneath as the input surface, so without a
					// background its tiling shows straight through this one.
					<div className="absolute inset-0 z-10 bg-surface">
						<PentagonEdgesCanvas pattern={selected.pentEdges} />
					</div>
				) : selected?.ihEdges ? (
					// Edge system on a PARAMETRIC ISOHEDRAL tile — the same story as the pentagon above, with
					// the board coming from Tactile instead of a bespoke closure solver, so the shelf reaches
					// any of the 93 types. Same renderer, same store fields, same opaque layer over the p5
					// input surface.
					<div className="absolute inset-0 z-10 bg-surface">
						<IsohedralEdgesCanvas pattern={selected.ihEdges} />
					</div>
				) : selected?.sphEdges ? (
					// Uniform-polyhedron edge system: the same object as a spherical Schwarz board on a prism /
					// antiprism / truncated tetrahedron / cuboctahedron / J27, so it draws through the very same
					// three.js canvas. Those boards mix face sizes, which the adapter never assumed away.
					<SphSchwarzCanvas
						pattern={selected.sphEdges}
						mode={sphericalFreedrawMode}
						showGrid={sphericalFreedrawGrid}
					/>
				) : selected?.sphPoly ? (
					// A 3.4.n.4 tiling on the sphere: its own solid, faces filled by polygon size, every edge a
					// boundary. Same three.js canvas as every other spherical Čtrnáct shelf.
					<SphPolyCanvas pattern={selected.sphPoly} mode={sphericalFreedrawMode} showGrid={sphericalFreedrawGrid} />
				) : selected?.hypPoly ? (
					// 3.4.n.4 tiling by regular polygons: not a decoration, so every edge is a real boundary and
					// each face is filled by its POLYGON SIZE. That is the colored-tiling render exactly, so it
					// uses that canvas with the size index standing in for the colour index.
					<HyperbolicColorsCanvas pattern={hypPolyMeta(selected.hypPoly)} />
				) : isSpherical && selected?.spherical ? (
					<SphericalCanvas solidId={selected.spherical.solid} />
				) : selected?.sphericalFreedraw ? (
					// Spherical freedraw: a drawn edge subset of a Platonic solid, on its own three.js canvas with
					// ArcballControls (drag to rotate, wheel to zoom) — the same self-contained renderer the
					// /freedraw spherical arm uses. Mode (polyhedron/sphere) and grid come from the View options tab,
					// the same two controls the /freedraw arm carries; it owns its own pointer input.
					<IcoFreedrawCanvas
						pattern={selected.sphericalFreedraw.pattern}
						solidId={selected.sphericalFreedraw.solid}
						mode={sphericalFreedrawMode}
						showGrid={sphericalFreedrawGrid}
					/>
				) : selected?.freedraw ? (
					// Freedraw pattern: drawn grid edges + cells coloured by face, on its own 2D canvas. It owns
					// its pan/zoom (the flat canvas has no cell here to pan), so it sits on top and takes the input.
					<FreedrawPlayCanvas pattern={selected.freedraw} />

				) : selected?.colors ? (
					// Colored square tiling: the color field with tile edges, on its own 2D canvas — same
					// contract as freedraw (no polygon cell, owns its pan/zoom).
					<ColorsPlayCanvas pattern={selected.colors} />
				) : selected?.sphColors ? (
					// Spherical colored tiling: an n-coloring of a Platonic solid on its own three.js canvas with
					// ArcballControls, the exact sibling of the ico-freedraw sphere. Mode (polyhedron/sphere) comes
					// from the View options tab; it owns its own pointer input.
					<SphericalColorsCanvas pattern={selected.sphColors.pattern} mode={sphericalFreedrawMode} />
				) : selected?.hypColors ? (
					// Hyperbolic colored tiling: an n-coloring of a {p,q} tiling, the per-pixel disk shader in colors
					// mode — fills to the rim, infinite drift-free pan, GPU, exactly like the edge systems.
					<HyperbolicColorsCanvas pattern={selected.hypColors} />
				) : selected?.hypEdges ? (
					// Hyperbolic edge system: Čtrnáct's freedraw in H². Re-develops the darts under the view and
					// draws the merged-tile fill + drawn/scaffold strokes, with the same store-driven pan as the
					// developed tiling. Always 2D (the edge field is not baked for the per-pixel renderer).
					<HyperbolicEdgesCanvas pattern={selected.hypEdges} />
				) : selected?.developed ? (
					// Engine-developed tiling: explicit Poincaré geometry from the Čtrnáct SU(1,1) developer,
					// drawn as geodesic polygons with the same store-driven pan. Handles the arbitrary
					// regular-faced tilings the (2,p,q) fold shader cannot.
					<HyperbolicDevelopedCanvas patchId={selected.developed.patch} />
				) : null}
				{/* Truchet figures over a PLAIN tiling. Deliberately OUTSIDE the exclusive canvas chain above:
				    it is an overlay, not a renderer, so the flat canvas keeps drawing the tiling and keeps
				    owning the pointer. It reads the same `controls` the flat uniforms come from, so toggling
				    it cannot move the picture. Not while the lens is on — the conformal view draws the same
				    figures itself, through the periodic-cell IR, and a flat layer over a warped one is two
				    different pictures at once. */}
				{truchetPattern && !inversive ? <TruchetOverlay pattern={truchetPattern} /> : null}
				{paramCell ? <ParamSliderPanel paramCell={paramCell} /> : null}
				{/* The pentagon family's shape controls sit OUTSIDE the exclusive canvas chain above, because
				    the family is still what is being drawn when the conformal lens replaces the flat view —
				    the sliders have to survive that swap. Their values live in the store for the same reason. */}
				{selected?.pentEdges ? <PentagonEdgesControls /> : null}
				{selected?.ihEdges ? <IsohedralEdgesControls ih={selected.ihEdges.ih} /> : null}
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
				{/* Share: copies a link carrying every view option plus the selected tiling — the URL the
				    mirror effect keeps live. Second slot in the same top-right control column; the
				    symmetry-info badge insets itself left of that column (canvas.tsx `right-16`), so they
				    never overlap however tall the badge grows. */}
				<Tooltip label={shared ? "Link copied" : "Copy link to this view"} side="left" delay={0}>
					<button
						type="button"
						onClick={copyLink}
						aria-label="Copy link to this view"
						className={cn(
							"absolute top-16 right-4 z-30 flex items-center justify-center rounded-lg p-2 text-fg-muted bg-surface-overlay/80 backdrop-blur-sm border border-line hover:text-fg hover:border-line-strong transition-colors",
						)}
					>
						{shared ? <Check size={16} className="text-success" /> : <Link2 size={16} />}
					</button>
				</Tooltip>
				{/* Screenshot: canvas.tsx runs the capture (createGraphics patch → preview modal) when it sees
				    takeScreenshot flip; hovering frames the crop region via screenshotButtonHover. Third slot
				    in the top-right stack, below Share. Hidden until the capture is ready. */}
				{SCREENSHOT_BUTTONS_ENABLED ? (
					<button
						type="button"
						onClick={() => useConfiguration.getState().set({ takeScreenshot: true })}
						onMouseEnter={() => useConfiguration.getState().set({ screenshotButtonHover: true })}
						onMouseLeave={() => useConfiguration.getState().set({ screenshotButtonHover: false })}
						title="Screenshot"
						aria-label="Take screenshot"
						className={cn(
							"absolute top-28 right-4 z-30 flex items-center justify-center rounded-lg p-2 text-fg-muted bg-surface-overlay/80 backdrop-blur-sm border border-line hover:text-fg hover:border-line-strong transition-colors",
						)}
					>
						<Camera size={16} />
					</button>
				) : null}
			</div>
		</div>
	);
}
