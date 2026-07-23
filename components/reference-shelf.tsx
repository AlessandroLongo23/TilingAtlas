"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Library, Link2, Loader2, X } from "lucide-react";
import { PageSidebar } from "@/components/page-sidebar";
import { ButtonGroup } from "@/components/ui/button-group";
import { IntervalSlider } from "@/components/ui/interval-slider";
import { OptionWall } from "@/components/ui/option-wall";
import { Pagination } from "@/components/ui/pagination";
import { RangeInput } from "@/components/ui/range-input";
import { Switch } from "@/components/ui/switch";
import { ReferenceCard } from "@/components/reference-card";
import { cn } from "@/lib/utils/cn";
import type { FreedrawGrid } from "@/lib/freedraw/pattern";
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
	hyperbolicFacetsOf,
	tileClassOf,
	geometryOf,
	GEOMETRY_ORDER,
	GEOMETRY_LABEL,
	TILE_CLASS_ORDER,
	TILE_CLASS_LABEL,
	COMPOSABLE_SHARD_KS as COMPOSABLE_HIGHER_K,
	ISOTOXAL_SHARD_KS as ISOTOXAL_HIGHER_K,
	type Certification,
	type FreedrawKind,
	type FreedrawRegular,
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
// Freedraw-shelf sub-class facet: what KIND of faces the pattern produces. A freedraw "tile" is whatever
// face falls out of the drawn edge set, so it can be a finite polyomino, an infinite strip, or a sheet
// unbounded in both directions — the one axis that says what a pattern actually makes. Shown only for the
// freedraw class. See lib/freedraw/faces.ts.
const FREEDRAW_KIND_OPTIONS: { value: "all" | FreedrawKind; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "finite", label: "All finite" },
	{ value: "strip", label: "Has strip" },
	{ value: "unbounded", label: "Has unbounded" },
	{ value: "holes", label: "Has holes" },
];
const FREEDRAW_KIND_VALUES = FREEDRAW_KIND_OPTIONS.map((o) => o.value).filter((v): v is FreedrawKind => v !== "all");
// Freedraw-shelf grid facet, one level above the tile kind: which lattice the edge subset decorates.
// Shown only for the freedraw class, ordered before Tile kind — first the board, then the pieces.
const FREEDRAW_GRID_OPTIONS: { value: "all" | FreedrawGrid; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "square", label: "Squares" },
	{ value: "triangle", label: "Triangles" },
	{ value: "ts", label: "Tri + square" },
];
const FREEDRAW_GRID_VALUES = FREEDRAW_GRID_OPTIONS.map((o) => o.value).filter((v): v is FreedrawGrid => v !== "all");
// Freedraw-shelf regular-polygon facet — the bridge to the classical catalogue. Every k-uniform tiling
// dissects onto a triangle/square grid (octagon excepted), so "k-uniform" is the subfamily where every
// tile is an edge-to-edge regular polygon. The full has/none/any composition tool is on /freedraw; the
// shelf offers the common single-select cases (all-regular, k-uniform, or contains a given polygon). A
// dodecagon needs a large period and first appears at k=3, so the shelf's has-a-hexagon/triangle/square
// chips cover the common cases and the full composition (incl. dodecagons) lives on /freedraw.
const FREEDRAW_REGULAR_OPTIONS: { value: "all" | FreedrawRegular; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "unit", label: "k-uniform" },
	{ value: "regular", label: "All regular (+ dilations)" },
	{ value: "tri", label: "Has a triangle" },
	{ value: "square", label: "Has a square" },
	{ value: "hex", label: "Has a hexagon" },
];
const FREEDRAW_REGULAR_VALUES = FREEDRAW_REGULAR_OPTIONS.map((o) => o.value).filter((v): v is FreedrawRegular => v !== "all");
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
// maximal, folds, param, iso, fdkind, group, lattice, by, cert, polygon, q + page, size, cols.
interface ViewState {
	filters: ReferenceFilter;
	page: number;
	pageSize: number;
	gridColumns: number;
	// Group tilings sharing a vertex configuration + k into one card with a ‹ n/N › pager (hyperbolic
	// shelf, where one figure carries up to hundreds of tilings). URL key "grouped" — "group" is taken
	// by the wallpaper-group filter.
	groupVariants: boolean;
}

// One card of the (possibly grouped) shelf: the tilings it cycles through, in variant order. A
// singleton for every ungrouped entry.
interface CardGroup {
	key: string;
	members: ReferenceTiling[];
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
	// "lo,hi" → an inclusive interval; anything malformed (wrong arity, NaN, inverted) is dropped.
	const ival = (key: string): [number, number] | undefined => {
		const v = sp.get(key);
		if (!v) return undefined;
		const parts = v.split(",").map(Number);
		if (parts.length !== 2 || !parts.every(Number.isFinite) || parts[0] > parts[1]) return undefined;
		return [parts[0], parts[1]];
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
	// The hyperbolic interval facets only mean something on the hyperbolic shelf — under any other
	// geometry an active one would just filter the view to zero, so drop them from foreign links.
	if (f.geometry === "hyperbolic") {
		const valence = ival("valence");
		if (valence) f.hypValence = valence;
		const palette = ival("palette");
		if (palette) f.hypPolygon = palette;
		const edge = ival("edge");
		if (edge) f.hypEdge = edge;
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
	const freedrawKind = sp.get("fdkind");
	if (freedrawKind && (FREEDRAW_KIND_VALUES as string[]).includes(freedrawKind)) f.freedrawKind = freedrawKind as FreedrawKind;
	const freedrawGrid = sp.get("fdgrid");
	if (freedrawGrid && (FREEDRAW_GRID_VALUES as string[]).includes(freedrawGrid)) f.freedrawGrid = freedrawGrid as FreedrawGrid;
	const freedrawRegular = sp.get("fdreg");
	if (freedrawRegular && (FREEDRAW_REGULAR_VALUES as string[]).includes(freedrawRegular)) f.freedrawRegular = freedrawRegular as FreedrawRegular;
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
		groupVariants: sp.get("grouped") === "1",
	};
}

function serializeView(v: ViewState): string {
	const p = new URLSearchParams();
	const f = v.filters;
	if (f.kValue != null) p.set("k", String(f.kValue));
	// Euclidean is the default, so only non-euclidean geometries need a URL param.
	if (f.geometry && f.geometry !== "euclidean") p.set("geo", f.geometry);
	if (f.tileClass) p.set("class", f.tileClass);
	if (f.hypValence) p.set("valence", f.hypValence.join(","));
	if (f.hypPolygon) p.set("palette", f.hypPolygon.join(","));
	if (f.hypEdge) p.set("edge", f.hypEdge.map((n) => String(Math.round(n * 100) / 100)).join(","));
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
	if (f.freedrawKind) p.set("fdkind", f.freedrawKind);
	if (f.freedrawGrid) p.set("fdgrid", f.freedrawGrid);
	if (f.freedrawRegular) p.set("fdreg", f.freedrawRegular);
	if (f.wallpaperGroups?.length) p.set("group", f.wallpaperGroups.join(","));
	if (f.latticeShapes?.length) p.set("lattice", f.latticeShapes.join(","));
	if (f.discoverers?.length) p.set("by", f.discoverers.join(","));
	if (f.certifications?.length) p.set("cert", f.certifications.join(","));
	if (f.polygonNames?.length) p.set("polygon", f.polygonNames.join(","));
	if (f.query?.trim()) p.set("q", f.query.trim());
	if (v.page > 1) p.set("page", String(v.page));
	if (v.pageSize !== DEFAULT_PAGE_SIZE) p.set("size", String(v.pageSize));
	if (v.gridColumns !== 5) p.set("cols", String(v.gridColumns));
	if (v.groupVariants) p.set("grouped", "1");
	return p.toString();
}

// ── the panel's type ramp ─────────────────────────────────────────────────────────────────────────
// Three sizes, no more. 14px semibold = a group heading; 12px medium = an option cell (OptionWall's
// own class); 11px regular = EVERY small annotation. That last slot used to be three separate
// treatments — a 10px uppercase tracked note on the right of the heading, a 10px sentence-case
// sub-label, and 10px prose — which is what made the panel read as four typefaces stacked in one
// column. One constant now, so they can't drift apart again.
// text-fg-muted, not fg-disabled: at 11px the disabled ink (neutral-600 on neutral-900) was unreadable
// in dark, and /play's options panel already annotates at 11px muted.
const META = "text-[11px] font-normal leading-snug text-fg-muted";

// Structure sits on the wall's mortar; content sits on its tiles. A group heading and a sub-label are
// structure, but they carry the SAME chrome fill the option cells use (AL, 2026-07-23) — the title band
// reads as the lighter gray of an unselected tab, not the darker line colour, so a heading is flush with
// the controls it names rather than dropping into the seam. The 1px wall gaps above and below still rule
// each band off; every diamond stays where it was, born only where four rounded option-cell corners meet.

// A caption row inside a filter group — a thinner echo of the group heading, same chrome band.
function SubLabel({ children }: { children: ReactNode }) {
	return <span className={cn("bg-surface-chrome", META, "px-3 pt-2.5 pb-1.5 font-medium")}>{children}</span>;
}

// An explanatory line under a group's controls. This one IS content, so it stays a tile.
function GroupNote({ children }: { children: ReactNode }) {
	return <p className={cn("ta-wall-cell bg-surface-chrome px-3 py-2", META, "leading-relaxed")}>{children}</p>;
}

// A filter cell holding one IntervalSlider plus its live readout — the hyperbolic Valence / Palette /
// Edge-length groups. The readout is muted at the full data span (no filter) and foreground ink once
// the interval is narrowed, mirroring how the other groups signal an active selection.
function IntervalFilterCell({
	value,
	min,
	max,
	step,
	active,
	onChange,
	ariaLabel,
	format = (n: number) => String(n),
}: {
	value: [number, number];
	min: number;
	max: number;
	step: number;
	active: boolean;
	onChange: (v: [number, number]) => void;
	ariaLabel: string;
	format?: (n: number) => string;
}) {
	return (
		<div className="ta-wall-cell bg-surface-chrome flex flex-col gap-1 px-3 pt-2 pb-2.5">
			<div className="flex justify-end">
				<span className={cn("text-[10px] font-medium tabular-nums", active ? "text-fg" : "text-fg-muted")}>
					{format(value[0])} – {format(value[1])}
				</span>
			</div>
			<IntervalSlider
				value={value}
				onChange={onChange}
				min={min}
				max={max}
				step={step}
				aria-label={ariaLabel}
			/>
		</div>
	);
}

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
		<section className="flex flex-col gap-px">
			<div className="bg-surface-chrome flex items-baseline justify-between gap-2 px-3 pt-4 pb-2">
				<h3 className="text-sm font-semibold tracking-tight text-fg">
					{title}
					{summary ? <span className={cn(META, "ml-1.5")}>{summary}</span> : null}
				</h3>
				{note ? <span className={cn(META, "shrink-0")}>{note}</span> : null}
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
	const [groupVariants, setGroupVariants] = useState(initialView.groupVariants);
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
	}, [filters, pageSize, groupVariants]);

	// Mirror the whole view into the URL without navigating — a reload restores it and "Copy link" hands
	// a friend the exact same view. replaceState (not router.replace) keeps this off the Next router, so
	// it neither re-runs the server component nor spams history; useSearchParams is read once on mount.
	useEffect(() => {
		const q = serializeView({ filters, page: currentPage, pageSize, gridColumns, groupVariants });
		window.history.replaceState(null, "", q ? `${window.location.pathname}?${q}` : window.location.pathname);
	}, [filters, currentPage, pageSize, gridColumns, groupVariants]);

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
		// The freedraw tile-kind, grid and regular-polygon facets only mean something inside the freedraw
		// class — drop them otherwise.
		if (v !== "freedraw") {
			next.freedrawKind = undefined;
			next.freedrawGrid = undefined;
			next.freedrawRegular = undefined;
		}
		if (v === "freedraw") {
			// Freedraw faces are not tiles in the Grünbaum & Shephard sense, so none of the uniform-tiling
			// classification applies: no M/partition, no star folds, no α-family, no wallpaper group or lattice.
			next.mValue = undefined;
			next.partitionKey = undefined;
			next.maximalOnly = undefined;
			next.starFolds = undefined;
			next.parametric = undefined;
			next.wallpaperGroups = undefined;
			next.latticeShapes = undefined;
		}
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
	const setFreedrawKind = (v: "all" | FreedrawKind) =>
		setFilters({ ...filters, freedrawKind: v === "all" ? undefined : v });
	const setFreedrawGrid = (v: "all" | FreedrawGrid) =>
		setFilters({ ...filters, freedrawGrid: v === "all" ? undefined : v });
	const setFreedrawRegular = (v: "all" | FreedrawRegular) =>
		setFilters({ ...filters, freedrawRegular: v === "all" ? undefined : v });

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
				? {
						...filters,
						geometry: g,
						kValue: undefined,
						mValue: undefined,
						partitionKey: undefined,
						maximalOnly: undefined,
						// the hyperbolic interval facets mean nothing on the plane
						hypValence: undefined,
						hypPolygon: undefined,
						hypEdge: undefined,
					}
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

	// Data bounds for the hyperbolic interval sliders (valence / palette / edge length ℓ), derived from
	// the loaded hyperbolic shelf. The edge span is rounded outward to the slider's 0.01 step so the raw
	// extremes stay reachable. Null until the atlas is in (the groups just don't render yet).
	const hypBounds = useMemo(() => {
		if (!tilings) return null;
		let vMin = Infinity, vMax = -Infinity;
		let pMin = Infinity, pMax = -Infinity;
		let eMin = Infinity, eMax = -Infinity;
		for (const t of tilings) {
			const hf = hyperbolicFacetsOf(t);
			if (hf) {
				if (hf.valence < vMin) vMin = hf.valence;
				if (hf.valence > vMax) vMax = hf.valence;
				if (hf.polygon < pMin) pMin = hf.polygon;
				if (hf.polygon > pMax) pMax = hf.polygon;
			}
			if (t.source === "hyperbolic" && t.edge != null) {
				if (t.edge < eMin) eMin = t.edge;
				if (t.edge > eMax) eMax = t.edge;
			}
		}
		if (!Number.isFinite(vMin) || !Number.isFinite(eMin)) return null;
		return {
			valence: [vMin, vMax] as [number, number],
			polygon: [pMin, pMax] as [number, number],
			edge: [Math.floor(eMin * 100) / 100, Math.ceil(eMax * 100) / 100] as [number, number],
		};
	}, [tilings]);

	// An interval slider back at the full data span IS "no filter" — store undefined so the active
	// count, the Clear button and the URL stay honest.
	const setHypInterval = (
		key: "hypValence" | "hypPolygon" | "hypEdge",
		v: [number, number],
		full: [number, number],
	) => setFilters({ ...filters, [key]: v[0] <= full[0] && v[1] >= full[1] ? undefined : v });

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
	// Classes carrying NO vertex-configuration classification — no M/partition, no star folds, no wallpaper
	// group or lattice. The convex-irregular + isotoxal demo shelves (their builds don't compute it) and
	// freedraw (whose faces aren't tiles in the Grünbaum & Shephard sense, so none of that theory applies).
	const isUnclassified = tileClass === "convex" || tileClass === "isotoxal" || tileClass === "freedraw";
	// Tile class, M/partition, star, lattice, and wallpaper group are all Euclidean-only — a hyperbolic
	// {p,q} or spherical Platonic tiling has no wallpaper group, no lattice, no star fold. Off the plane
	// only k, discoverer, certification, and search survive.
	const showM = isEuclidean && filters.kValue != null && !isUnclassified;
	const showStar = isEuclidean && tileClass !== "regular" && !isUnclassified && availableFolds.length > 0;
	const showGroup = isEuclidean && tileClass !== "star" && !isUnclassified && availableGroups.length > 0;
	const showLattice = isEuclidean && tileClass !== "star" && !isUnclassified && availableShapes.length > 0;
	const showConvex = tileClass === "convex";
	const showIsotoxalShape = tileClass === "isotoxal";
	const showScaledScaleSet = tileClass === "scaled";
	const showPolyominoOrder = tileClass === "polyomino";
	const showIslamicSystem = tileClass === "islamic";
	const showFreedrawKind = tileClass === "freedraw";
	// Freedraw's k counts GRID-POINT orbits of the decoration, not vertex orbits of a tiling. It shares the
	// axis so the two are browsable together; the heading is what keeps them from reading as one quantity.
	const kGroupTitle = showFreedrawKind ? "Grid-point orbits (k)" : "Vertex count (k)";

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
		(filters.freedrawKind ? 1 : 0) +
		(filters.freedrawGrid ? 1 : 0) +
		(filters.freedrawRegular ? 1 : 0) +
		(filters.hypValence ? 1 : 0) +
		(filters.hypPolygon ? 1 : 0) +
		(filters.hypEdge ? 1 : 0) +
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

	// The card list, one group per card. Grouping collapses HYPERBOLIC entries sharing (k, vertex
	// configuration) — the shelf where one figure carries up to hundreds of variants — into a single
	// card the ReferenceCard pager cycles through; everything else stays a singleton (a Euclidean
	// "family" is the tile inventory, not the vertex configuration, so collapsing it would lump
	// genuinely different tilings). Members ride in variant order (the exporter's ℓ-ascending index),
	// not id order — base-25 suffixes ("-ba" < "-c") would shuffle them.
	const displayGroups = useMemo<CardGroup[]>(() => {
		if (!groupVariants) return filtered.map((t) => ({ key: t.id, members: [t] }));
		const byKey = new Map<string, CardGroup>();
		const order: CardGroup[] = [];
		for (const t of filtered) {
			if (t.source !== "hyperbolic") {
				order.push({ key: t.id, members: [t] });
				continue;
			}
			const key = `hyp|${t.k}|${t.family}`;
			let g = byKey.get(key);
			if (!g) {
				g = { key, members: [] };
				byKey.set(key, g);
				order.push(g);
			}
			g.members.push(t);
		}
		for (const g of order)
			if (g.members.length > 1)
				g.members.sort((a, b) => (a.variant ?? 0) - (b.variant ?? 0) || (a.id < b.id ? -1 : 1));
		return order;
	}, [filtered, groupVariants]);

	const paginated = useMemo(
		() => displayGroups.slice((currentPage - 1) * pageSize, currentPage * pageSize),
		[displayGroups, currentPage, pageSize],
	);

	const gridStyle = { gridTemplateColumns: `repeat(${gridColumns}, 1fr)` };

	return (
		<div className="flex flex-1 min-h-0 overflow-hidden">
			<PageSidebar>
				{/* The filter panel is one wall: every row an opaque cell on a line-coloured container,
				    so the 1px gaps between them are the only rules, and the diamonds fall out wherever
				    a vertical gap crosses a horizontal one — which in a grid of option cells is
				    everywhere. Same mechanism as the /play catalogue (globals.css, .ta-wall). */}
				<div className="ta-wall ta-wall-dense flex flex-col gap-px pb-4 text-sm">
					<div className="ta-wall-cell bg-surface-chrome flex h-9 items-center justify-between px-3">
						<span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Filters</span>
						{activeFilterCount > 0 ? (
							<button
								onClick={() => setFilters({ geometry: "euclidean" })}
								className="flex cursor-pointer items-center gap-1 text-xs text-fg-muted hover:text-danger transition-colors"
							>
								<X size={11} /> Clear ({activeFilterCount})
							</button>
						) : null}
					</div>
					<input
						type="text"
						value={filters.query ?? ""}
						onChange={(e) => setFilters({ ...filters, query: e.target.value })}
						placeholder="Search id or family…"
						className="ta-wall-cell bg-surface-chrome w-full px-3 py-2 text-xs text-fg placeholder:text-fg-muted focus:outline-none focus:bg-surface-raised"
					/>

					<FilterGroup title="Geometry" summary={isEuclidean ? null : GEOMETRY_LABEL[geometry]}>
						<OptionWall columns={3} options={GEOMETRY_OPTIONS} selected={geometry} onChange={setGeometry} />
					</FilterGroup>

					{/* Tile class is a Euclidean-only axis — hyperbolic/spherical are their own geometries, each a
					    single class, so the chip row would just be one dead option there. */}
					{isEuclidean ? (
						<FilterGroup title="Tile class" summary={filters.tileClass ?? null}>
							<OptionWall columns={3} options={CLASS_OPTIONS} selected={tileClass} onChange={setTileClass} />
						</FilterGroup>
					) : null}

					{showConvex ? (
						<FilterGroup
							title="Composite palette"
							summary={filters.convexDecomp ?? null}
							note="exact ℤ[ζ] distinct counts"
						>
							<OptionWall
								columns={3}
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
							<OptionWall
								columns={3}
								options={ISOTOXAL_SHAPE_OPTIONS}
								selected={filters.isotoxalShape ?? "all"}
								onChange={setIsotoxalShape}
							/>
							<GroupNote>
								How many of the tile’s angles flex independently.
							</GroupNote>
						</FilterGroup>
					) : null}

					{showScaledScaleSet ? (
						<FilterGroup
							title="Side lengths"
							summary={filters.scaledScaleSet === "s12" ? "1–2" : filters.scaledScaleSet === "s123" ? "1–3" : null}
							note="scaling factors"
						>
							<OptionWall
								columns={3}
								options={SCALE_SET_OPTIONS}
								selected={filters.scaledScaleSet ?? "all"}
								onChange={setScaledScaleSet}
							/>
							<GroupNote>
								Sides 1–2 is the former Doubled class; 1–3 adds a side-3 tile.
							</GroupNote>
						</FilterGroup>
					) : null}

					{showPolyominoOrder ? (
						<FilterGroup
							title="Polyomino order"
							summary={filters.polyominoOrder === "tetromino" ? "tetromino" : null}
							note="piece family"
						>
							<OptionWall
								columns={2}
								options={POLY_ORDER_OPTIONS}
								selected={filters.polyominoOrder ?? "all"}
								onChange={setPolyominoOrder}
							/>
							<GroupNote>
								The seven Tetris pieces. More polyomino families to come.
							</GroupNote>
						</FilterGroup>
					) : null}

					{showIslamicSystem ? (
						<FilterGroup
							title="Design system"
							summary={filters.islamicSystem ?? null}
							note="Bonner's tile kits"
						>
							<OptionWall
								columns={2}
								options={ISLAMIC_SYSTEM_OPTIONS}
								selected={filters.islamicSystem ?? "all"}
								onChange={setIslamicSystem}
							/>
							<GroupNote>
								The underlying tessellation’s tile set. Toggle the Islamic construction in Play to see the strapwork.
							</GroupNote>
						</FilterGroup>
					) : null}

					{showFreedrawKind ? (
						<FilterGroup
							title="Grid"
							summary={
								filters.freedrawGrid === "square"
									? "squares"
									: filters.freedrawGrid === "triangle"
										? "triangles"
										: filters.freedrawGrid === "ts"
											? "tri + square"
											: null
							}
							note="the decorated lattice"
						>
							<OptionWall
								columns={3}
								options={FREEDRAW_GRID_OPTIONS}
								selected={filters.freedrawGrid ?? "all"}
								onChange={setFreedrawGrid}
							/>
							<GroupNote>
								Which lattice the drawn edges decorate. Square patterns tile with polyominoes, triangular
								ones with polyiamonds — plus strips and unbounded sheets on either board.
							</GroupNote>
						</FilterGroup>
					) : null}

					{showFreedrawKind ? (
						<FilterGroup title="Tile kind" summary={filters.freedrawKind ?? null} note="faces of the edge set">
							<OptionWall
								columns={2}
								options={FREEDRAW_KIND_OPTIONS}
								selected={filters.freedrawKind ?? "all"}
								onChange={setFreedrawKind}
							/>
							<GroupNote>
								A freedraw tile is whatever face the drawn edges enclose — it can be a finite polyomino or
								polyiamond, an infinite strip, or a sheet unbounded in both directions.
							</GroupNote>
						</FilterGroup>
					) : null}

					{showFreedrawKind ? (
						<FilterGroup
							title="Regular polygons"
							summary={
								FREEDRAW_REGULAR_OPTIONS.find((o) => o.value === filters.freedrawRegular)?.label ?? null
							}
							note="the k-uniform bridge"
						>
							<OptionWall
								columns={2}
								options={FREEDRAW_REGULAR_OPTIONS}
								selected={filters.freedrawRegular ?? "all"}
								onChange={setFreedrawRegular}
							/>
							<GroupNote>
								Every k-uniform tiling dissects onto a triangle/square grid, so these patterns contain the
								k-uniform tilings as the case where every tile is a regular polygon. “k-uniform” keeps the
								edge-to-edge ones; the dodecagon needs a large period and first appears at k = 3 (as 3.12.12).
								For a full has/none/any composition (say triangles and dodecagons, no squares), use /freedraw.
							</GroupNote>
						</FilterGroup>
					) : null}

					<FilterGroup title={kGroupTitle} summary={filters.kValue ?? null}>
						<OptionWall
							columns={6}
							options={[
								{ value: ALL_NUM, label: "All" },
								...kChips.map((k) => ({ value: k, label: k })),
							]}
							selected={filters.kValue ?? ALL_NUM}
							onChange={(v) => setKValue(v === ALL_NUM ? undefined : v)}
						/>
						{/* Maximal (M = k) is a Krötenheerdt property of Euclidean uniform tilings — no meaning off
						    the plane, and none for freedraw (whose k isn't a vertex-orbit count at all). */}
						{isEuclidean && !showFreedrawKind ? (
							<OptionWall
								columns={1}
								options={[{ value: "maximal", label: "Maximal (M = k)" }]}
								selected={filters.maximalOnly ? "maximal" : null}
								onChange={toggleMaximal}
							/>
						) : null}
						{showFreedrawKind ? (
							<GroupNote>
								Orbits of GRID POINTS under the pattern&apos;s own symmetry group — including points with no
								drawn edge. Not vertex orbits of a tiling.
							</GroupNote>
						) : tileClass === "convex" && kChips.some((k) => k >= 3) ? (
							<GroupNote>k ≥ 3 loads on demand.</GroupNote>
						) : kChips.some((k) => k >= 8) ? (
							<GroupNote>k ≥ 8 loads on demand.</GroupNote>
						) : null}
					</FilterGroup>

					{/* Hyperbolic-only interval facets. Valence and palette are the sweep's own axes (most edges
					    at any vertex, largest polygon in any figure), so their upper bounds read exactly as an
					    enumeration cell's (p, v). Edge length ℓ is the hyperbolic shape coordinate — H² has no
					    similarity, so ℓ separates tilings the vertex figure alone cannot. */}
					{geometry === "hyperbolic" && hypBounds ? (
						<>
							<FilterGroup
								title="Valence"
								summary={filters.hypValence ? `${filters.hypValence[0]} – ${filters.hypValence[1]}` : null}
								note="max edges per vertex"
							>
								<IntervalFilterCell
									value={filters.hypValence ?? hypBounds.valence}
									active={!!filters.hypValence}
									min={hypBounds.valence[0]}
									max={hypBounds.valence[1]}
									step={1}
									onChange={(v) => setHypInterval("hypValence", v, hypBounds.valence)}
									ariaLabel="Valence"
								/>
							</FilterGroup>

							<FilterGroup
								title="Palette"
								summary={filters.hypPolygon ? `${filters.hypPolygon[0]} – ${filters.hypPolygon[1]}` : null}
								note="largest polygon"
							>
								<IntervalFilterCell
									value={filters.hypPolygon ?? hypBounds.polygon}
									active={!!filters.hypPolygon}
									min={hypBounds.polygon[0]}
									max={hypBounds.polygon[1]}
									step={1}
									onChange={(v) => setHypInterval("hypPolygon", v, hypBounds.polygon)}
									ariaLabel="Palette"
								/>
							</FilterGroup>

							<FilterGroup
								title="Edge length"
								summary={
									filters.hypEdge ? `${filters.hypEdge[0].toFixed(2)} – ${filters.hypEdge[1].toFixed(2)}` : null
								}
								note="forced ℓ"
							>
								<IntervalFilterCell
									value={filters.hypEdge ?? hypBounds.edge}
									active={!!filters.hypEdge}
									min={hypBounds.edge[0]}
									max={hypBounds.edge[1]}
									step={0.01}
									onChange={(v) => setHypInterval("hypEdge", v, hypBounds.edge)}
									ariaLabel="Edge length"
									format={(n) => n.toFixed(2)}
								/>
								<GroupNote>
									The edge length ℓ forced by the vertex figures (Σα = 2π). H² has no similarity, so ℓ is a
									shape coordinate — it separates tilings the figure alone cannot.
								</GroupNote>
							</FilterGroup>
						</>
					) : null}

					{showM ? (
						<FilterGroup title="Distinct configs (M)" summary={filters.mValue ?? null} note="M ≤ k">
							<OptionWall
								columns={6}
								options={[
									{ value: ALL_NUM, label: "All" },
									...mOptions.map((m) => ({ value: m, label: m })),
								]}
								selected={filters.mValue ?? ALL_NUM}
								onChange={(v) => setMValue(v === ALL_NUM ? undefined : v)}
							/>
							{partitionOptions.length > 0 ? (
								<>
									<SubLabel>Partition (multiplicity group)</SubLabel>
									<OptionWall
										columns={4}
										options={[
											{ value: ALL_STR, label: "All", key: "__all__" },
											...partitionOptions.map((p) => ({ value: p.key, label: p.key })),
										]}
										selected={filters.partitionKey ?? ALL_STR}
										onChange={(v) => setPartitionKey(v === ALL_STR ? undefined : v)}
									/>
								</>
							) : null}
						</FilterGroup>
					) : null}

					{showStar ? (
						<FilterGroup title="Star" note="star polygons">
							<SubLabel>Fold (n-pointed)</SubLabel>
							<OptionWall
								multi
								columns={5}
								options={availableFolds.map((n) => ({ value: n, label: `${n}★` }))}
								selected={filters.starFolds ?? []}
								onChange={toggleFold}
							/>
							<SubLabel>Shape</SubLabel>
							<OptionWall
								columns={3}
								options={PARAM_OPTIONS}
								selected={filters.parametric ?? "all"}
								onChange={setParametric}
							/>
						</FilterGroup>
					) : null}

					{showLattice ? (
						<FilterGroup
							title="Lattice"
							summary={selectedLattice ?? null}
							note="pick one"
						>
							<OptionWall
								columns={3}
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
							summary={filters.wallpaperGroups?.length ? `${filters.wallpaperGroups.length} selected` : null}
							note={selectedLattice ? `on ${selectedLattice}` : "all lattices"}
						>
							<OptionWall
								multi
								columns={4}
								options={availableGroups.map((g) => ({
									value: g,
									label: g,
									// A selected lattice greys out (and blocks) every group it can't host — the disabled
									// styling + not-allowed cursor + aria-disabled come from OptionWall.
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
						<OptionWall
							multi
							columns={2}
							options={DISCOVERER_OPTIONS}
							selected={filters.discoverers ?? []}
							onChange={toggleDiscoverer}
						/>
					</FilterGroup>

					<FilterGroup
						title="Certification"
						summary={filters.certifications?.length ? filters.certifications.join(", ") : null}
					>
						<OptionWall
							multi
							columns={3}
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
					<Library size={18} className="text-fg-secondary" />
					<h1 className="text-base font-semibold text-fg">Tiling Library</h1>
					<span className="text-xs px-2 py-0.5 bg-surface-overlay border border-line text-fg-muted">
						{filtered.length} tilings
					</span>
					{groupVariants && geometry === "hyperbolic" ? (
						<span className="text-xs px-2 py-0.5 bg-surface-overlay border border-line text-fg-muted">
							{displayGroups.length} families
						</span>
					) : null}
					{loadingShards.size > 0 ? (
						<span className="flex items-center gap-1.5 text-xs text-fg-muted">
							<Loader2 size={12} className="animate-spin text-fg-muted" />
							loading k={[...loadingShards].sort((a, b) => a - b).join(", ")}…
						</span>
					) : null}
					{shardErrors.size > 0 ? (
						<span className="text-xs text-danger">
							failed to load k={[...shardErrors.keys()].sort((a, b) => a - b).join(", ")}
						</span>
					) : null}

					<div className="ml-auto flex items-center gap-4">
						{/* Group-variants toggle — hyperbolic only, where one vertex configuration carries up to
						    hundreds of tilings; the card then pages through them in place. */}
						{geometry === "hyperbolic" ? (
							<span className="flex items-center gap-2 text-xs text-fg-muted">
								Group variants
								<Switch
									size="sm"
									checked={groupVariants}
									onCheckedChange={setGroupVariants}
									aria-label="Group tilings sharing a vertex configuration"
								/>
							</span>
						) : null}
						<button
							type="button"
							onClick={copyLink}
							title="Copy a link to this filtered view"
							className="flex items-center gap-1.5 rounded-md border border-line bg-surface-raised px-2 py-1 text-xs text-fg-muted transition-colors hover:border-line-strong hover:text-fg focus:border-line-strong focus:outline-none"
						>
							{copied ? <Check size={12} className="text-success" /> : <Link2 size={12} />}
							{copied ? "Copied" : "Copy link"}
						</button>
						<label className="flex items-center gap-2 text-xs text-fg-muted">
							Columns
							<RangeInput
								min={COLUMN_PRESETS[0]}
								max={COLUMN_PRESETS[COLUMN_PRESETS.length - 1]}
								step={1}
								value={gridColumns}
								onChange={setGridColumns}
								aria-label="Grid columns"
								className="w-24"
							/>
							<span className="w-3 text-center tabular-nums font-medium text-accent">{gridColumns}</span>
						</label>
						<div
							role="group"
							aria-label="Items per page"
							className="flex items-center gap-2 text-xs text-fg-muted"
						>
							<span>Per page</span>
							<ButtonGroup
								options={PAGE_SIZE_OPTIONS.map((n) => ({ value: n, label: n }))}
								selected={pageSize}
								onChange={setPageSize}
								gap="gap-1"
								wrap={false}
								classes="[&>button]:w-8 [&>button]:px-0 tabular-nums"
							/>
						</div>
					</div>
				</div>

				{error ? (
					<div className="flex flex-col items-center justify-center py-24 text-center">
						<p className="text-danger font-medium">Could not load the tiling library</p>
						<p className="text-fg-disabled text-sm mt-1 font-mono">{error}</p>
					</div>
				) : tilings === null ? (
					<div className="flex flex-col items-center justify-center py-24 text-center text-fg-muted">
						<Loader2 size={28} className="animate-spin mb-3 text-fg-muted" />
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
							totalItems={displayGroups.length}
							pageSize={pageSize}
							currentPage={currentPage}
							onPageChange={setCurrentPage}
						/>
						<div className="ta-lanes grid mt-4" style={gridStyle}>
							{paginated.map((g) => (
								<ReferenceCard
									key={g.key}
									tiling={g.members[0]}
									group={g.members}
									onClick={(t) => router.push(`/play?source=reference&tiling=${encodeURIComponent(t.id)}`)}
								/>
							))}
						</div>
						<div className="mt-4">
							<Pagination
								totalItems={displayGroups.length}
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
