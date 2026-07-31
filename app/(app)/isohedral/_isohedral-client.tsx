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
// Twelve of the ninety-three are here but cannot be drawn: they need interior markings to break the
// tile's symmetry and have no boundary geometry at all. They are selectable, and selecting one
// replaces the canvas with the reason. That is the whole point of listing all ninety-three instead of
// the eighty-one that render — see lib/isohedral/catalogue.ts.
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
import {
	applyViewTransform,
	useAperiodicView,
	type AperiodicFrame,
	type HomeBox,
} from "@/lib/hooks/useAperiodicView";
import { FlatCellRenderer } from "@/lib/render/flatTilingGL";
import { drawPolygons, expandToViewport, parseBaseCell } from "@/lib/utils/renderTiling";
import { Kbd } from "@/components/ui/kbd";
import { Slider } from "@/components/ui/slider";
import { TilingInfo } from "@/components/tiling-info";
import type { TilingSpec } from "@/lib/services/tilingSpec";
import {
	DEFAULT_IH,
	ISOHEDRAL_TYPES,
	MARKED_REASON,
	MARKED_TYPES,
	isohedralType,
	parseIh,
	type EdgeKind,
	type IsohedralTypeInfo,
} from "@/lib/isohedral/catalogue";
import {
	BULGE,
	buildCell,
	curvesOf,
	defaultEdgeStates,
	randomEdgeStates,
	setEdgeAmount,
	type EdgeShapeState,
} from "@/lib/isohedral/build";
import { IsohedralSidebar, Section, Segmented, type SegmentedOption } from "./_controls";

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

const PARAM_FILTERS = ["any", "0", "1", "2", "3+"] as const;
const VERTEX_FILTERS = ["any", "3", "4", "5", "6"] as const;

function matchesParamFilter(t: IsohedralTypeInfo, f: string): boolean {
	if (f === "any") return true;
	if (f === "3+") return t.available && t.numParams >= 3;
	return t.available && t.numParams === Number(f);
}

function matchesVertexFilter(t: IsohedralTypeInfo, f: string): boolean {
	if (f === "any") return true;
	return t.available && t.numVertices === Number(f);
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
	const glRef = useRef<FlatCellRenderer | null>(null);
	const glContextRef = useRef<WebGL2RenderingContext | null>(null);
	const modeRef = useRef<"init" | "gl" | "2d">("init");
	const uploadedRef = useRef<unknown>(null);

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

	const cell = useMemo(
		() => (info.available ? buildCell({ ih, params, curves: curvesOf(edges), pxPerWorld: tessZoom }) : null),
		[ih, params, edges, tessZoom, info.available],
	);

	// Only the 2-D fallback needs this; parsing once here keeps it off the draw path.
	const fallbackBase = useMemo(
		() => (cell ? parseBaseCell({ p: cell.polygons, b: [cell.v1, cell.v2] }) : null),
		[cell],
	);

	// Sets the starting scale only. The tiling has no edge to frame, so this is a square box and the
	// renderer instances out to whatever the canvas' aspect turns out to be.
	const home = useCallback((): HomeBox | null => cell?.home ?? null, [cell]);

	const draw = useCallback(
		(f: AperiodicFrame) => {
			const cv = canvasRef.current;
			if (!cv) return;

			// Re-tessellate when the zoom crosses a power of two. The ref is what keeps this off the hot
			// path: without it every frame of a drag would call setState with the value it already holds.
			const q = tessellationZoom(f.zoom);
			if (q !== tessZoomRef.current) {
				tessZoomRef.current = q;
				setTessZoom(q);
			}

			if (modeRef.current === "gl" && glRef.current && glContextRef.current) {
				// FlatCellRenderer leaves backing-size and viewport to the caller. useAperiodicView has
				// already resized the backing store to w*dpr, so the viewport just follows it.
				glContextRef.current.viewport(0, 0, cv.width, cv.height);
				glRef.current.draw({
					width: f.w,
					height: f.h,
					// The hook's frame and flatWorldToClip use the same convention — centred CSS px, y
					// down, rotation applied after the y flip — so the offset passes straight through.
					// This holds because home is centred on the origin, making f.centreX/Y zero.
					offset: { x: f.offsetX, y: f.offsetY },
					zoom: f.zoom,
					rotationDeg: (f.rot * 180) / Math.PI,
					lineWidth: strokeWidth,
					showFill: true,
					strokeRGB: STROKE_RGB,
				});
				return;
			}

			const ctx = cv.getContext("2d");
			if (!ctx) return;
			ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
			ctx.clearRect(0, 0, f.w, f.h);
			ctx.save();
			applyViewTransform(ctx, f);
			ctx.lineJoin = "round";
			if (fallbackBase && f.zoom > 0) {
				// Walk the same lattice on the CPU, out to the visible world rect. The √2 covers rotation.
				const halfW = ((f.w / f.zoom) * Math.SQRT2) / 2;
				const halfH = ((f.h / f.zoom) * Math.SQRT2) / 2;
				const world = expandToViewport(
					fallbackBase,
					f.centreX - f.offsetX / f.zoom,
					f.centreY + f.offsetY / f.zoom,
					halfW,
					halfH,
					FALLBACK_MAX_RADIUS,
				);
				drawPolygons(ctx, world, f.zoom, 0, strokeWidth, STROKE_CSS);
			}
			ctx.restore();
		},
		[fallbackBase, strokeWidth],
	);

	// fill: 1, not the hook's 0.86 default. There is no patch boundary to keep clear of the canvas
	// edges — the tiling runs off all four of them — so a margin would only mean less tiling.
	const view = useAperiodicView({ canvasRef, home, draw, fill: 1 });
	const { refit, rehome, requestDraw } = view;

	/**
	 * What counts as "a different thing to look at", as opposed to the same thing deformed.
	 *
	 * Only the type. Picking IH23 after IH21 is a different tiling and should snap home; the vertex and
	 * edge sliders deform the one you are already looking at, and snapping on those would reset the
	 * camera on every tick of a drag, so you could never zoom into an edge and watch what its curvature
	 * does. Canvas aspect is deliberately absent too: a window resize must not throw the reader's view
	 * away, and the hook's own ResizeObserver already rescales the zoom.
	 */
	const framingKey = `${ih}`;
	const lastFramingRef = useRef<string | null>(null);

	// Create the renderer once: a canvas holds one context type for its life, so this decides the path.
	// Declared BEFORE the upload effect so the renderer exists when the first upload runs.
	useEffect(() => {
		const cv = canvasRef.current;
		if (!cv) return;
		const gl = cv.getContext("webgl2", { antialias: true, premultipliedAlpha: false, alpha: true });
		if (gl) {
			try {
				glRef.current = new FlatCellRenderer(gl);
				glContextRef.current = gl;
				modeRef.current = "gl";
			} catch {
				modeRef.current = "2d";
			}
		} else {
			modeRef.current = "2d";
		}
		uploadedRef.current = null;
		return () => {
			glRef.current?.dispose();
			glRef.current = null;
			glContextRef.current = null;
			uploadedRef.current = null;
		};
		// The canvas unmounts when a marked type is selected, so this must re-run when one is picked.
	}, [info.available]);

	useEffect(() => {
		if (modeRef.current === "gl" && glRef.current && cell && uploadedRef.current !== cell.mesh) {
			glRef.current.uploadMesh(cell.mesh);
			uploadedRef.current = cell.mesh;
		}
		if (lastFramingRef.current !== framingKey) {
			lastFramingRef.current = framingKey;
			refit();
		} else {
			rehome();
		}
	}, [cell, framingKey, refit, rehome]);

	useEffect(() => {
		requestDraw();
	}, [strokeWidth, requestDraw]);

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
				sub: t.available ? (t.numParams > 0 ? `${t.numParams}p` : "fixed") : "marked",
				dim: !t.available,
				title: t.available
					? `${t.label} · ${t.numParams} parameter${t.numParams === 1 ? "" : "s"} · ${t.numVertices} tiling vertices · ${t.numAspects} aspect${t.numAspects === 1 ? "" : "s"} · edges ${t.edgeShapes.join("")}`
					: `${t.label} needs interior markings; no boundary geometry exists`,
			})),
		[visible],
	);

	const header = (
		<div className="ta-wall-cell bg-surface-chrome px-3 py-2.5 flex flex-col gap-1">
			<span className="text-xs font-mono text-fg-secondary">
				{info.label} ·{" "}
				{info.available
					? `${info.numParams} parameter${info.numParams === 1 ? "" : "s"}`
					: "marked type"}
			</span>
			<span className="text-[10px] font-mono text-fg-disabled truncate">
				{info.available
					? `${info.numVertices} vertices · ${info.numAspects} aspect${info.numAspects === 1 ? "" : "s"} · ${info.edgeShapes.join("")}`
					: "no boundary geometry"}
			</span>
		</div>
	);

	const filters = (
		<>
			<Section label="Parameters">
				<Segmented
					cols={5}
					options={PARAM_FILTERS.map((f) => ({ v: f, label: f }))}
					value={paramFilter}
					onChange={setParamFilter}
				/>
			</Section>
			<Section label="Tiling vertices">
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
			wallpaperGroup: null,
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
				header={header}
				filters={filters}
				types={
					typeOptions.length > 0 ? (
						<Segmented cols={4} options={typeOptions} value={String(ih)} onChange={(v) => selectType(Number(v))} />
					) : (
						<p className="text-xs text-fg-muted">No type matches both filters.</p>
					)
				}
			>
				{info.available ? (
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
						</Section>
					</>
				) : null}

			</IsohedralSidebar>

			<div className="flex-1 min-h-0 relative">
				{info.available ? (
					<canvas
						ref={canvasRef}
						className="w-full h-full block cursor-grab active:cursor-grabbing touch-none"
						{...view.handlers}
					/>
				) : (
					<MarkedTypeNote info={info} />
				)}
				{/* Same corner, same component as /play's canvas. */}
				<div className="absolute top-4 left-4 z-20">
					<TilingInfo spec={spec} />
				</div>
			</div>
		</div>
	);
}

/**
 * What stands in for the canvas on the twelve types with no boundary geometry. It quotes Kaplan
 * verbatim and names the source, because the claim is the whole reason those twelve are listed at all
 * and a paraphrase would invite the reader to assume we simply ran out of data.
 */
function MarkedTypeNote({ info }: { info: IsohedralTypeInfo }) {
	return (
		<div className="h-full overflow-y-auto flex items-center justify-center p-8">
			<div className="max-w-prose flex flex-col gap-4">
				<h2 className="text-base font-semibold text-fg">{info.label} needs interior markings</h2>
				<p className="text-sm text-fg-secondary leading-relaxed">
					Twelve of the ninety-three isohedral types cannot be expressed by the tile boundary
					alone. Craig Kaplan puts it this way:
				</p>
				<blockquote className="border-l-2 border-line pl-4 text-sm text-fg-secondary leading-relaxed italic">
					{MARKED_REASON}
				</blockquote>
				<p className="text-sm text-fg-secondary leading-relaxed">
					Grünbaum and Shephard reach these twelve only by decorating the tile&apos;s interior to
					cut its symmetry back down. Which is why their 1977 paper is titled{" "}
					<em>The eighty-one types of isohedral tilings in the plane</em>: the count of ninety-three
					belongs to the marked enumeration. The other eighty-one are all here and all live.
				</p>
				<p className="text-xs text-fg-muted leading-relaxed">
					The twelve:{" "}
					<span className="font-mono tabular-nums">
						{MARKED_TYPES.map((n) => `IH${String(n).padStart(2, "0")}`).join(", ")}
					</span>
				</p>
			</div>
		</div>
	);
}
