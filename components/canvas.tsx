"use client";

import { useEffect, useRef, useState } from "react";
import { useConfiguration } from "@/stores/configuration";
import { useDebug, debugManager, updateDebugStore } from "@/stores/debug";
import { useScreenshotPreview } from "@/stores/screenshotPreview";
import { useLegacyTilingStore } from "@/stores/legacyTilingStore";
import { Vector } from "@/classes/Vector";
import { Tiling } from "@/classes/Tiling";
import { GenericPolygon } from "@/classes/polygons/GenericPolygon";
import { RegularPolygon } from "@/classes/polygons/RegularPolygon";
import type { TranslationalCellData } from "@/classes/algorithm/types";
import { starHue, starApexAngleDeg } from "@/lib/utils/renderTiling";
import {
	TILING_TRANSITION_IN_MS,
	TILING_TRANSITION_OUT_MS,
	prefersReducedMotion,
	waveTileScale,
} from "@/lib/utils/tilingTransition";
import { evaluateParamCell, resolveAlphaDegsRaw, clampAlphaOnly, renderAlphaDegs, type ParametricCellData } from "@/lib/utils/paramCell";
import {
	screenToWorld,
	worldToScreen,
	pickSnapTarget,
	inversiveScreenToWorld,
	reduceToOriginCell,
	type LensParams,
} from "@/lib/utils/canvasPick";
import { useFamilyAlphas } from "@/stores/familyAlphas";
import { setIslamicNoiseWorldOffset } from "@/utils/islamicNoise";
import { TilingInfo } from "./tiling-info";
import { PieChart } from "./pie-chart";
import { Input } from "./ui/input";
import { ColorPad } from "./ui/color-pad";
import { useP5 } from "@/lib/hooks/useP5";
import { drawFundamentalDomain, drawSymmetryElements, drawTilingPlain } from "./canvas-overlays";
import type { SymmetryData } from "@/lib/classes/symmetry/types";
import type { OrbitData } from "@/lib/services/orbitsFromExactSource";

interface CanvasProps {
	width?: number;
	height?: number;
	translationalCell?: TranslationalCellData | null;
	translationalCellId?: string | null;
	/** Free-angle family cell. When present, the live cell is evaluated in the draw loop from the store's
	 *  `familyAlphas` (an imperative read, so dragging a slider never re-renders React). */
	paramCell?: ParametricCellData | null;
	symmetryData?: SymmetryData | null;
	orbitData?: OrbitData | null;
	showTilingRuleInput?: boolean;
}

// Play-mode zoom bounds (screen px per world unit). Wheel and reset clamp to [ZOOM_MIN, ZOOM_MAX].
// Lowering ZOOM_MIN lets the user zoom further out; fill radius scales as 1/zoom, so MAX_FILL_RADIUS
// below is sized against ZOOM_MIN — keep them in step.
const ZOOM_MIN = 20;
const ZOOM_MAX = 150;

// Wheel rotation (hyperbolic wheel; flat/inversive Shift+wheel). The angle advances in fixed detents
// as a function of how far you scroll (not how many wheel events fire — a trackpad emits dozens per
// gesture): every ROTATE_PX_PER_STEP pixels of accumulated scroll steps the target by ROTATE_SNAP_DEG.
// The live angle then eases into the detent, so a gentle scroll nudges one notch and a hard flick (or a
// trackpad's momentum tail) rolls through many like a spinning wheel. Lower ROTATE_PX_PER_STEP = more
// sensitive. The at-rest angle is always a multiple of ROTATE_SNAP_DEG.
const ROTATE_SNAP_DEG = 5; // detent size — the angle snaps to multiples of this
const ROTATE_PX_PER_STEP = 30; // pixels of scroll per detent (sensitivity knob)
const ROTATE_DAMP = 0.2; // per-frame ease of the live angle toward the target detent
// Fold the rotation target into [0, 360) for the slider readout. The live `controls.rotation` stays
// continuous, so no render path ever sees a 360° jump in its per-frame delta.
const wrap360 = (deg: number) => ((deg % 360) + 360) % 360;
// Shortest signed angular distance (degrees) for a raw difference, mapped to [-180, 180); lets the live
// angle take the short way round when the wrapped target jumps across the 0/360 seam.
const shortestDeltaDeg = (diff: number) => ((diff % 360) + 540) % 360 - 180;
// Normalize a wheel event's deltaY to approximate pixels so sensitivity matches across a pixel-mode
// trackpad and a line/page-mode mouse wheel. deltaMode: 0 = pixel, 1 = line (~16px), 2 = page.
const wheelDeltaPx = (e: WheelEvent) => e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 800 : 1);

// Left-click-to-centre. A left press starts a drag-pan; on release we treat it as a click (and centre the
// clicked tile) only if the pointer moved less than CLICK_DRAG_THRESHOLD_PX since press — beyond that it was
// a pan. CLICK_SNAP_RADIUS_PX is the screen-space reach for snapping to a tiling vertex (else the containing
// tile's centroid); see pickSnapTarget.
const CLICK_DRAG_THRESHOLD_PX = 5;
const CLICK_SNAP_RADIUS_PX = 12;

// Per-axis safety backstop on the replicated grid. Sized so it never limits a real screen-fill at the
// zoom floor (worst realistic case ~126 cells/axis for a skewed cell on a 4K-at-100% display at
// ZOOM_MIN=20); it only caps a pathological/near-degenerate basis from exploding the polygon count.
// Fill normally needs far fewer (~46/axis on a Retina laptop). Perf is governed by the zoom floor
// (tile density), not this cap.
const MAX_FILL_RADIUS = 144;
const DEGENERATE_DET = 1e-9;

// Command+drag angle scrub for parametric families. ALPHA_DEG_PER_PX: degrees of free-angle change per
// pixel of mouse movement (α on horizontal delta, β on vertical). ALPHA_DAMP: per-frame ease of the live
// angle toward the target tuple (exponential lerp — the flywheel glide feel), so the flat and inversive
// views settle in step.
const ALPHA_DEG_PER_PX = 0.25;
const ALPHA_DAMP = 0.2;

// The lattice basis (two world-space translation vectors) of a translational cell, plus its
// determinant. Single source of truth so fill-radius, wrap, and replication never disagree.
function latticeBasisFromCell(cellData: TranslationalCellData): { v1: Vector; v2: Vector; det: number } {
	const basisRaw = cellData?.b ?? cellData?.basis ?? [[1, 0], [0, 1]];
	const v1 = new Vector(basisRaw[0][0], basisRaw[0][1]);
	const v2 = new Vector(basisRaw[1][0], basisRaw[1][1]);
	return { v1, v2, det: v1.x * v2.y - v2.x * v1.y };
}

// The two on-screen (pixel-space) lattice vectors for the world basis, mirroring the canvas transform
// world -> scale(zoom) -> flip-y -> rotate(theta). So e(v) = Rot(theta)·(zoom*vx, -zoom*vy). At
// theta=0 this is the plain (zoom*vx, -zoom*vy). Fill-radius and wrap both reduce against these, so a
// rotated lattice still tiles/wraps seamlessly.
function screenLatticeVectors(v1: Vector, v2: Vector, zoom: number, rotation: number) {
	const c = Math.cos(rotation), s = Math.sin(rotation);
	const e = (v: Vector) => ({ x: zoom * (c * v.x + s * v.y), y: zoom * (s * v.x - c * v.y) });
	return { e1: e(v1), e2: e(v2) };
}

// Draw-time off-screen cull. Returns a predicate on a world-space centroid: true iff the tile may touch
// the viewport. The world -> centered-screen map here is the SAME one as screenLatticeVectors (translate
// center, +offset, rotate, scale zoom, flip-y, reduced to centered coords), so it agrees with fill/wrap.
// The pad is zoom·maxRadius (the largest centroid->vertex distance in world units): a tile whose body
// clips the edge while its centroid sits just outside is still kept, so the cull never hides a visible
// tile. Lets the drawer skip the off-screen remainder of an oversized grid (e.g. the larger grid retained
// mid zoom-in) instead of stroking every replicated copy every frame.
function makeVisibilityCull(
	maxRadius: number, zoom: number, rotation: number, offset: Vector, width: number, height: number,
): (c: Vector) => boolean {
	const cos = Math.cos(rotation), sin = Math.sin(rotation);
	const ox = offset.x, oy = offset.y;
	const pad = zoom * (maxRadius > 0 ? maxRadius : 2);
	const limX = width / 2 + pad, limY = height / 2 + pad;
	return (c: Vector) => {
		const sx = ox + zoom * (cos * c.x + sin * c.y);
		const sy = oy + zoom * (sin * c.x - cos * c.y);
		return sx >= -limX && sx <= limX && sy >= -limY && sy <= limY;
	};
}

// The selection transition's per-tile scale, as a function of the tile's WORLD centroid. The wave is
// radial in SCREEN space — it leaves the canvas centre and reaches the far corner at the end of the phase
// — so it stays uniform in every direction no matter how the view is panned, zoomed or rotated. Uses the
// same world -> centered-screen map as makeVisibilityCull, so the two agree on where a tile is.
function makeWaveScale(
	phase: "in" | "out", p: number, zoom: number, rotation: number, offset: Vector, width: number, height: number,
): (c: Vector) => number {
	const cos = Math.cos(rotation), sin = Math.sin(rotation);
	const ox = offset.x, oy = offset.y;
	// Normalise by the half-diagonal: the wavefront has swept every visible tile, corners included, at p=1.
	const dmax = Math.max(1, Math.hypot(width / 2, height / 2));
	return (c: Vector) => {
		const sx = ox + zoom * (cos * c.x + sin * c.y);
		const sy = oy + zoom * (sin * c.x - cos * c.y);
		return waveTileScale(phase, Math.hypot(sx, sy) / dmax, p);
	};
}

// The transition scales tiles about their centroids in the plain (and circle-packing) draw path. The
// Islamic construction and the symmetry-elements overlay are drawn by different code that has no notion of
// a per-tile scale, and the inversive view doesn't use this canvas at all — in those modes a selection just
// swaps, as it did before. Reduced-motion always wins over the toggle.
function transitionsEnabled(cfg: ReturnType<typeof useConfiguration.getState>): boolean {
	return (
		cfg.tilingTransition &&
		!cfg.isIslamic &&
		!cfg.showSymmetryElements &&
		!cfg.inversive &&
		!prefersReducedMotion()
	);
}

// How many lattice copies (per axis, each side of origin) are needed to cover the viewport plus a
// one-cell margin. We transform the four screen corners into lattice coords via M^{-1} (columns of M
// are the on-screen lattice vectors e1, e2) and take the worst case. The +1 absorbs the half-cell wrap
// shift and the cell's own extent past its anchor.
function computeFillRadii(
	v1: Vector, v2: Vector, det: number, zoomForFill: number, width: number, height: number, rotation: number,
): { Ri: number; Rj: number } {
	if (Math.abs(det) < DEGENERATE_DET || zoomForFill <= 0) return { Ri: 6, Rj: 6 };
	const { e1, e2 } = screenLatticeVectors(v1, v2, zoomForFill, rotation);
	const detM = e1.x * e2.y - e2.x * e1.y; // = zoomForFill^2 * det (rotation-invariant)
	let maxA = 0, maxB = 0;
	const hw = width / 2, hh = height / 2;
	for (const cx of [-hw, hw]) {
		for (const cy of [-hh, hh]) {
			const a = (cx * e2.y - cy * e2.x) / detM;
			const b = (-cx * e1.y + cy * e1.x) / detM;
			if (Math.abs(a) > maxA) maxA = Math.abs(a);
			if (Math.abs(b) > maxB) maxB = Math.abs(b);
		}
	}
	const clamp = (n: number) => Math.max(1, Math.min(MAX_FILL_RADIUS, Math.ceil(n) + 1));
	return { Ri: clamp(maxA), Rj: clamp(maxB) };
}

// Reduce the (pixel-space) pan offset modulo the on-screen lattice {e1, e2} into the centered
// fundamental cell. Because the drawn content is exactly lattice-periodic, subtracting whole lattice
// vectors shifts it by full periods — visually invisible — so panning wraps seamlessly while the copy
// count stays bounded. Applied at draw time only; stored offset is left untouched. Also returns the
// WORLD lattice vector L = ra*v1 + rb*v2 that the wrap removed: the Islamic noise is non-periodic and
// must be sampled at the true (unwrapped) position (world - L), or it snaps at every cell boundary.
function wrapOffset(
	offset: Vector, v1: Vector, v2: Vector, det: number, zoom: number, rotation: number,
): { draw: Vector; worldShiftX: number; worldShiftY: number } {
	if (Math.abs(det) < DEGENERATE_DET || zoom <= 0) {
		return { draw: offset.copy(), worldShiftX: 0, worldShiftY: 0 };
	}
	const { e1, e2 } = screenLatticeVectors(v1, v2, zoom, rotation);
	const detM = e1.x * e2.y - e2.x * e1.y;
	const a = (offset.x * e2.y - offset.y * e2.x) / detM;
	const b = (-offset.x * e1.y + offset.y * e1.x) / detM;
	const ra = Math.round(a), rb = Math.round(b);
	return {
		draw: new Vector(offset.x - ra * e1.x - rb * e2.x, offset.y - ra * e1.y - rb * e2.y),
		worldShiftX: ra * v1.x + rb * v2.x,
		worldShiftY: ra * v1.y + rb * v2.y,
	};
}

function buildTilingFromCell(cellData: TranslationalCellData, Ri: number, Rj: number, orbitData?: OrbitData | null): Tiling {
	const ri = Math.max(1, Math.min(MAX_FILL_RADIUS, Ri || 1));
	const rj = Math.max(1, Math.min(MAX_FILL_RADIUS, Rj || 1));
	const polyArray = cellData.p ?? cellData.cellPolygons ?? [];
	const basisRaw = cellData.b ?? cellData.basis ?? [[1, 0], [0, 1]];
	const [v1x, v1y] = basisRaw[0];
	const [v2x, v2y] = basisRaw[1];

	const t = new Tiling();
	t.nodes = [];

	// Build each distinct base tile ONCE. fromVertices is the expensive part (per-vertex angle, side
	// lengths, centroid, hue classification); every replicated cell is the same base tile translated by
	// i·v1 + j·v2, so the grid loop below clones by translation (translatedCopy) rather than
	// reconstructing each copy from scratch — the reconstruction is identical work for a shape that only
	// shifted. This is what keeps the parametric-angle slider (which rebuilds the whole grid every tick)
	// interactive: the cost drops from O(gridCells · perTileRebuild) to O(baseTiles · perTileRebuild)
	// plus a cheap per-copy vertex shift.
	//
	// maxRadius = largest centroid→vertex distance (world units). The draw-time off-screen cull tests
	// each tile by its CENTROID; a tile whose centroid is off-screen can still have a vertex on-screen,
	// but never further than this radius — so culling with a margin of zoom·maxRadius provably never
	// drops a partially-visible tile. It is translation-invariant, so the base tiles carry the global max.
	let maxRadius = 0;
	const basePolys: GenericPolygon[] = [];
	for (const polyData of polyArray) {
		const rawVerts = polyData.v ?? polyData.vertices ?? [];
		const vertices = rawVerts.map((v) =>
			Array.isArray(v) ? new Vector(v[0], v[1]) : new Vector(v.x, v.y),
		);
		if (vertices.length < 3) continue;
		const poly = GenericPolygon.fromVertices(vertices);
		// GenericPolygon colors by the regular log ramp; a star tile ({n}: n points, 2n vertices, or an
		// explicit `star` flag) uses the original StarPolygon hue instead.
		const nn = (polyData as { n?: number }).n ?? vertices.length;
		const isStar =
			(polyData as { star?: boolean }).star === true || (nn >= 3 && vertices.length === 2 * nn);
		if (isStar) poly.hue = starHue(nn, starApexAngleDeg(vertices));
		poly.isStar = isStar; // persist so the Islamic star-fill path can detect star tiles
		basePolys.push(poly);
		if (orbitData) poly.orbitOfCorner = poly.vertices.map((v) => orbitData.orbitAt(v.x, v.y));
		const c = poly.centroid;
		for (const vv of poly.vertices) {
			const d = Math.hypot(vv.x - c.x, vv.y - c.y);
			if (d > maxRadius) maxRadius = d;
		}
	}

	for (let i = -ri; i <= ri; i++) {
		for (let j = -rj; j <= rj; j++) {
			const ox = i * v1x + j * v2x;
			const oy = i * v1y + j * v2y;
			for (const base of basePolys) t.nodes.push(base.translatedCopy(ox, oy));
		}
	}
	t.maxRadius = maxRadius;
	return t;
}

export function Canvas({
	width = 600,
	height = 600,
	translationalCell = null,
	translationalCellId = null,
	paramCell = null,
	symmetryData = null,
	orbitData = null,
	showTilingRuleInput = true,
}: CanvasProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);

	const tilingRef = useRef<Tiling | null>(null);
	// The cell the current grid was built from — the static prop for a rigid tiling, or the live
	// alpha-evaluated cell for a parametric family. The draw loop reads this (not the raw prop) for
	// pan-wrap and culling, so a parametric family wraps/culls against its CURRENT geometry.
	const activeCellRef = useRef<TranslationalCellData | null>(null);
	// Last values pushed to React/store from the rebuild path, so we only re-render/notify on a real
	// change. Critical during a parametric-slider drag (a rebuild every frame): `isTilingRegularOnly`
	// is topological and never changes across an alpha drag, and TilingsTab subscribes to the WHOLE
	// config store (no selector), so an unconditional setState here would re-render the entire tiling
	// catalogue every frame.
	const prevRegularOnlyRef = useRef<boolean | null>(null);
	const prevTileCountRef = useRef(-1);
	const prevVcsSigRef = useRef<string>("");
	const grabRef = useRef(false);
	// Screen coords of the last left press, or null if the press didn't start on the canvas. Read on release
	// to tell a click (centre the tile) from a drag (pan) by how far the pointer travelled.
	const pressPosRef = useRef<{ x: number; y: number } | null>(null);
	// Last applied rotation (degrees); drives the pivot-on-nearest-vertex compensation in the draw loop.
	const prevRotationRef = useRef<number | null>(null);
	// True while WE'VE set the canvas cursor to "move" for an active Command-scrub, so we only reset the
	// cursor we own (not one a future pan/grab handler might set).
	const scrubCursorRef = useRef(false);
	// Accumulated wheel scroll (normalized px) not yet converted to rotation detents. Carries the sub-step
	// remainder between wheel events so rotation tracks total scroll distance, not the wheel-event count.
	const scrollAccumRef = useRef(0);
	// The orbitData the current grid's orbit ids were built from. orbitData arrives asynchronously (the hook
	// computes it after selection), so the grid rebuilds once when it changes to attach ids to base polygons.
	const prevOrbitDataRef = useRef<OrbitData | null>(null);

	// Selection transition (lib/utils/tilingTransition.ts). `outgoingRef` holds the tiling that is on its
	// way out — it keeps its own cell, because the draw loop must wrap and cull it against the lattice it
	// was built from, not the incoming one. The incoming grid is built at selection time (the cost is paid
	// either way) and simply waits its turn, so the out -> in handover costs no frame.
	const transitionRef = useRef<{ phase: "out" | "in"; start: number } | null>(null);
	const outgoingRef = useRef<{ tiling: Tiling; cell: TranslationalCellData } | null>(null);
	// The tiling the current grid belongs to, WITHOUT the parametric-alpha signature that translationalCellId
	// carries: dragging an α slider rebuilds the grid every frame and must NOT read as a new selection.
	const prevBaseIdRef = useRef<string | null>(null);

	const prevRef = useRef({
		rulestring: "",
		parameter: -1,
		ruleType: "" as string,
		translationalCellId: null as string | null,
		width,
		height,
		Ri: -1,
		Rj: -1,
	});

	const propsRef = useRef({ width, height, translationalCell, translationalCellId, paramCell, symmetryData, orbitData });
	useEffect(() => {
		propsRef.current = { width, height, translationalCell, translationalCellId, paramCell, symmetryData, orbitData };
	}, [width, height, translationalCell, translationalCellId, paramCell, symmetryData, orbitData]);

	// Clear the Command-scrub "move" cursor when Command is released (or the window blurs) without another
	// mouse move to clear it in mouseMoved. Cosmetic: the scrub itself is driven entirely by mouseMoved.
	useEffect(() => {
		const clear = () => {
			const c = containerRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
			if (c) c.style.cursor = "";
			scrubCursorRef.current = false;
		};
		const onKeyUp = (e: KeyboardEvent) => {
			if (e.key === "Meta" || !e.metaKey) clear();
		};
		window.addEventListener("keyup", onKeyUp);
		window.addEventListener("blur", clear);
		return () => {
			window.removeEventListener("keyup", onKeyUp);
			window.removeEventListener("blur", clear);
		};
	}, []);

	const [canvasError, setCanvasError] = useState<string | null>(null);
	const [tileCount, setTileCount] = useState(0);
	const [vcs, setVcs] = useState<Tiling["vcs"]>([]);

	const debugEnabled = useDebug((s) => s.isEnabled);
	const debugPhases = useDebug((s) => s.timingData.phases.length);
	const openScreenshotPreview = useScreenshotPreview((s) => s.open);
	const selectedRule = useConfiguration((s) => s.selectedTiling.rulestring);
	const colorParams = useConfiguration((s) => s.colorParams);
	const setCfg = useConfiguration((s) => s.set);
	const showSymmetryElements = useConfiguration((s) => s.showSymmetryElements);
	const showFundamentalDomain = useConfiguration((s) => s.showFundamentalDomain);
	const showSymmetryInfo = (showSymmetryElements || showFundamentalDomain) && !!symmetryData;
	const isDualRule = selectedRule.includes("*");

	useP5(
		containerRef,
		() => (p5Raw: unknown) => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const p5 = p5Raw as any;
			const readCfg = () => useConfiguration.getState();

			// The angle tuple the render/pick path should draw for a parametric family: the eased LIVE tuple
			// when it exists (Command+drag or slider glide), else the resolved target. Bypasses resolveAlphaDegs'
			// 0.5° grid snap so the continuous ease stays smooth; `live` is always in range (seeded from
			// resolveAlphaDegs and eased monotonically toward it — no overshoot), and deltasFor still holds it
			// inside the open interval.
			const renderAlphas = (pc: ParametricCellData): number[] => {
				const fa = useFamilyAlphas.getState();
				return renderAlphaDegs(pc, fa.live, fa.values);
			};

			const ensureTiling = () => {
				const cfg = readCfg();
				const ctrl = cfg.controls;
				const { translationalCell: staticCell, translationalCellId: baseId, paramCell: pc, width: W, height: H } = propsRef.current;
				// No geometry yet (cold load before the first tiling resolves): blank rather than crash in
				// buildTilingFromCell, which dereferences a null cell.
				if (!staticCell && !pc) {
					tilingRef.current = null;
					activeCellRef.current = null;
					return;
				}
				const prev = prevRef.current;
				// Captured before the rebuild below overwrites them: what is on screen right now. A selection
				// change hands this pair to the outgoing (collapsing) slot.
				const shownTiling = tilingRef.current;
				const shownCell = activeCellRef.current;

				// Resolve the cell to draw. Rigid tiling: the static prop. Parametric family: evaluate the
				// cell at the store's current slider tuple — an imperative read, so dragging a slider never
				// re-renders React. The alpha signature is appended to the id so a slider move registers as a
				// cell change (rebuilds the grid) exactly like a selection change; we only re-EVALUATE when
				// that id actually changed, not every frame.
				let tc = staticCell;
				let tcId = baseId;
				if (pc) {
					const alphas = renderAlphas(pc);
					tcId = `${baseId ?? ""}@a=${alphas.map((a) => a.toFixed(2)).join(",")}`;
					tc =
						tcId === prev.translationalCellId && activeCellRef.current
							? activeCellRef.current
							: evaluateParamCell(pc, alphas);
				}
				activeCellRef.current = tc;

				// Auto-fill: size the replicated grid to cover the viewport + 1-cell margin. Use the
				// most-zoomed-out point of any in-flight zoom ease (min of current/target) so the grid is
				// never momentarily undersized during a zoom-out (which would flash black corners).
				let Ri = prev.Ri, Rj = prev.Rj;
				if (tc) {
					const { v1, v2, det } = latticeBasisFromCell(tc);
					const zoomForFill = Math.min(ctrl.zoom, ctrl.targetZoom);
					const rot = (ctrl.rotation || 0) * Math.PI / 180;
					({ Ri, Rj } = computeFillRadii(v1, v2, det, zoomForFill, W, H, rot));
				}

				const ruleChanged =
					!tc &&
					(cfg.selectedTiling.rulestring !== prev.rulestring ||
						cfg.parameter !== prev.parameter);

				// Rebuilding the replicated grid is the expensive per-frame spike (thousands of polygons,
				// each recomputing centroid/halfways/angles/hue). A zoom-IN shrinks the needed radius
				// frame-by-frame across the ease, and rebuilding on every shrink is exactly what makes
				// zoom-in stutter. So only rebuild when the grid would be UNDERSIZED (must grow — the
				// zoom-out case, else black corners flash at the edges), or once the ease has SETTLED and
				// a now-oversized grid can be reclaimed in a single at-rest rebuild. During a zoom-in
				// gesture neither fires: the (larger-than-needed) grid is drawn as-is with zero rebuilds,
				// and the one shrink happens after motion stops, off the critical path. The grid stays
				// >= the fill radius throughout, so no visible tile is ever dropped.
				const settled = Math.abs(ctrl.zoom - ctrl.targetZoom) < 0.5;
				const grew = Ri > prev.Ri || Rj > prev.Rj;
				const shrankAtRest = settled && (Ri !== prev.Ri || Rj !== prev.Rj);
				const cellChanged =
					!!tc && (prev.translationalCellId !== tcId || grew || shrankAtRest);

				// orbitData arrives asynchronously (the hook computes it after selection); rebuild once when it
				// changes so buildTilingFromCell can attach the orbit ids to the base polygons.
				const orbitData = propsRef.current.orbitData ?? null;
				const orbitChanged = orbitData !== prevOrbitDataRef.current;

				// A NEW TILING was selected — as opposed to an α-slider tick or a zoom-driven regrid, which
				// also change tcId/the grid but must never animate. Hand what is on screen to the outgoing
				// slot and start the wave. If a collapse is already running, leave it be: that is the one the
				// user can actually see, and only the (not yet shown) incoming grid is superseded.
				if (!!tc && baseId !== prevBaseIdRef.current) {
					const canAnimate =
						prevBaseIdRef.current !== null && !!shownTiling && !!shownCell && transitionsEnabled(cfg);
					if (!canAnimate) {
						transitionRef.current = null;
						outgoingRef.current = null;
					} else if (transitionRef.current?.phase !== "out") {
						outgoingRef.current = { tiling: shownTiling, cell: shownCell };
						transitionRef.current = { phase: "out", start: p5.millis() };
					}
					prevBaseIdRef.current = baseId;
				}

				if (!tilingRef.current || ruleChanged || cellChanged || orbitChanged) {
					try {
						if (cfg.debugView) debugManager.reset();

						const t = buildTilingFromCell(tc, Ri, Rj, orbitData);
						tilingRef.current = t;

						const regularOnly = t.nodes.length > 0 && t.nodes.every((n) => n instanceof RegularPolygon);
						// Only touch the config store when this actually flips — see prevRegularOnlyRef: an
						// unconditional setState re-renders the whole-store-subscribed sidebar every frame.
						if (regularOnly !== prevRegularOnlyRef.current) {
							prevRegularOnlyRef.current = regularOnly;
							useConfiguration.setState({
								isTilingRegularOnly: regularOnly,
								...(regularOnly ? {} : { circlePacking: false }),
							});
						}
						if (cfg.debugView) updateDebugStore();
						setCanvasError(null);
						// The tile-count + VC overlay is informational; re-render it only when the numbers
						// actually change, so a slider drag doesn't re-render the overlay every frame for nothing.
						if (t.nodes.length !== prevTileCountRef.current) {
							prevTileCountRef.current = t.nodes.length;
							setTileCount(t.nodes.length);
						}
						const nextVcs = t.vcs ?? [];
						const vcsSig = JSON.stringify(nextVcs);
						if (vcsSig !== prevVcsSigRef.current) {
							prevVcsSigRef.current = vcsSig;
							setVcs(nextVcs);
						}

						prev.rulestring = cfg.selectedTiling.rulestring;
						prev.parameter = cfg.parameter;
						prev.translationalCellId = tcId;
						prev.Ri = Ri;
						prev.Rj = Rj;
						prevOrbitDataRef.current = orbitData;
					} catch (e) {
						setCanvasError(e instanceof Error ? e.message : String(e));
					}
				}
			};

			const drawTiling = (
				cfg: ReturnType<typeof readCfg>,
				tiling: Tiling,
				cull?: (c: Vector) => boolean,
				scaleOf?: (c: Vector) => number,
			) => {
				const orbitMode = cfg.showVertexOrbits && !cfg.isIslamic;
				const opacity = orbitMode ? 0.3 : 1;
				if (cfg.exportGraphButtonHover) tiling.showGraph(p5);
				else tiling.show(p5, cfg.showPolygonPoints, opacity, cfg.circlePacking, cull, scaleOf);
				if (cfg.showConstructionPoints) tiling.drawConstructionPoints(p5);
				// Orbit dots ride on the same world transform, above the (dimmed) tiles. Skipped during the
				// selection transition (scaleOf active) so they don't float off the shrinking outline.
				if (orbitMode && !scaleOf) {
					const dark = document.documentElement.classList.contains("dark");
					tiling.drawVertexOrbits(p5, dark, cull);
				}
			};

			const drawScreenshotOverlay = () => {
				p5.push();
				p5.resetMatrix();
				const sss = 600;
				p5.noStroke();
				p5.fill(0, 0, 0, 0.5);
				p5.rect(0, 0, p5.width / 2 - sss / 2, p5.height);
				p5.rect(p5.width / 2 + sss / 2, 0, p5.width / 2 - sss / 2, p5.height);
				p5.rect(p5.width / 2 - sss / 2, 0, sss, p5.height / 2 - sss / 2);
				p5.rect(p5.width / 2 - sss / 2, p5.height / 2 + sss / 2, sss, p5.height / 2 - sss / 2);
				p5.pop();
			};

			const takeScreenshotImpl = (cfg: ReturnType<typeof readCfg>, tiling: Tiling) => {
				const filename = `${cfg.selectedTiling.rulestring}.png`;
				const g = p5.createGraphics(300, 300);
				g.pixelDensity(1);
				g.colorMode(p5.HSB, 360, 100, 100);
				g.translate(0, 300);
				g.scale(0.5, -0.5);
				g.background(240, 7, 16);
				g.translate(300, 300);
				g.stroke(0);
				// A small fixed 3x3 patch -> deterministic thumbnail independent of play-mode zoom. Use the
				// active cell so a parametric family's screenshot captures the current slider position.
				const tc = activeCellRef.current ?? propsRef.current.translationalCell;
				const patch = tc ? buildTilingFromCell(tc, 1, 1) : tiling;

				let maxX = 0, maxY = 0, minX = 0, minY = 0;
				for (const n of patch.nodes) {
					for (const v of n.vertices) {
						if (v.x > maxX) maxX = v.x;
						if (v.y > maxY) maxY = v.y;
						if (v.x < minX) minX = v.x;
						if (v.y < minY) minY = v.y;
					}
				}
				const bw = Math.max(maxX - minX, 1e-6);
				const bh = Math.max(maxY - minY, 1e-6);
				// The outer transform maps a 600x600 world box onto the 300px buffer; fit the patch in.
				const fit = 0.9 * Math.min(600 / bw, 600 / bh);
				g.strokeWeight(2 / fit);
				g.scale(fit);
				g.translate(-(maxX + minX) / 2, -(maxY + minY) / 2);

				for (const n of patch.nodes) {
					g.push();
					g.fill(n.hue ?? 0, 40, 100, 1.0);
					g.beginShape();
					for (const v of n.vertices) g.vertex(v.x, v.y);
					g.endShape(g.CLOSE);
					g.pop();
				}
				const imageDataUrl = g.elt.toDataURL("image/png");
				g.remove();

				const baseRule = cfg.selectedTiling.rulestring.replace(/\*$/, "");
				const store = useLegacyTilingStore.getState();
				const db =
					store.getTilingByRulestring(cfg.selectedTiling.rulestring) ??
					store.getTilingByRulestring(baseRule);
				openScreenshotPreview({
					imageDataUrl,
					filename,
					rulestring: cfg.selectedTiling.rulestring,
					groupId: db?.group_id ?? null,
					allowSupabaseUpload: true,
				});
			};

			p5.setup = () => {
				const { width: w, height: h } = propsRef.current;
				p5.createCanvas(w, h);
				p5.colorMode(p5.HSB, 360, 100, 100);
				const cfg = readCfg();
				useConfiguration.setState({
					controls: {
						...cfg.controls,
						targetZoom: cfg.controls.zoom,
						targetOffset: cfg.controls.offset.copy(),
						// Start the live rotation at the slider value so a remount (view switch) with a non-zero
						// rotation shows it immediately instead of easing up from 0.
						rotation: cfg.rotation || 0,
					},
				});
				// The hyperbolic (and inversive) views paint via their own WebGL overlay; skip the flat grid build.
				if (!cfg.hyperbolic) ensureTiling();
			};

			p5.draw = () => {
				const cfg = readCfg();
				const ctrl = cfg.controls;
				ctrl.zoom += (ctrl.targetZoom - ctrl.zoom) * ctrl.dampening;
				ctrl.offset.add(Vector.sub(ctrl.targetOffset, ctrl.offset).scale(ctrl.dampening));
				// Ease the live rotation toward the target detent (cfg.rotation — the slider value, or the wheel's
				// accumulated 5° steps) along the shortest arc, so it glides in like a flywheel settling into a
				// notch. Snap once within a hair to stop perpetual micro-updates and keep the value bounded; the
				// snap is a whole number of turns off the target, which is identity for the periodic consumers
				// (overlays + pan-compensation use cos/sin of the per-frame delta).
				{
					const dRot = shortestDeltaDeg((cfg.rotation || 0) - ctrl.rotation);
					if (Math.abs(dRot) < 0.05) ctrl.rotation = cfg.rotation || 0;
					else ctrl.rotation += dRot * ROTATE_DAMP;
				}

				// Ease the live parametric angle(s) toward the target tuple (familyAlphas.values — the slider
				// position or the Command+drag scrub) with an exponential per-frame lerp, per-parameter and
				// clamped (never wrapped). Runs every frame in every view (before the skipFlat check) because
				// both the flat grid and the inversive overlay render from `live`. A null/length-mismatched `live`
				// (mount, or a selection change via resetLive) seeds from the target this frame with no ease.
				{
					const pc = propsRef.current.paramCell;
					if (pc) {
						const fa = useFamilyAlphas.getState();
						const target = resolveAlphaDegsRaw(pc, fa.values);
						const live = fa.live;
						if (!live || live.length !== target.length) {
							fa.live = target.slice();
						} else {
							for (let i = 0; i < target.length; i++) {
								const d = target[i] - live[i];
								if (Math.abs(d) < 0.01) live[i] = target[i];
								else live[i] += d * ALPHA_DAMP;
							}
						}
					}
				}

				p5.clear();
				// Inversive view: the WebGL overlay (InversiveCanvas) draws the tiling instead. Keep the p5
				// canvas as the input layer — the ease/rotation/drag bookkeeping below still runs so panning
				// and rotation keep flowing into the store — but skip the (now wasted) grid build and tile draw.
				// Both WebGL overlays (inversive conformal, hyperbolic disk) paint the tiling themselves; the
				// flat p5 grid build + tile draw are skipped for either. The p5 canvas stays mounted only as the
				// pan/pointer input layer, so the ease/drag bookkeeping below still runs.
				const inversive = cfg.inversive;
				const hyperbolic = cfg.hyperbolic;
				const skipFlat = inversive || hyperbolic;
				if (!skipFlat) ensureTiling();

				// Advance the selection transition. Phase "out" collapses the OUTGOING tiling into its
				// centroids, centre-first; when it lands, the (already built) incoming grid takes over and
				// phase "in" grows it back out the same way. Two phases in sequence — the new tiling never
				// starts appearing before the old one is gone.
				let wavePhase: "in" | "out" | null = null;
				let waveP = 0;
				const tr = transitionRef.current;
				if (tr && !transitionsEnabled(cfg)) {
					// Toggled off (or Islamic/symmetry/inversive switched on) mid-flight: drop straight to the
					// finished state rather than freezing the tiles at whatever scale they had reached.
					transitionRef.current = null;
					outgoingRef.current = null;
				} else if (tr) {
					const dur = tr.phase === "out" ? TILING_TRANSITION_OUT_MS : TILING_TRANSITION_IN_MS;
					const elapsed = (p5.millis() - tr.start) / dur;
					if (elapsed < 1) {
						wavePhase = tr.phase;
						waveP = elapsed;
					} else if (tr.phase === "out") {
						outgoingRef.current = null;
						transitionRef.current = { phase: "in", start: p5.millis() };
						wavePhase = "in";
						waveP = 0;
					} else {
						transitionRef.current = null;
					}
				}
				// While the old tiling collapses it is what's on screen, so it — and the lattice it was built
				// from — is what the wrap, the cull and the draw below all work against.
				const outgoing = wavePhase === "out" ? outgoingRef.current : null;
				const tiling = outgoing ? outgoing.tiling : tilingRef.current;

				const { width: w, height: h } = propsRef.current;
				if (w !== prevRef.current.width || h !== prevRef.current.height) {
					p5.resizeCanvas(w, h);
					prevRef.current.width = w;
					prevRef.current.height = h;
				}

				try {
					// Wrap the pan offset modulo the lattice so panning feels infinite while the drawn
					// copy count stays bounded; the wrap jump is a whole period -> invisible. Use the cell
					// the grid was actually built from (the live alpha cell for a parametric family), so the
					// wrap lattice matches the drawn geometry.
					const rot = (ctrl.rotation || 0) * Math.PI / 180;
					const tc = outgoing ? outgoing.cell : activeCellRef.current;

					// Rotate about the screen centre, not the world origin: when the angle changes by Δθ,
					// rotate the stored pan offset by the same Δθ. That holds the world point under the
					// viewport centre fixed there, so the pattern spins around the middle of the screen no
					// matter how it's been panned. (To keep wc under centre: O_new = R(Δθ)·O_old — exact
					// for any Δθ, and wrap-proof since it never leaves the drawn frame.)
					// The hyperbolic view applies rotation directly as θ inside its shader's Möbius map and derives
					// its pan vector from the RAW offset, so rotating the pan offset here too would double-count.
					// Skip the compensation in hyperbolic mode (the inversive view still needs it — it reads the
					// raw uOffset + uRot and relies on this to hold the centre fixed under rotation).
					const rotDeg = ctrl.rotation || 0;
					const prevRotDeg = prevRotationRef.current;
					if (!hyperbolic && prevRotDeg !== null && prevRotDeg !== rotDeg) {
						const dTheta = rot - prevRotDeg * Math.PI / 180;
						const cd = Math.cos(dTheta), sd = Math.sin(dTheta);
						const rotateAboutCentre = (o: Vector) => {
							const x = cd * o.x - sd * o.y;
							const y = sd * o.x + cd * o.y;
							o.x = x;
							o.y = y;
						};
						rotateAboutCentre(ctrl.offset);
						rotateAboutCentre(ctrl.targetOffset);
					}
					prevRotationRef.current = rotDeg;

					// Everything below paints tiles onto the p5 canvas; a WebGL overlay owns painting in the
					// inversive/hyperbolic modes, so skip it (the rotation compensation above still ran).
					if (!skipFlat) {
					let drawOffset = ctrl.offset;
					if (tc) {
						const { v1, v2, det } = latticeBasisFromCell(tc);
						const wrapped = wrapOffset(ctrl.offset, v1, v2, det, ctrl.zoom, rot);
						drawOffset = wrapped.draw;
						// Keep the Islamic noise sampling in the true (unwrapped) world frame so the animated
						// motif pans with the content instead of snapping back at each lattice wrap.
						setIslamicNoiseWorldOffset(-wrapped.worldShiftX, -wrapped.worldShiftY);
					} else {
						setIslamicNoiseWorldOffset(0, 0);
					}

					p5.push();
					p5.translate(p5.width / 2, p5.height / 2);
					p5.translate(drawOffset.x, drawOffset.y);
					p5.rotate(rot);
					p5.scale(ctrl.zoom);
					p5.scale(1, -1);
					const sd = propsRef.current.symmetryData;
					// Symmetry-elements view: draw tiles plain (no per-tile colour) so colour is reserved for the
					// symmetry axes + rotation-centre glyphs drawn on top. Otherwise the normal coloured render.
					const symmetryActive = !!sd && cfg.showSymmetryElements;
					// Skip tiles outside the viewport. Only meaningful when the grid can exceed it (the
					// translational-cell path with its retained-oversize grid); the rulestring path draws all.
					const cull =
						tc && tiling
							? makeVisibilityCull(tiling.maxRadius ?? 0, ctrl.zoom, rot, drawOffset, p5.width, p5.height)
							: undefined;
					// The wave rides on the same view transform, so it stays radial about the canvas centre under
					// any pan/zoom/rotation.
					const wave = wavePhase
						? makeWaveScale(wavePhase, waveP, ctrl.zoom, rot, drawOffset, p5.width, p5.height)
						: undefined;
					if (symmetryActive) drawTilingPlain(p5, tiling, ctrl.zoom);
					else drawTiling(cfg, tiling, cull, wave);
					if (sd && cfg.showFundamentalDomain) drawFundamentalDomain(p5, sd);
					if (symmetryActive) {
						drawSymmetryElements(p5, sd, {
							zoom: ctrl.zoom,
							rotation: rot,
							offset: { x: drawOffset.x, y: drawOffset.y },
							width: p5.width,
							height: p5.height,
						});
					}
					p5.pop();

					if (cfg.screenshotButtonHover) drawScreenshotOverlay();
					}
				} catch (e) {
					setCanvasError(e instanceof Error ? e.message : String(e));
				}

				if (grabRef.current) {
					const mouse = new Vector(p5.mouseX, p5.mouseY);
					const prevMouse = new Vector(p5.pmouseX, p5.pmouseY);
					ctrl.targetOffset.add(Vector.sub(mouse, prevMouse));
				}

				if (cfg.takeScreenshot && tiling) {
					takeScreenshotImpl(cfg, tiling);
					useConfiguration.setState({ takeScreenshot: false });
				}
				if (cfg.exportGraph && tiling) {
					tiling.exportGraph();
					useConfiguration.setState({ exportGraph: false });
				}
			};

			p5.mousePressed = (event?: MouseEvent) => {
				if (event && event.target !== p5.canvas) return;
				const cfg = readCfg();
				const ctrl = cfg.controls;
				if (event?.button === 1) {
					const mouse = new Vector(p5.mouseX - p5.width / 2, p5.mouseY - p5.height / 2);
					const world = Vector.sub(mouse, ctrl.targetOffset).scale(1 / ctrl.targetZoom);
					ctrl.targetOffset.set(Vector.sub(new Vector(0, 0), Vector.scale(world, ctrl.targetZoom)));
					return;
				}
				if (event?.button === 2) {
					event.preventDefault();
					event.stopPropagation();
					ctrl.targetOffset.set(new Vector(0, 0));
					useConfiguration.setState({ controls: { ...ctrl, targetZoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, 50)) } });
					// Hyperbolic: also recentre the disk view (right-click resets, as in the flat view).
					if (cfg.hyperbolic) useConfiguration.setState({ hyperbolicResetView: true });
					return;
				}
				grabRef.current = true;
				pressPosRef.current = { x: p5.mouseX, y: p5.mouseY };
			};

			// Centre the view on the tile under the cursor, in both the flat and inversive views. Operates in
			// the TARGET frame (targetOffset/targetZoom), the convention the wheel and middle-click handlers
			// use, so it composes with an in-flight ease. Each branch inverts the click to a world point, hit-
			// tests with pickSnapTarget, then re-solves the offset so the picked tile lands at the centre.
			const centreOnClick = () => {
				const cfg = readCfg();
				// Hyperbolic view: hand the click (centred CSS px) to the disk overlay, which owns the view
				// isometry and folds the clicked tile's centre to the screen centre.
				if (cfg.hyperbolic) {
					useConfiguration.setState({
						hyperbolicClick: { x: p5.mouseX - p5.width / 2, y: p5.mouseY - p5.height / 2 },
					});
					return;
				}
				if (transitionRef.current) return; // mid selection-transition the shown tiling is the outgoing one
				const ctrl = cfg.controls;
				const zoom = ctrl.targetZoom;
				const rot = ((ctrl.rotation || 0) * Math.PI) / 180;
				const mx = p5.mouseX - p5.width / 2;
				const my = p5.mouseY - p5.height / 2;

				if (cfg.inversive) {
					// The inversive view skips ensureTiling (its geometry lives in InversiveCanvas' own data textures),
					// so tilingRef/activeCellRef can be stale after a selection or slider change made while inversive.
					// Resolve the current cell fresh from the props and build a small local patch to hit-test against.
					const { translationalCell: staticCell, paramCell: pc } = propsRef.current;
					const cell = pc
						? evaluateParamCell(pc, renderAlphas(pc))
						: staticCell;
					if (!cell) return;
					const { v1, v2 } = latticeBasisFromCell(cell);

					// Replicate the shader's per-pixel inverse (lens then affine) to find the world point under the
					// cursor. The lens uniforms are rebuilt from config exactly as InversiveCanvas builds them (sigma is
					// the 0.5 it hardcodes) — keep this in step with that file.
					const kinvMag = Math.exp(-0.5);
					const tau = ((cfg.mobiusTwist || 0) * Math.PI) / 180;
					const lens: LensParams = {
						mode: cfg.inversiveMode === "mobius" ? 1 : 0,
						R: cfg.inversiveRadiusFrac * Math.min(p5.width, p5.height) * 0.5,
						kinv: { x: kinvMag * Math.cos(-tau), y: kinvMag * Math.sin(-tau) },
					};
					const w0 = inversiveScreenToWorld(mx, my, lens, ctrl.targetOffset, zoom, rot);
					// Find the TILE the click lands in — the one containing the world point under the cursor — and take
					// its centroid. NO vertex snapping here (radius 0): the user is selecting a whole tile to send to
					// infinity, and snapping to a vertex, which several tiles share, makes "which tile surrounds the
					// image" ambiguous — and near the singular centre, where the lens magnification diverges, it would
					// snap to a vertex almost every time. reduceToOriginCell first brings the click (which the lens can
					// map far from the origin) into the cell the local patch covers.
					const patch = buildTilingFromCell(cell, 2, 2);
					const qw = reduceToOriginCell(w0, v1, v2);
					const hit = pickSnapTarget(qw, patch.nodes, patch.maxRadius ?? 0, 0);
					if (!hit) return;
					// Put the tile's centroid at the affine origin v = 0, the centre of the inversion. The lens then
					// carries it out to infinity, so the clicked tile becomes the one that surrounds the whole image.
					// Same affine solve as the flat view (offset = -zoom.Rt.p); the lens plays no part in the centring.
					const sp = worldToScreen(hit.x, hit.y, { x: 0, y: 0 }, zoom, rot);
					ctrl.targetOffset.set(new Vector(-sp.x, -sp.y));
					return;
				}

				// Flat view. wrap-reduce the offset so the inverted click lands in the built base grid, then shift
				// targetOffset by the snapped point's on-screen position — moving that (visible) tile to the centre
				// with a bounded pan.
				const tiling = tilingRef.current;
				const tc = activeCellRef.current;
				if (!tiling || !tc) return;
				const { v1, v2, det } = latticeBasisFromCell(tc);
				const { draw } = wrapOffset(ctrl.targetOffset, v1, v2, det, zoom, rot);
				const c = screenToWorld(mx, my, draw, zoom, rot);
				const hit = pickSnapTarget(c, tiling.nodes, tiling.maxRadius ?? 0, CLICK_SNAP_RADIUS_PX / zoom);
				if (!hit) return;
				const s = worldToScreen(hit.x, hit.y, draw, zoom, rot);
				ctrl.targetOffset.sub(new Vector(s.x, s.y));
			};

			p5.mouseReleased = () => {
				grabRef.current = false;
				const press = pressPosRef.current;
				pressPosRef.current = null;
				if (!press) return;
				if (Math.hypot(p5.mouseX - press.x, p5.mouseY - press.y) < CLICK_DRAG_THRESHOLD_PX) {
					centreOnClick();
				}
			};
			// Advance the rotation target by whole 5° detents as a function of total scroll DISTANCE, not the
			// number of wheel events (a trackpad fires dozens per gesture). Accumulate normalized scroll px and
			// emit one detent per ROTATE_PX_PER_STEP; the draw loop eases the live angle into it.
			const stepFromWheel = (event: WheelEvent) => {
				scrollAccumRef.current += wheelDeltaPx(event);
				let steps = 0;
				while (scrollAccumRef.current >= ROTATE_PX_PER_STEP) {
					steps++;
					scrollAccumRef.current -= ROTATE_PX_PER_STEP;
				}
				while (scrollAccumRef.current <= -ROTATE_PX_PER_STEP) {
					steps--;
					scrollAccumRef.current += ROTATE_PX_PER_STEP;
				}
				if (steps === 0) return;
				const rot = useConfiguration.getState().rotation || 0;
				useConfiguration.setState({ rotation: wrap360(rot + steps * ROTATE_SNAP_DEG) });
			};

			p5.mouseWheel = (event?: WheelEvent) => {
				if (event && event.target !== p5.canvas) return;
				const cfg = readCfg();
				// Hyperbolic view has no zoom (the disk radius is fixed), so the wheel spins the disc instead.
				// The overlay folds the per-frame rotation change into its view; panning stays screen-relative,
				// so drag direction still follows the mouse under any rotation.
				if (cfg.hyperbolic) {
					if (event) stepFromWheel(event);
					return;
				}
				// Flat/inversive view: the wheel alone zooms, Shift+wheel spins the view in the same 5° detents.
				if (event?.shiftKey) {
					stepFromWheel(event);
					return;
				}
				const ctrl = cfg.controls;
				const mouse = new Vector(p5.mouseX - p5.width / 2, p5.mouseY - p5.height / 2);
				const world = Vector.sub(mouse, ctrl.targetOffset).scale(1 / ctrl.targetZoom);
				let z = ctrl.targetZoom;
				if (event && event.deltaY > 0) z = Math.max(z / 1.1, ZOOM_MIN);
				else if (event && event.deltaY < 0) z = Math.min(z * 1.1, ZOOM_MAX);
				const newScreen = Vector.add(Vector.scale(world, z), ctrl.targetOffset);
				ctrl.targetOffset.add(Vector.sub(mouse, newScreen));
				useConfiguration.setState({ controls: { ...ctrl, targetZoom: z } });
			};

			// Command + move (no button): scrub the parametric angle(s). α on horizontal delta, β on vertical,
			// relative (movementX/Y) so pressing Command never snaps the value — only actual motion moves it.
			// Continuous, clamped to each parameter's range (never wrapped); the draw loop eases the live
			// value behind it. Writes the TARGET (familyAlphas.values), so the slider thumbs track instantly.
			// Inert unless a parametric family is selected. Re-renders only the small ParamSliderPanel (it
			// alone subscribes to `values`), exactly like a slider drag.
			p5.mouseMoved = (event?: MouseEvent) => {
				if (!event || event.target !== p5.canvas) return;
				const pc = propsRef.current.paramCell;
				if (!event.metaKey || !pc) {
					if (scrubCursorRef.current) {
						p5.canvas.style.cursor = "";
						scrubCursorRef.current = false;
					}
					return;
				}
				if (!scrubCursorRef.current) {
					p5.canvas.style.cursor = "move";
					scrubCursorRef.current = true;
				}
				const dx = event.movementX || 0;
				const dy = event.movementY || 0;
				if (dx === 0 && dy === 0) return;
				const fa = useFamilyAlphas.getState();
				const cur = resolveAlphaDegsRaw(pc, fa.values); // clamp-only, off-grid — the continuous scrub base
				const next = cur.slice();
				next[0] = clampAlphaOnly(pc, 0, cur[0] + dx * ALPHA_DEG_PER_PX);
				if (pc.params.length >= 2) next[1] = clampAlphaOnly(pc, 1, cur[1] - dy * ALPHA_DEG_PER_PX);
				// Skip the store write (and the ParamSliderPanel re-render) when nothing actually moved — a pure
				// off-axis move on a 1-param family, or scrubbing while already pinned at a range endpoint.
				if (next[0] !== cur[0] || (pc.params.length >= 2 && next[1] !== cur[1])) fa.set(next);
			};
		},
		[],
	);

	return (
		<div className="relative h-full w-full bg-surface-base">
			<div
				ref={containerRef}
				className="cursor-pointer"
				role="application"
				onContextMenu={(e) => e.preventDefault()}
			/>
			<div className="absolute top-4 left-4 z-20">
				<TilingInfo tileCount={tileCount} vcs={vcs} />
			</div>

			{showSymmetryInfo ? (
				<div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-1 rounded-lg bg-surface-overlay/90 px-3 py-2 text-right">
					<span className="text-sm font-bold leading-none text-fg">
						Group <span className="font-mono">{symmetryData.group}</span>
						<span className="ml-1.5 font-mono font-normal text-fg-muted">{symmetryData.orbifold}</span>
					</span>
					<span className="text-xs capitalize leading-none text-fg-muted">
						{symmetryData.latticeShape} lattice
					</span>
				</div>
			) : null}

			{!translationalCell && isDualRule ? (
				<div className="absolute bottom-4 right-4 z-20">
					<ColorPad value={colorParams} onChange={(v) => setCfg({ colorParams: v })} />
				</div>
			) : null}

			{showTilingRuleInput && !translationalCell ? (
				<div className="absolute bottom-8 right-[50%] translate-x-[50%] z-20 w-80">
					<div className="flex flex-col gap-3 bg-surface-overlay/90 rounded-lg p-2 pt-3 justify-center items-center w-full">
						<label htmlFor="tilingRule" className="text-lg text-center font-bold leading-none text-fg">
							Tiling Rule
						</label>
						<Input
							id="tilingRule"
							align="center"
							value={selectedRule}
							placeholder="4/m90/r(h1)"
							onChange={(e) =>
								setCfg({
									selectedTiling: { ...useConfiguration.getState().selectedTiling, rulestring: e.target.value },
								})
							}
						/>
					</div>
				</div>
			) : null}

			{canvasError ? (
				<div className="absolute inset-0 flex items-center justify-center pointer-events-none text-center text-fg text-sm px-8">
					{canvasError}
				</div>
			) : null}

			{debugEnabled ? (
				<div className="absolute bottom-4 right-4 w-96 z-20">
					<PieChart />
					{debugPhases === 0 ? (
						<div className="mt-2 p-3 bg-warning-subtle text-fg text-sm rounded-lg">
							No timing data available.
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}
