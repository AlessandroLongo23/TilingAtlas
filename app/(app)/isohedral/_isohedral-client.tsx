"use client";

// The isohedral shelf: Grünbaum and Shephard's IH1–IH93, parameterized.
//
// An isohedral tiling is one where every tile is equivalent to every other under the tiling's own
// symmetry group — one prototile, repeating in one of ninety-three combinatorially distinct ways. The
// geometry comes from Craig Kaplan's Tactile (lib/isohedral/vendor/, BSD-3), whose table encodes each
// type's tiling vertices, lattice translations and aspect transforms as affine functions of a short
// parameter vector. Moving a slider therefore moves the whole tiling, coherently, and never leaves the
// type.
//
// Twelve of the ninety-three come from somewhere else. Their tiles are too symmetric for the boundary
// to carry the type — every edge sits on a mirror, so every edge is straight and the tile is a regular
// hexagon, a rhombus, a rectangle, a square or a triangle — and Tactile does not parameterize them.
// lib/isohedral/marked.ts builds them the way Grünbaum and Shephard did in 1977: one asymmetric mark,
// carried around by a wallpaper group smaller than the base net's own symmetry, leaving |I(T)| marks
// in every tile. They render through the same cell, the same mesh and the same shader as the other
// eighty-one; only the builder differs.
//
// These tilings are periodic, so they render on the atlas' flat Euclidean renderer, the one /play
// uses: FlatCellRenderer takes one translational cell and the vertex shader instances it across the
// visible lattice every frame (lib/render/flatTilingGL.ts). The tiling is therefore unbounded — pan
// and zoom out as far as you like and it keeps going — and a frame costs two instanced draw calls
// whatever the zoom, with no geometry rebuilt. A finite patch would have been both a lie about the
// subject and more work per frame.
//
// The mesh comes from lib/isohedral/cellMesh.ts, not lib/render/buildCellMesh.ts: the shared builder
// fans each polygon from its centroid, which the edge-curvature sliders can invalidate. See that file.
//
// drawPolygons over expandToViewport is the 2-D fallback for a canvas with no WebGL2 context, walking
// the same lattice on the CPU.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Shuffle, RotateCcw } from "lucide-react";
import type { AperiodicFrame } from "@/lib/hooks/useAperiodicView";
import { useParametricTilingCanvas } from "@/lib/hooks/useParametricTilingCanvas";
import { tilingPeriodicCell } from "@/lib/render/periodic/tilings";
import { Kbd } from "@/components/ui/kbd";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Reveal } from "@/components/ui/reveal";
import { TilingInfo } from "@/components/tiling-info";
import { InversiveCanvas, MAX_VERTS_PER_PRIM } from "@/components/inversive-canvas";
import { InversiveControls, useInversiveShortcut } from "@/components/inversive-controls";
import { FullscreenToggle, useImmersiveShortcuts } from "@/components/fullscreen-toggle";
import { useConfiguration } from "@/stores/configuration";
import { useImmersive } from "@/stores/immersive";
import type { TilingSpec } from "@/lib/services/tilingSpec";
import {
	DEFAULT_IH,
	ISOHEDRAL_TYPES,
	MARKED_REASON,
	isohedralType,
	parseIh,
	type EdgeKind,
	type IsohedralTypeInfo,
} from "@/lib/isohedral/catalogue";
import { markedType } from "@/lib/isohedral/marked";
import {
	BULGE,
	buildCell,
	buildMarked,
	curvesOf,
	defaultEdgeStates,
	randomEdgeStates,
	setEdgeAmount,
	type EdgeShapeState,
} from "@/lib/isohedral/build";
import { IsohedralSidebar, Section, Segmented, type SegmentedOption } from "./_controls";
import { PrototileInspector } from "./_prototile";

/** Outline width in CSS px, as /play's `lineWidth` means it. 0 is off. */
const STROKE_WIDTH = { min: 0, max: 3, step: 0.25, def: 1.5 } as const;
const STROKE_RGB: [number, number, number] = [0, 0, 0];
const STROKE_CSS = "#000";

/** How far past the viewport the 2-D fallback replicates before giving up. */
const FALLBACK_MAX_RADIUS = 60;

const EDGE_KIND_NOTE: Record<EdgeKind, string> = {
	J: "free — any path",
	U: "mirror across the bisector",
	S: "180° about the midpoint",
	I: "straight (forced)",
};

/**
 * Zoom, rounded up to a power of two, for deciding how finely to flatten the edge curves.
 *
 * The curves are cubics and the fill has to be triangles, so the only question is how many segments —
 * lib/isohedral/build.ts answers it from the Bézier's own error bound and a pixel budget, which means
 * the answer moves with the zoom. Quantizing keeps that from rebuilding the mesh every frame: over the
 * hook's whole zoom range (home/8 to home×400) this changes about a dozen times. Rounded UP so the
 * tessellation is never coarser than the view is asking for.
 */
function tessellationZoom(zoom: number): number {
	if (!(zoom > 0) || !Number.isFinite(zoom)) return 1;
	return 2 ** Math.ceil(Math.log2(zoom));
}

/** What the first frame tessellates at, before a real zoom has been measured. Home lands near here. */
const INITIAL_TESS_ZOOM = 128;

/**
 * How much more than the view zoom the conformal lens magnifies, at its most magnifying pixel.
 *
 * The view zoom is NOT the magnification once the lens is on, and tessellating for it alone is what
 * left the outer ring of an inversion visibly polygonal while the middle stayed smooth. Circle
 * inversion sends screen offset s to R²·s/|s|², whose derivative has magnitude R²/|s|² — so the picture
 * is scaled by |s|²/R², identity on the lens circle, compressed inside it and MAGNIFIED outside. The
 * extreme is the far corner of the canvas: 17x at the default radius on a 1280x900 view, and it climbs
 * as the radius slider shrinks the circle.
 *
 * The Möbius map is the same family and bounded by the same quantity. The spiral is a similarity in
 * strip space and asks for none of this, which is why the caller excludes it.
 */
function lensMagnification(f: { w: number; h: number }, on: boolean, radiusFrac: number): number {
	if (!on) return 1;
	const R = radiusFrac * Math.min(f.w, f.h) * 0.5;
	if (!(R > 0)) return 1;
	const ratio = (0.5 * Math.hypot(f.w, f.h)) / R;
	return Math.max(1, ratio * ratio);
}

const PARAM_FILTERS = ["any", "0", "1", "2", "3+"] as const;
const VERTEX_FILTERS = ["any", "3", "4", "5", "6"] as const;

// Both filters read the same fields on all 93 now. The marked twelve used to report zeroes and drop out
// of every filter but "any", which was honest while they had no geometry and is a lie now that they do.
function matchesParamFilter(t: IsohedralTypeInfo, f: string): boolean {
	if (f === "any") return true;
	if (f === "3+") return t.numParams >= 3;
	return t.numParams === Number(f);
}

function matchesVertexFilter(t: IsohedralTypeInfo, f: string): boolean {
	if (f === "any") return true;
	return t.numVertices === Number(f);
}

export function IsohedralClient() {
	const searchParams = useSearchParams();

	// Read the URL once on mount, write-only afterwards (replaceState) — the /aperiodic pattern.
	const [ih, setIh] = useState<number>(() => parseIh(searchParams.get("type")));
	const info = isohedralType(ih) ?? isohedralType(DEFAULT_IH)!;

	const [params, setParams] = useState<number[]>(() => [...info.defaultParams]);
	const [edges, setEdges] = useState<EdgeShapeState[]>(() => defaultEdgeStates(info.edgeShapes));
	const [strokeWidth, setStrokeWidth] = useState<number>(STROKE_WIDTH.def);
	const [paramFilter, setParamFilter] = useState<string>("any");
	const [vertexFilter, setVertexFilter] = useState<string>("any");
	// Drives the edge tessellation. Written from the draw loop, but only when it crosses a power of two,
	// so this is a handful of re-renders across the entire zoom range and none during a pan.
	const [tessZoom, setTessZoom] = useState(INITIAL_TESS_ZOOM);
	const tessZoomRef = useRef(INITIAL_TESS_ZOOM);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	// Selecting a type replaces its whole control set: a parameter vector only means anything relative
	// to the type it belongs to, and so does a per-edge-shape curve list.
	const selectType = useCallback((next: number) => {
		const nextInfo = isohedralType(next);
		if (!nextInfo) return;
		setIh(next);
		setParams([...nextInfo.defaultParams]);
		setEdges(defaultEdgeStates(nextInfo.edgeShapes));
	}, []);

	const resetShape = useCallback(() => {
		setParams([...info.defaultParams]);
		setEdges(defaultEdgeStates(info.edgeShapes));
	}, [info]);

	// Immersive (fullscreen-canvas) mode: collapses the header + sidebar so the tiling fills the window.
	// F toggles it, Esc leaves it, and the hook restores the chrome when this page unmounts.
	const immersive = useImmersive((s) => s.immersive);
	useImmersiveShortcuts();

	// Mirror the selection into the URL without navigating, so a reload and a shared link both land on
	// the same type. Debounced because the type grid is clickable at speed and WebKit disables
	// replaceState after 100 calls in 30s.
	useEffect(() => {
		const id = window.setTimeout(() => {
			const q = ih === DEFAULT_IH ? "" : `?type=IH${String(ih).padStart(2, "0")}`;
			window.history.replaceState(null, "", `${window.location.pathname}${q}`);
		}, 400);
		return () => window.clearTimeout(id);
	}, [ih]);

	// The conformal lens: the same cell seen through a circle inversion, a Möbius map or Kaplan's spiral.
	// It reads the cell through the shared periodic-cell IR, so the tessellated edge curves below reach it
	// unchanged and a bowed J or S edge stays bowed under the map.
	const lens = useConfiguration((s) => s.inversive);
	const setLens = useCallback((v: boolean) => useConfiguration.getState().set({ inversive: v }), []);
	const lensMode = useConfiguration((s) => s.inversiveMode);
	const lensRadiusFrac = useConfiguration((s) => s.inversiveRadiusFrac);
	// The lens takes a marked cell too: it reads the shared periodic-cell IR, and a marked cell is a
	// periodic cell like any other — the marks travel through the conformal map with their tiles.
	const lensActive = lens;
	useInversiveShortcut(true);

	// Under the lens one tile's whole boundary is a single IR primitive, and the shader walks at most
	// MAX_VERTS_PER_PRIM of them before breaking out — past that a ring closes early and both the fill
	// test and the edge distance are computed against a broken outline. A hexagon at the flattener's own
	// ceiling wants 6 x 128 = 768, so the budget is split across the tile's sides instead. The flat
	// renderer has no such limit (it triangulates), so this applies only while the lens owns the canvas.
	const lensSegmentCap = Math.max(
		4,
		Math.floor((MAX_VERTS_PER_PRIM - 8) / Math.max(3, info.numVertices)),
	);
	const cell = useMemo(
		() =>
			info.marked
				? // The marked twelve have straight edges by construction, so there is nothing to flatten and
					// neither the tessellation zoom nor the lens segment cap reaches them. `params[0]` is the
					// rectangles' height-to-width ratio; the nine rigid types ignore it.
					buildMarked(ih, params[0])
				: buildCell({
						ih,
						params,
						curves: curvesOf(edges),
						pxPerWorld: tessZoom,
						...(lensActive ? { maxSegments: lensSegmentCap } : {}),
					}),
		[ih, params, edges, tessZoom, info.marked, lensActive, lensSegmentCap],
	);

	const lensCell = useMemo(
		() => (lensActive && cell ? tilingPeriodicCell({ cellPolygons: cell.polygons, basis: [cell.v1, cell.v2] }) : null),
		[lensActive, cell],
	);
	// Everything that moves the geometry, so the lens re-uploads exactly when it changes: the type, the
	// parameter vector, every edge's shape AND amplitude (Randomize varies the control points, which one
	// number cannot carry), and the tessellation zoom that decides how finely the curves are flattened.
	const lensCellId = useMemo(
		() =>
			lensCell
				? `IH${ih}:${tessZoom}:${params.join(",")}:${edges
						.map((e) => `${e.kind}${e.amount}${e.base ? `@${e.base.a.x},${e.base.a.y},${e.base.b.x},${e.base.b.y}` : ""}`)
						.join("|")}`
				: null,
		[lensCell, ih, tessZoom, params, edges],
	);

	// Re-tessellate when the zoom crosses a power of two. The ref is what keeps this off the hot path:
	// without it every frame of a drag would call setState with the value it already holds.
	const onFrame = useCallback((f: AperiodicFrame) => {
		const q = tessellationZoom(f.zoom * lensMagnification(f, lensActive && lensMode !== "spiral", lensRadiusFrac));
		if (q !== tessZoomRef.current) {
			tessZoomRef.current = q;
			setTessZoom(q);
		}
	}, [lensActive, lensMode, lensRadiusFrac]);

	/**
	 * What counts as "a different thing to look at", as opposed to the same thing deformed.
	 *
	 * Only the type. Picking IH23 after IH21 is a different tiling and should snap home; the vertex and
	 * edge sliders deform the one you are already looking at, and snapping on those would reset the
	 * camera on every tick of a drag, so you could never zoom into an edge and watch what its curvature
	 * does. Canvas aspect is deliberately absent too: a window resize must not throw the reader's view
	 * away, and the hook's own ResizeObserver already rescales the zoom.
	 */
	const { view, lensCamera } = useParametricTilingCanvas({
		canvasRef,
		cell,
		strokeWidth,
		strokeRgb: STROKE_RGB,
		strokeCss: STROKE_CSS,
		framingKey: `${ih}`,
		fallbackMaxRadius: FALLBACK_MAX_RADIUS,
		mounted: true,
		lensActive,
		onFrame,
	});

	const visible = useMemo(
		() =>
			ISOHEDRAL_TYPES.filter(
				(t) => matchesParamFilter(t, paramFilter) && matchesVertexFilter(t, vertexFilter),
			),
		[paramFilter, vertexFilter],
	);

	const typeOptions: SegmentedOption[] = useMemo(
		() =>
			visible.map((t) => ({
				v: String(t.ih),
				label: t.label,
				// A marked type's badge is its induced tile group, which is the marks-per-tile count and the
				// one fact that says why it needs marks at all. Not dimmed any more: it draws.
				sub: t.gs ? t.gs.tileGroup : t.numParams > 0 ? `${t.numParams}p` : "fixed",
				dim: false,
				title: t.gs
					? `${t.label} · marked · ${t.gs.laves} · tile group ${t.gs.tileGroup} (${t.gs.tileGroupOrder} mark${t.gs.tileGroupOrder === 1 ? "" : "s"} per tile) · ${t.gs.wallpaper} · ${t.numAspects} aspect${t.numAspects === 1 ? "" : "s"}`
					: `${t.label} · ${t.numParams} parameter${t.numParams === 1 ? "" : "s"} · ${t.numVertices} tiling vertices · ${t.numAspects} aspect${t.numAspects === 1 ? "" : "s"} · edges ${t.edgeShapes.join("")}`,
			})),
		[visible],
	);

	const header = (
		<div className="ta-wall-cell bg-surface-chrome px-3 py-2.5 flex flex-col gap-1">
			<span className="text-xs font-mono text-fg-secondary">
				{info.label} ·{" "}
				{info.gs
					? `marked · ${info.gs.wallpaper}`
					: `${info.numParams} parameter${info.numParams === 1 ? "" : "s"}`}
			</span>
			<span className="text-[10px] font-mono text-fg-disabled truncate">
				{info.gs
					? `${info.gs.laves} · ${info.gs.tileGroup} · ${info.numAspects} aspect${info.numAspects === 1 ? "" : "s"}`
					: `${info.numVertices} vertices · ${info.numAspects} aspect${info.numAspects === 1 ? "" : "s"} · ${info.edgeShapes.join("")}`}
			</span>
		</div>
	);

	const filters = (
		<>
			<Section label="Parameters" flush>
				<Segmented
					cols={5}
					options={PARAM_FILTERS.map((f) => ({ v: f, label: f }))}
					value={paramFilter}
					onChange={setParamFilter}
				/>
			</Section>
			<Section label="Tiling vertices" flush>
				<Segmented
					cols={5}
					options={VERTEX_FILTERS.map((f) => ({ v: f, label: f }))}
					value={vertexFilter}
					onChange={setVertexFilter}
				/>
			</Section>
		</>
	);

	/**
	 * The facts, for the same floating info panel /play carries over its canvas — not a sidebar block.
	 *
	 * They belong there because they are what the tiling IS, not what you can set: the sidebar states
	 * values you can change, and every row here is read-only output. Putting them in the shared panel
	 * also means one presenter decides how a tiling describes itself across the whole atlas.
	 *
	 * `k` and the orbit counts stay null. Tile orbits is 1 for every isohedral tiling by definition, but
	 * the other three are not derived here, and a section that reports one certainty next to three
	 * blanks reads worse than no section — see hasOrbitFacts.
	 */
	const spec: TilingSpec = useMemo(
		() => ({
			geometry: "euclidean",
			label: info.label,
			// Čtrnáct's ladder describes tilings by REGULAR polygons; this page's tiles are neither.
			level: null,
			// The marked twelve are the only entries on this page that know their own wallpaper group: it
			// is column (5) of G&S Table 1, and marked.ts recomputes it from the constructed geometry and
			// fails the build if it disagrees. Tactile does not expose it for the other 81, which stay null
			// rather than get a guess. The panel turns it into an orbifold signature for free.
			wallpaperGroup: info.gs?.wallpaper ?? null,
			orbifold: null,
			latticeShape: null,
			freedraw: null,
			colors: null,
			pentagon: null,
			isohedral: {
				ih: info.ih,
				numParams: info.numParams,
				numVertices: info.numVertices,
				numAspects: info.numAspects,
				edgeShapes: info.edgeShapes,
				edgeWord: info.edgeWord,
				numColours: info.numColours,
				tilesPerCell: cell?.tilesPerCell ?? 0,
				degenerate: cell?.degenerate ?? false,
				marked: !info.available,
			},
			k: null,
			m: null,
			partition: null,
			edgeOrbits: null,
			faceOrbits: null,
		}),
		[info, cell],
	);

	return (
		<div className="flex-1 min-h-0 flex">
			<IsohedralSidebar
				collapsed={immersive}
				header={header}
				filters={filters}
				types={
					typeOptions.length > 0 ? (
						<Segmented cols={4} options={typeOptions} value={String(ih)} onChange={(v) => selectType(Number(v))} />
					) : (
						// Its own inset: the region around it is unpadded so the grid can reach the edges.
						<p className="px-3 py-2 text-xs text-fg-muted">No type matches both filters.</p>
					)
				}
			>
				{/* Above the sliders, like /pentagons: the picture is what makes an edge slider mean
				    anything, and it has to be visible while you drag one. */}
				{cell ? (
					<Section label="Prototile">
						<PrototileInspector info={info} cell={cell} />
					</Section>
				) : null}

				{info.gs ? (
					<MarkedControls info={info} params={params} setParams={setParams} />
				) : (
					<>
						{info.numParams > 0 ? (
							<Section label="Tiling vertices">
								{params.map((p, i) => (
									<Slider
										key={i}
										id={`ih-param-${i}`}
										label={`v${i}`}
										value={p}
										onChange={(v) =>
											setParams((prev) => prev.map((old, j) => (j === i ? v : old)))
										}
										// Tactile ships defaults but no ranges; [0, 2] is what the reference editor
										// at isohedral.ca uses for every parameter of every type.
										min={0}
										max={2}
										step={0.001}
										format={(v) => v.toFixed(3)}
									/>
								))}
							</Section>
						) : (
							<Section label="Tiling vertices">
								<p className="text-xs text-fg-muted">
									Fixed. This type constrains its vertices completely, so the tile has no freedom
									beyond its edges.
								</p>
							</Section>
						)}

						<Section label="Edges">
							{info.edgeShapes.map((kind, i) => (
								<Slider
									key={i}
									id={`ih-edge-${i}`}
									label={`${String.fromCharCode(97 + i)} · ${kind}`}
									hint={
										<span className="text-[10px] text-fg-muted whitespace-nowrap">
											{EDGE_KIND_NOTE[kind]}
										</span>
									}
									// Scales the edge's shape; it does not replace it. So this round-trips after
									// Randomize, which is the whole reason edge state is a template plus an
									// amplitude — see EdgeShapeState.
									value={edges[i]?.amount ?? 0}
									onChange={(v) => setEdges((prev) => setEdgeAmount(prev, i, v))}
									min={BULGE.min}
									max={BULGE.max}
									step={BULGE.step}
									disabled={kind === "I"}
									format={(v) => (kind === "I" ? "straight" : v.toFixed(2))}
								/>
							))}
							<div className="grid grid-cols-2 gap-px ta-wall ta-wall-dense">
								<button
									type="button"
									onClick={() => setEdges(randomEdgeStates(info.edgeShapes))}
									className="ta-tab ta-wall-cell flex cursor-pointer items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-fg-muted hover:text-fg transition-colors focus:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-fg"
								>
									<Shuffle size={12} />
									Randomize
								</button>
								<button
									type="button"
									onClick={resetShape}
									className="ta-tab ta-wall-cell flex cursor-pointer items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-fg-muted hover:text-fg transition-colors focus:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-fg"
								>
									<RotateCcw size={12} />
									Reset
								</button>
							</div>
						</Section>
					</>
				)}

				{/* No zoom control: the wheel does it, over an unbounded tiling. A slider for it would
				    duplicate the gesture and, because changing the framing refits, would yank the view
				    back to home the moment you touched it. */}
				<Section label="View">
					<Slider
						id="ih-rotation"
						label="Rotation"
						hint={
							<span className="inline-flex items-center gap-1 text-[10px] text-fg-muted whitespace-nowrap">
								<Kbd>Shift</Kbd>
								<span>+ scroll</span>
							</span>
						}
						value={view.rotationDeg}
						onChange={view.setRotation}
						min={0}
						max={359}
						step={1}
						unit="°"
					/>
					<Slider
						id="ih-outlines"
						label="Tile outlines"
						value={strokeWidth}
						onChange={setStrokeWidth}
						min={STROKE_WIDTH.min}
						max={STROKE_WIDTH.max}
						step={STROKE_WIDTH.step}
						format={(v) => (v === 0 ? "off" : `${v} px`)}
					/>
					{/* The lens draws the same cell the flat renderer does, curved edges and all, so a
					    bowed J or S edge stays bowed under the conformal map. Same store fields as
					    /play's, so a mode picked there is the mode here. */}
					<Checkbox
						id="ih-inversive"
						label="Inversive view"
						shortcut="X"
						checked={lens}
						onCheckedChange={(v) => setLens(v)}
					/>
					<Reveal show={lens}>
						<div className="pl-7">
							<InversiveControls />
						</div>
					</Reveal>
				</Section>
			</IsohedralSidebar>

			<div className="flex-1 min-h-0 relative">
				<canvas
					ref={canvasRef}
					className="w-full h-full block cursor-grab active:cursor-grabbing touch-none"
					{...view.handlers}
				/>
				{/* The lens is a second canvas over the first, which stays mounted as the input layer —
				    the same arrangement /play uses, and for the same reason: a canvas holds one WebGL
				    context for its life. */}
				{lensActive ? (
					<InversiveCanvas cell={lensCell} cellId={lensCellId} camera={lensCamera} />
				) : null}
				{/* Same corner, same component as /play's canvas. */}
				<div className="absolute top-4 left-4 z-20">
					<TilingInfo spec={spec} />
				</div>
				{/* Opposite corner, and the only control that stays put while immersive — it is the way back.
				    Shown on a marked type too: those twelve replace the canvas with prose, which reads better
				    across the full window as well. */}
				<FullscreenToggle />
			</div>
		</div>
	);
}

/**
 * The sidebar for one of the twelve marked types: the incidence symbol, the reason marks are needed,
 * and the tile's one remaining degree of freedom where it has one.
 *
 * No edge sliders, because there is nothing to slide. Every edge of these tiles lies on a mirror of the
 * tiling, so every edge is a straight line and the boundary carries no information about the type — the
 * marks carry all of it. That constraint is Kaplan's own account of why Tactile stops at 81, quoted
 * below rather than paraphrased, and it is the reason this panel looks different from the other 81's.
 */
function MarkedControls({
	info,
	params,
	setParams,
}: {
	info: IsohedralTypeInfo;
	params: number[];
	setParams: (next: number[]) => void;
}) {
	const gs = info.gs!;
	const shape = markedType(info.ih);
	const range = shape?.param ?? null;
	const marks = gs.tileGroupOrder;

	return (
		<>
			<Section label="Incidence symbol">
				<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
					<dt className="text-fg-muted">Laves net</dt>
					<dd className="font-mono text-fg-secondary">{gs.laves}</dd>
					<dt className="text-fg-muted">Tile symbol</dt>
					<dd className="font-mono text-fg-secondary">{gs.tileSymbol}</dd>
					<dt className="text-fg-muted">Adjacency</dt>
					<dd className="font-mono text-fg-secondary">{gs.adjacency}</dd>
					<dt className="text-fg-muted">Tile group</dt>
					<dd className="font-mono text-fg-secondary">
						{gs.tileGroup} · order {marks}
					</dd>
					<dt className="text-fg-muted">Group</dt>
					<dd className="font-mono text-fg-secondary">{gs.wallpaper}</dd>
					<dt className="text-fg-muted">Aspects</dt>
					<dd className="font-mono text-fg-secondary tabular-nums">{info.numAspects}</dd>
				</dl>
				<p className="text-[10px] text-fg-disabled leading-relaxed">
					Grünbaum &amp; Shephard 1977, Table 1, columns (2) to (5) and (8). The tile group order,
					the aspect count and the group are recomputed from the drawn geometry and checked against
					the table before this page builds.
				</p>
			</Section>

			<Section label="Marks">
				<p className="text-xs text-fg-secondary leading-relaxed">
					{marks === 1
						? "One mark per tile. This is one of only three types whose induced tile group is trivial, so a single asymmetric motif is the whole decoration."
						: `${marks} marks per tile, one for each element of ${gs.tileGroup}. The mark itself is asymmetric; the rosette is its orbit under the tile group, and that orbit is what has exactly the symmetry the incidence symbol asks for.`}
				</p>
				<p className="text-xs text-fg-secondary leading-relaxed">
					The mark is flat ink, and it carries both facts in its shape: which way it points is the
					rotation, which way it is handed is the reflection. Colour is left to the tile tints, which
					already separate the aspects — and an aspect is an orientation class, so tinting the marks
					too would say the same thing twice in a channel that greyscale and colour blindness lose.
				</p>
				<p className="text-[10px] text-fg-disabled leading-relaxed">{MARKED_REASON} — Craig Kaplan</p>
			</Section>

			<Section label="Tile">
				{range ? (
					<Slider
						id="ih-marked-param"
						label={range.label}
						value={params[0] ?? range.def}
						onChange={(v) => setParams([v])}
						min={range.min}
						max={range.max}
						step={0.005}
						format={(v) => v.toFixed(3)}
					/>
				) : (
					<p className="text-xs text-fg-muted">
						Rigid. Every edge is on a mirror, which fixes the tile up to similarity; only the
						rectangles keep a free ratio.
					</p>
				)}
			</Section>
		</>
	);
}
