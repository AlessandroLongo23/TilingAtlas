"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Library, Link2, Loader2, X } from "lucide-react";
import { PageSidebar } from "@/components/page-sidebar";
import { ButtonGroup } from "@/components/ui/button-group";
import { ToggleButton } from "@/components/ui/toggle-button";
import { Pagination } from "@/components/ui/pagination";
import { ReferenceCard } from "@/components/reference-card";
import { WallpaperGroupTooltip } from "@/components/wallpaper-group-diagram";
import { LatticeTooltip } from "@/components/lattice-diagram";
import {
	loadReferenceAtlas,
	loadReferenceAtlasShard,
	loadComposableAtlasShard,
	loadIsotoxalAtlasShard,
	matchesReferenceFilters,
	partitionKeyOf,
	starFoldsOf,
	tileClassOf,
	geometryOf,
	GEOMETRY_ORDER,
	GEOMETRY_LABEL,
	TILE_CLASS_ORDER,
	TILE_CLASS_LABEL,
	COMPOSABLE_SHARD_KS as COMPOSABLE_HIGHER_K,
	ISOTOXAL_SHARD_KS as ISOTOXAL_HIGHER_K,
	type Certification,
	type Geometry,
	type ReferenceTiling,
	type ReferenceFilter,
	type TileClass,
	type IslamicSystem,
} from "@/lib/services/referenceAtlas";
import {
	WALLPAPER_GROUPS,
	isGroupOnLattice,
	type LatticeShape,
	type WallpaperGroup,
} from "@/lib/classes/symmetry/types";

// The unified Tiling Library: one display-only atlas of every tiling (regular k=1..7 + stars in the
// base file; regular k=8..10 as lazy per-k shards loaded on demand), fetched from public/reference-
// atlas*.json. Each entry carries a DISCOVERER (historical
// first-finder), a CERTIFICATION (proven / reproduced / candidate), and a vertex-type classification
// (k, M, partition — see referenceAtlas.ts). Filters are flat and always-open (no accordion); groups
// irrelevant to the current tile-class selection are hidden rather than shown as dead controls.
//
// k / M / partition are SINGLE-select (pick one, or "All"). M and partition only appear once a k is
// chosen, and their chips are faceted to values that actually occur under the current filters — so at
// k=4 you see M ∈ {2,3,4}, never a dead M=1 button.
// Derived from the shared registry (referenceAtlas TILE_CLASS_ORDER/LABEL) — the SAME source /play's
// catalogue groups read, so the two pages' class axes can never drift.
// The geometry axis is the top-level split now, so hyperbolic/spherical are their OWN geometries — not
// tile classes. Drop them from the class chips; the remaining classes are all Euclidean and only ever
// show while the Euclidean geometry is selected.
const CLASS_OPTIONS: { value: "all" | TileClass; label: string }[] = [
	{ value: "all", label: "All" },
	...TILE_CLASS_ORDER.filter((c) => c !== "hyperbolic" && c !== "spherical").map((c) => ({
		value: c,
		label: TILE_CLASS_LABEL[c].short,
	})),
];
const GEOMETRY_OPTIONS: { value: Geometry; label: string }[] = GEOMETRY_ORDER.map((g) => ({
	value: g,
	label: GEOMETRY_LABEL[g],
}));
// Convex-irregular-shelf facet: the whole demo, only decomposable-family tilings, or only the ones that
// reach for a non-decomposable composite. Shown only while the convex-irregular tile class is selected.
const DECOMP_OPTIONS: { value: "all" | "decomposable" | "non-decomposable"; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "decomposable", label: "Decomposable" },
	{ value: "non-decomposable", label: "Uses non-decomp." },
];
const PARAM_OPTIONS: { value: "all" | "rigid" | "family"; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "rigid", label: "Rigid" },
	{ value: "family", label: "α-family" },
];
// Isotoxal-shelf Shape facet: how many tile angles flex independently. 1 free angle (α-family) vs 2
// independent free angles (α, β-family). There is no rigid bucket — the isotoxal exporter only emits
// flexing families, so every shipped isotoxal tiling has P ∈ {1, 2}. Shown only for the isotoxal class.
const ISOTOXAL_SHAPE_OPTIONS: { value: "all" | "alpha" | "alpha-beta"; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "alpha", label: "α-family" },
	{ value: "alpha-beta", label: "α, β-family" },
];
// Scaled-shelf sub-class facet: which side lengths the tiling spans. "Sides 1–2" is the former Doubled
// class (no side-3 tile); "Sides 1–3" is the tilings that use a side-3 tile. Shown only for the scaled class.
const SCALE_SET_OPTIONS: { value: "all" | "s12" | "s123"; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "s12", label: "Sides 1–2" },
	{ value: "s123", label: "Sides 1–3" },
];
// Polyomino-shelf sub-class facet: which polyomino ORDER the tiles belong to. Only "Tetrominoes" exists
// today (the Tetris set); pentominoes etc. extend this. Shown only for the polyomino class.
const POLY_ORDER_OPTIONS: { value: "all" | "tetromino"; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "tetromino", label: "Tetrominoes" },
];
// Islamic-shelf sub-class facet: Bonner's design system (the underlying tile kit). Shown only for the
// Islamic class. See docs/ISLAMIC_TILINGS.md.
const ISLAMIC_SYSTEM_OPTIONS: { value: "all" | IslamicSystem; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "regular", label: "Regular" },
	{ value: "fourfold-a", label: "Fourfold A" },
	{ value: "fourfold-b", label: "Fourfold B" },
	{ value: "fivefold", label: "Fivefold" },
	{ value: "sevenfold", label: "Sevenfold" },
	{ value: "nonsystematic", label: "Nonsystematic" },
	{ value: "dual-level", label: "Dual-level" },
];
const ISLAMIC_SYSTEM_VALUES = ISLAMIC_SYSTEM_OPTIONS.map((o) => o.value).filter((v): v is IslamicSystem => v !== "all");
const DISCOVERER_OPTIONS: { value: string; label: string }[] = [
	{ value: "Kepler", label: "Kepler" },
	{ value: "Krötenheerdt", label: "Krötenheerdt" },
	{ value: "Chavey", label: "Chavey" },
	{ value: "Brian Galebach", label: "Galebach" },
	{ value: "Marek Čtrnáct", label: "Čtrnáct" },
	{ value: "Joseph Myers", label: "Myers" },
	{ value: "Alessandro Longo", label: "Longo" },
];
const CERT_OPTIONS: { value: Certification; label: string }[] = [
	{ value: "proven", label: "Proven" },
	{ value: "reproduced", label: "Reproduced" },
	{ value: "candidate", label: "Candidate" },
];
const LATTICE_ORDER: LatticeShape[] = ["square", "hexagonal", "rhombic", "rectangular", "oblique"];
const COLUMN_PRESETS = [3, 4, 5, 6];
// Page-size choices for the header dropdown; 25 is the default.
const PAGE_SIZE_OPTIONS = [10, 25, 50];
const DEFAULT_PAGE_SIZE = 25;
// Čtrnáct tiers beyond the base atlas (k≤7), shipped as separate lazy shards (public/reference-atlas-
// k{k}.json). Their k chips always show; selecting one fetches the shard on demand and merges it in.
const HIGHER_K = [8, 9, 10];
// Convex-irregular (COMPOSABLE_HIGHER_K) and isotoxal (ISOTOXAL_HIGHER_K) demo tiers held out of the eager
// main file as lazy shards — imported from referenceAtlas so /play's browse tree reads the SAME tier list
// (they drifted before: the shelf knew isotoxal k=4 while /play did not). k≤2 ship in the main file; these
// load on demand when the class or a k≥3 chip is selected. The isotoxal ks are tracked in DEDICATED shard
// state (below) because they collide with the convex-irregular shard ks in the shared number-keyed sets.
const ALL_NUM = 0; // sentinel: the "All" chip for a single-select numeric group (k / M)
const ALL_STR = ""; // sentinel: the "All" chip for the partition group

// Enum whitelists for URL parsing — a hand-edited or stale link can carry any string, so only accept
// values the filter actually understands (an unknown one is dropped, never injected into state).
const TILE_CLASS_VALUES = CLASS_OPTIONS.map((o) => o.value).filter((v): v is TileClass => v !== "all");
const CERT_VALUES = CERT_OPTIONS.map((o) => o.value);

// ── URL ⇆ view state ──────────────────────────────────────────────────────────────────────────────
// The whole view (every filter field + the page, page-size and column-count prefs) round-trips through
// the query string: a reload restores the exact view, and the "Copy link" button hands a friend a link
// that reproduces it. parseViewState and serializeView are inverse — add a field to one, add it to the
// other. Keys are short and stable (they're a shared URL contract): k, class, decomp, m, partition,
// maximal, folds, param, iso, group, lattice, by, cert, polygon, q + page, size, cols.
interface ViewState {
	filters: ReferenceFilter;
	page: number;
	pageSize: number;
	gridColumns: number;
}

function parseViewState(sp: URLSearchParams): ViewState {
	const f: ReferenceFilter = {};
	const num = (key: string): number | undefined => {
		const v = sp.get(key);
		if (v == null) return undefined;
		const n = Number(v);
		return Number.isFinite(n) ? n : undefined;
	};
	const list = (key: string): string[] | undefined => {
		const v = sp.get(key);
		if (!v) return undefined;
		const items = v.split(",").map((s) => s.trim()).filter(Boolean);
		return items.length ? items : undefined;
	};

	const k = num("k");
	if (k != null) f.kValue = k;
	// Geometry is the top-level axis; default euclidean when the link omits it.
	const geo = sp.get("geo");
	f.geometry = geo === "hyperbolic" || geo === "spherical" ? geo : "euclidean";
	const cls = sp.get("class");
	if (cls === "hyperbolic" || cls === "spherical") {
		// Back-compat: geometry used to be a tile-class chip. Promote an old link's class to the geometry
		// axis and leave tileClass unset.
		f.geometry = cls;
	} else if (cls && (TILE_CLASS_VALUES as string[]).includes(cls)) {
		f.tileClass = cls as TileClass;
	}
	const decomp = sp.get("decomp");
	if (decomp === "decomposable" || decomp === "non-decomposable") f.convexDecomp = decomp;
	const m = num("m");
	if (m != null) f.mValue = m;
	const partition = sp.get("partition");
	if (partition) f.partitionKey = partition;
	if (sp.get("maximal") === "1") f.maximalOnly = true;
	const folds = list("folds")?.map(Number).filter((n) => Number.isFinite(n));
	if (folds?.length) f.starFolds = folds;
	const param = sp.get("param");
	if (param === "rigid" || param === "family") f.parametric = param;
	const iso = sp.get("iso");
	if (iso === "alpha" || iso === "alpha-beta") f.isotoxalShape = iso;
	const scaleSet = sp.get("scaleset");
	if (scaleSet === "s12" || scaleSet === "s123") f.scaledScaleSet = scaleSet;
	const polyOrder = sp.get("polyorder");
	if (polyOrder === "tetromino") f.polyominoOrder = polyOrder;
	const islamicSystem = sp.get("islamicsystem");
	if (islamicSystem && (ISLAMIC_SYSTEM_VALUES as string[]).includes(islamicSystem)) f.islamicSystem = islamicSystem as IslamicSystem;
	const groups = list("group")?.filter((g): g is WallpaperGroup => (WALLPAPER_GROUPS as readonly string[]).includes(g));
	if (groups?.length) f.wallpaperGroups = groups;
	const lattices = list("lattice")?.filter((s): s is LatticeShape => (LATTICE_ORDER as string[]).includes(s));
	if (lattices?.length) f.latticeShapes = lattices;
	const discoverers = list("by");
	if (discoverers?.length) f.discoverers = discoverers;
	const certs = list("cert")?.filter((c): c is Certification => (CERT_VALUES as string[]).includes(c));
	if (certs?.length) f.certifications = certs;
	const polygons = list("polygon");
	if (polygons?.length) f.polygonNames = polygons;
	const q = sp.get("q");
	if (q) f.query = q;

	const page = num("page");
	const size = num("size");
	const cols = num("cols");
	return {
		filters: f,
		page: page != null && page >= 1 ? Math.floor(page) : 1,
		pageSize: size != null && PAGE_SIZE_OPTIONS.includes(size) ? size : DEFAULT_PAGE_SIZE,
		gridColumns: cols != null ? Math.min(6, Math.max(3, Math.floor(cols))) : 5,
	};
}

function serializeView(v: ViewState): string {
	const p = new URLSearchParams();
	const f = v.filters;
	if (f.kValue != null) p.set("k", String(f.kValue));
	// Euclidean is the default, so only non-euclidean geometries need a URL param.
	if (f.geometry && f.geometry !== "euclidean") p.set("geo", f.geometry);
	if (f.tileClass) p.set("class", f.tileClass);
	if (f.convexDecomp) p.set("decomp", f.convexDecomp);
	if (f.mValue != null) p.set("m", String(f.mValue));
	if (f.partitionKey) p.set("partition", f.partitionKey);
	if (f.maximalOnly) p.set("maximal", "1");
	if (f.starFolds?.length) p.set("folds", f.starFolds.join(","));
	if (f.parametric) p.set("param", f.parametric);
	if (f.isotoxalShape) p.set("iso", f.isotoxalShape);
	if (f.scaledScaleSet) p.set("scaleset", f.scaledScaleSet);
	if (f.polyominoOrder) p.set("polyorder", f.polyominoOrder);
	if (f.islamicSystem) p.set("islamicsystem", f.islamicSystem);
	if (f.wallpaperGroups?.length) p.set("group", f.wallpaperGroups.join(","));
	if (f.latticeShapes?.length) p.set("lattice", f.latticeShapes.join(","));
	if (f.discoverers?.length) p.set("by", f.discoverers.join(","));
	if (f.certifications?.length) p.set("cert", f.certifications.join(","));
	if (f.polygonNames?.length) p.set("polygon", f.polygonNames.join(","));
	if (f.query?.trim()) p.set("q", f.query.trim());
	if (v.page > 1) p.set("page", String(v.page));
	if (v.pageSize !== DEFAULT_PAGE_SIZE) p.set("size", String(v.pageSize));
	if (v.gridColumns !== 5) p.set("cols", String(v.gridColumns));
	return p.toString();
}

// A flat, always-visible filter group: a static heading (optional accent summary + right-aligned note)
// over its controls. Replaces the old collapsible SidebarSection in this shelf.
function FilterGroup({
	title,
	summary,
	note,
	children,
}: {
	title: string;
	summary?: ReactNode;
	note?: string;
	children: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-2 border-t border-line-subtle pt-3 first:border-t-0 first:pt-0">
			<div className="flex items-baseline justify-between gap-2">
				<h3 className="text-xs font-medium text-fg-secondary">
					{title}
					{summary ? <span className="ml-1.5 font-normal text-accent">{summary}</span> : null}
				</h3>
				{note ? <span className="text-[10px] uppercase tracking-wide text-fg-disabled">{note}</span> : null}
			</div>
			{children}
		</section>
	);
}

export function ReferenceShelf() {
	const router = useRouter();
	const searchParams = useSearchParams();
	// Parse the URL exactly once, on mount. After this we only WRITE the URL (one-way, via replaceState
	// below) — we never re-read it, so browser back/forward inside the page isn't a filter-state source.
	const [initialView] = useState(() => parseViewState(searchParams));
	const [tilings, setTilings] = useState<ReferenceTiling[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [filters, setFilters] = useState<ReferenceFilter>(initialView.filters);
	const [gridColumns, setGridColumns] = useState(initialView.gridColumns);
	const [pageSize, setPageSize] = useState(initialView.pageSize);
	const [currentPage, setCurrentPage] = useState(initialView.page);
	const [copied, setCopied] = useState(false);
	const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [loadedShards, setLoadedShards] = useState<Set<number>>(new Set());
	const [loadingShards, setLoadingShards] = useState<Set<number>>(new Set());
	const [shardErrors, setShardErrors] = useState<Map<number, string>>(new Map());
	// Dedicated isotoxal shard tracking — its k=3 collides with the convex-irregular k=3 in the shared sets.
	const [isotoxalLoadedShards, setIsotoxalLoadedShards] = useState<Set<number>>(new Set());
	const [isotoxalLoadingShards, setIsotoxalLoadingShards] = useState<Set<number>>(new Set());

	useEffect(() => {
		let alive = true;
		loadReferenceAtlas()
			.then((d) => alive && setTilings(d))
			.catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
		return () => {
			alive = false;
		};
	}, []);

	// Reset to page 1 whenever filters or page size change — but skip the initial mount, so a shared or
	// reloaded ?page=N link lands on page N instead of being clobbered back to 1.
	const skipPageReset = useRef(true);
	useEffect(() => {
		if (skipPageReset.current) {
			skipPageReset.current = false;
			return;
		}
		setCurrentPage(1);
	}, [filters, pageSize]);

	// Mirror the whole view into the URL without navigating — a reload restores it and "Copy link" hands
	// a friend the exact same view. replaceState (not router.replace) keeps this off the Next router, so
	// it neither re-runs the server component nor spams history; useSearchParams is read once on mount.
	useEffect(() => {
		const q = serializeView({ filters, page: currentPage, pageSize, gridColumns });
		window.history.replaceState(null, "", q ? `${window.location.pathname}?${q}` : window.location.pathname);
	}, [filters, currentPage, pageSize, gridColumns]);

	const copyLink = useCallback(() => {
		navigator.clipboard
			.writeText(window.location.href)
			.then(() => {
				setCopied(true);
				if (copyResetRef.current) clearTimeout(copyResetRef.current);
				copyResetRef.current = setTimeout(() => setCopied(false), 1500);
			})
			.catch(() => {
				/* clipboard blocked (insecure origin or denied permission) — silently no-op */
			});
	}, []);
	useEffect(
		() => () => {
			if (copyResetRef.current) clearTimeout(copyResetRef.current);
		},
		[],
	);

	// Lazy k≥8 shards: selecting the k fetches public/reference-atlas-k{k}.json once and merges the
	// records into `tilings`, so every derived facet (k chips, filtered, pagination) picks them up. A
	// failed shard is sticky (won't refetch until Clear) and surfaces an inline error by the count.
	useEffect(() => {
		const k = filters.kValue;
		if (k == null || k < 8) return;
		if (loadedShards.has(k) || loadingShards.has(k) || shardErrors.has(k)) return;
		setLoadingShards((s) => new Set(s).add(k));
		loadReferenceAtlasShard(k)
			.then((data) => {
				setTilings((prev) => (prev ? [...prev, ...data] : data));
				setLoadedShards((s) => new Set(s).add(k));
			})
			.catch((e) => setShardErrors((m) => new Map(m).set(k, e instanceof Error ? e.message : String(e))))
			.finally(() =>
				setLoadingShards((s) => {
					const n = new Set(s);
					n.delete(k);
					return n;
				}),
			);
	}, [filters.kValue, loadedShards, loadingShards, shardErrors]);

	// Lazy convex-irregular k≥3 shards. The demo keeps k≤2 in the main atlas and splits each higher k into
	// public/reference-atlas-composable-k{k}.json (COMPOSABLE_HIGHER_K). Fetch a shard when it's in view:
	// the convex-irregular class is selected (pull all its shards so the shelf fills in), or a convex-irregular
	// shard-k chip is picked (also under "All", where k=3 includes it). Convex-irregular shard ks (3)
	// never collide with the regular shard ks (8/9/10), so the shared loaded/loading/error state is safe.
	// A missing shard resolves to an empty merge inside the loader — no error is surfaced (it's a demo).
	useEffect(() => {
		const cls = filters.tileClass;
		if (cls !== "convex" && cls != null) return; // regular/star only — no convex-irregular shard needed
		const k = filters.kValue;
		const want =
			k != null
				? COMPOSABLE_HIGHER_K.filter((kk) => kk === k)
				: cls === "convex"
					? COMPOSABLE_HIGHER_K
					: [];
		for (const kk of want) {
			if (loadedShards.has(kk) || loadingShards.has(kk) || shardErrors.has(kk)) continue;
			setLoadingShards((s) => new Set(s).add(kk));
			loadComposableAtlasShard(kk)
				.then((data) => {
					setTilings((prev) => (prev ? [...prev, ...data] : data));
					setLoadedShards((s) => new Set(s).add(kk));
				})
				.catch((e) => setShardErrors((m) => new Map(m).set(kk, e instanceof Error ? e.message : String(e))))
				.finally(() =>
					setLoadingShards((s) => {
						const n = new Set(s);
						n.delete(kk);
						return n;
					}),
				);
		}
	}, [filters.tileClass, filters.kValue, loadedShards, loadingShards, shardErrors]);

	// Lazy isotoxal k≥3 shards — same shape as the convex-irregular effect, but with dedicated shard state
	// (its k=3 collides with convex-irregular's in the shared number-keyed sets). Fetch when the isotoxal
	// class or a k≥3 chip is in view. A missing shard resolves to an empty merge inside the loader.
	useEffect(() => {
		const cls = filters.tileClass;
		if (cls !== "isotoxal" && cls != null) return;
		const k = filters.kValue;
		const want =
			k != null ? ISOTOXAL_HIGHER_K.filter((kk) => kk === k) : cls === "isotoxal" ? ISOTOXAL_HIGHER_K : [];
		for (const kk of want) {
			if (isotoxalLoadedShards.has(kk) || isotoxalLoadingShards.has(kk)) continue;
			setIsotoxalLoadingShards((s) => new Set(s).add(kk));
			loadIsotoxalAtlasShard(kk)
				.then((data) => {
					setTilings((prev) => (prev ? [...prev, ...data] : data));
					setIsotoxalLoadedShards((s) => new Set(s).add(kk));
				})
				.catch(() => setIsotoxalLoadedShards((s) => new Set(s).add(kk))) // best-effort demo; swallow + mark done
				.finally(() =>
					setIsotoxalLoadingShards((s) => {
						const n = new Set(s);
						n.delete(kk);
						return n;
					}),
				);
		}
	}, [filters.tileClass, filters.kValue, isotoxalLoadedShards, isotoxalLoadingShards]);

	// ── single-select setters (each clears the now-stale downstream selections) ──
	const setKValue = (k: number | undefined) =>
		setFilters({ ...filters, kValue: k, mValue: undefined, partitionKey: undefined });
	const setMValue = (m: number | undefined) => setFilters({ ...filters, mValue: m, partitionKey: undefined });
	const setPartitionKey = (p: string | undefined) => setFilters({ ...filters, partitionKey: p });
	const toggleMaximal = () => setFilters({ ...filters, maximalOnly: filters.maximalOnly ? undefined : true });
	const setParametric = (v: "all" | "rigid" | "family") =>
		setFilters({ ...filters, parametric: v === "all" ? undefined : v });
	const setIsotoxalShape = (v: "all" | "alpha" | "alpha-beta") =>
		setFilters({ ...filters, isotoxalShape: v === "all" ? undefined : v });
	const setTileClass = (v: "all" | TileClass) => {
		const cls = v === "all" ? undefined : v;
		const next: ReferenceFilter = { ...filters, tileClass: cls };
		// k chips are faceted per class — if the current k isn't covered by the new class (e.g. k=10
		// under Star), drop it (and its now-stale M/partition) so we don't silently filter to 0.
		if (next.kValue != null && !kValuesForClass(cls).has(next.kValue)) {
			next.kValue = undefined;
			next.mValue = undefined;
			next.partitionKey = undefined;
		}
		// The decomposable facet only means something inside the convex-irregular class — drop it otherwise.
		if (v !== "convex") next.convexDecomp = undefined;
		// The isotoxal Shape facet only means something inside the isotoxal class — drop it otherwise.
		if (v !== "isotoxal") next.isotoxalShape = undefined;
		// The scale-set (sides 1-2 / 1-3) facet only means something inside the scaled class — drop it otherwise.
		if (v !== "scaled") next.scaledScaleSet = undefined;
		// The polyomino-order facet only means something inside the polyomino class — drop it otherwise.
		if (v !== "polyomino") next.polyominoOrder = undefined;
		// The Islamic-system facet only means something inside the Islamic class — drop it otherwise.
		if (v !== "islamic") next.islamicSystem = undefined;
		if (v === "islamic") {
			// The Islamic tessellations carry no m/partition/wallpaper/star-fold classification yet.
			next.starFolds = undefined;
			next.parametric = undefined;
			next.wallpaperGroups = undefined;
			next.latticeShapes = undefined;
		}
		if (v === "regular") {
			next.starFolds = undefined;
			next.parametric = undefined;
		} else if (v === "star") {
			next.wallpaperGroups = undefined;
			next.latticeShapes = undefined;
		} else if (v === "convex" || v === "isotoxal") {
			// No star folds, α-family, wallpaper group, or lattice on the composite-tile / isotoxal demos.
			next.starFolds = undefined;
			next.parametric = undefined;
			next.wallpaperGroups = undefined;
			next.latticeShapes = undefined;
		}
		setFilters(next);
	};
	const setConvexDecomp = (v: "all" | "decomposable" | "non-decomposable") =>
		setFilters({ ...filters, convexDecomp: v === "all" ? undefined : v });
	const setScaledScaleSet = (v: "all" | "s12" | "s123") =>
		setFilters({ ...filters, scaledScaleSet: v === "all" ? undefined : v });
	const setPolyominoOrder = (v: "all" | "tetromino") =>
		setFilters({ ...filters, polyominoOrder: v === "all" ? undefined : v });
	const setIslamicSystem = (v: "all" | IslamicSystem) =>
		setFilters({ ...filters, islamicSystem: v === "all" ? undefined : v });

	// ── multi-select setters (empty ⇒ undefined so the filter clears and the active-count stays honest) ──
	const toggleIn = <T,>(key: keyof ReferenceFilter, cur: readonly T[], v: T) => {
		const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
		setFilters({ ...filters, [key]: next.length ? next : undefined } as ReferenceFilter);
	};
	const toggleFold = (n: number) => toggleIn("starFolds", filters.starFolds ?? [], n);
	const toggleGroup = (g: WallpaperGroup) => toggleIn("wallpaperGroups", filters.wallpaperGroups ?? [], g);
	// Lattice is single-select — it drives which wallpaper groups are realizable, so at most one at a
	// time. Re-clicking the active shape clears it; switching shape drops any now-incompatible group so
	// the group filter never contradicts the chosen lattice.
	const selectShape = (s: LatticeShape) => {
		const next = filters.latticeShapes?.[0] === s ? undefined : s;
		const groups = next
			? filters.wallpaperGroups?.filter((g) => isGroupOnLattice(g, next))
			: filters.wallpaperGroups;
		setFilters({
			...filters,
			latticeShapes: next ? [next] : undefined,
			wallpaperGroups: groups?.length ? groups : undefined,
		});
	};
	const toggleDiscoverer = (d: string) => toggleIn("discoverers", filters.discoverers ?? [], d);
	const toggleCert = (c: Certification) => toggleIn("certifications", filters.certifications ?? [], c);

	// The active geometry (default euclidean) — the top-level axis. Off the plane, the Euclidean-only
	// sub-filters (tile class, star, lattice, wallpaper group, M/partition) are hidden.
	const geometry = filters.geometry ?? "euclidean";
	const isEuclidean = geometry === "euclidean";
	// Switch geometry: clear every Euclidean-only filter (they mean nothing off the plane) and reset k —
	// a k valid in one geometry (e.g. a Euclidean k=2) may filter the new one to zero.
	const setGeometry = (g: Geometry) => {
		if (g === geometry) return;
		setFilters(
			g === "euclidean"
				? { ...filters, geometry: g, kValue: undefined, mValue: undefined, partitionKey: undefined, maximalOnly: undefined }
				: {
						geometry: g,
						// keep the cross-geometry axes (provenance + search); drop everything Euclidean-only
						discoverers: filters.discoverers,
						certifications: filters.certifications,
						query: filters.query,
					},
		);
	};

	// ── option sets: only offer filters some in-scope tiling can actually satisfy ──
	// The k's a given tile class actually covers. Faceted, so Star/Convex-irregular (k=1..3 today) never show
	// a dead k=10 button. The lazy higher-k tiers (8/9/10) are all regular Čtrnáct, so they're offered
	// only when regular tilings are in scope (All or Regular) — before their shard is even fetched.
	const kValuesForClass = useCallback(
		(cls: TileClass | undefined): Set<number> => {
			const s = new Set<number>();
			if (tilings) for (const t of tilings) if (!cls || tileClassOf(t) === cls) s.add(t.k);
			if (!cls || cls === "regular") for (const k of HIGHER_K) s.add(k);
			// Convex-irregular k≥3 lives in lazy shards not yet in `tilings`; show their chips up front (like the
			// regular HIGHER_K) so selecting one can trigger the fetch.
			if (!cls || cls === "convex") for (const k of COMPOSABLE_HIGHER_K) s.add(k);
			if (!cls || cls === "isotoxal") for (const k of ISOTOXAL_HIGHER_K) s.add(k);
			return s;
		},
		[tilings],
	);
	const kChips = useMemo(() => {
		const s = new Set<number>();
		if (tilings)
			for (const t of tilings) {
				if (geometryOf(t) !== geometry) continue;
				if (isEuclidean && filters.tileClass && tileClassOf(t) !== filters.tileClass) continue;
				s.add(t.k);
			}
		// The lazy higher-k tiers are all Euclidean; offer their chips up front (before the shard is fetched)
		// only under the Euclidean geometry, faceted by the class in scope.
		if (isEuclidean) {
			const cls = filters.tileClass;
			if (!cls || cls === "regular") for (const k of HIGHER_K) s.add(k);
			if (!cls || cls === "convex") for (const k of COMPOSABLE_HIGHER_K) s.add(k);
			if (!cls || cls === "isotoxal") for (const k of ISOTOXAL_HIGHER_K) s.add(k);
		}
		return [...s].sort((a, b) => a - b);
	}, [tilings, geometry, isEuclidean, filters.tileClass]);

	// M chips are faceted to the current view MINUS M/partition: at k=4 they resolve to {2,3,4}.
	const mOptions = useMemo(() => {
		if (!tilings || filters.kValue == null) return [];
		const s = new Set<number>();
		for (const t of tilings) {
			if (t.m == null) continue;
			if (matchesReferenceFilters(t, { ...filters, mValue: undefined, partitionKey: undefined })) s.add(t.m);
		}
		return [...s].sort((a, b) => a - b);
	}, [tilings, filters]);

	// Partition chips faceted to the current view MINUS the partition itself — so they narrow with the
	// chosen k (and M, if one is picked): k=7 → 511/421/331/…; k=7,M=3 → just the M=3 partitions.
	const partitionOptions = useMemo(() => {
		if (!tilings || filters.kValue == null) return [];
		const byKey = new Map<string, number>(); // key → m (for ordering)
		for (const t of tilings) {
			if (!matchesReferenceFilters(t, { ...filters, partitionKey: undefined })) continue;
			const key = partitionKeyOf(t);
			if (key && t.m != null) byKey.set(key, t.m);
		}
		return [...byKey.entries()]
			.map(([key, m]) => ({ key, m }))
			.sort((a, b) => a.m - b.m || (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
	}, [tilings, filters]);

	const availableFolds = useMemo(() => {
		if (!tilings) return [];
		const s = new Set<number>();
		for (const t of tilings) for (const n of starFoldsOf(t)) s.add(n);
		return [...s].sort((a, b) => a - b);
	}, [tilings]);

	const availableGroups = useMemo(() => {
		if (!tilings) return [];
		const present = new Set(tilings.map((t) => t.wallpaperGroup).filter((g): g is WallpaperGroup => !!g));
		return WALLPAPER_GROUPS.filter((g) => present.has(g));
	}, [tilings]);

	const availableShapes = useMemo(() => {
		if (!tilings) return [];
		const present = new Set(tilings.map((t) => t.latticeShape).filter((s): s is LatticeShape => !!s));
		return LATTICE_ORDER.filter((s) => present.has(s));
	}, [tilings]);

	// The one selected lattice (single-select). When set, it disables the wallpaper-group chips whose
	// group can't be crystallographically realized on it.
	const selectedLattice = filters.latticeShapes?.[0];

	const tileClass = filters.tileClass ?? "all";
	// The convex-irregular + isotoxal demo shelves carry no m/partition/wallpaper/star-fold classification.
	const isDemo = tileClass === "convex" || tileClass === "isotoxal";
	// Tile class, M/partition, star, lattice, and wallpaper group are all Euclidean-only — a hyperbolic
	// {p,q} or spherical Platonic tiling has no wallpaper group, no lattice, no star fold. Off the plane
	// only k, discoverer, certification, and search survive.
	const showM = isEuclidean && filters.kValue != null && !isDemo;
	const showStar = isEuclidean && tileClass !== "regular" && !isDemo && availableFolds.length > 0;
	const showGroup = isEuclidean && tileClass !== "star" && !isDemo && availableGroups.length > 0;
	const showLattice = isEuclidean && tileClass !== "star" && !isDemo && availableShapes.length > 0;
	const showConvex = tileClass === "convex";
	const showIsotoxalShape = tileClass === "isotoxal";
	const showScaledScaleSet = tileClass === "scaled";
	const showPolyominoOrder = tileClass === "polyomino";
	const showIslamicSystem = tileClass === "islamic";

	const activeFilterCount =
		// Euclidean is the default, so it doesn't read as an active filter; hyperbolic/spherical do.
		(filters.geometry && filters.geometry !== "euclidean" ? 1 : 0) +
		(filters.kValue != null ? 1 : 0) +
		(filters.tileClass ? 1 : 0) +
		(filters.convexDecomp ? 1 : 0) +
		(filters.isotoxalShape ? 1 : 0) +
		(filters.scaledScaleSet ? 1 : 0) +
		(filters.polyominoOrder ? 1 : 0) +
		(filters.islamicSystem ? 1 : 0) +
		(filters.mValue != null ? 1 : 0) +
		(filters.partitionKey != null ? 1 : 0) +
		(filters.maximalOnly ? 1 : 0) +
		(filters.starFolds?.length ? 1 : 0) +
		(filters.parametric ? 1 : 0) +
		(filters.wallpaperGroups?.length ? 1 : 0) +
		(filters.latticeShapes?.length ? 1 : 0) +
		(filters.discoverers?.length ? 1 : 0) +
		(filters.certifications?.length ? 1 : 0) +
		(filters.query?.trim() ? 1 : 0);

	const filtered = useMemo(() => {
		if (!tilings) return [];
		return tilings
			.filter((t) => matchesReferenceFilters(t, filters))
			.sort((a, b) => a.k - b.k || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	}, [tilings, filters]);

	const paginated = useMemo(
		() => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
		[filtered, currentPage, pageSize],
	);

	const gridStyle = { gridTemplateColumns: `repeat(${gridColumns}, 1fr)` };

	return (
		<div className="flex flex-1 min-h-0 overflow-hidden">
			<PageSidebar>
				<div className="flex items-center justify-between px-3 pt-3">
					<span className="text-xs font-medium text-fg-muted uppercase tracking-wider">Filters</span>
					{activeFilterCount > 0 ? (
						<button
							onClick={() => setFilters({ geometry: "euclidean" })}
							className="flex items-center gap-1 text-xs text-fg-muted hover:text-danger transition-colors"
						>
							<X size={11} /> Clear ({activeFilterCount})
						</button>
					) : null}
				</div>
				<div className="p-3 flex flex-col gap-4 text-sm">
					<input
						type="text"
						value={filters.query ?? ""}
						onChange={(e) => setFilters({ ...filters, query: e.target.value })}
						placeholder="Search id or family…"
						className="w-full rounded-md border border-line bg-surface-raised px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-disabled focus:border-line-strong focus:outline-none"
					/>

					<FilterGroup title="Geometry" summary={isEuclidean ? null : GEOMETRY_LABEL[geometry]}>
						<ButtonGroup options={GEOMETRY_OPTIONS} selected={geometry} onChange={setGeometry} />
					</FilterGroup>

					{/* Tile class is a Euclidean-only axis — hyperbolic/spherical are their own geometries, each a
					    single class, so the chip row would just be one dead option there. */}
					{isEuclidean ? (
						<FilterGroup title="Tile class" summary={filters.tileClass ?? null}>
							<ButtonGroup options={CLASS_OPTIONS} selected={tileClass} onChange={setTileClass} />
						</FilterGroup>
					) : null}

					{showConvex ? (
						<FilterGroup
							title="Composite palette"
							summary={filters.convexDecomp ?? null}
							note="exact ℤ[ζ] distinct counts"
						>
							<ButtonGroup
								options={DECOMP_OPTIONS}
								selected={filters.convexDecomp ?? "all"}
								onChange={setConvexDecomp}
							/>
						</FilterGroup>
					) : null}

					{showIsotoxalShape ? (
						<FilterGroup
							title="Shape"
							summary={filters.isotoxalShape === "alpha" ? "α" : filters.isotoxalShape === "alpha-beta" ? "α, β" : null}
							note="free angles"
						>
							<ButtonGroup
								options={ISOTOXAL_SHAPE_OPTIONS}
								selected={filters.isotoxalShape ?? "all"}
								onChange={setIsotoxalShape}
							/>
							<p className="text-[10px] text-fg-disabled">
								How many of the tile’s angles flex independently.
							</p>
						</FilterGroup>
					) : null}

					{showScaledScaleSet ? (
						<FilterGroup
							title="Side lengths"
							summary={filters.scaledScaleSet === "s12" ? "1–2" : filters.scaledScaleSet === "s123" ? "1–3" : null}
							note="scaling factors"
						>
							<ButtonGroup
								options={SCALE_SET_OPTIONS}
								selected={filters.scaledScaleSet ?? "all"}
								onChange={setScaledScaleSet}
							/>
							<p className="text-[10px] text-fg-disabled">
								Sides 1–2 is the former Doubled class; 1–3 adds a side-3 tile.
							</p>
						</FilterGroup>
					) : null}

					{showPolyominoOrder ? (
						<FilterGroup
							title="Polyomino order"
							summary={filters.polyominoOrder === "tetromino" ? "tetromino" : null}
							note="piece family"
						>
							<ButtonGroup
								options={POLY_ORDER_OPTIONS}
								selected={filters.polyominoOrder ?? "all"}
								onChange={setPolyominoOrder}
							/>
							<p className="text-[10px] text-fg-disabled">
								The seven Tetris pieces. More polyomino families to come.
							</p>
						</FilterGroup>
					) : null}

					{showIslamicSystem ? (
						<FilterGroup
							title="Design system"
							summary={filters.islamicSystem ?? null}
							note="Bonner's tile kits"
						>
							<ButtonGroup
								options={ISLAMIC_SYSTEM_OPTIONS}
								selected={filters.islamicSystem ?? "all"}
								onChange={setIslamicSystem}
							/>
							<p className="text-[10px] text-fg-disabled">
								The underlying tessellation’s tile set. Toggle the Islamic construction in Play to see the strapwork.
							</p>
						</FilterGroup>
					) : null}

					<FilterGroup title="Vertex count (k)" summary={filters.kValue ?? null}>
						<ButtonGroup
							options={[
								{ value: ALL_NUM, label: "All", classes: "px-2.5" },
								...kChips.map((k) => ({ value: k, label: k, classes: "w-8" })),
							]}
							selected={filters.kValue ?? ALL_NUM}
							onChange={(v) => setKValue(v === ALL_NUM ? undefined : v)}
						/>
						{/* Maximal (M = k) is a Krötenheerdt property of Euclidean uniform tilings — no meaning off
						    the plane. */}
						{isEuclidean ? (
							<ToggleButton
								size="sm"
								pressed={!!filters.maximalOnly}
								onPressedChange={toggleMaximal}
								label="Maximal (M = k)"
								classes="mt-1 self-start"
							/>
						) : null}
						{tileClass === "convex" && kChips.some((k) => k >= 3) ? (
							<p className="mt-1 text-[10px] text-fg-disabled">k ≥ 3 loads on demand.</p>
						) : kChips.some((k) => k >= 8) ? (
							<p className="mt-1 text-[10px] text-fg-disabled">k ≥ 8 loads on demand.</p>
						) : null}
					</FilterGroup>

					{showM ? (
						<FilterGroup title="Distinct configs (M)" summary={filters.mValue ?? null} note="M ≤ k">
							<ButtonGroup
								options={[
									{ value: ALL_NUM, label: "All", classes: "px-2.5" },
									...mOptions.map((m) => ({ value: m, label: m, classes: "w-8" })),
								]}
								selected={filters.mValue ?? ALL_NUM}
								onChange={(v) => setMValue(v === ALL_NUM ? undefined : v)}
							/>
							{partitionOptions.length > 0 ? (
								<div className="mt-1 flex flex-col gap-1.5">
									<span className="text-[10px] text-fg-disabled">Partition (multiplicity group)</span>
									<ButtonGroup
										options={[
											{ value: ALL_STR, label: "All", key: "__all__" },
											...partitionOptions.map((p) => ({ value: p.key, label: p.key })),
										]}
										selected={filters.partitionKey ?? ALL_STR}
										onChange={(v) => setPartitionKey(v === ALL_STR ? undefined : v)}
									/>
								</div>
							) : null}
						</FilterGroup>
					) : null}

					{showStar ? (
						<FilterGroup title="Star" note="star polygons">
							<div className="flex flex-col gap-1.5">
								<span className="text-[10px] text-fg-disabled">Fold (n-pointed)</span>
								<ButtonGroup
									multi
									options={availableFolds.map((n) => ({ value: n, label: `${n}★`, classes: "px-2" }))}
									selected={filters.starFolds ?? []}
									onChange={toggleFold}
								/>
							</div>
							<div className="mt-1 flex flex-col gap-1.5">
								<span className="text-[10px] text-fg-disabled">Shape</span>
								<ButtonGroup
									options={PARAM_OPTIONS}
									selected={filters.parametric ?? "all"}
									onChange={setParametric}
								/>
							</div>
						</FilterGroup>
					) : null}

					{showLattice ? (
						<FilterGroup
							title="Lattice"
							summary={selectedLattice ?? null}
							note="pick one"
						>
							<ButtonGroup
								options={availableShapes.map((s) => ({
									value: s,
									label: s,
									// Wikipedia Bravais-lattice diagram on hover/focus.
									tooltip: <LatticeTooltip lattice={s} />,
									tooltipSide: "right" as const,
									tooltipDelay: 0,
								}))}
								selected={selectedLattice ?? null}
								onChange={selectShape}
							/>
						</FilterGroup>
					) : null}

					{showGroup ? (
						<FilterGroup
							title="Wallpaper group"
							summary={filters.wallpaperGroups?.length ? `${filters.wallpaperGroups.length} sel` : null}
							note={selectedLattice ? `on ${selectedLattice}` : "regular"}
						>
							<ButtonGroup
								multi
								options={availableGroups.map((g) => ({
									value: g,
									label: g,
									// A selected lattice greys out (and blocks) every group it can't host — the disabled
									// styling + not-allowed cursor + aria-disabled come from ToggleButton.
									disabled: selectedLattice ? !isGroupOnLattice(g, selectedLattice) : false,
									// Wikipedia cell diagram(s) on hover/focus; opens into the main pane, not off-edge.
									tooltip: <WallpaperGroupTooltip group={g} />,
									tooltipSide: "right" as const,
									tooltipDelay: 0,
								}))}
								selected={filters.wallpaperGroups ?? []}
								onChange={toggleGroup}
							/>
						</FilterGroup>
					) : null}

					<FilterGroup
						title="Discoverer"
						summary={filters.discoverers?.length ? `${filters.discoverers.length} selected` : null}
					>
						<ButtonGroup
							multi
							options={DISCOVERER_OPTIONS}
							selected={filters.discoverers ?? []}
							onChange={toggleDiscoverer}
						/>
					</FilterGroup>

					<FilterGroup
						title="Certification"
						summary={filters.certifications?.length ? filters.certifications.join(", ") : null}
					>
						<ButtonGroup
							multi
							options={CERT_OPTIONS}
							selected={filters.certifications ?? []}
							onChange={toggleCert}
						/>
					</FilterGroup>
				</div>
			</PageSidebar>

			{/* `relative` makes this scroll pane the containing block for the Pagination's absolutely-
			    positioned sr-only <label>; without it the label anchors to <html> and stretches the
			    document ~1000px below the app shell (a phantom black scroll region). */}
			<main className="relative flex-1 overflow-y-auto p-5">
				<div className="flex items-center gap-3 mb-5">
					<Library size={18} className="text-sky-400" />
					<h1 className="text-base font-semibold text-fg">Tiling Library</h1>
					<span className="text-xs px-2 py-0.5 rounded-full bg-surface-overlay border border-line text-fg-muted">
						{filtered.length} tilings
					</span>
					{loadingShards.size > 0 ? (
						<span className="flex items-center gap-1.5 text-xs text-fg-muted">
							<Loader2 size={12} className="animate-spin text-sky-400" />
							loading k={[...loadingShards].sort((a, b) => a - b).join(", ")}…
						</span>
					) : null}
					{shardErrors.size > 0 ? (
						<span className="text-xs text-danger">
							failed to load k={[...shardErrors.keys()].sort((a, b) => a - b).join(", ")}
						</span>
					) : null}

					<div className="ml-auto flex items-center gap-4">
						<button
							type="button"
							onClick={copyLink}
							title="Copy a link to this filtered view"
							className="flex items-center gap-1.5 rounded-md border border-line bg-surface-raised px-2 py-1 text-xs text-fg-muted transition-colors hover:border-line-strong hover:text-fg focus:border-line-strong focus:outline-none"
						>
							{copied ? <Check size={12} className="text-emerald-400" /> : <Link2 size={12} />}
							{copied ? "Copied" : "Copy link"}
						</button>
						<label className="flex items-center gap-2 text-xs text-fg-muted">
							Columns
							<input
								type="range"
								min={COLUMN_PRESETS[0]}
								max={COLUMN_PRESETS[COLUMN_PRESETS.length - 1]}
								step={1}
								value={gridColumns}
								onChange={(e) => setGridColumns(Number(e.target.value))}
								aria-label="Grid columns"
								className="w-24 h-1.5 rounded-full appearance-none cursor-pointer bg-surface-overlay/70 accent-accent focus:outline-none focus-visible:ring-1 focus-visible:ring-line-focus/40"
							/>
							<span className="w-3 text-center tabular-nums font-medium text-accent">{gridColumns}</span>
						</label>
						<label className="flex items-center gap-2 text-xs text-fg-muted">
							Per page
							<select
								value={pageSize}
								onChange={(e) => setPageSize(Number(e.target.value))}
								aria-label="Items per page"
								className="rounded-md border border-line bg-surface-raised px-2 py-1 text-xs text-fg cursor-pointer focus:border-line-strong focus:outline-none"
							>
								{PAGE_SIZE_OPTIONS.map((n) => (
									<option key={n} value={n}>
										{n}
									</option>
								))}
							</select>
						</label>
					</div>
				</div>

				{error ? (
					<div className="flex flex-col items-center justify-center py-24 text-center">
						<p className="text-danger font-medium">Could not load the tiling library</p>
						<p className="text-fg-disabled text-sm mt-1 font-mono">{error}</p>
					</div>
				) : tilings === null ? (
					<div className="flex flex-col items-center justify-center py-24 text-center text-fg-muted">
						<Loader2 size={28} className="animate-spin mb-3 text-sky-400" />
						<p className="text-sm">Loading tiling library…</p>
					</div>
				) : filtered.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-24 text-center">
						<Library size={40} className="text-fg-disabled mb-4" />
						<p className="text-fg-muted font-medium">No tilings match the current filters.</p>
						{activeFilterCount > 0 ? (
							<button onClick={() => setFilters({ geometry: "euclidean" })} className="text-accent hover:underline text-sm mt-1">
								Clear filters
							</button>
						) : null}
					</div>
				) : (
					<>
						<Pagination
							totalItems={filtered.length}
							pageSize={pageSize}
							currentPage={currentPage}
							onPageChange={setCurrentPage}
						/>
						<div className="grid gap-3 mt-4" style={gridStyle}>
							{paginated.map((tiling) => (
								<ReferenceCard
									key={tiling.id}
									tiling={tiling}
									onClick={(t) => router.push(`/play?source=reference&tiling=${encodeURIComponent(t.id)}`)}
								/>
							))}
						</div>
						<div className="mt-4">
							<Pagination
								totalItems={filtered.length}
								pageSize={pageSize}
								currentPage={currentPage}
								onPageChange={setCurrentPage}
							/>
						</div>
					</>
				)}
			</main>
		</div>
	);
}
