"use client";

import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronRight, Library, Link2, Loader2, Search, Shapes, X } from "lucide-react";
import { InfoDot } from "@/components/ui/info-dot";
import { Fold } from "@/components/ui/sidebar-section";
import { PageSidebar } from "@/components/page-sidebar";
import { SheetTrigger } from "@/components/ui/bottom-sheet";
import { IntervalSlider } from "@/components/ui/interval-slider";
import { OptionWall } from "@/components/ui/option-wall";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { Switch } from "@/components/ui/switch";
import { ReferenceCard } from "@/components/reference-card";
import { useMobileSheet } from "@/stores/mobileSheet";
import { PHONE_QUERY } from "@/lib/hooks/useIsPhone";
import { cn } from "@/lib/utils/cn";
import type { SphStarKind } from "@/lib/tilings/sph-star";
import { HYP_EDGES_BASES, hypEdgesLazyShardsForK } from "@/lib/freedraw/hyp-edges";
import { hypColorsLazyShardsForK } from "@/lib/colors/hyp-colors";
import { sphColorsLazyShardsForK } from "@/lib/colors/sph-colors";
import { schwarzLazyShardsForK } from "@/lib/freedraw/schwarz";
import { sphEdgesLazyShardsForK } from "@/lib/freedraw/sph-edges";
import { hypPolyBoardOfSub, hypPolyLazyShardsForK } from "@/lib/tilings/hyp-poly";
import { hypHalfLazyShardsForK } from "@/lib/tilings/hyp-half";
import { pentEdgeLazyShardsForK } from "@/lib/pentagon/edge-shelf";
import { ihEdgeLazyShardsForK } from "@/lib/isohedral/edge-shelf";
import {
	tilingLevel,
	TILING_LEVEL_LABEL,
	TILING_LEVEL_NOTE,
	TILING_LEVEL_ORDER,
	type TilingLevel,
} from "@/lib/tilings/tiling-level";
import { WallpaperGroupTooltip } from "@/components/wallpaper-group-diagram";
import { LatticeTooltip } from "@/components/lattice-diagram";
import {
	loadReferenceAtlas,
	loadReferenceAtlasShard,
	loadComposableAtlasShard,
	loadIsotoxalAtlasShard,
	loadPeriodAtlasShard,
	loadMixedAtlasShard,
	loadScaledAtlasShard,
	loadTri45AtlasShard,
	loadPenroseAtlasShard,
	loadFreedrawShardsForK,
	loadColorsShardsForK,
	hasDecorationShardsForK,
	loadHyperbolicEdgesAtlas,
	loadHyperbolicEdgesShard,
	loadHyperbolicColorsAtlas,
	loadHyperbolicColorsShard,
	loadSphericalColorsAtlas,
	loadSphericalColorsShard,
	loadSphericalSchwarzAtlas,
	loadHyperbolicSchwarzAtlas,
	loadSchwarzShard,
	loadSphericalEdgesAtlas,
	loadSphericalEdgesShard,
	loadSphericalPolyAtlas,
	loadPentagonEdgesAtlas,
	loadPentagonEdgesShard,
	loadIsohedralEdgesAtlas,
	loadIsohedralEdgesShard,
	loadColorsDecorAtlas,
	loadFreedrawDecorAtlas,
	loadBubbleDecorAtlas,
	loadHyperbolicBaseAtlas,
	loadHyperbolicPolyAtlas,
	loadHyperbolicPolyShard,
	loadHyperbolicHalfShard,
	matchesReferenceFilters,
	partitionKeyOf,
	starFoldsOf,
	distinctPolygonCountOf,
	distinctStarCountOf,
	hyperbolicFacetsOf,
	tileClassOf,
	geometryOf,
	decorationOf,
	GEOMETRY_ORDER,
	GEOMETRY_LABEL,
	DECORATION_ORDER,
	DECORATION_LABEL,
	COMPOSABLE_SHARD_KS as COMPOSABLE_HIGHER_K,
	ISOTOXAL_SHARD_KS as ISOTOXAL_HIGHER_K,
	PERIOD_SHARD_KS as PERIOD_HIGHER_K,
	MIXED_SHARD_KS as MIXED_HIGHER_K,
	SCALED_SHARD_KS as SCALED_HIGHER_K,
	TRI45_SHARD_KS as TRI45_HIGHER_K,
	PENROSE_SHARD_KS as PENROSE_HIGHER_K,
	EUHALF_SHARD_KS as EUHALF_HIGHER_K,
	loadEuHalfAtlasShard,
	type Certification,
	type FreedrawKind,
	type FreedrawRegular,
	type Geometry,
	type Decoration,
	type ReferenceTiling,
	type ReferenceFilter,
	type TileClass,
	type IslamicSystem,
	type EdgeBoard,
	type PolygonMode,
} from "@/lib/services/referenceAtlas";
import { PolygonFilterModal } from "@/components/polygon-filter-modal";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { BoardPicker } from "@/components/library/board-picker";
import { ResultsTable } from "@/components/library/results-table";
import {
	ActiveFilters,
	ExportButton,
	SortControl,
	ViewToggle,
	type ActiveChip,
	type ResultsView,
} from "@/components/library/results-toolbar";
import { VcFilter } from "@/components/library/vc-filter";
import {
	availableSortKeys,
	SORT_DEFAULT_DIR,
	SORT_KEYS,
	sortTilings,
	type SortDir,
	type SortKey,
} from "@/lib/services/librarySort";
import { compactVC, parseVC, vcsOf } from "@/lib/services/vertexConfig";
import {
	periodLabel,
	polygonSpeciesOf,
	speciesCompare,
	speciesLabel,
	tilePeriodsOf,
} from "@/lib/services/polygonSpecies";
import {
	withAll,
	valuesOf,
	boardFamiliesFor,
	boardSummary,
	BOARD_VALUES,
	SHAPE_CLASS_ORDER,
	SHAPE_CLASS_LABEL,
	ISLAMIC_SYSTEM_ORDER,
	ISLAMIC_SYSTEM_LABEL,
	EDGE_BOARD_ORDER,
	EDGE_BOARD_LABEL,
	FREEDRAW_KIND_ORDER,
	FREEDRAW_KIND_LABEL,
	FREEDRAW_REGULAR_ORDER,
	FREEDRAW_REGULAR_LABEL,
	CERTIFICATION_ORDER,
	CERTIFICATION_LABEL,
	COLORS_COUNT_ORDER,
	COLORS_COUNT_LABEL,
} from "@/lib/services/facets";
import {
	WALLPAPER_GROUPS,
	isGroupOnLattice,
	type LatticeShape,
	type WallpaperGroup,
} from "@/lib/classes/symmetry/types";
import { polyformFamilyShort, POLYFORM_FAMILIES, type PolyformFamily } from "@/lib/tilings/polyform";
import { DECORATIONS, GEOMETRIES, SOURCES, TILE_CLASSES } from "@/lib/vocabulary";

// The unified Tiling Library: one display-only atlas of every tiling (regular k=1..7 + stars in the
// base file; regular k=8..10 as lazy per-k shards loaded on demand), fetched from public/reference-
// atlas*.json. Each entry carries a DISCOVERER (historical
// first-finder), a CERTIFICATION (proven / reproduced / candidate), and a vertex-type classification
// (k, M, partition — see referenceAtlas.ts). Filters are flat and always-open (no accordion); groups
// irrelevant to the current tile-class selection are hidden, not shown as dead controls.
//
// k / M / partition are SINGLE-select (pick one, or "All"). M and partition only appear once a k is
// chosen, and their chips are faceted to values that actually occur under the current filters — so at
// k=4 you see M ∈ {2,3,4}, never a dead M=1 button.
// Derived from the shared registry (referenceAtlas TILE_CLASS_ORDER/LABEL) — the SAME source /play's
// catalogue groups read, so the two pages' class axes can never drift.
//
// Four of the twelve classes are dropped because they belong to a HIGHER axis, not to this one:
// hyperbolic/spherical are geometries, freedraw/colors are decorations. Each is the sole occupant of its
// (geometry, decoration) cell, so a chip for it would just restate the segment already chosen above. What
// is left is the shape axis proper — the eight shelves that differ by tile set, which is what "tile class"
// was always trying to say.
const CLASS_OPTIONS: { value: "all" | TileClass; label: string }[] = withAll(SHAPE_CLASS_ORDER, SHAPE_CLASS_LABEL);
const GEOMETRY_OPTIONS: { value: Geometry; label: string }[] = GEOMETRY_ORDER.map((g) => ({
	value: g,
	label: GEOMETRY_LABEL[g],
}));
// The decoration axis, present in every geometry (unlike the class wall, which is Euclidean shape talk).
// "All" is offered here but not in /play's segmented control: the shelf is one flat paginated grid that
// can hold all three at once, where /play always renders a single cell.
const DECORATION_OPTIONS: { value: "all" | Decoration; label: string }[] = [
	{ value: "all", label: "All" },
	...DECORATION_ORDER.map((d) => ({ value: d, label: DECORATION_LABEL[d] })),
];
// Convex-irregular-shelf facet: the whole demo, only decomposable-family tilings, or only the ones that
// reach for a non-decomposable composite. Shown only while the convex-irregular tile class is selected.
const DECOMP_OPTIONS: { value: "all" | "decomposable" | "non-decomposable"; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "decomposable", label: "Decomposable" },
	{ value: "non-decomposable", label: "Uses non-decomp." },
];

// The star shelf's four shapes. Read off each record's structure, never off its name — two thirds of that
// shelf ships unnamed, and the three families have signatures nothing else wears. See sphStarKind.
const STAR_KIND_LABEL: Record<SphStarKind, string> = {
	pyramid: "pyramids",
	prism: "prisms",
	antiprism: "antiprisms",
	cupola: "cupolas",
	other: "other",
};

const STAR_KIND_OPTIONS: { value: "all" | SphStarKind; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "pyramid", label: "Pyramids" },
	{ value: "prism", label: "Prisms" },
	{ value: "antiprism", label: "Antiprisms" },
	{ value: "cupola", label: "Cupolas" },
	{ value: "other", label: "Other" },
];

// The non-convex regular-faced shelf holds two different kinds of object under one roof: solids whose
// faces pass through one another, and solids that are non-convex but embedded — polyhedra in the ordinary
// sense. The split is the shelf generator's own measurement; see lib/tilings/ncx-crossing.ts.
const NCX_CROSSING_OPTIONS: { value: "all" | "self-intersecting" | "embedded"; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "self-intersecting", label: "Self-intersecting" },
	{ value: "embedded", label: "Embedded" },
];
const PARAM_OPTIONS: { value: "all" | "rigid" | "family"; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "rigid", label: "Rigid" },
	{ value: "family", label: "α-family" },
];
// The Polygons group header when a selection is active: which way the picks combine, then how many.
const POLY_MODE_SUMMARY: Record<PolygonMode, string> = { all: "all of", any: "any of", only: "only" };
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
// Polyform-shelf level 1: which atomic tile the pieces are built from. Level 2 (how many cells) is the
// BOARD wall below, which groups its nine chips under these same three headings, and level 3 is k — the
// same nesting /play's tree walks. Shown only for the polyform class.
const POLYFORM_FORM_OPTIONS: { value: "all" | PolyformFamily; label: string }[] = [
	{ value: "all", label: "All" },
	...POLYFORM_FAMILIES.map((f) => ({ value: f, label: polyformFamilyShort(f) })),
];
// Islamic-shelf sub-class facet: Bonner's design system (the underlying tile kit). Shown only for the
// Islamic class. See docs/ISLAMIC_TILINGS.md.
const ISLAMIC_SYSTEM_OPTIONS = withAll(ISLAMIC_SYSTEM_ORDER, ISLAMIC_SYSTEM_LABEL);
const ISLAMIC_SYSTEM_VALUES = valuesOf(ISLAMIC_SYSTEM_ORDER);
const EDGE_BOARD_OPTIONS = withAll(EDGE_BOARD_ORDER, EDGE_BOARD_LABEL);
const EDGE_BOARD_VALUES = valuesOf(EDGE_BOARD_ORDER);
// Freedraw-shelf sub-class facet: what KIND of faces the pattern produces. A freedraw "tile" is whatever
// face falls out of the drawn edge set, so it can be a finite polyomino, an infinite strip, or a sheet
// unbounded in both directions — the one axis that says what a pattern actually makes. Shown only for the
// freedraw class. See lib/freedraw/faces.ts.
const FREEDRAW_KIND_OPTIONS = withAll(FREEDRAW_KIND_ORDER, FREEDRAW_KIND_LABEL);
const FREEDRAW_KIND_VALUES = valuesOf(FREEDRAW_KIND_ORDER);
// The BOARD facet replaces the two hand-typed grid walls that used to live here — one for freedraw, one
// for colors, each naming only the four Euclidean grids. Both are now derived from SUB_ORDER in
// lib/services/facets.ts, which is the same list /play's tree walks, so the pentagon and isohedral boards
// (and every board Marek sends next) appear in both surfaces from one edit.
// Colors-shelf palette-size facet: how many colors the solutions use. Each (grid, size) pair is its own
// catalogue — an n-color run's solutions all use every one of its n colors. Read off the subs.
const COLORS_COUNT_OPTIONS: { value: "all" | number; label: string }[] = [
	{ value: "all", label: "All" },
	...COLORS_COUNT_ORDER.map((n) => ({ value: n, label: COLORS_COUNT_LABEL(n) })),
];
const COLORS_COUNT_VALUES = valuesOf(COLORS_COUNT_ORDER);
// Freedraw-shelf regular-polygon facet — the bridge to the classical catalogue. Every k-uniform tiling
// dissects onto a triangle/square grid (octagon excepted), so "k-uniform" is the subfamily where every
// tile is an edge-to-edge regular polygon. The full has/none/any composition tool is on /freedraw; the
// shelf offers the common single-select cases (all-regular, k-uniform, or contains a given polygon). A
// dodecagon needs a large period and first appears at k=3, so the shelf's has-a-hexagon/triangle/square
// chips cover the common cases and the full composition (incl. dodecagons) lives on /freedraw.
const FREEDRAW_REGULAR_OPTIONS = withAll(FREEDRAW_REGULAR_ORDER, FREEDRAW_REGULAR_LABEL);
const FREEDRAW_REGULAR_VALUES = valuesOf(FREEDRAW_REGULAR_ORDER);
const DISCOVERER_OPTIONS: { value: string; label: string }[] = [
	{ value: "Kepler", label: "Kepler" },
	{ value: "Krötenheerdt", label: "Krötenheerdt" },
	{ value: "Chavey", label: "Chavey" },
	{ value: "Brian Galebach", label: "Galebach" },
	{ value: "Marek Čtrnáct", label: "Čtrnáct" },
	{ value: "Joseph Myers", label: "Myers" },
	{ value: "Alessandro Longo", label: "Longo" },
];
const CERT_OPTIONS: { value: Certification; label: string }[] = CERTIFICATION_ORDER.map((c) => ({
	value: c,
	label: CERTIFICATION_LABEL[c],
}));
const LATTICE_ORDER: LatticeShape[] = ["square", "hexagonal", "rhombic", "rectangular", "oblique"];
const COLUMN_PRESETS = [3, 4, 5, 6];
// Page-size choices for the header dropdown; 25 is the default.
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
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
const CLASS_OPTIONS_NO_BUBBLE = CLASS_OPTIONS.filter((o) => o.value !== "bubble");
const TILE_CLASS_VALUES = CLASS_OPTIONS.map((o) => o.value).filter((v): v is TileClass => v !== "all");
const CERT_VALUES = CERT_OPTIONS.map((o) => o.value);

// ── URL ⇆ view state ──────────────────────────────────────────────────────────────────────────────
// The whole view (every filter field + the page, page-size and column-count prefs) round-trips through
// the query string: a reload restores the exact view, and the "Copy link" button hands a friend a link
// that reproduces it. parseViewState and serializeView are inverse — add a field to one, add it to the
// other. Keys are short and stable (they're a shared URL contract): k, dec, class, decomp, m, partition,
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
	// Result order and presentation: URL keys "sort", "dir", "view".
	sortKey: SortKey;
	sortDir: SortDir;
	view: ResultsView;
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
		const items = v
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
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
	f.geometry = geo === GEOMETRIES.HYPERBOLIC || geo === GEOMETRIES.SPHERICAL ? geo : GEOMETRIES.EUCLIDEAN;
	const dec = sp.get("dec");
	if (dec && (DECORATION_ORDER as string[]).includes(dec)) f.decoration = dec as Decoration;
	const cls = sp.get("class");
	if (cls === GEOMETRIES.HYPERBOLIC || cls === GEOMETRIES.SPHERICAL) {
		// Back-compat: geometry used to be a tile-class chip. Promote an old link's class to the geometry
		// axis and leave tileClass unset.
		f.geometry = cls;
	} else if (cls === "freedraw" || cls === "colors") {
		// Same move one axis down: freedraw and colors used to be tile-class chips before the decoration
		// axis existed. Promote them so links shared before this change still land on the right shelf.
		f.decoration = cls === "freedraw" ? DECORATIONS.EDGES : DECORATIONS.COLORINGS;
	} else if (cls && (TILE_CLASS_VALUES as string[]).includes(cls)) {
		f.tileClass = cls as TileClass;
		// A bubble tiling is decoration "edges", so `class=bubble&dec=tilings` is a link that can only
		// read 0. The class is the more specific half of that pair, so keep it and drop the segment —
		// same move as the two promotions above, one axis over.
		if (cls === "bubble" && f.decoration === DECORATIONS.TILINGS) f.decoration = undefined;
	}
	// The hyperbolic interval facets only mean something on the hyperbolic shelf — under any other
	// geometry an active one would just filter the view to zero, so drop them from foreign links.
	if (f.geometry === GEOMETRIES.HYPERBOLIC) {
		const valence = ival("valence");
		if (valence) f.hypValence = valence;
		const palette = ival("palette");
		if (palette) f.hypPolygon = palette;
		const edge = ival("edge");
		if (edge) f.hypEdge = edge;
	}
	const decomp = sp.get("decomp");
	if (decomp === "decomposable" || decomp === "non-decomposable") f.convexDecomp = decomp;
	const skind = sp.get("skind");
	if (skind === "pyramid" || skind === "prism" || skind === "antiprism" || skind === "cupola" || skind === "other")
		f.starKind = skind;
	const ncx = sp.get("ncx");
	if (ncx === "self-intersecting" || ncx === "embedded") f.ncxCrossing = ncx;
	const m = num("m");
	if (m != null) f.mValue = m;
	const partition = sp.get("partition");
	if (partition) f.partitionKey = partition;
	if (sp.get("maximal") === "1") f.maximalOnly = true;
	const folds = list("folds")
		?.map(Number)
		.filter((n) => Number.isFinite(n));
	if (folds?.length) f.starFolds = folds;
	const param = sp.get("param");
	if (param === "rigid" || param === "family") f.parametric = param;
	const iso = sp.get("iso");
	if (iso === "alpha" || iso === "alpha-beta") f.isotoxalShape = iso;
	const scaleSet = sp.get("scaleset");
	if (scaleSet === "s12" || scaleSet === "s123") f.scaledScaleSet = scaleSet;
	const pform = sp.get("pform");
	if (pform && (POLYFORM_FAMILIES as readonly string[]).includes(pform)) f.polyformFamily = pform as PolyformFamily;
	const islamicSystem = sp.get("islamicsystem");
	if (islamicSystem && (ISLAMIC_SYSTEM_VALUES as string[]).includes(islamicSystem))
		f.islamicSystem = islamicSystem as IslamicSystem;
	const edgeBoard = sp.get("edgeboard");
	if (edgeBoard && (EDGE_BOARD_VALUES as string[]).includes(edgeBoard)) f.edgeBoard = edgeBoard as EdgeBoard;
	const freedrawKind = sp.get("fdkind");
	if (freedrawKind && (FREEDRAW_KIND_VALUES as string[]).includes(freedrawKind))
		f.freedrawKind = freedrawKind as FreedrawKind;
	// The board axis. `fdgrid` / `cogrid` are the two params it replaced; a link carrying either still
	// resolves, because every value they could hold is a board sub under the same name ("square", "ts",
	// "sch236"). Reading them into `board` keeps shared links working without a second filter to apply.
	const board = sp.get("board") ?? sp.get("fdgrid") ?? sp.get("cogrid");
	if (board && BOARD_VALUES.includes(board)) f.board = board;
	const colorsCount = Number(sp.get("cocount"));
	if (COLORS_COUNT_VALUES.includes(colorsCount)) f.colorsCount = colorsCount;
	const freedrawRegular = sp.get("fdreg");
	if (freedrawRegular && (FREEDRAW_REGULAR_VALUES as string[]).includes(freedrawRegular))
		f.freedrawRegular = freedrawRegular as FreedrawRegular;
	const groups = list("group")?.filter((g): g is WallpaperGroup => (WALLPAPER_GROUPS as readonly string[]).includes(g));
	if (groups?.length) f.wallpaperGroups = groups;
	const levels = list("level")?.filter((s): s is TilingLevel => (TILING_LEVEL_ORDER as string[]).includes(s));
	if (levels?.length) f.levels = levels;
	const lattices = list("lattice")?.filter((s): s is LatticeShape => (LATTICE_ORDER as string[]).includes(s));
	if (lattices?.length) f.latticeShapes = lattices;
	const discoverers = list("by");
	if (discoverers?.length) f.discoverers = discoverers;
	const certs = list("cert")?.filter((c): c is Certification => (CERT_VALUES as string[]).includes(c));
	if (certs?.length) f.certifications = certs;
	const polygons = list("polygon");
	if (polygons?.length) f.polygonNames = polygons;
	// Default "all" so links shared before the mode existed keep meaning what they meant.
	const polyMode = sp.get("polymode");
	if (polyMode === "any" || polyMode === "only" || polyMode === "all") f.polygonMode = polyMode;
	const polyx = list("polyx");
	if (polyx?.length) f.polygonExclude = polyx;
	const dpoly = list("dpoly")
		?.map(Number)
		.filter((n) => Number.isFinite(n));
	if (dpoly?.length) f.distinctPolygons = dpoly;
	const dstar = list("dstar")
		?.map(Number)
		.filter((n) => Number.isFinite(n));
	if (dstar?.length) f.distinctStars = dstar;
	const aper = list("aper")
		?.map(Number)
		.filter((n) => Number.isFinite(n));
	if (aper?.length) f.anglePeriods = aper;
	const q = sp.get("q");
	if (q) f.query = q;
	// Vertex configurations, any notation in the link; only what parses as a figure is kept.
	const vcs = list("vc")
		?.map(parseVC)
		.filter((v): v is string => v !== null);
	if (vcs?.length) f.vcs = [...new Set(vcs)];
	const vcMode = sp.get("vcmode");
	if (vcMode === "any" || vcMode === "exact") f.vcMode = vcMode;

	const sortParam = sp.get("sort");
	const sortKey: SortKey =
		sortParam && (SORT_KEYS as string[]).includes(sortParam) ? (sortParam as SortKey) : "catalogue";
	const dirParam = sp.get("dir");
	const page = num("page");
	const size = num("size");
	const cols = num("cols");
	return {
		filters: f,
		page: page != null && page >= 1 ? Math.floor(page) : 1,
		pageSize: size != null && PAGE_SIZE_OPTIONS.includes(size) ? size : DEFAULT_PAGE_SIZE,
		gridColumns: cols != null ? Math.min(6, Math.max(3, Math.floor(cols))) : 5,
		// On by default (hyperbolic is the only shelf it affects, and there a family of hundreds of
		// variants should arrive as one card). So the param encodes the OFF state; "1" is still read
		// for links shared before the default flipped.
		groupVariants: sp.get("grouped") !== "0",
		sortKey,
		sortDir: dirParam === "asc" || dirParam === "desc" ? dirParam : SORT_DEFAULT_DIR[sortKey],
		view: sp.get("view") === "table" ? "table" : "grid",
	};
}

function serializeView(v: ViewState): string {
	const p = new URLSearchParams();
	const f = v.filters;
	if (f.kValue != null) p.set("k", String(f.kValue));
	// Euclidean is the default, so only non-euclidean geometries need a URL param.
	if (f.geometry && f.geometry !== GEOMETRIES.EUCLIDEAN) p.set("geo", f.geometry);
	if (f.decoration) p.set("dec", f.decoration);
	if (f.tileClass) p.set("class", f.tileClass);
	if (f.hypValence) p.set("valence", f.hypValence.join(","));
	if (f.hypPolygon) p.set("palette", f.hypPolygon.join(","));
	if (f.hypEdge) p.set("edge", f.hypEdge.map((n) => String(Math.round(n * 100) / 100)).join(","));
	if (f.convexDecomp) p.set("decomp", f.convexDecomp);
	if (f.starKind) p.set("skind", f.starKind);
	if (f.ncxCrossing) p.set("ncx", f.ncxCrossing);
	if (f.mValue != null) p.set("m", String(f.mValue));
	if (f.partitionKey) p.set("partition", f.partitionKey);
	if (f.maximalOnly) p.set("maximal", "1");
	if (f.starFolds?.length) p.set("folds", f.starFolds.join(","));
	if (f.parametric) p.set("param", f.parametric);
	if (f.isotoxalShape) p.set("iso", f.isotoxalShape);
	if (f.scaledScaleSet) p.set("scaleset", f.scaledScaleSet);
	if (f.polyformFamily) p.set("pform", f.polyformFamily);
	if (f.islamicSystem) p.set("islamicsystem", f.islamicSystem);
	// `board` is READ by parseFilter above and was never WRITTEN here, so the round trip was one-way: a
	// link carrying ?board= selected the board, and the UI could not produce one. Copy link and a plain
	// reload both dropped the selection — on all 271 hyperbolic-poly boards, the 32 edge bases and every
	// spherical and freedraw board. Found 2026-09-01 walking the shelf by click instead of by URL.
	if (f.board) p.set("board", f.board);
	if (f.edgeBoard) p.set("edgeboard", f.edgeBoard);
	if (f.freedrawKind) p.set("fdkind", f.freedrawKind);
	if (f.freedrawGrid) p.set("fdgrid", f.freedrawGrid);
	if (f.colorsGrid) p.set("cogrid", f.colorsGrid);
	if (f.colorsCount) p.set("cocount", String(f.colorsCount));
	if (f.freedrawRegular) p.set("fdreg", f.freedrawRegular);
	if (f.wallpaperGroups?.length) p.set("group", f.wallpaperGroups.join(","));
	if (f.levels?.length) p.set("level", f.levels.join(","));
	if (f.latticeShapes?.length) p.set("lattice", f.latticeShapes.join(","));
	if (f.discoverers?.length) p.set("by", f.discoverers.join(","));
	if (f.certifications?.length) p.set("cert", f.certifications.join(","));
	if (f.polygonNames?.length) p.set("polygon", f.polygonNames.join(","));
	// Only worth a param alongside a selection, and only when it isn't the default.
	if (f.polygonNames?.length && f.polygonMode && f.polygonMode !== "all") p.set("polymode", f.polygonMode);
	if (f.polygonExclude?.length) p.set("polyx", f.polygonExclude.join(","));
	if (f.distinctPolygons?.length) p.set("dpoly", f.distinctPolygons.join(","));
	if (f.distinctStars?.length) p.set("dstar", f.distinctStars.join(","));
	if (f.anglePeriods?.length) p.set("aper", f.anglePeriods.join(","));
	if (f.query?.trim()) p.set("q", f.query.trim());
	if (f.vcs?.length) p.set("vc", f.vcs.join(","));
	if (f.vcs?.length && f.vcMode && f.vcMode !== "all") p.set("vcmode", f.vcMode);
	if (v.sortKey !== "catalogue") p.set("sort", v.sortKey);
	if (v.sortDir !== SORT_DEFAULT_DIR[v.sortKey]) p.set("dir", v.sortDir);
	if (v.view !== "grid") p.set("view", v.view);
	if (v.page > 1) p.set("page", String(v.page));
	if (v.pageSize !== DEFAULT_PAGE_SIZE) p.set("size", String(v.pageSize));
	if (v.gridColumns !== 5) p.set("cols", String(v.gridColumns));
	if (!v.groupVariants) p.set("grouped", "0");
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
// the controls it names instead of dropping into the seam. The 1px wall gaps above and below still rule
// each band off; every diamond stays where it was, born only where four rounded option-cell corners meet.

// An option and how many results it gives: side by side in a wide cell, stacked in a narrow one (the
// same two-line cell the /play geometry segments use). No count means none loaded yet, not zero.
function CountLabel({ label, count, stacked }: { label: ReactNode; count?: number; stacked?: boolean }) {
	const n =
		count != null ? (
			<span className="font-mono text-[10.5px] font-normal text-fg-muted tabular-nums">
				{count.toLocaleString("en-US")}
			</span>
		) : null;
	return stacked ? (
		<span className="flex flex-col items-center leading-tight">
			<span>{label}</span>
			{n}
		</span>
	) : (
		<span className="flex w-full items-baseline justify-between gap-2 px-1">
			<span className="truncate">{label}</span>
			{n}
		</span>
	);
}

// A caption row inside a filter group — a thinner echo of the group heading, same chrome band.
function SubLabel({ children }: { children: ReactNode }) {
	return <span className="pt-1 text-xs text-fg-secondary">{children}</span>;
}

// An explanatory line under a group's controls: helper text, 4px under what it explains.
function GroupNote({ children }: { children: ReactNode }) {
	return <p className={cn(META, "-mt-1")}>{children}</p>;
}

// A long pick-one list (Tile class): 28px left-aligned rows with no track, the selected row lifted
// like a segmented tab. A 13-cell track read as a grey slab. A label too long for half the panel
// spans both columns (dense flow backfills the gap) so no class name is ever truncated.
function RowList<T extends string>({
	options,
	selected,
	onChange,
}: {
	options: { value: T; label: string }[];
	selected: T;
	onChange: (v: T) => void;
}) {
	return (
		<div className="grid grid-flow-row-dense grid-cols-2 gap-0.5">
			{options.map((o) => (
				<button
					key={o.value}
					type="button"
					aria-pressed={selected === o.value}
					onClick={() => onChange(o.value)}
					title={o.label}
					className={cn(
						o.label.length > 18 && "col-span-2",
						"ta-tab h-7 cursor-pointer truncate px-2 text-left text-[13px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 max-md:h-11 max-md:text-sm",
						selected === o.value ? "font-medium text-fg" : "text-fg-secondary hover:text-fg",
					)}
				>
					{o.label}
				</button>
			))}
		</div>
	);
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
	label,
	format = (n: number) => String(n),
}: {
	value: [number, number];
	min: number;
	max: number;
	step: number;
	active: boolean;
	onChange: (v: [number, number]) => void;
	ariaLabel: string;
	/** Names the range on the readout's own row, when several share one group. */
	label?: ReactNode;
	format?: (n: number) => string;
}) {
	return (
		<div className="flex flex-col gap-1 pb-1">
			<div className="flex items-baseline justify-between gap-2">
				<span className="text-xs text-fg-secondary">{label}</span>
				<span className={cn("text-[10px] font-medium tabular-nums", active ? "text-fg" : "text-fg-muted")}>
					{format(value[0])} – {format(value[1])}
				</span>
			</div>
			<IntervalSlider value={value} onChange={onChange} min={min} max={max} step={step} aria-label={ariaLabel} />
		</div>
	);
}

/**
 * One filter facet: a ruled section whose heading folds it. The chevron leads, as on /play's catalogue
 * rows. Closed, the heading still carries the current selection (`summary`), and a group with a
 * selection always starts open, so nothing applied is ever out of sight. `defaultOpen={false}` is for
 * the facets few people reach for: they cost one 40px row until wanted. `info` is the explanation that
 * would otherwise sit as a paragraph under the controls; it folds into an InfoDot on the heading.
 */
function FilterGroup({
	title,
	summary,
	note,
	info,
	defaultOpen = true,
	children,
}: {
	title: string;
	summary?: ReactNode;
	note?: string;
	info?: ReactNode;
	defaultOpen?: boolean;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(defaultOpen || summary != null);
	return (
		<section className="flex flex-col border-t border-line-subtle">
			<div className="flex items-center gap-1 pr-2.5 pl-2">
				<button
					type="button"
					aria-expanded={open}
					onClick={() => setOpen(!open)}
					title={note}
					className="group flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-control py-3 pl-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 max-md:min-h-11"
				>
					<ChevronRight
						size={12}
						aria-hidden
						className={cn(
							"shrink-0 text-fg-muted transition-transform duration-200 ease-[var(--ease-out-strong)] group-hover:text-fg motion-reduce:transition-none",
							open && "rotate-90",
						)}
					/>
					<span className="ta-label shrink-0 transition-colors group-hover:text-fg-secondary">{title}</span>
					{/* Open, the controls show the selection themselves; the heading repeats it only when folded. */}
					{summary && !open ? (
						<span className="min-w-0 truncate text-[11px] font-medium text-fg">{summary}</span>
					) : null}
					{/* A finger has no hover, so on a phone the gloss is printed after the heading instead. */}
					{note && !summary ? <span className={cn(META, "truncate md:hidden")}>· {note}</span> : null}
				</button>
				{info ? <InfoDot label={`About ${title}`}>{info}</InfoDot> : null}
			</div>
			<Fold open={open}>
				<div className="flex flex-col gap-2 px-3.5 pb-4">{children}</div>
			</Fold>
		</section>
	);
}

/**
 * How many of the loaded tilings matching `scope` carry each value of one facet. `scope` is the view's
 * filter with that facet's own field cleared, so the count beside an option is the number of results
 * picking it would give.
 */
function countFacet<V>(
	tilings: readonly ReferenceTiling[] | null,
	scope: ReferenceFilter,
	valuesOf: (t: ReferenceTiling) => V | readonly V[] | null | undefined,
): Map<V, number> {
	const counts = new Map<V, number>();
	for (const t of tilings ?? []) {
		const v = valuesOf(t);
		if (v == null || (Array.isArray(v) && !v.length) || !matchesReferenceFilters(t, scope)) continue;
		for (const x of Array.isArray(v) ? (v as readonly V[]) : [v as V]) counts.set(x, (counts.get(x) ?? 0) + 1);
	}
	return counts;
}

/**
 * Fetch each wanted best-effort shard once and merge it into the tilings. `inflight` dedupes runs that
 * overlap a fetch; a failure is swallowed and still marks the k loaded, so it is never retried.
 */
function fetchShards(
	want: readonly number[],
	loaded: Set<number>,
	inflight: Set<number>,
	load: (k: number) => Promise<ReferenceTiling[]>,
	setTilings: Dispatch<SetStateAction<ReferenceTiling[] | null>>,
	setLoaded: Dispatch<SetStateAction<Set<number>>>,
) {
	for (const kk of want) {
		if (loaded.has(kk) || inflight.has(kk)) continue;
		inflight.add(kk);
		load(kk)
			.then((data) => setTilings((prev) => (prev ? [...prev, ...data] : data)))
			.catch(() => {})
			.finally(() => {
				inflight.delete(kk);
				setLoaded((s) => new Set(s).add(kk));
			});
	}
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
	const [polygonModalOpen, setPolygonModalOpen] = useState(false);
	const [gridColumns, setGridColumns] = useState(initialView.gridColumns);
	const [pageSize, setPageSize] = useState(initialView.pageSize);
	const [currentPage, setCurrentPage] = useState(initialView.page);
	const [groupVariants, setGroupVariants] = useState(initialView.groupVariants);
	const [sortKey, setSortKey] = useState<SortKey>(initialView.sortKey);
	const [sortDir, setSortDir] = useState<SortDir>(initialView.sortDir);
	const [view, setView] = useState<ResultsView>(initialView.view);
	// A key picks its own natural direction; the same key again (a table header clicked twice) reverses.
	const changeSort = (key: SortKey, dir?: SortDir) => {
		setSortDir(dir ?? (key === sortKey ? (sortDir === "asc" ? "desc" : "asc") : SORT_DEFAULT_DIR[key]));
		setSortKey(key);
	};
	const [copied, setCopied] = useState(false);
	// Phone only: whether the header's Filters button is on screen (the floating pill stands in when not).
	const mainRef = useRef<HTMLElement | null>(null);
	const headerTriggerRef = useRef<HTMLButtonElement | null>(null);
	const [headerTriggerVisible, setHeaderTriggerVisible] = useState(true);
	useEffect(() => {
		const el = headerTriggerRef.current;
		if (!el) return;
		const io = new IntersectionObserver(([e]) => setHeaderTriggerVisible(e.isIntersecting), { root: mainRef.current });
		io.observe(el);
		return () => io.disconnect();
	}, []);
	const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [loadedShards, setLoadedShards] = useState<Set<number>>(new Set());
	const [loadingShards, setLoadingShards] = useState<Set<number>>(new Set());
	const [shardErrors, setShardErrors] = useState<Map<number, string>>(new Map());
	// Dedicated isotoxal shard tracking — its k=3 collides with the convex-irregular k=3 in the shared sets.
	const [isotoxalLoadedShards, setIsotoxalLoadedShards] = useState<Set<number>>(new Set());
	const isotoxalInflight = useRef<Set<number>>(new Set());
	// Period-p k≥3 needs its OWN shard state for the same reason isotoxal does: the sets are keyed by k
	// alone, so a shared one would mark period k=3 loaded because convex-irregular k=3 already was.
	const [periodLoadedShards, setPeriodLoadedShards] = useState<Set<number>>(new Set());
	const periodInflight = useRef<Set<number>>(new Set());
	const [mixedLoadedShards, setMixedLoadedShards] = useState<Set<number>>(new Set());
	const mixedInflight = useRef<Set<number>>(new Set());
	const [euHalfLoadedShards, setEuHalfLoadedShards] = useState<Set<number>>(new Set());
	const euHalfInflight = useRef<Set<number>>(new Set());
	const [tri45LoadedShards, setTri45LoadedShards] = useState<Set<number>>(new Set());
	const tri45Inflight = useRef<Set<number>>(new Set());
	const [penroseLoadedShards, setPenroseLoadedShards] = useState<Set<number>>(new Set());
	const penroseInflight = useRef<Set<number>>(new Set());
	const [scaledLoadedShards, setScaledLoadedShards] = useState<Set<number>>(new Set());
	const scaledInflight = useRef<Set<number>>(new Set());
	// k values whose Euclidean decoration shards have been requested (hexagonal edges/colorings tails).
	const decorRequested = useRef<Set<number>>(new Set());

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
	// Adjusted during render: the initial state already matches, so the first render keeps its page.
	const [pageResetKey, setPageResetKey] = useState({ filters, pageSize, groupVariants, sortKey, sortDir, view });
	if (
		pageResetKey.filters !== filters ||
		pageResetKey.pageSize !== pageSize ||
		pageResetKey.groupVariants !== groupVariants ||
		pageResetKey.sortKey !== sortKey ||
		pageResetKey.sortDir !== sortDir ||
		pageResetKey.view !== view
	) {
		setPageResetKey({ filters, pageSize, groupVariants, sortKey, sortDir, view });
		setCurrentPage(1);
	}

	// Mirror the whole view into the URL without navigating — a reload restores it and "Copy link" hands
	// a friend the exact same view. replaceState (not router.replace) keeps this off the Next router, so
	// it neither re-runs the server component nor spams history; useSearchParams is read once on mount.
	useEffect(() => {
		const q = serializeView({
			filters,
			page: currentPage,
			pageSize,
			gridColumns,
			groupVariants,
			sortKey,
			sortDir,
			view,
		});
		window.history.replaceState(null, "", q ? `${window.location.pathname}?${q}` : window.location.pathname);
	}, [filters, currentPage, pageSize, gridColumns, groupVariants, sortKey, sortDir, view]);

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
		// Euclidean-only: the k≥8 shards are reference-atlas-k{k}.json (Čtrnáct Euclidean). Off the plane the
		// same k selects hyperbolic-edge shards instead (below), so don't fetch a 15–73 MB Euclidean file for
		// a hyperbolic view that would filter every record out by geometry.
		if (filters.geometry && filters.geometry !== GEOMETRIES.EUCLIDEAN) return;
		const k = filters.kValue;
		// `HIGHER_K`, not `k >= 8`: the base Čtrnáct shards are k = 8, 9 and 10 and there is no k=11+ file,
		// so any higher k 404'd and painted "failed to load k=…" beside the count. That was unreachable
		// while nothing offered a Euclidean chip above 10; the halved-polygon boards go to k=14, which is
		// how it surfaced. The bug is the unbounded test, not the new chips.
		if (k == null || !HIGHER_K.includes(k)) return;
		if (loadedShards.has(k) || loadingShards.has(k) || shardErrors.has(k)) return;
		// eslint-disable-next-line react-hooks/set-state-in-effect -- the fetch starts here and the "loading k=…" line renders this set
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
	}, [filters.geometry, filters.kValue, loadedShards, loadingShards, shardErrors]);

	// Hyperbolic edge systems (freedraw class, hyperbolic geometry): lazy like the k≥8 shards, but off the
	// plane. The eager k ≤ 9 slice loads once the Hyperbolic geometry is entered; the dense k = 12/13/14
	// shards load when their k chip is selected. All merged into `tilings` (deduped by id) so every derived
	// facet — class chips, k chips, counts — picks them up.
	const [heLoaded, setHeLoaded] = useState<Set<string>>(new Set());
	useEffect(() => {
		if (filters.geometry !== GEOMETRIES.HYPERBOLIC) return;
		// Decoration shelf, so the chip gates it and not the geometry. These rows are decoration
		// "edges"; a Tilings view cannot show one, yet entering the geometry fetched them all.
		// Measured on /library?geo=spherical: 321 JSON requests, 147 long tasks and 17.6 s of
		// blocking, of which 207 requests were decoration shelves nothing on screen could display.
		if (filters.decoration !== DECORATIONS.EDGES) return;
		// Wait for the base atlas: its own load does setTilings(d) (a REPLACE), so a merge that landed first
		// would be clobbered. Gating on `tilings` and depending on it re-runs the merge once the base is in.
		if (!tilings) return;
		let alive = true;
		const merge = (data: ReferenceTiling[], token: string) => {
			if (!alive || !data.length) return;
			setTilings((prev) => {
				const base = prev ?? [];
				const have = new Set(base.map((t) => t.id));
				const add = data.filter((t) => !have.has(t.id));
				return add.length ? [...base, ...add] : base;
			});
			setHeLoaded((s) => new Set(s).add(token));
		};
		if (!heLoaded.has("eager"))
			loadHyperbolicEdgesAtlas()
				.then((d) => merge(d, "eager"))
				.catch(() => {});
		// Selecting a k chip pulls the lazy (base, k) shards for that k — 6.6.7's k=12/13, the high-valence
		// bases' k=2, the 2026-08-29 bases' k=3..5.
		//
		// SCOPED TO THE SELECTED BOARD, and that is a heap fix, not a bytes one. Every shard for a k used
		// to be fetched whenever that k was picked, so `?geo=hyperbolic&dec=edges&k=5` pulled 29 MB over
		// the wire — fine, under a second — and built 527 MB of JS heap, because a record's dart arrays
		// expand several-fold as live objects and the shard cache never lets go. Measured with
		// scripts/measure-page-load.mjs. With one board chosen only its own shard loads, which is what a
		// reader looking at one board was ever going to look at. With no board chosen the fan-out is
		// unchanged, because the unfiltered count has to be the true one.
		const k = filters.kValue;
		if (k != null) {
			const only = filters.board?.startsWith("hyp-") ? filters.board.slice(4) : null;
			for (const { base } of hypEdgesLazyShardsForK(k)) {
				if (only && base !== only) continue;
				const token = `${base}-${k}`;
				if (!heLoaded.has(token))
					loadHyperbolicEdgesShard(base, k)
						.then((d) => merge(d, token))
						.catch(() => {});
			}
		}
		// Selecting a base with NO k chosen loads that base's dense slices — the same rule the poly shelf
		// follows, and for the same reason: the chip promises the board, so picking it fetches the board.
		// Without this, 3^3.5^2 read its eager slices alone and said nothing about the 90,387 at k = 5.
		const heBase = filters.board?.startsWith("hyp-") ? filters.board.slice(4) : null;
		if (heBase && k == null) {
			for (const b of HYP_EDGES_BASES) {
				if (b.id !== heBase) continue;
				for (const bk of b.lazyKs) {
					const token = `${b.id}-${bk}`;
					if (!heLoaded.has(token))
						loadHyperbolicEdgesShard(b.id, bk)
							.then((d) => merge(d, token))
							.catch(() => {});
				}
			}
		}
		return () => {
			alive = false;
		};
	}, [filters.geometry, filters.decoration, filters.kValue, filters.board, heLoaded, tilings]);

	// Parametric-pentagon edge systems — EUCLIDEAN, so this effect runs under the plane, unlike every
	// other Čtrnáct edge shelf. Eager slices (k = 2, 4, 6) arrive with the geometry; k = 8 and 10 are
	// 8.4 and 35.2 MB and wait for their k chip.
	const [penLoaded, setPenLoaded] = useState<Set<string>>(new Set());
	useEffect(() => {
		if ((filters.geometry ?? GEOMETRIES.EUCLIDEAN) !== GEOMETRIES.EUCLIDEAN) return;
		if (!tilings) return; // wait for the base atlas (its setTilings is a REPLACE)
		const dec = filters.decoration;
		let alive = true;
		const merge = (data: ReferenceTiling[], token: string) => {
			if (!alive || !data.length) return;
			setTilings((prev) => {
				const base = prev ?? [];
				const have = new Set(base.map((t) => t.id));
				const add = data.filter((t) => !have.has(t.id));
				return add.length ? [...base, ...add] : base;
			});
			setPenLoaded((s) => new Set(s).add(token));
		};
		// Behind the Edge patterns chip, exactly like freedraw and bubble: these records are
		// decoration="edges" (source "freedraw" -> tileClassOf "freedraw" -> decorationOf "edges"), so
		// they are only ever VISIBLE under that chip, and the eager slices were nonetheless fetched on
		// every Euclidean open. Measured on /play: pentagon + isohedral were 53 of the 80 JSON requests
		// a default open made, for rows the current chip cannot show.
		if (dec === DECORATIONS.EDGES && !penLoaded.has("pen-eager")) {
			loadPentagonEdgesAtlas()
				.then((d) => merge(d, "pen-eager"))
				.catch(() => {});
		}
		const k = filters.kValue;
		if (dec === DECORATIONS.EDGES && k != null) {
			for (const b of pentEdgeLazyShardsForK(k)) {
				const token = `pen-${b.id}-${k}`;
				if (penLoaded.has(token)) continue;
				loadPentagonEdgesShard(b.id, k)
					.then((d) => merge(d, token))
					.catch(() => {});
			}
		}
		return () => {
			alive = false;
		};
	}, [filters.geometry, filters.decoration, filters.kValue, penLoaded, tilings]);

	// Parametric-isohedral edge systems — EUCLIDEAN too, and the same lazy shape as the pentagon board
	// above. Eager slices (k = 2…10) arrive with the geometry; k = 12 and 14 are 14.1 and 35.0 MB and
	// wait for their k chip.
	const [ihLoaded, setIhLoaded] = useState<Set<string>>(new Set());
	useEffect(() => {
		if ((filters.geometry ?? GEOMETRIES.EUCLIDEAN) !== GEOMETRIES.EUCLIDEAN) return;
		if (!tilings) return; // wait for the base atlas (its setTilings is a REPLACE)
		const dec = filters.decoration;
		let alive = true;
		const merge = (data: ReferenceTiling[], token: string) => {
			if (!alive || !data.length) return;
			setTilings((prev) => {
				const base = prev ?? [];
				const have = new Set(base.map((t) => t.id));
				const add = data.filter((t) => !have.has(t.id));
				return add.length ? [...base, ...add] : base;
			});
			setIhLoaded((s) => new Set(s).add(token));
		};
		if (dec === DECORATIONS.EDGES && !ihLoaded.has("ih-eager")) {
			loadIsohedralEdgesAtlas()
				.then((d) => merge(d, "ih-eager"))
				.catch(() => {});
		}
		const k = filters.kValue;
		if (dec === DECORATIONS.EDGES && k != null) {
			for (const b of ihEdgeLazyShardsForK(k)) {
				const token = `ih-${b.id}-${k}`;
				if (ihLoaded.has(token)) continue;
				loadIsohedralEdgesShard(b.id, k)
					.then((d) => merge(d, token))
					.catch(() => {});
			}
		}
		return () => {
			alive = false;
		};
	}, [filters.geometry, filters.decoration, filters.kValue, ihLoaded, tilings]);

	// Schwarz-triangle edge systems — the freedraw class on a (p,q,r) mirror board. Same lazy shape as the
	// {p,q} edge systems, but it spans BOTH curved geometries, so the effect runs under either and pulls
	// that geometry's boards. Eager slices arrive with the geometry; the two dense tails ((2,2,4) k=10,
	// (2,3,3) k=7) load when their k chip is selected.
	const [schLoaded, setSchLoaded] = useState<Set<string>>(new Set());
	useEffect(() => {
		const geo = filters.geometry;
		if (geo !== GEOMETRIES.HYPERBOLIC && geo !== GEOMETRIES.SPHERICAL) return;
		// Decoration shelf, so the chip gates it and not the geometry. These rows are decoration
		// "edges"; a Tilings view cannot show one, yet entering the geometry fetched them all.
		// Measured on /library?geo=spherical: 321 JSON requests, 147 long tasks and 17.6 s of
		// blocking, of which 207 requests were decoration shelves nothing on screen could display.
		if (filters.decoration !== DECORATIONS.EDGES) return;
		if (!tilings) return; // wait for the base atlas (its setTilings is a REPLACE, see the edge-systems effect)
		let alive = true;
		const merge = (data: ReferenceTiling[], token: string) => {
			if (!alive || !data.length) return;
			setTilings((prev) => {
				const base = prev ?? [];
				const have = new Set(base.map((t) => t.id));
				const add = data.filter((t) => !have.has(t.id));
				return add.length ? [...base, ...add] : base;
			});
			setSchLoaded((s) => new Set(s).add(token));
		};
		const eagerToken = `sch-${geo}`;
		if (!schLoaded.has(eagerToken)) {
			const load = geo === GEOMETRIES.SPHERICAL ? loadSphericalSchwarzAtlas : loadHyperbolicSchwarzAtlas;
			load()
				.then((d) => merge(d, eagerToken))
				.catch(() => {});
		}
		const k = filters.kValue;
		if (k != null) {
			for (const b of schwarzLazyShardsForK(geo, k)) {
				const token = `sch-${b.id}-${k}`;
				if (!schLoaded.has(token))
					loadSchwarzShard(b.id, k)
						.then((d) => merge(d, token))
						.catch(() => {});
			}
		}
		return () => {
			alive = false;
		};
	}, [filters.geometry, filters.decoration, filters.kValue, schLoaded, tilings]);

	// Uniform-polyhedron edge systems (spherical) and the 3.4.n.4 tilings (hyperbolic) — one shelf per
	// curved geometry, same lazy shape: eager slices with the geometry, dense tails on their k chip.
	const [xLoaded, setXLoaded] = useState<Set<string>>(new Set());
	useEffect(() => {
		const geo = filters.geometry;
		if (geo !== GEOMETRIES.HYPERBOLIC && geo !== GEOMETRIES.SPHERICAL) return;
		if (!tilings) return; // wait for the base atlas (its setTilings is a REPLACE, see the edge-systems effect)
		let alive = true;
		const merge = (data: ReferenceTiling[], token: string) => {
			if (!alive || !data.length) return;
			setTilings((prev) => {
				const base = prev ?? [];
				const have = new Set(base.map((t) => t.id));
				const add = data.filter((t) => !have.has(t.id));
				return add.length ? [...base, ...add] : base;
			});
			setXLoaded((s) => new Set(s).add(token));
		};
		const eagerToken = `xtra-${geo}`;
		// ⚑ ONE GUARD PER LOAD, never one guard around two. This effect lists `tilings` as a dep, so the
		// FIRST load to merge re-runs it, and the cleanup marks the run that owns the other load dead —
		// its `merge` becomes a no-op and its token is never recorded. Under a shared `if (!has(token))`
		// the retry is then blocked by the token the winner already wrote, and the loser's whole shelf
		// stays out of the corpus for the session. That is what happened to the star polyhedra and the
		// four halved boards: 105 records, every shard fetched with a 200, all six board chips filtering
		// to zero (AL found it, 2026-08-22). With a token each the loser is simply re-issued on the next
		// run and resolves off `sphPolyCache` with no second fetch.
		if (geo === GEOMETRIES.SPHERICAL) {
			// The uniform-polyhedron EDGE systems are decoration "edges" (145 of the 321 requests a
			// spherical open made); the polyhedra themselves are tilings and stay with the geometry.
			// One guard per load, per the warning above — the decoration test is folded into this
			// load's own guard and does not wrap the poly load below it.
			if (filters.decoration === DECORATIONS.EDGES && !xLoaded.has(eagerToken)) {
				loadSphericalEdgesAtlas()
					.then((d) => merge(d, eagerToken))
					.catch(() => {});
			}
			if (!xLoaded.has(`${eagerToken}-poly`)) {
				loadSphericalPolyAtlas()
					.then((d) => merge(d, `${eagerToken}-poly`))
					.catch(() => {});
			}
		} else {
			// The BASE hyperbolic shelf is deferred too (see loadHyperbolicBaseAtlas): 15.9 MB that
			// used to be parsed on every /library load regardless of the geometry chip.
			if (!xLoaded.has(`${eagerToken}-base`)) {
				loadHyperbolicBaseAtlas()
					.then((d) => merge(d, `${eagerToken}-base`))
					.catch(() => {});
			}
			if (!xLoaded.has(eagerToken)) {
				loadHyperbolicPolyAtlas()
					.then((d) => merge(d, eagerToken))
					.catch(() => {});
			}
		}
		const k = filters.kValue;
		if (k != null) {
			if (geo === GEOMETRIES.SPHERICAL) {
				for (const b of sphEdgesLazyShardsForK(k)) {
					const token = `spe-${b.id}-${k}`;
					if (filters.decoration === DECORATIONS.EDGES && !xLoaded.has(token))
						loadSphericalEdgesShard(b.id, k)
							.then((d) => merge(d, token))
							.catch(() => {});
				}
			} else {
				// Scoped to the selected board for the reason the hyperbolic EDGE bases are (see that effect):
				// a k chip used to pull that k from every board at once, which is heap, not bytes.
				const onlyPoly = hypPolyBoardOfSub(filters.board)?.id ?? null;
				for (const b of hypPolyLazyShardsForK(k)) {
					if (onlyPoly && b.id !== onlyPoly) continue;
					const token = `hpo-${b.id}-${k}`;
					if (!xLoaded.has(token))
						loadHyperbolicPolyShard(b.id, k)
							.then((d) => merge(d, token))
							.catch(() => {});
				}
				// The half-tile boards share this axis. Five lazy slices now, the largest {4,6} at k=3 —
				// 15,443 quotients, 51 MB of JSON that gzips to 1.0 MB, so it is parse time being deferred
				// here and not bandwidth.
				for (const b of hypHalfLazyShardsForK(k)) {
					const token = `hph-${b.id}-${k}`;
					if (!xLoaded.has(token))
						loadHyperbolicHalfShard(b.id, k)
							.then((d) => merge(d, token))
							.catch(() => {});
				}
			}
		}
		// SELECTING A BOARD LOADS THAT BOARD, on all three hyperbolic-poly families.
		//
		// The abcd boards have no eager slice at all — 247 boards with even one eager k would be 247
		// requests before anything displayed, which is the wall this shelf had to clear to ship the corpus
		// whole — and the ai1/ai2 boards have five, out of the hundred-odd k each now carries. Either way,
		// what the board chip promises is the board, so picking it fetches the board.
		//
		// ⚑ This covered `hpq-` only until 2026-09-01, and the asymmetry was visible on screen: clicking
		// 3.4.7.4 in /library showed 10 tilings, its five eager slices, against 16,459 shipped. Found by
		// walking the shelf by click instead of by URL. With a k also chosen, just that slice loads.
		const polyBoard = hypPolyBoardOfSub(filters.board);
		if (polyBoard) {
			for (const bk of polyBoard.lazyKs) {
				if (k != null && bk !== k) continue;
				const token = `hpo-${polyBoard.id}-${bk}`;
				if (!xLoaded.has(token))
					loadHyperbolicPolyShard(polyBoard.id, bk)
						.then((d) => merge(d, token))
						.catch(() => {});
			}
		}
		return () => {
			alive = false;
		};
	}, [filters.geometry, filters.decoration, filters.kValue, filters.board, xLoaded, tilings]);

	// The DECORATION catalogues, on their own effect and their own trigger.
	//
	// They used to live inside the curved-geometry effect above, which early-returns unless the
	// geometry is hyperbolic or spherical — and `parseViewState` defaults the geometry to euclidean.
	// So on /library the Edge patterns and Colorings chips fetched NOTHING: `?dec=colorings` rendered
	// "No tilings match" over 226,946 rows that exist, 342,693 across both chips, presented as a
	// complete shelf. `filters.decoration` was also missing from that effect's dep array, so even
	// under a curved geometry the chip alone could not re-run it (setDecoration preserves kValue, so
	// no other dep changed either). /play had this right all along — see _play-client.tsx, which
	// gates on the chip outside any geometry guard. This mirrors it.
	const [decorLoaded, setDecorLoaded] = useState<Set<string>>(new Set());
	useEffect(() => {
		if (!tilings) return; // the base atlas setTilings is a REPLACE; merging before it lands loses us
		// Euclidean shelves, so the plane gates them as well as the chip. Freedraw, bubble and the
		// colourings are all `geometry: "euclidean"`, and the geometry filter drops every one of them
		// under a curved view — so fetching them there is 29 requests and ~1 MB for rows that cannot
		// appear. This is NOT the old bug the note above records: that one required a CURVED geometry
		// and so starved the chip everywhere; this asks for the geometry these records actually live in.
		if ((filters.geometry ?? GEOMETRIES.EUCLIDEAN) !== GEOMETRIES.EUCLIDEAN) return;
		const dec = filters.decoration;
		let alive = true;
		const merge = (data: ReferenceTiling[], token: string) => {
			if (!alive || !data.length) return;
			setTilings((prev) => {
				const base = prev ?? [];
				const have = new Set(base.map((t) => t.id));
				const add = data.filter((t) => !have.has(t.id));
				return add.length ? [...base, ...add] : base;
			});
			setDecorLoaded((s) => new Set(s).add(token));
		};
		if (dec === DECORATIONS.EDGES && !decorLoaded.has("decor-fd")) {
			loadFreedrawDecorAtlas()
				.then((d) => merge(d, "decor-fd"))
				.catch(() => {});
		}
		// Bubble tiles are the second occupant of the Euclidean × edges cell, so they ride the same
		// chip as freedraw and are told apart by the tile-class facet.
		//
		// They are ALSO the only shape-class chip whose rows live outside the eager atlas, so the class
		// wall can ask for them with no Kind chosen — and then this effect, gated on the Kind alone,
		// fetched nothing and the Bubble chip read "No tilings match" over 52,140 rows that exist. The
		// class is its own trigger. Under Kind=Tilings it is not: decorationOf(bubble) is "edges", so
		// that segment excludes every bubble row and a fetch there is 37 MB spent to display zero.
		if (
			(dec === DECORATIONS.EDGES || (!dec && filters.tileClass === TILE_CLASSES.BUBBLE)) &&
			!decorLoaded.has("decor-bub")
		) {
			loadBubbleDecorAtlas()
				.then((d) => merge(d, "decor-bub"))
				.catch(() => {});
		}
		if (dec === DECORATIONS.COLORINGS && !decorLoaded.has("decor-col")) {
			loadColorsDecorAtlas()
				.then((d) => merge(d, "decor-col"))
				.catch(() => {});
		}
		return () => {
			alive = false;
		};
	}, [filters.geometry, filters.decoration, filters.tileClass, tilings, decorLoaded]);

	// Colored tilings in H² and on S² — the same lazy shape as the edge systems. The eager per-base/solid
	// slices load once their geometry is entered (making the "Colorings" class chip appear); dense shards load
	// when their k chip is selected. Merged into `tilings` (deduped by id).
	const [colLoaded, setColLoaded] = useState<Set<string>>(new Set());
	useEffect(() => {
		const geo = filters.geometry;
		if (geo !== GEOMETRIES.HYPERBOLIC && geo !== GEOMETRIES.SPHERICAL) return;
		// Decoration shelf, so the chip gates it and not the geometry. These rows are decoration
		// "colorings"; a Tilings view cannot show one, yet entering the geometry fetched them all.
		// Measured on /library?geo=spherical: 321 JSON requests, 147 long tasks and 17.6 s of
		// blocking, of which 207 requests were decoration shelves nothing on screen could display.
		if (filters.decoration !== DECORATIONS.COLORINGS) return;
		if (!tilings) return; // wait for the base atlas (its setTilings is a REPLACE, see the edge-systems effect)
		let alive = true;
		const merge = (data: ReferenceTiling[], token: string) => {
			if (!alive || !data.length) return;
			setTilings((prev) => {
				const base = prev ?? [];
				const have = new Set(base.map((t) => t.id));
				const add = data.filter((t) => !have.has(t.id));
				return add.length ? [...base, ...add] : base;
			});
			setColLoaded((s) => new Set(s).add(token));
		};
		const k = filters.kValue;
		if (geo === GEOMETRIES.HYPERBOLIC) {
			if (!colLoaded.has("hc-eager"))
				loadHyperbolicColorsAtlas()
					.then((d) => merge(d, "hc-eager"))
					.catch(() => {});
			if (k != null)
				for (const { base } of hypColorsLazyShardsForK(k)) {
					const token = `hc-${base}-${k}`;
					if (!colLoaded.has(token))
						loadHyperbolicColorsShard(base, k)
							.then((d) => merge(d, token))
							.catch(() => {});
				}
		} else {
			if (!colLoaded.has("sc-eager"))
				loadSphericalColorsAtlas()
					.then((d) => merge(d, "sc-eager"))
					.catch(() => {});
			if (k != null)
				for (const { solid } of sphColorsLazyShardsForK(k)) {
					const token = `sc-${solid}-${k}`;
					if (!colLoaded.has(token))
						loadSphericalColorsShard(solid, k)
							.then((d) => merge(d, token))
							.catch(() => {});
				}
		}
		return () => {
			alive = false;
		};
	}, [filters.geometry, filters.decoration, filters.kValue, colLoaded, tilings]);

	// Lazy convex-irregular k≥3 shards. The demo keeps k≤2 in the main atlas and splits each higher k into
	// public/reference-atlas-composable-k{k}.json (COMPOSABLE_HIGHER_K). Fetch a shard when it's in view:
	// the convex-irregular class is selected (pull all its shards so the shelf fills in), or a convex-irregular
	// shard-k chip is picked (also under "All", where k=3 includes it). Convex-irregular shard ks (3)
	// never collide with the regular shard ks (8/9/10), so the shared loaded/loading/error state is safe.
	// A missing shard resolves to an empty merge inside the loader — no error is surfaced (it's a demo).
	useEffect(() => {
		const cls = filters.tileClass;
		if (cls !== TILE_CLASSES.CONVEX && cls != null) return; // regular/star only — no convex-irregular shard needed
		// ⚑ Wait for the base atlas. Its load does setTilings(d), a REPLACE, and a shard is small enough to
		// win that race every time when its class is already in the URL — the merge lands, the base lands
		// on top of it, and the shard's k is marked loaded so nothing ever retries. Symptom: "0 tilings"
		// for /library?class=isotoxal&k=3 and ?class=period&k=3 with the shard visibly fetched in the
		// network panel. The hyperbolic and decoration effects below already guard this way (see the note
		// at the edge-systems effect); these three did not.
		if (!tilings) return;
		const k = filters.kValue;
		const want =
			k != null ? COMPOSABLE_HIGHER_K.filter((kk) => kk === k) : cls === TILE_CLASSES.CONVEX ? COMPOSABLE_HIGHER_K : [];
		for (const kk of want) {
			if (loadedShards.has(kk) || loadingShards.has(kk) || shardErrors.has(kk)) continue;
			// eslint-disable-next-line react-hooks/set-state-in-effect -- the fetch starts here and the "loading k=…" line renders this set
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
	}, [filters.tileClass, filters.kValue, loadedShards, loadingShards, shardErrors, tilings]);

	// Lazy isotoxal k≥3 shards — same shape as the convex-irregular effect, but with dedicated shard state
	// (its k=3 collides with convex-irregular's in the shared number-keyed sets). Fetch when the isotoxal
	// class or a k≥3 chip is in view. A missing shard resolves to an empty merge inside the loader.
	useEffect(() => {
		const cls = filters.tileClass;
		if (cls !== TILE_CLASSES.ISOTOXAL && cls != null) return;
		if (!tilings) return; // base atlas REPLACES; see the convex-irregular effect
		const k = filters.kValue;
		const want =
			k != null ? ISOTOXAL_HIGHER_K.filter((kk) => kk === k) : cls === TILE_CLASSES.ISOTOXAL ? ISOTOXAL_HIGHER_K : [];
		fetchShards(
			want,
			isotoxalLoadedShards,
			isotoxalInflight.current,
			loadIsotoxalAtlasShard,
			setTilings,
			setIsotoxalLoadedShards,
		);
	}, [filters.tileClass, filters.kValue, isotoxalLoadedShards, tilings]);

	// Lazy period-p k≥3 shards — same shape as the isotoxal effect. These families come from the QUOTIENT
	// search, so the tier exists at all only because the alphabet was quotiented by tile shape.
	useEffect(() => {
		const cls = filters.tileClass;
		if (cls !== TILE_CLASSES.PERIOD && cls != null) return;
		if (!tilings) return; // base atlas REPLACES; see the convex-irregular effect
		const k = filters.kValue;
		const want =
			k != null ? PERIOD_HIGHER_K.filter((kk) => kk === k) : cls === TILE_CLASSES.PERIOD ? PERIOD_HIGHER_K : [];
		fetchShards(
			want,
			periodLoadedShards,
			periodInflight.current,
			loadPeriodAtlasShard,
			setTilings,
			setPeriodLoadedShards,
		);
	}, [filters.tileClass, filters.kValue, periodLoadedShards, tilings]);

	// Lazy MIXED k≥3 shards. Same shape again; these tiers arrived 2026-08-09 when the palette was finally
	// run past k=2, and they are 15× the entries the shelf had, so they cannot ride the eager bundle.
	useEffect(() => {
		const cls = filters.tileClass;
		if (cls !== TILE_CLASSES.MIXED && cls != null) return;
		if (!tilings) return; // base atlas REPLACES; see the convex-irregular effect
		const k = filters.kValue;
		const want = k != null ? MIXED_HIGHER_K.filter((kk) => kk === k) : cls === TILE_CLASSES.MIXED ? MIXED_HIGHER_K : [];
		fetchShards(want, mixedLoadedShards, mixedInflight.current, loadMixedAtlasShard, setTilings, setMixedLoadedShards);
	}, [filters.tileClass, filters.kValue, mixedLoadedShards, tilings]);

	// Lazy 45-45-90 k≥3 shards. Same shape as mixed, and the whole tail is 7.4 MB, so picking the class
	// with no k fetches both tiers rather than making the user click each chip to see the shelf at all.
	useEffect(() => {
		const cls = filters.tileClass;
		if (cls !== TILE_CLASSES.EDGELEN && cls != null) return;
		if (!tilings) return; // base atlas REPLACES; see the convex-irregular effect
		const k = filters.kValue;
		const want =
			k != null ? TRI45_HIGHER_K.filter((kk) => kk === k) : cls === TILE_CLASSES.EDGELEN ? TRI45_HIGHER_K : [];
		fetchShards(want, tri45LoadedShards, tri45Inflight.current, loadTri45AtlasShard, setTilings, setTri45LoadedShards);
	}, [filters.tileClass, filters.kValue, tri45LoadedShards, tilings]);

	// Lazy EUCLIDEAN HALF-POLYGON k>=5 shards. Stricter than BOTH rules above: this tail is ten slices
	// and 110 MB of JSON (the two deep ones are 46 and 37 MB, gzipping to about 1 each), so it is fetched
	// only when its own k chip is chosen. Selecting the class, or the board with no k, must not pull it —
	// the tri45 rule does exactly that and is fine at 7.4 MB; here it would be fifteen times the whole
	// rest of the Euclidean atlas.
	useEffect(() => {
		const cls = filters.tileClass;
		if (cls !== TILE_CLASSES.EDGELEN && cls != null) return;
		if (!tilings) return; // base atlas REPLACES; see the convex-irregular effect
		const k = filters.kValue;
		if (k == null || !EUHALF_HIGHER_K.includes(k)) return;
		fetchShards(
			[k],
			euHalfLoadedShards,
			euHalfInflight.current,
			loadEuHalfAtlasShard,
			setTilings,
			setEuHalfLoadedShards,
		);
	}, [filters.tileClass, filters.kValue, euHalfLoadedShards, tilings]);

	// Lazy PENROSE k>=4 shards. Deliberately NOT the tri45 rule above: k=6 alone is 14.1 MB, so picking
	// the class with no k must not pull the tail down. A shard is fetched when its own k chip is chosen,
	// or when the Penrose palette is the one in view — the two moments the user has asked for it.
	useEffect(() => {
		const cls = filters.tileClass;
		if (cls !== TILE_CLASSES.EDGELEN && cls != null) return;
		if (!tilings) return; // base atlas REPLACES; see the convex-irregular effect
		const k = filters.kValue;
		const want =
			k != null ? PENROSE_HIGHER_K.filter((kk) => kk === k) : filters.edgeBoard === "penrose" ? PENROSE_HIGHER_K : [];
		fetchShards(
			want,
			penroseLoadedShards,
			penroseInflight.current,
			loadPenroseAtlasShard,
			setTilings,
			setPenroseLoadedShards,
		);
	}, [filters.tileClass, filters.kValue, filters.edgeBoard, penroseLoadedShards, tilings]);

	// Lazy SCALED k≥3 shards. Same shape once more. The sides-1-2 palette went k=4 → k=7 on 2026-08-12,
	// which is where the bulk of this shelf now lives, so k≥3 cannot ride the eager bundle either.
	useEffect(() => {
		const cls = filters.tileClass;
		if (cls !== TILE_CLASSES.SCALED && cls != null) return;
		if (!tilings) return; // base atlas REPLACES; see the convex-irregular effect
		const k = filters.kValue;
		// ⚑ Deliberately NOT the mixed/period pattern of "class selected with no k ⇒ fetch every shard".
		// Those tails are a few MB; this one is ~200 MB (k=7 alone is 29,500 tilings), so picking the
		// Scaled class would have pulled the lot on one click. A shard here loads only when its own k
		// chip is chosen, which is what the "k ≥ 3 loads on demand" note under the chips promises.
		const want = k != null ? SCALED_HIGHER_K.filter((kk) => kk === k) : [];
		fetchShards(
			want,
			scaledLoadedShards,
			scaledInflight.current,
			loadScaledAtlasShard,
			setTilings,
			setScaledLoadedShards,
		);
	}, [filters.tileClass, filters.kValue, scaledLoadedShards, tilings]);

	// Lazy Euclidean DECORATION shards — the hexagonal grid's deep k slices (edges k>=7, colorings k>=6),
	// the only freedraw/colors slices too big to ship eagerly. Fetch when that k chip is picked, under any
	// decoration (the k chip is the whole trigger; there is no class to gate on). Best-effort: a missing
	// shard resolves to an empty merge inside the loader, and a failure just marks the k done.
	useEffect(() => {
		const k = filters.kValue;
		if (k == null || !hasDecorationShardsForK(k) || decorRequested.current.has(k)) return;
		decorRequested.current.add(k);
		Promise.all([loadFreedrawShardsForK(k), loadColorsShardsForK(k)])
			.then(([fd, col]) => {
				const data = [...fd, ...col];
				if (data.length) setTilings((prev) => (prev ? [...prev, ...data] : data));
			})
			.catch(() => {});
	}, [filters.kValue]);

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
	// The polygon vocabulary is per-shelf: "12*" exists under Star and nowhere under Regular. When an
	// axis that changes the vocabulary moves, keep the tokens the new scope still has and drop the rest,
	// so a cross-shelf pick like "3" survives while a stale one cannot filter to 0 from a hidden group.
	// Mutates `next` in place; callers already hold a fresh copy.
	const prunePolygonsToScope = (next: ReferenceFilter) => {
		if (!(next.polygonNames?.length || next.polygonExclude?.length) || !tilings) return;
		const scope = new Set<string>();
		for (const t of tilings) {
			if (next.geometry && geometryOf(t) !== next.geometry) continue;
			if (next.decoration && decorationOf(t) !== next.decoration) continue;
			if (next.tileClass && tileClassOf(t) !== next.tileClass) continue;
			for (const sp of polygonSpeciesOf(t)) scope.add(sp);
		}
		const kept = next.polygonNames?.filter((tok) => scope.has(tok));
		next.polygonNames = kept?.length ? kept : undefined;
		const keptx = next.polygonExclude?.filter((tok) => scope.has(tok));
		next.polygonExclude = keptx?.length ? keptx : undefined;
	};
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
		// The polyform FORM facet only means something inside the polyform class — drop it otherwise.
		if (v !== "polyomino") next.polyformFamily = undefined;
		// The Islamic-system facet only means something inside the Islamic class — drop it otherwise.
		if (v !== "islamic") next.islamicSystem = undefined;
		if (v !== "edgelen") next.edgeBoard = undefined;
		// The freedraw and colors facets belong to the OTHER decoration segments (setDecoration owns them);
		// the class chips only ever run inside Tilings, so reaching one means those are stale.
		next.freedrawKind = undefined;
		next.freedrawGrid = undefined;
		next.freedrawRegular = undefined;
		next.colorsGrid = undefined;
		next.colorsCount = undefined;
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
		prunePolygonsToScope(next);
		setFilters(next);
	};
	const setConvexDecomp = (v: "all" | "decomposable" | "non-decomposable") =>
		setFilters({ ...filters, convexDecomp: v === "all" ? undefined : v });
	const setScaledScaleSet = (v: "all" | "s12" | "s123") =>
		setFilters({ ...filters, scaledScaleSet: v === "all" ? undefined : v });
	const setPolyformFamily = (v: "all" | PolyformFamily) =>
		setFilters({ ...filters, polyformFamily: v === "all" ? undefined : v });
	const setIslamicSystem = (v: "all" | IslamicSystem) =>
		setFilters({ ...filters, islamicSystem: v === "all" ? undefined : v });
	const setEdgeBoard = (v: "all" | EdgeBoard) => setFilters({ ...filters, edgeBoard: v === "all" ? undefined : v });
	const setFreedrawKind = (v: "all" | FreedrawKind) =>
		setFilters({ ...filters, freedrawKind: v === "all" ? undefined : v });
	// Selecting a board clears the two legacy grid filters: they name the same axis, so leaving one set
	// would silently intersect it with the board and show nothing.
	const setBoard = (v: "all" | string) =>
		setFilters({
			...filters,
			board: v === "all" ? undefined : v,
			freedrawGrid: undefined,
			colorsGrid: undefined,
			// Both of these are sub-facets OF a board, and each renders only while its own board is
			// selected. Leaving one set while moving to another board would filter the new board down to
			// nothing behind a control that is no longer on screen.
			starKind: v === "sst" ? filters.starKind : undefined,
			ncxCrossing: v === "spn-solid" ? filters.ncxCrossing : undefined,
		});
	const setStarKind = (v: "all" | SphStarKind) => setFilters({ ...filters, starKind: v === "all" ? undefined : v });
	const setNcxCrossing = (v: "all" | "self-intersecting" | "embedded") =>
		setFilters({ ...filters, ncxCrossing: v === "all" ? undefined : v });
	const setColorsCount = (v: "all" | number) => setFilters({ ...filters, colorsCount: v === "all" ? undefined : v });
	const setFreedrawRegular = (v: "all" | FreedrawRegular) =>
		setFilters({ ...filters, freedrawRegular: v === "all" ? undefined : v });

	// ── multi-select setters (empty ⇒ undefined so the filter clears and the active-count stays honest) ──
	const toggleIn = <T,>(key: keyof ReferenceFilter, cur: readonly T[], v: T) => {
		const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
		setFilters({ ...filters, [key]: next.length ? next : undefined } as ReferenceFilter);
	};
	const toggleFold = (n: number) => toggleIn("starFolds", filters.starFolds ?? [], n);
	// A polygon card cycles either → required → forbidden → either.
	const togglePolygon = (tok: string) => {
		const names = filters.polygonNames ?? [];
		const excl = filters.polygonExclude ?? [];
		const nextNames = names.includes(tok)
			? names.filter((x) => x !== tok)
			: excl.includes(tok)
				? names
				: [...names, tok];
		const nextExcl = names.includes(tok) ? [...excl, tok] : excl.filter((x) => x !== tok);
		setFilters({
			...filters,
			polygonNames: nextNames.length ? nextNames : undefined,
			polygonExclude: nextExcl.length ? nextExcl : undefined,
		});
	};
	const toggleDistinctPolygons = (n: number) => toggleIn("distinctPolygons", filters.distinctPolygons ?? [], n);
	const toggleDistinctStars = (n: number) => toggleIn("distinctStars", filters.distinctStars ?? [], n);
	const toggleAnglePeriods = (n: number) => toggleIn("anglePeriods", filters.anglePeriods ?? [], n);
	const setPolygonMode = (m: PolygonMode) => setFilters({ ...filters, polygonMode: m });
	const clearPolygons = () => setFilters({ ...filters, polygonNames: undefined, polygonExclude: undefined });
	const toggleGroup = (g: WallpaperGroup) => toggleIn("wallpaperGroups", filters.wallpaperGroups ?? [], g);
	const toggleLevel = (l: TilingLevel) => toggleIn("levels", filters.levels ?? [], l);
	// Lattice is single-select — it drives which wallpaper groups are realizable, so at most one at a
	// time. Re-clicking the active shape clears it; switching shape drops any now-incompatible group so
	// the group filter never contradicts the chosen lattice.
	const selectShape = (s: LatticeShape) => {
		const next = filters.latticeShapes?.[0] === s ? undefined : s;
		const groups = next ? filters.wallpaperGroups?.filter((g) => isGroupOnLattice(g, next)) : filters.wallpaperGroups;
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
	const geometry = filters.geometry ?? GEOMETRIES.EUCLIDEAN;
	const isEuclidean = geometry === GEOMETRIES.EUCLIDEAN;
	// Switch decoration: each segment owns its own facets, so moving between them drops the ones that
	// belong to the segment being left. k survives — it means grid-point orbits under Edge patterns and
	// colored vertices under Colorings, not vertex orbits, but the axis is shared and a k present in
	// one segment is usually present in the next, so clearing it would be a nuisance, not a fix.
	const setDecoration = (v: "all" | Decoration) => {
		const dec = v === "all" ? undefined : v;
		const next: ReferenceFilter = { ...filters, decoration: dec };
		// The shape-class chips and everything hanging off them only exist inside Tilings.
		if (dec && dec !== DECORATIONS.TILINGS) {
			next.tileClass = undefined;
			next.convexDecomp = undefined;
			next.isotoxalShape = undefined;
			next.scaledScaleSet = undefined;
			next.polyformFamily = undefined;
			next.islamicSystem = undefined;
			next.edgeBoard = undefined;
			// Neither an edge pattern nor a coloring carries the uniform-tiling classification: freedraw faces
			// aren't tiles in the Grünbaum & Shephard sense, and a coloring is classified by its colored vertex
			// classes. No M/partition, no star folds, no α-family, no wallpaper group or lattice.
			next.mValue = undefined;
			next.partitionKey = undefined;
			next.maximalOnly = undefined;
			next.starFolds = undefined;
			next.parametric = undefined;
			next.wallpaperGroups = undefined;
			next.latticeShapes = undefined;
			// Čtrnáct's ladder is defined for tilings by regular polygons, so it leaves with them.
			next.levels = undefined;
			// Both spherical board sub-facets live under Tilings, and their controls go away with the board.
			next.starKind = undefined;
			next.ncxCrossing = undefined;
		}
		// ...and the Tilings segment, which keeps the class, still cannot hold a BUBBLE one: those rows
		// are decoration "edges". Left set it would filter the segment to 0 behind a chip the wall no
		// longer draws.
		if (dec === DECORATIONS.TILINGS && next.tileClass === TILE_CLASSES.BUBBLE) next.tileClass = undefined;
		if (v !== "edges") {
			next.freedrawKind = undefined;
			next.freedrawGrid = undefined;
			next.freedrawRegular = undefined;
		}
		if (v !== "colorings") {
			next.colorsGrid = undefined;
			next.colorsCount = undefined;
		}
		if (v !== "tilings") {
			// Only tilings carry a tile inventory; an edge system's faces are merged polyforms.
			next.polygonNames = undefined;
			next.polygonExclude = undefined;
			next.distinctPolygons = undefined;
			next.distinctStars = undefined;
			next.anglePeriods = undefined;
		}
		prunePolygonsToScope(next);
		setFilters(next);
	};

	// Switch geometry: clear every Euclidean-only filter (they mean nothing off the plane) and reset k —
	// a k valid in one geometry (e.g. a Euclidean k=2) may filter the new one to zero. Decoration is
	// deliberately NOT cleared: it is orthogonal to geometry (every geometry has all three), so a reader
	// comparing Euclidean and hyperbolic colorings stays on colorings across the switch.
	const setGeometry = (g: Geometry) => {
		if (g === geometry) return;
		setFilters(
			g === GEOMETRIES.EUCLIDEAN
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
						// Nor does Čtrnáct's ladder: in E² the edge function is unconstrained, so its top rung
						// costs nothing and stops meaning anything.
						levels: undefined,
						// Both board sub-facets are spherical-only, and their controls render only while their
						// board is chosen — so left set here they would be invisible active filters.
						starKind: undefined,
						ncxCrossing: undefined,
					}
				: {
						geometry: g,
						// keep the cross-geometry axes (decoration + provenance + search); drop everything
						// Euclidean-only
						decoration: filters.decoration,
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
			if (!cls || cls === TILE_CLASSES.REGULAR) for (const k of HIGHER_K) s.add(k);
			// Convex-irregular k≥3 lives in lazy shards not yet in `tilings`; show their chips up front (like the
			// regular HIGHER_K) so selecting one can trigger the fetch.
			if (!cls || cls === TILE_CLASSES.CONVEX) for (const k of COMPOSABLE_HIGHER_K) s.add(k);
			if (!cls || cls === TILE_CLASSES.ISOTOXAL) for (const k of ISOTOXAL_HIGHER_K) s.add(k);
			// Period-p grew a k=3..6 tail with the concave tiles; without this its chips vanish and a
			// deep link like ?class=period&k=4 resolves to an empty shelf.
			if (!cls || cls === TILE_CLASSES.PERIOD) for (const k of PERIOD_HIGHER_K) s.add(k);
			if (!cls || cls === TILE_CLASSES.MIXED) for (const k of MIXED_HIGHER_K) s.add(k);
			if (!cls || cls === TILE_CLASSES.SCALED) for (const k of SCALED_HIGHER_K) s.add(k);
			if (!cls || cls === TILE_CLASSES.EDGELEN) for (const k of TRI45_HIGHER_K) s.add(k);
			if (!cls || cls === TILE_CLASSES.EDGELEN) for (const k of PENROSE_HIGHER_K) s.add(k);
			if (!cls || cls === TILE_CLASSES.EDGELEN) for (const k of EUHALF_HIGHER_K) s.add(k);
			return s;
		},
		[tilings],
	);
	const kChips = useMemo(() => {
		const s = new Set<number>();
		if (tilings)
			for (const t of tilings) {
				if (geometryOf(t) !== geometry) continue;
				if (filters.tileClass && tileClassOf(t) !== filters.tileClass) continue; // facet k by class in any geometry
				// …and by the board and kind in hand: a board carries a few k of the dozens its geometry has, and
				// choosing a board loads all of that board's slices, so its loaded rows are its whole k range.
				if (filters.decoration && decorationOf(t) !== filters.decoration) continue;
				if (filters.board && !matchesReferenceFilters(t, { board: filters.board })) continue;
				s.add(t.k);
			}
		// The lazy higher-k tiers are all Euclidean; offer their chips up front (before the shard is fetched)
		// only under the Euclidean geometry, faceted by the class in scope.
		if (isEuclidean) {
			const cls = filters.tileClass;
			if (!cls || cls === TILE_CLASSES.REGULAR) for (const k of HIGHER_K) s.add(k);
			if (!cls || cls === TILE_CLASSES.CONVEX) for (const k of COMPOSABLE_HIGHER_K) s.add(k);
			if (!cls || cls === TILE_CLASSES.ISOTOXAL) for (const k of ISOTOXAL_HIGHER_K) s.add(k);
			if (!cls || cls === TILE_CLASSES.PERIOD) for (const k of PERIOD_HIGHER_K) s.add(k);
			if (!cls || cls === TILE_CLASSES.MIXED) for (const k of MIXED_HIGHER_K) s.add(k);
			// ⚑ This list and `kValuesForClass` are two separate memos over the same question — this one
			// draws the chips, that one decides whether a deep link's k survives. Adding a shard tier to
			// only one leaves the tier reachable by URL but with no chip to click, which is exactly what
			// the scaled tail did until 2026-08-13. Add to BOTH.
			if (!cls || cls === TILE_CLASSES.SCALED) for (const k of SCALED_HIGHER_K) s.add(k);
			if (!cls || cls === TILE_CLASSES.EDGELEN) for (const k of TRI45_HIGHER_K) s.add(k);
			if (!cls || cls === TILE_CLASSES.EDGELEN) for (const k of PENROSE_HIGHER_K) s.add(k);
			if (!cls || cls === TILE_CLASSES.EDGELEN) for (const k of EUHALF_HIGHER_K) s.add(k);
		}
		return [...s].sort((a, b) => a - b);
	}, [tilings, geometry, isEuclidean, filters.tileClass, filters.decoration, filters.board]);

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
		let vMin = Infinity,
			vMax = -Infinity;
		let pMin = Infinity,
			pMax = -Infinity;
		let eMin = Infinity,
			eMax = -Infinity;
		for (const t of tilings) {
			const hf = hyperbolicFacetsOf(t);
			if (hf) {
				if (hf.valence < vMin) vMin = hf.valence;
				if (hf.valence > vMax) vMax = hf.valence;
				if (hf.polygon < pMin) pMin = hf.polygon;
				if (hf.polygon > pMax) pMax = hf.polygon;
			}
			if (t.source === SOURCES.HYPERBOLIC && t.edge != null) {
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
	const setHypInterval = (key: "hypValence" | "hypPolygon" | "hypEdge", v: [number, number], full: [number, number]) =>
		setFilters({ ...filters, [key]: v[0] <= full[0] && v[1] >= full[1] ? undefined : v });

	const availableFolds = useMemo(() => {
		if (!tilings) return [];
		const s = new Set<number>();
		for (const t of tilings) for (const n of starFoldsOf(t)) s.add(n);
		return [...s].sort((a, b) => a - b);
	}, [tilings]);

	// The polygon facet's own scope: every tiling matching the OTHER filters. Both the picker's
	// per-token counts and the "how many distinct species" walls read off this, so a token shows the
	// tilings it would actually add and a count chip is never offered when it can only return nothing.
	const polygonScope = useMemo(() => {
		if (!tilings) return [];
		return tilings.filter((t) =>
			matchesReferenceFilters(t, {
				...filters,
				polygonNames: undefined,
				polygonExclude: undefined,
				distinctPolygons: undefined,
				distinctStars: undefined,
				anglePeriods: undefined,
			}),
		);
	}, [tilings, filters]);

	// Counts are per SPECIES (fold AND point angle), the granularity /play/about/prototiles shows: "6*30" and
	// "6*60" are different tiles and get their own card.
	const polygonTokenCounts = useMemo(() => {
		const m = new Map<string, number>();
		for (const t of polygonScope) for (const s of polygonSpeciesOf(t)) m.set(s, (m.get(s) ?? 0) + 1);
		return m;
	}, [polygonScope]);

	const availablePolygons = useMemo(() => [...polygonTokenCounts.keys()].sort(speciesCompare), [polygonTokenCounts]);

	const distinctPolygonOptions = useMemo(() => {
		const s = new Set<number>();
		for (const t of polygonScope) s.add(distinctPolygonCountOf(t));
		return [...s].sort((a, b) => a - b);
	}, [polygonScope]);

	const distinctStarOptions = useMemo(() => {
		const s = new Set<number>();
		for (const t of polygonScope) s.add(distinctStarCountOf(t));
		return [...s].sort((a, b) => a - b);
	}, [polygonScope]);

	// Angle-word periods present in the current scope. p=1 is every regular tile, so the option only
	// earns its place when the scope actually mixes periods — hence the length > 1 guard at the render.
	const anglePeriodOptions = useMemo(() => {
		const s = new Set<number>();
		for (const t of polygonScope) for (const n of tilePeriodsOf(t)) s.add(n);
		return [...s].sort((a, b) => a - b);
	}, [polygonScope]);

	// Live consequence of the picks, shown in the modal footer while it is open.
	const polygonMatchCount = useMemo(() => {
		if (!filters.polygonNames?.length && !filters.polygonExclude?.length) return polygonScope.length;
		return polygonScope.filter((t) =>
			matchesReferenceFilters(t, {
				polygonNames: filters.polygonNames,
				polygonMode: filters.polygonMode,
				polygonExclude: filters.polygonExclude,
			}),
		).length;
	}, [polygonScope, filters.polygonNames, filters.polygonMode, filters.polygonExclude]);

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

	// Per-level counts, so the wall can say how many sit on each rung before it is clicked — the
	// distribution IS the finding here, and five bare labels would hide that hybrids are three records in
	// the whole developed hyperbolic catalogue.
	//
	// Counted over the records matching every OTHER active filter, the same way availableM is, so the
	// number on a chip is the number of results clicking it gives. Counting over everything loaded
	// instead reads as a bug the moment another filter is on: under Geometry = Hyperbolic it would still
	// include the seven spherical hybrids and promise 1023 where the shelf then shows 1016.
	const levelCounts = useMemo(() => {
		const c = new Map<TilingLevel, number>();
		// The filter object is built ONCE, not per record: it was being spread inside the loop, which is
		// one throwaway object per loaded tiling every time any filter changed. And the filter is tested
		// BEFORE tilingLevel, because the level is the expensive half (it canonicalises every vertex
		// configuration of the record) and a tiling the filter rejects never needs its level at all.
		const scope = { ...filters, levels: undefined };
		for (const t of tilings ?? []) {
			if (!matchesReferenceFilters(t, scope)) continue;
			const lv = tilingLevel(t);
			if (lv) c.set(lv, (c.get(lv) ?? 0) + 1);
		}
		return c;
	}, [tilings, filters]);

	// The one selected lattice (single-select). When set, it disables the wallpaper-group chips whose
	// group can't be crystallographically realized on it.
	const selectedLattice = filters.latticeShapes?.[0];

	const tileClass = filters.tileClass ?? "all";
	const decoration = filters.decoration ?? "all";
	// Tilings covers both the explicit segment and "All", where the shape chips are still the useful way in
	// (each of the eight lives only in that segment, so picking one implies it).
	const inTilings = decoration === "all" || decoration === "tilings";
	// The shape-class wall is Euclidean talk: off the plane the Tilings segment holds exactly ONE class
	// (the developed patches, the Platonic solids), so a wall with one live chip would say nothing the
	// geometry segment hasn't. This is what the old non-Euclidean class relabeling was standing in for.
	const showTileClass = isEuclidean && inTilings;
	// Bubble is the one shape class that is also a DECORATION (decorationOf → "edges"), so the explicit
	// Tilings segment excludes every one of its rows. Offering the chip there is a promise the segment
	// cannot keep — it can only ever read 0 — so the wall drops it and keeps it under "All", which is
	// the segment that does show a bubble tiling.
	const classOptions = decoration === "tilings" ? CLASS_OPTIONS_NO_BUBBLE : CLASS_OPTIONS;
	// Classes carrying NO vertex-configuration classification — no M/partition, no star folds, no wallpaper
	// group or lattice. The convex-irregular + isotoxal demo shelves, whose builds don't compute it.
	const isUnclassified = tileClass === "convex" || tileClass === "isotoxal";
	// M/partition, star, lattice, and wallpaper group are Euclidean-only — a hyperbolic {p,q} or spherical
	// Platonic tiling has no wallpaper group, no lattice, no star fold. Off the plane only k, discoverer,
	// certification, and search survive. They are also Tilings-only: freedraw faces aren't tiles in the
	// Grünbaum & Shephard sense and a coloring is classified by its colored vertex classes, so none of the
	// uniform-tiling theory applies in the other two segments.
	const classified = isEuclidean && inTilings && !isUnclassified;
	const showM = classified && filters.kValue != null;
	const showStar = classified && tileClass !== "regular" && availableFolds.length > 0;
	// Tile-inventory facets. Euclidean tilings only (a hyperbolic {p,q} has no family label of this
	// shape), but unlike the Star block they apply to the regular shelf too — "which tilings use a
	// dodecagon" is the same question there. Needs at least two tokens to be worth showing: one
	// species means every tiling in scope has it.
	// The hyperbolic regular-polygon boards ship a per-tiling inventory too (∞ included), which is how a
	// 100k-tiling hybrid board gets cut down to the tilings by, say, triangles and apeirogons alone.
	const showPolygons = (isEuclidean || geometry === GEOMETRIES.HYPERBOLIC) && inTilings && availablePolygons.length > 1;
	const showGroup = classified && tileClass !== "star" && availableGroups.length > 0;
	// Marek's five levels are the CURVED counterpart of the M/partition block above, and the two never
	// show together: the ladder needs per-orbit vertex configurations (only the hyperbolic and spherical
	// shelves ship them) and its top rung is vacuous in E², where every combination shares an edge
	// length for free. Tilings-only for the same reason M is — an edge system's tiles are merged
	// polyforms, and the ladder is defined for tilings by regular polygons.
	const showLevel = !isEuclidean && inTilings && levelCounts.size > 0;
	const showLattice = classified && tileClass !== "star" && availableShapes.length > 0;
	const showConvex = tileClass === "convex";
	const showIsotoxalShape = tileClass === "isotoxal";
	const showScaledScaleSet = tileClass === "scaled";
	const showPolyformFamily = tileClass === "polyomino";
	const showIslamicSystem = tileClass === "islamic";
	// Freedraw's tile-kind / regular-polygon facets read the pattern's own face analysis, which only the
	// EUCLIDEAN grid patterns ship, so they stay Euclidean-only.
	const showFreedrawKind = isEuclidean && decoration === "edges";
	// The palette-size facet describes the EUCLIDEAN color catalogues (square/triangle/ts × 2/3). The
	// hyperbolic and spherical colorings are the same segment on a {p,q} / Platonic base and have no
	// palette axis of their own.
	const showColorsGrid = isEuclidean && decoration === "colorings";
	// The BOARD facet, unlike the grid walls it replaces, is defined in every geometry: each segment has its
	// own families (hyperbolic edges group by base tiling, spherical by solid, Euclidean tilings by polyform
	// lattice), and boardFamiliesFor names them off the same SUB_ORDER run /play's tree walks.
	// "all" spans the three segments at once, and a board wall then means nothing — the same sub can be a
	// grid under Edge patterns and a palette stem under Colorings. Shown once a segment is chosen.
	// Picking a FORM narrows the board wall to that form's boards, so level 2 only ever offers the
	// children of the level-1 node in hand. Without it the wall keeps offering the other six polyform
	// boards, each of which lands on an empty page.
	const boardFamilies = useMemo(() => {
		if (decoration === "all") return [];
		const fams = boardFamiliesFor(geometry, decoration);
		return filters.polyformFamily ? fams.filter((f) => f.family === `pf-${filters.polyformFamily}`) : fams;
	}, [geometry, decoration, filters.polyformFamily]);
	// k is shared across the three segments but does NOT mean the same thing in each: vertex orbits of a
	// tiling, GRID-POINT orbits of a PLANAR edge pattern (including points with no drawn edge), colored
	// vertex classes of a coloring. Sharing the axis is what makes them browsable together; naming the
	// quantity on the heading is what keeps them from reading as one. Matches the /play tree's k row labels.
	//
	// The curved edge shelves are the exception inside the exception: Marek's hyperbolic {p,q} and Schwarz
	// solvers count VERTEX orbits of the decorated tiling, not grid points, so calling them grid points
	// there would be simply wrong.
	const kGroupTitle =
		decoration === "edges"
			? isEuclidean
				? "Grid-point orbits (k)"
				: "Vertex orbits (k)"
			: decoration === "colorings"
				? "Colored vertices (k)"
				: "Vertex count (k)";

	// Every applied filter as a chip above the results: what it is, and how to take it off. The count on
	// the phone's Filters button is its length, so the two can never disagree.
	const activeChips: ActiveChip[] = [];
	// `omit` is the filter with this chip taken off, which is also how the empty state finds the nearest
	// results; `clear` defaults to applying it, and is a setter where taking a filter off cascades.
	const relaxedBy = new Map<string, Partial<ReferenceFilter>>();
	const chip = (key: string, label: ReactNode, omit: Partial<ReferenceFilter>, clear?: () => void) => {
		// Not a default parameter: the React Compiler gives up on the whole component over one, and its
		// lint then silently stops checking every hook in it.
		relaxedBy.set(key, omit);
		activeChips.push({ key, label, clear: clear ?? (() => setFilters({ ...filters, ...omit })) });
	};
	const off = (...keys: (keyof ReferenceFilter)[]): Partial<ReferenceFilter> =>
		Object.fromEntries(keys.map((k) => [k, undefined]));
	const list = (xs: readonly (string | number)[]) => xs.join(", ");
	if (filters.geometry && filters.geometry !== GEOMETRIES.EUCLIDEAN)
		chip("geo", GEOMETRY_LABEL[filters.geometry], { geometry: GEOMETRIES.EUCLIDEAN }, () =>
			setGeometry(GEOMETRIES.EUCLIDEAN),
		);
	if (filters.decoration)
		chip("dec", DECORATION_LABEL[filters.decoration], off("decoration"), () => setDecoration("all"));
	if (filters.tileClass)
		chip(
			"class",
			CLASS_OPTIONS.find((o) => o.value === filters.tileClass)?.label ?? filters.tileClass,
			off("tileClass"),
			() => setTileClass("all"),
		);
	if (filters.board)
		chip(
			"board",
			<>
				board <b className="font-mono font-medium">{boardSummary(filters.board)}</b>
			</>,
			off("board"),
			() => setBoard("all"),
		);
	if (filters.query?.trim()) chip("q", <>“{filters.query.trim()}”</>, off("query"));
	if (filters.vcs?.length)
		chip(
			"vcs",
			<>
				{filters.vcMode === "exact" ? "exactly" : filters.vcMode === "any" ? "any of" : "has"}{" "}
				<b className="font-mono font-medium">{filters.vcs.map(compactVC).join(" ; ")}</b>
			</>,
			off("vcs", "vcMode"),
		);
	if (filters.kValue != null) chip("k", `k = ${filters.kValue}`, off("kValue"), () => setKValue(undefined));
	if (filters.mValue != null)
		chip("m", `m = ${filters.mValue}`, off("mValue", "partitionKey"), () => setMValue(undefined));
	if (filters.partitionKey) chip("partition", `partition ${filters.partitionKey}`, off("partitionKey"));
	if (filters.maximalOnly) chip("maximal", "Krötenheerdt (m = k)", off("maximalOnly"));
	if (filters.levels?.length) chip("level", list(filters.levels.map((l) => TILING_LEVEL_LABEL[l])), off("levels"));
	if (filters.polygonNames?.length || filters.polygonExclude?.length)
		chip(
			"polygons",
			[
				filters.polygonNames?.length
					? `${POLY_MODE_SUMMARY[filters.polygonMode ?? "all"]} ${filters.polygonNames.map(speciesLabel).join(", ")}`
					: "",
				filters.polygonExclude?.length ? `no ${filters.polygonExclude.map(speciesLabel).join(", ")}` : "",
			]
				.filter(Boolean)
				.join(" · "),
			off("polygonNames", "polygonExclude"),
		);
	if (filters.distinctPolygons?.length)
		chip("dpoly", `${list(filters.distinctPolygons)} tile types`, off("distinctPolygons"));
	if (filters.distinctStars?.length) chip("dstar", `${list(filters.distinctStars)} star types`, off("distinctStars"));
	if (filters.anglePeriods?.length)
		chip("aper", `period ${list(filters.anglePeriods.map((n) => `p${n}`))}`, off("anglePeriods"));
	if (filters.starFolds?.length) chip("folds", list(filters.starFolds.map((n) => `${n}★`)), off("starFolds"));
	if (filters.parametric) chip("param", filters.parametric === "family" ? "α-family" : "rigid", off("parametric"));
	if (filters.latticeShapes?.length)
		chip("lattice", `${list(filters.latticeShapes)} lattice`, off("latticeShapes", "wallpaperGroups"));
	if (filters.wallpaperGroups?.length) chip("group", list(filters.wallpaperGroups), off("wallpaperGroups"));
	if (filters.hypValence) chip("valence", `valence ${filters.hypValence.join("–")}`, off("hypValence"));
	if (filters.hypPolygon) chip("palette", `palette ${filters.hypPolygon.join("–")}`, off("hypPolygon"));
	if (filters.hypEdge) chip("edge", `ℓ ${filters.hypEdge.map((n) => n.toFixed(2)).join("–")}`, off("hypEdge"));
	if (filters.discoverers?.length) chip("by", list(filters.discoverers), off("discoverers"));
	if (filters.certifications?.length) chip("cert", list(filters.certifications), off("certifications"));
	// The class-specific sub-facets: named by their value, cleared like the rest.
	for (const [key, value] of [
		["convexDecomp", filters.convexDecomp],
		["starKind", filters.starKind && STAR_KIND_LABEL[filters.starKind]],
		["ncxCrossing", filters.ncxCrossing],
		[
			"isotoxalShape",
			filters.isotoxalShape === "alpha" ? "α" : filters.isotoxalShape === "alpha-beta" ? "α, β" : undefined,
		],
		[
			"scaledScaleSet",
			filters.scaledScaleSet === "s12" ? "sides 1–2" : filters.scaledScaleSet === "s123" ? "sides 1–3" : undefined,
		],
		["polyformFamily", filters.polyformFamily && polyformFamilyShort(filters.polyformFamily)],
		["islamicSystem", filters.islamicSystem],
		["edgeBoard", filters.edgeBoard && EDGE_BOARD_LABEL[filters.edgeBoard]],
		["freedrawKind", filters.freedrawKind],
		["colorsCount", filters.colorsCount && `${filters.colorsCount} colors`],
		["freedrawRegular", filters.freedrawRegular],
	] as [keyof ReferenceFilter, string | undefined][])
		if (value) chip(key, value, off(key));
	const activeFilterCount = activeChips.length;

	// Decoration leads the sort so that Kind = "All" pages in the order the Kind wall reads: every tiling,
	// then every edge pattern, then every coloring. Without it the shelf is (k, id)-major, and since the
	// three segments share the k axis and "col-…" precedes "reg-…", the landing page of the whole library
	// was colorings. Inside one segment nothing moves — k ascending, then id, as before.
	const filtered = useMemo(() => {
		if (!tilings) return [];
		return tilings
			.filter((t) => matchesReferenceFilters(t, filters))
			.sort(
				(a, b) =>
					DECORATION_ORDER.indexOf(decorationOf(a)) - DECORATION_ORDER.indexOf(decorationOf(b)) ||
					a.k - b.k ||
					(a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
			);
	}, [tilings, filters]);

	// The card list, one group per card. Grouping collapses HYPERBOLIC entries sharing (k, vertex
	// configuration) — the shelf where one figure carries up to hundreds of variants — into a single
	// card the ReferenceCard pager cycles through; everything else stays a singleton (a Euclidean
	// "family" is the tile inventory, not the vertex configuration, so collapsing it would lump
	// genuinely different tilings). Members ride in variant order (the exporter's ℓ-ascending index),
	// not id order — base-25 suffixes ("-ba" < "-c") would shuffle them.
	const sorted = useMemo(() => sortTilings(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);
	const sortKeys = useMemo(() => availableSortKeys(filtered), [filtered]);
	// An empty result is an answer, not a dead end: for each filter, how many tilings there would be
	// without it, nearest (fewest) first. Only computed when the view is empty.
	// "Exactly these figures" relaxes first to "contains them all", which keeps the question and is the
	// nearest neighbour; dropping the figures altogether usually jumps to the whole class.
	const relaxCandidates: ActiveChip[] = [...activeChips];
	if (filters.vcs?.length && filters.vcMode === "exact") {
		relaxedBy.set("vc-contains", { vcMode: undefined });
		relaxCandidates.unshift({
			key: "vc-contains",
			label: <>“exactly”, with “contains all” instead</>,
			clear: () => setFilters({ ...filters, vcMode: undefined }),
		});
	}
	const relaxations =
		tilings && activeChips.length && !filtered.length
			? relaxCandidates
					.map((c) => ({
						chip: c,
						count: tilings.filter((t) => matchesReferenceFilters(t, { ...filters, ...relaxedBy.get(c.key) })).length,
					}))
					.filter((r) => r.count > 0)
					.sort((a, b) => a.count - b.count)
					.slice(0, 3)
			: [];

	const displayGroups = useMemo<CardGroup[]>(() => {
		if (!groupVariants) return sorted.map((t) => ({ key: t.id, members: [t] }));
		const byKey = new Map<string, CardGroup>();
		const order: CardGroup[] = [];
		for (const t of sorted) {
			if (t.source !== SOURCES.HYPERBOLIC) {
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
			if (g.members.length > 1) g.members.sort((a, b) => (a.variant ?? 0) - (b.variant ?? 0) || (a.id < b.id ? -1 : 1));
		return order;
	}, [sorted, groupVariants]);

	const paginated = useMemo(
		() => displayGroups.slice((currentPage - 1) * pageSize, currentPage * pageSize),
		[displayGroups, currentPage, pageSize],
	);
	// The table lists every tiling on its own row: variants are what a table is for comparing.
	const tableRows = useMemo(
		() => (view === "table" ? sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize) : []),
		[view, sorted, currentPage, pageSize],
	);
	const resultTotal = view === "table" ? sorted.length : displayGroups.length;

	// ── facet counts: the tilings matching every OTHER filter, per option of one facet ──
	const vcCounts = useMemo(
		() => countFacet(tilings, { ...filters, vcs: undefined, vcMode: undefined }, (t) => vcsOf(t)),
		[tilings, filters],
	);
	const discovererCounts = useMemo(
		() => countFacet(tilings, { ...filters, discoverers: undefined }, (t) => t.discoverer),
		[tilings, filters],
	);
	const certCounts = useMemo(
		() => countFacet(tilings, { ...filters, certifications: undefined }, (t) => t.certification),
		[tilings, filters],
	);
	const groupCounts = useMemo(
		() => countFacet(tilings, { ...filters, wallpaperGroups: undefined }, (t) => t.wallpaperGroup),
		[tilings, filters],
	);
	const showVcs = inTilings && vcCounts.size > 0;

	const exportCsv = () => {
		const cell = (v: unknown) => {
			const s = v == null ? "" : String(v);
			return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
		};
		const head = [
			"id",
			"geometry",
			"k",
			"m",
			"partition",
			"vertex_configurations",
			"polygons",
			"wallpaper_group",
			"lattice",
			"edge_length",
			"discoverer",
			"certification",
		];
		const rows = sorted.map((t) =>
			[
				t.id,
				geometryOf(t),
				t.k,
				t.m,
				t.partition?.join(" "),
				(vcsOf(t) ?? []).join(" ; "),
				polygonSpeciesOf(t).join(" "),
				t.wallpaperGroup,
				t.latticeShape,
				t.edge,
				t.discoverer,
				t.certification ?? (t.candidate ? "candidate" : ""),
			]
				.map(cell)
				.join(","),
		);
		const url = URL.createObjectURL(new Blob([[head.join(","), ...rows].join("\n") + "\n"], { type: "text/csv" }));
		const a = Object.assign(document.createElement("a"), { href: url, download: `tiling-atlas-${sorted.length}.csv` });
		a.click();
		URL.revokeObjectURL(url);
	};

	// The column count rides in a variable so a phone can overrule it from CSS: two columns there
	// whatever `cols` says, while the URL keeps the desktop choice untouched.
	const gridStyle = { "--cols": gridColumns } as CSSProperties;
	const clearFilters = () => setFilters({ geometry: GEOMETRIES.EUCLIDEAN });
	const resultCount = filtered.length;
	// "Show N results" closes the phone sheet onto page 1 of the new result set, from its top.
	const showResults = () => {
		useMobileSheet.getState().setOpen(false);
		mainRef.current?.scrollTo({ top: 0 });
	};
	// The pager sits under the grid, so on a phone, where a page of cards is several screens tall, a new
	// page would open at its own bottom. There it starts from the top; a desktop keeps its scroll as before.
	const changePage = (page: number) => {
		setCurrentPage(page);
		if (window.matchMedia(PHONE_QUERY).matches) mainRef.current?.scrollTo({ top: 0 });
	};

	return (
		<div className="flex min-h-0 flex-1 overflow-hidden">
			<PageSidebar
				mobile="modal"
				mobileLabel="Filters"
				mobileBadge={activeFilterCount}
				mobileTrigger={!headerTriggerVisible}
				mobileFooter={
					<div className="flex items-center gap-2">
						{activeFilterCount > 0 ? (
							<Button variant="ghost" icon={X} label={`Clear (${activeFilterCount})`} onClick={clearFilters} />
						) : null}
						<Button
							variant="primary"
							classes="flex-1"
							onClick={showResults}
							label={
								tilings === null
									? "Show results"
									: `Show ${resultCount.toLocaleString("en-US")} result${resultCount === 1 ? "" : "s"}`
							}
						/>
					</div>
				}
			>
				<div className="flex flex-col gap-px pb-12 text-sm">
					{/* On a phone the sheet's own title says "Filters" and its footer carries Clear. */}
					<div className="flex h-11 items-center justify-between px-3.5 max-md:hidden">
						<span className="text-[13px] font-semibold text-fg">Filters</span>
						{activeFilterCount > 0 ? (
							<button
								onClick={() => setFilters({ geometry: GEOMETRIES.EUCLIDEAN })}
								className="flex cursor-pointer items-center gap-1 text-xs text-fg-muted transition-colors hover:text-danger"
							>
								<X size={11} /> Clear ({activeFilterCount})
							</button>
						) : null}
					</div>
					<div className="relative mx-3.5 mb-3 max-md:mt-3">
						<Search
							size={14}
							className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-muted"
						/>
						<input
							type="text"
							value={filters.query ?? ""}
							onChange={(e) => setFilters({ ...filters, query: e.target.value })}
							placeholder="Search id or family…"
							aria-label="Search id or family"
							className="h-8 w-full rounded-control border border-line bg-surface-raised pr-8 pl-8 text-[13px] text-fg shadow-sm transition-[border-color,box-shadow] placeholder:text-fg-muted focus:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40 max-md:h-11"
						/>
						{filters.query ? (
							<button
								type="button"
								onClick={() => setFilters({ ...filters, query: undefined })}
								aria-label="Clear search"
								className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-fg-muted hover:bg-surface-overlay hover:text-fg max-md:size-10"
							>
								<X size={13} />
							</button>
						) : null}
					</div>

					<FilterGroup title="Geometry" summary={isEuclidean ? null : GEOMETRY_LABEL[geometry]}>
						<OptionWall columns={3} options={GEOMETRY_OPTIONS} selected={geometry} onChange={setGeometry} />
					</FilterGroup>
					{/* Decoration — WHAT is catalogued, below geometry and above tile class. Every geometry has all
					    three segments, so this wall never changes shape with the one above it. */}
					<FilterGroup title="Kind" summary={filters.decoration ? DECORATION_LABEL[filters.decoration] : null}>
						<OptionWall columns={2} options={DECORATION_OPTIONS} selected={decoration} onChange={setDecoration} />
					</FilterGroup>
					{/* Tile class — the SHAPE axis, which is the eight Euclidean shelves that differ by tile set.
					    Hidden off the plane and outside Tilings, where it has at most one live chip. */}
					{showTileClass ? (
						<FilterGroup title="Tile class" summary={filters.tileClass ?? null}>
							<RowList options={classOptions} selected={tileClass} onChange={setTileClass} />
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
							info={<>How many of the tile’s angles flex independently.</>}
						>
							<OptionWall
								columns={3}
								options={ISOTOXAL_SHAPE_OPTIONS}
								selected={filters.isotoxalShape ?? "all"}
								onChange={setIsotoxalShape}
							/>
						</FilterGroup>
					) : null}

					{showScaledScaleSet ? (
						<FilterGroup
							title="Side lengths"
							summary={filters.scaledScaleSet === "s12" ? "1–2" : filters.scaledScaleSet === "s123" ? "1–3" : null}
							note="scaling factors"
							info={<>Sides 1–2 is the former Doubled class; 1–3 adds a side-3 tile.</>}
						>
							<OptionWall
								columns={3}
								options={SCALE_SET_OPTIONS}
								selected={filters.scaledScaleSet ?? "all"}
								onChange={setScaledScaleSet}
							/>
						</FilterGroup>
					) : null}

					{showPolyformFamily ? (
						<FilterGroup
							title="Form"
							summary={filters.polyformFamily ? polyformFamilyShort(filters.polyformFamily) : null}
							note="the atomic tile"
							info={
								<>
									What the pieces are made of. Under it, the Board wall picks how many cells a piece has, and k divides
									that: three levels, the same ones the Play sidebar nests.
								</>
							}
						>
							<OptionWall
								columns={2}
								options={POLYFORM_FORM_OPTIONS}
								selected={filters.polyformFamily ?? "all"}
								onChange={setPolyformFamily}
							/>
						</FilterGroup>
					) : null}

					{showIslamicSystem ? (
						<FilterGroup
							title="Design system"
							summary={filters.islamicSystem ?? null}
							note="Bonner's tile kits"
							info={
								<>
									The underlying tessellation’s tile set. Toggle the Islamic construction in Play to see the strapwork.
								</>
							}
						>
							<OptionWall
								columns={2}
								options={ISLAMIC_SYSTEM_OPTIONS}
								selected={filters.islamicSystem ?? "all"}
								onChange={setIslamicSystem}
							/>
						</FilterGroup>
					) : null}

					{tileClass === "edgelen" ? (
						<FilterGroup
							title="Palette"
							summary={filters.edgeBoard ? EDGE_BOARD_LABEL[filters.edgeBoard] : null}
							note="which tile set"
							info={
								<>
									Every tile set here carries edges of more than one length, which is what this class is. The planigons
									are the duals of the Euclidean vertex configurations — fifteen tiles, twelve edge lengths.
									Penrose&apos;s kite and dart have two, 1 and φ, and are enumerated without the matching rules, so
									these are the periodic tilings the two shapes admit. The last five are halves of a regular polygon,
									cut vertex-to-vertex, between opposite edge midpoints, or along the mirror an odd polygon has: the
									half pentagon tiles the plane although the regular pentagon cannot, and the domino has exactly one
									tiling if every edge must be matched whole. Only six such halves can tile at all, and the sixth is the
									half square, which is the 45-45-90 board.
								</>
							}
						>
							<OptionWall
								columns={1}
								options={EDGE_BOARD_OPTIONS}
								selected={filters.edgeBoard ?? "all"}
								onChange={setEdgeBoard}
							/>
						</FilterGroup>
					) : null}

					{boardFamilies.length ? (
						<FilterGroup
							title="Board"
							summary={filters.board ? boardSummary(filters.board) : null}
							note={tileClass === "polyomino" ? "cells per piece" : "the board the shelf is drawn on"}
						>
							<BoardPicker
								families={boardFamilies}
								selected={filters.board}
								onChange={(sub) => setBoard(sub ?? "all")}
							/>
							{decoration === "colorings" ? (
								<GroupNote>Each (grid, palette size) pair is its own catalogue.</GroupNote>
							) : null}
						</FilterGroup>
					) : null}

					{/* Two facets that live INSIDE a board, so each renders only while its own board is chosen.
					    They are the axis that board is actually browsed along: the star shelf mixes four shapes
					    and the non-convex regular-faced shelf mixes two kinds of object (AL, 2026-08-22). */}
					{filters.board === "sst" ? (
						<FilterGroup
							title="Shape"
							summary={filters.starKind ? STAR_KIND_LABEL[filters.starKind] : null}
							note="pyramid, prism, antiprism, cupola"
							info={
								<>
									Read off each solid&apos;s structure, not its name: a pyramid is one star face, n triangles and n+1
									vertices, and nothing else can wear that signature. Two thirds of this shelf ships unnamed, so the
									name would answer for a third of it. &quot;Other&quot; is the uniform star polyhedra and everything
									the three families do not describe.
								</>
							}
						>
							<OptionWall
								columns={3}
								options={STAR_KIND_OPTIONS}
								selected={filters.starKind ?? "all"}
								onChange={setStarKind}
							/>
						</FilterGroup>
					) : null}

					{filters.board === "spn-solid" ? (
						<FilterGroup
							title="Crossing"
							summary={filters.ncxCrossing ?? null}
							note="does it pass through itself"
							info={
								<>
									A solid is self-intersecting when some face edge passes through the interior of a face it shares no
									vertex with. The rest are non-convex but embedded, which makes them polyhedra in the ordinary sense.
									The shelf holds 112 of the first and 131 of the second, measured when the solids were built.
								</>
							}
						>
							<OptionWall
								columns={3}
								options={NCX_CROSSING_OPTIONS}
								selected={filters.ncxCrossing ?? "all"}
								onChange={setNcxCrossing}
							/>
						</FilterGroup>
					) : null}

					{showColorsGrid ? (
						<FilterGroup
							title="Colors"
							summary={filters.colorsCount ? `${filters.colorsCount} colors` : null}
							note="palette size"
							info={
								<>
									How many colors the tiles carry. Every solution in a catalogue uses all of them — the 2-colorings are
									not repeated inside the 3-color one.
								</>
							}
						>
							<OptionWall
								columns={3}
								options={COLORS_COUNT_OPTIONS}
								selected={filters.colorsCount ?? "all"}
								onChange={setColorsCount}
							/>
						</FilterGroup>
					) : null}

					{showFreedrawKind ? (
						<FilterGroup
							title="Tile kind"
							summary={filters.freedrawKind ?? null}
							note="faces of the edge set"
							info={
								<>
									A freedraw tile is whatever face the drawn edges enclose — it can be a finite polyomino or polyiamond,
									an infinite strip, or a sheet unbounded in both directions.
								</>
							}
						>
							<OptionWall
								columns={2}
								options={FREEDRAW_KIND_OPTIONS}
								selected={filters.freedrawKind ?? "all"}
								onChange={setFreedrawKind}
							/>
						</FilterGroup>
					) : null}

					{showFreedrawKind ? (
						<FilterGroup
							title="Regular polygons"
							summary={FREEDRAW_REGULAR_OPTIONS.find((o) => o.value === filters.freedrawRegular)?.label ?? null}
							note="the k-uniform bridge"
							info={
								<>
									Every k-uniform tiling dissects onto a triangle/square grid, so these patterns contain the k-uniform
									tilings as the case where every tile is a regular polygon. “k-uniform” keeps the edge-to-edge ones;
									the dodecagon needs a large period and first appears at k = 3 (as 3.12.12). For a full has/none/any
									composition (say triangles and dodecagons, no squares), use /freedraw.
								</>
							}
						>
							<OptionWall
								columns={2}
								options={FREEDRAW_REGULAR_OPTIONS}
								selected={filters.freedrawRegular ?? "all"}
								onChange={setFreedrawRegular}
							/>
						</FilterGroup>
					) : null}

					{/* The question this field asks most: which tilings have this vertex figure. Read off the
					    records' own configurations (canonical, any rotation or notation), with counts. */}
					{showVcs ? (
						<FilterGroup
							title="Vertex configurations"
							summary={filters.vcs?.length ? filters.vcs.map(compactVC).join(" ; ") : null}
							note="figures at the vertices"
							info={
								<>
									A vertex configuration lists the polygons around a vertex in cyclic order, so 3.4.6.4 and 4.6.4.3 are
									one figure. Type it with dots or commas, exponents for repeats (3^4.6 or 3⁴.6). “Contains all” keeps
									tilings with every chosen figure, “Any of” with at least one, and “Exactly” those whose figures are
									these and no others.
								</>
							}
						>
							<VcFilter
								counts={vcCounts}
								selected={filters.vcs ?? []}
								mode={filters.vcMode ?? "all"}
								onChange={(vcs) => setFilters({ ...filters, vcs: vcs.length ? vcs : undefined })}
								onModeChange={(vcMode) => setFilters({ ...filters, vcMode: vcMode === "all" ? undefined : vcMode })}
							/>
						</FilterGroup>
					) : null}

					<FilterGroup title={kGroupTitle} summary={filters.kValue ?? null}>
						<OptionWall
							columns={6}
							fill={false}
							options={[{ value: ALL_NUM, label: "All" }, ...kChips.map((k) => ({ value: k, label: k }))]}
							selected={filters.kValue ?? ALL_NUM}
							onChange={(v) => setKValue(v === ALL_NUM ? undefined : v)}
						/>
						{/* Maximal (M = k) is a Krötenheerdt property of Euclidean uniform tilings — no meaning off
						    the plane, and none in the other two segments, whose k isn't a vertex-orbit count. */}
						{isEuclidean && inTilings ? (
							<label className="flex h-7 cursor-pointer items-center justify-between text-xs text-fg-secondary max-md:h-11 max-md:text-sm">
								Maximal (M = k)
								<Switch size="sm" checked={!!filters.maximalOnly} onCheckedChange={toggleMaximal} />
							</label>
						) : null}
						{showFreedrawKind ? (
							<GroupNote>
								Orbits of GRID POINTS under the pattern&apos;s own symmetry group — including points with no drawn edge.
								Not vertex orbits of a tiling.
							</GroupNote>
						) : (tileClass === "convex" || tileClass === "scaled") && kChips.some((k) => k >= 3) ? (
							<GroupNote>k ≥ 3 loads on demand.</GroupNote>
						) : kChips.some((k) => k >= 8) ? (
							<GroupNote>k ≥ 8 loads on demand.</GroupNote>
						) : null}
					</FilterGroup>
					{showM ? (
						<FilterGroup title="Distinct configs (M)" summary={filters.mValue ?? null} note="M ≤ k" defaultOpen={false}>
							<OptionWall
								columns={6}
								options={[{ value: ALL_NUM, label: "All" }, ...mOptions.map((m) => ({ value: m, label: m }))]}
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
					{/* Marek Čtrnáct's five levels of increasing complexity, from his own classification of the
					    hyperbolic tilings by regular polygons. The ladder is (k, m) plus one test the pair
					    cannot make — whether the vertex configurations agree as MULTISETS — and the top rung
					    is the rare one: two combinations whose edge functions land on the same length. */}
					{showLevel ? (
						<FilterGroup
							title="Level"
							summary={filters.levels?.length ? `${filters.levels.length} selected` : null}
							note="Čtrnáct's ladder"
						>
							<OptionWall
								multi
								columns={1}
								options={TILING_LEVEL_ORDER.filter((l) => (levelCounts.get(l) ?? 0) > 0).map((l) => ({
									value: l,
									label: (
										<span className="flex w-full items-baseline justify-between gap-2 px-1">
											<span>{TILING_LEVEL_LABEL[l]}</span>
											<span className="font-mono text-[10.5px] text-fg-muted tabular-nums">
												{(levelCounts.get(l) ?? 0).toLocaleString("en-US")}
											</span>
										</span>
									),
									tooltip: TILING_LEVEL_NOTE[l],
									tooltipSide: "right" as const,
									tooltipDelay: 0,
								}))}
								selected={filters.levels ?? []}
								onChange={toggleLevel}
							/>
						</FilterGroup>
					) : null}

					{showPolygons ? (
						<FilterGroup
							title="Polygons"
							summary={
								[
									filters.polygonNames?.length
										? `${POLY_MODE_SUMMARY[filters.polygonMode ?? "all"]} ${filters.polygonNames.length}`
										: null,
									filters.polygonExclude?.length ? `none of ${filters.polygonExclude.length}` : null,
								]
									.filter(Boolean)
									.join(" · ") || null
							}
							note="tile inventory"
						>
							{/* A control, not a field: it opens the picker, and an inline × clears what was picked. */}
							<div className="flex items-stretch gap-1">
								<button
									type="button"
									onClick={() => setPolygonModalOpen(true)}
									className="flex min-h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-control border border-line bg-surface-raised px-2.5 py-1.5 text-left text-[13px] text-fg shadow-sm transition-colors hover:border-line-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 max-md:min-h-11"
								>
									<Shapes size={14} className="shrink-0 text-fg-muted" />
									{filters.polygonNames?.length || filters.polygonExclude?.length ? (
										<span className="min-w-0 flex-1 truncate">
											{[
												filters.polygonNames?.map(speciesLabel).join(", "),
												filters.polygonExclude?.length
													? `no ${filters.polygonExclude.map(speciesLabel).join(", ")}`
													: "",
											]
												.filter(Boolean)
												.join(" · ")}
										</span>
									) : (
										<span className="flex-1 text-fg-muted">Pick polygons…</span>
									)}
									<ChevronRight size={13} className="shrink-0 text-fg-muted" />
								</button>
								{filters.polygonNames?.length || filters.polygonExclude?.length ? (
									<button
										type="button"
										onClick={clearPolygons}
										aria-label="Clear polygon selection"
										title="Clear polygon selection"
										className="flex w-8 shrink-0 cursor-pointer items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-surface-overlay hover:text-fg max-md:w-11"
									>
										<X size={14} />
									</button>
								) : null}
							</div>
						</FilterGroup>
					) : null}

					{/* How many kinds of tile a tiling mixes, and the period of its angle word: counting facets
					    reached for far less often than the inventory above, so they start folded. */}
					{showPolygons &&
					(distinctPolygonOptions.length > 1 || distinctStarOptions.length > 1 || anglePeriodOptions.length > 1) ? (
						<FilterGroup
							title="Polygon counts"
							summary={
								[
									filters.distinctPolygons?.length ? `${filters.distinctPolygons.join(", ")} kinds` : null,
									filters.distinctStars?.length ? `${filters.distinctStars.join(", ")} star` : null,
									filters.anglePeriods?.length ? filters.anglePeriods.map((n) => `p${n}`).join(", ") : null,
								]
									.filter(Boolean)
									.join(" · ") || null
							}
							note="distinct tiles, angle period"
							defaultOpen={false}
						>
							{distinctPolygonOptions.length > 1 ? (
								<>
									<SubLabel>Distinct polygons</SubLabel>
									<OptionWall
										multi
										columns={6}
										fill={false}
										options={distinctPolygonOptions.map((n) => ({ value: n, label: String(n) }))}
										selected={filters.distinctPolygons ?? []}
										onChange={toggleDistinctPolygons}
									/>
								</>
							) : null}
							{distinctStarOptions.length > 1 ? (
								<>
									<SubLabel>Distinct star polygons</SubLabel>
									<OptionWall
										multi
										columns={6}
										fill={false}
										options={distinctStarOptions.map((n) => ({ value: n, label: String(n) }))}
										selected={filters.distinctStars ?? []}
										onChange={toggleDistinctStars}
									/>
								</>
							) : null}
							{anglePeriodOptions.length > 1 ? (
								<>
									<SubLabel>Angle-word period</SubLabel>
									{/* Short codes in six columns: the long names of p1 and p2 ride on their tooltips. */}
									<OptionWall
										multi
										columns={6}
										fill={false}
										options={anglePeriodOptions.map((n) => ({
											value: n,
											label: `p${n}`,
											tooltip: n <= 2 ? periodLabel(n) : undefined,
										}))}
										selected={filters.anglePeriods ?? []}
										onChange={toggleAnglePeriods}
									/>
								</>
							) : null}
						</FilterGroup>
					) : null}
					{showStar ? (
						<FilterGroup
							title="Star"
							note="star polygons"
							summary={filters.starFolds?.length ? filters.starFolds.map((n) => `${n}★`).join(" ") : null}
							defaultOpen={false}
						>
							<SubLabel>Fold (n-pointed)</SubLabel>
							<OptionWall
								multi
								columns={6}
								fill={false}
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

					{/* Hyperbolic-only interval facets. Valence and palette are the sweep's own axes (most edges
					    at any vertex, largest polygon in any figure), so their upper bounds read exactly as an
					    enumeration cell's (p, v). Edge length ℓ is the hyperbolic shape coordinate — H² has no
					    similarity, so ℓ separates tilings the vertex figure alone cannot. */}
					{geometry === GEOMETRIES.HYPERBOLIC && hypBounds && tileClass !== "freedraw" ? (
						<FilterGroup
							title="Bounds"
							summary={
								[filters.hypValence && "valence", filters.hypPolygon && "palette", filters.hypEdge && "ℓ"]
									.filter(Boolean)
									.join(", ") || null
							}
							note="valence, palette, edge length"
							info={
								<>
									Valence is the most edges at any vertex and palette the largest polygon in any figure: the
									sweep&apos;s own axes, so their upper bounds read as an enumeration cell&apos;s (p, v). The edge
									length ℓ is forced by the vertex figures (Σα = 2π). H² has no similarity, so ℓ is a shape coordinate:
									it separates tilings the figure alone cannot.
								</>
							}
						>
							<IntervalFilterCell
								label="Valence"
								value={filters.hypValence ?? hypBounds.valence}
								active={!!filters.hypValence}
								min={hypBounds.valence[0]}
								max={hypBounds.valence[1]}
								step={1}
								onChange={(v) => setHypInterval("hypValence", v, hypBounds.valence)}
								ariaLabel="Valence"
							/>
							<IntervalFilterCell
								label="Palette"
								value={filters.hypPolygon ?? hypBounds.polygon}
								active={!!filters.hypPolygon}
								min={hypBounds.polygon[0]}
								max={hypBounds.polygon[1]}
								step={1}
								onChange={(v) => setHypInterval("hypPolygon", v, hypBounds.polygon)}
								ariaLabel="Palette"
							/>
							<IntervalFilterCell
								label="Edge length ℓ"
								value={filters.hypEdge ?? hypBounds.edge}
								active={!!filters.hypEdge}
								min={hypBounds.edge[0]}
								max={hypBounds.edge[1]}
								step={0.01}
								onChange={(v) => setHypInterval("hypEdge", v, hypBounds.edge)}
								ariaLabel="Edge length"
								format={(n) => n.toFixed(2)}
							/>
						</FilterGroup>
					) : null}

					{showLattice || showGroup ? (
						<FilterGroup
							title="Symmetry"
							summary={[selectedLattice, filters.wallpaperGroups?.join(", ")].filter(Boolean).join(" · ") || null}
							note="lattice and wallpaper group"
							defaultOpen={false}
						>
							{showLattice ? (
								<>
									<SubLabel>Lattice</SubLabel>
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
								</>
							) : null}
							{showGroup ? (
								<>
									<SubLabel>Wallpaper group{selectedLattice ? ` on ${selectedLattice}` : ""}</SubLabel>
									<OptionWall
										multi
										columns={4}
										options={availableGroups
											.filter((g) => groupCounts.has(g) || filters.wallpaperGroups?.includes(g))
											.map((g) => ({
												value: g,
												label: <CountLabel label={g} count={groupCounts.get(g)} stacked />,
												// A selected lattice greys out (and blocks) every group it can't host.
												disabled: selectedLattice ? !isGroupOnLattice(g, selectedLattice) : false,
												// Wikipedia cell diagram(s) on hover/focus; opens into the main pane, not off-edge.
												tooltip: <WallpaperGroupTooltip group={g} />,
												tooltipSide: "right" as const,
												tooltipDelay: 0,
											}))}
										selected={filters.wallpaperGroups ?? []}
										onChange={toggleGroup}
									/>
								</>
							) : null}
						</FilterGroup>
					) : null}

					<FilterGroup
						title="Provenance"
						summary={
							[filters.discoverers?.join(", "), filters.certifications?.join(", ")].filter(Boolean).join(" · ") || null
						}
						note="who found it, how sure it is"
						defaultOpen={false}
						info={
							<>
								Proven: this work holds a completeness certificate for the level. Reproduced: the count matches a
								published enumeration. Candidate: surfaced here, novelty or completeness not established.
							</>
						}
					>
						<SubLabel>Discoverer</SubLabel>
						<OptionWall
							multi
							columns={2}
							options={DISCOVERER_OPTIONS.filter(
								(o) => discovererCounts.has(o.value) || filters.discoverers?.includes(o.value),
							).map((o) => ({ ...o, label: <CountLabel label={o.label} count={discovererCounts.get(o.value)} /> }))}
							selected={filters.discoverers ?? []}
							onChange={toggleDiscoverer}
						/>
						{certCounts.size || filters.certifications?.length ? (
							<>
								<SubLabel>Certification</SubLabel>
								<OptionWall
									multi
									columns={3}
									options={CERT_OPTIONS.filter(
										(o) => certCounts.has(o.value) || filters.certifications?.includes(o.value),
									).map((o) => ({
										...o,
										label: <CountLabel label={o.label} count={certCounts.get(o.value)} stacked />,
									}))}
									selected={filters.certifications ?? []}
									onChange={toggleCert}
								/>
							</>
						) : null}
					</FilterGroup>
				</div>
			</PageSidebar>

			{/* `relative` makes this scroll pane the containing block for the Pagination's absolutely-
			    positioned sr-only <label>; without it the label anchors to <html> and stretches the
			    document ~1000px below the app shell (a phantom black scroll region). */}
			<main ref={mainRef} className="relative flex-1 overflow-y-auto p-5 max-md:px-4 max-md:pb-24">
				<div className="mb-4 flex flex-col gap-3">
					<div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2 max-md:gap-y-3">
						<h1 className="flex items-baseline gap-2 text-lg font-semibold tracking-tight text-fg max-md:w-full max-md:flex-wrap max-md:gap-y-0">
							Tiling Library
							<span className="font-mono text-xs font-normal tracking-normal text-fg-muted tabular-nums">
								<AnimatedNumber value={filtered.length} /> tilings
								{groupVariants && geometry === GEOMETRIES.HYPERBOLIC && view === "grid"
									? ` · ${displayGroups.length.toLocaleString("en-US")} families`
									: null}
							</span>
						</h1>
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

						<div className="ml-auto flex items-center gap-2 max-md:ml-0 max-md:w-full max-md:flex-wrap">
							{/* The phone's way into the filter sheet. While it is on screen the floating pill stays
							    away; once it scrolls off, the pill takes over. */}
							<SheetTrigger
								ref={headerTriggerRef}
								label="Filters"
								count={activeFilterCount}
								onClick={() => useMobileSheet.getState().setOpen(true)}
							/>
							<SortControl keys={sortKeys} sortKey={sortKey} sortDir={sortDir} onChange={changeSort} />
							<ViewToggle view={view} onChange={setView} />
							{/* A phone always shows two columns, so the column count has nothing to set there. */}
							{view === "grid" ? (
								<div role="group" aria-label="Grid columns" className="max-md:hidden">
									<OptionWall
										columns={COLUMN_PRESETS.length}
										options={COLUMN_PRESETS.map((n) => ({ value: n, label: n, title: `${n} columns` }))}
										selected={gridColumns}
										onChange={setGridColumns}
										classes="w-28 tabular-nums"
									/>
								</div>
							) : null}
							{/* Group-variants toggle — hyperbolic grid only, where one vertex configuration carries up to
							    hundreds of tilings; the card then pages through them in place. The table lists each. */}
							{geometry === GEOMETRIES.HYPERBOLIC && view === "grid" ? (
								<label className="flex items-center gap-2 text-xs text-fg-muted">
									Group variants
									<Switch
										size="sm"
										checked={groupVariants}
										onCheckedChange={setGroupVariants}
										aria-label="Group tilings sharing a vertex configuration"
									/>
								</label>
							) : null}
							<Button
								variant="secondary"
								size="sm"
								onClick={copyLink}
								title="Copy a link to this exact view"
								icon={copied ? Check : Link2}
								aria-label={copied ? "Copied" : "Copy link"}
								classes="max-md:min-w-11"
								label={<span className="max-xl:sr-only">{copied ? "Copied" : "Copy link"}</span>}
							/>
							<ExportButton onExport={exportCsv} disabled={!sorted.length} />
						</div>
					</div>
					<ActiveFilters chips={activeChips} onClearAll={clearFilters} />
				</div>

				{error ? (
					<div className="flex flex-col items-center justify-center py-24 text-center">
						<p className="font-medium text-danger">Could not load the tiling library</p>
						<p className="mt-1 font-mono text-sm text-fg-disabled">{error}</p>
					</div>
				) : tilings === null ? (
					<div className="flex flex-col items-center justify-center py-24 text-center text-fg-muted">
						<Loader2 size={28} className="mb-3 animate-spin text-fg-muted" />
						<p className="text-sm">Loading tiling library…</p>
					</div>
				) : filtered.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-24 text-center">
						<Library size={40} className="mb-4 text-fg-disabled" />
						<p className="font-medium text-fg-muted">No tilings match the current filters.</p>
						{relaxations.length ? (
							<div className="mt-4 flex flex-col items-center gap-1.5">
								<p className="text-xs text-fg-muted">Nearest results:</p>
								{relaxations.map(({ chip, count }) => (
									<button
										key={chip.key}
										type="button"
										onClick={chip.clear}
										className="flex cursor-pointer items-center gap-2 rounded-full bg-surface-sunken px-3 py-1.5 text-[13px] text-fg ring-1 ring-line-subtle transition-colors hover:bg-surface-overlay max-md:min-h-11"
									>
										{chip.key === "vc-contains" ? null : <span className="text-fg-muted">without</span>}
										{chip.label}
										<span className="font-mono text-xs text-fg-muted tabular-nums">
											→ {count.toLocaleString("en-US")} {count === 1 ? "tiling" : "tilings"}
										</span>
									</button>
								))}
							</div>
						) : null}
						{activeFilterCount > 0 ? (
							<button onClick={clearFilters} className="mt-3 text-sm text-accent hover:underline max-md:min-h-11">
								Clear all filters
							</button>
						) : null}
					</div>
				) : (
					<>
						{/* One pager, under the results: the header count already gives the total. */}
						{view === "table" ? (
							<ResultsTable
								tilings={tableRows}
								sortKey={sortKey}
								sortDir={sortDir}
								onSort={(k) => changeSort(k)}
								hrefOf={(t) => `/play?source=reference&tiling=${encodeURIComponent(t.id)}`}
							/>
						) : null}
						<div
							hidden={view === "table"}
							className="ta-lanes ta-stagger grid [grid-template-columns:repeat(var(--cols),1fr)] !gap-3 max-md:[grid-template-columns:repeat(2,minmax(0,1fr))]"
							style={gridStyle}
						>
							{paginated.map((g) => (
								<ReferenceCard
									key={g.key}
									tiling={g.members[0]}
									group={g.members}
									onClick={(t) => router.push(`/play?source=reference&tiling=${encodeURIComponent(t.id)}`)}
								/>
							))}
						</div>
						<div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
							<div role="group" aria-label="Items per page" className="flex items-center gap-2 text-xs text-fg-muted">
								Per page
								<OptionWall
									columns={PAGE_SIZE_OPTIONS.length}
									options={PAGE_SIZE_OPTIONS.map((n) => ({ value: n, label: n }))}
									selected={pageSize}
									onChange={setPageSize}
									classes="w-36 tabular-nums"
								/>
							</div>
							<div className="min-w-0 flex-1">
								<Pagination
									totalItems={resultTotal}
									pageSize={pageSize}
									currentPage={currentPage}
									onPageChange={changePage}
								/>
							</div>
						</div>
					</>
				)}
			</main>
			<PolygonFilterModal
				isOpen={polygonModalOpen}
				onOpenChange={setPolygonModalOpen}
				available={availablePolygons}
				counts={polygonTokenCounts}
				selected={filters.polygonNames ?? []}
				excluded={filters.polygonExclude ?? []}
				onToggle={togglePolygon}
				onClear={clearPolygons}
				mode={filters.polygonMode ?? "all"}
				onModeChange={setPolygonMode}
				matchCount={polygonMatchCount}
			/>
		</div>
	);
}
