"use client";

// The canvas every PARAMETRIC tiling shelf draws on: /isohedral, /pentagons, and whatever family
// arrives next.
//
// WHY THIS EXISTS. Those pages are two different subjects — Grünbaum and Shephard's ninety-three
// isohedral types, and the fifteen convex pentagons — but from the canvas down they are one thing.
// Both build a translational cell whose tiles move when a slider moves, both instance it with
// FlatCellRenderer, both fall back to the same CPU lattice walk where WebGL2 is missing, and both drive
// it with useAperiodicView. That plumbing was duplicated line for line in the two clients, and adding
// the conformal lens would have made it three copies in each. It is written once here instead.
//
// WHAT STAYS WITH THE PAGE. Everything above the cell: which family, its parameter sliders, its
// prototile inspector, and what counts as "a different tiling" for the purposes of snapping the camera
// home (`framingKey`). The hook takes the finished cell and the camera policy, and returns the ref to
// hang on a <canvas> plus the view object the page's rotation slider and pointer handlers need.
//
// THE LENS. When it is on, the flat pass is skipped and the canvas cleared: the lens is a SECOND canvas
// the page overlays (components/inversive-canvas.tsx), the same arrangement /play uses, because a
// canvas holds one WebGL context for its life and the two renderers set up their vertex state at
// different times. `lensCamera` is what connects the two — the page's own camera, read once per frame
// in the lens' render loop.

import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import {
	applyViewTransform,
	useAperiodicView,
	type AperiodicFrame,
	type AperiodicView,
	type HomeBox,
} from "@/lib/hooks/useAperiodicView";
import type { CellMesh } from "@/lib/render/buildCellMesh";
import { FlatCellRenderer } from "@/lib/render/flatTilingGL";
import { drawPolygons, expandToViewport, parseBaseCell, type RawPolygon } from "@/lib/utils/renderTiling";
import type { LensCamera } from "@/components/inversive-canvas";

/** The part of a built cell this canvas needs. `IsohedralCell` and `PentagonCell` both satisfy it
 *  structurally, which is the point of the shape — neither had to change to be drawn here. */
export interface ParametricCell {
	polygons: RawPolygon[];
	mesh: CellMesh;
	v1: [number, number];
	v2: [number, number];
	home: HomeBox;
}

export interface ParametricTilingCanvasOptions {
	/** The <canvas> to draw on. Owned by the page, like useAperiodicView's, because the page decides
	 *  whether to render one at all — the isohedral shelf swaps it for prose on its marked types. */
	canvasRef: RefObject<HTMLCanvasElement | null>;
	/** Null blanks the canvas — a family with no drawable geometry at this point. */
	cell: ParametricCell | null;
	/** Tile outline width in CSS px, as /play's `lineWidth` means it. 0 is off. */
	strokeWidth: number;
	/** Stroke colour, 0..1 per channel, for the GL pass. */
	strokeRgb: [number, number, number];
	/** The same colour as a CSS string, for the 2-D fallback. */
	strokeCss: string;
	/**
	 * What counts as "a different thing to look at", as opposed to the same thing deformed.
	 *
	 * A change snaps the camera home; anything else rehomes without moving it. This is the whole reason
	 * the pages can be zoomed into one vertex while a parameter slider is dragged — snapping on every
	 * tick would throw that view away before it could be read.
	 */
	framingKey: string;
	/** How far past the viewport the CPU fallback replicates before giving up. */
	fallbackMaxRadius: number;
	/** False while the page shows something other than a canvas, so the GL context is rebuilt when the
	 *  canvas returns. The isohedral shelf needs it: its twelve marked types replace the canvas with prose. */
	mounted?: boolean;
	/** True while the conformal lens owns the view: the flat pass is skipped and the canvas cleared. */
	lensActive?: boolean;
	/** Runs at the top of every frame, before anything is drawn. The isohedral shelf re-tessellates its
	 *  edge curves from here when the zoom crosses a power of two. */
	onFrame?: (f: AperiodicFrame) => void;
}

export interface ParametricTilingCanvas {
	view: AperiodicView;
	/** Hand to `InversiveCanvas`' `camera` prop. Returns null before the first frame is measured. */
	lensCamera: () => LensCamera | null;
}

export function useParametricTilingCanvas({
	canvasRef,
	cell,
	strokeWidth,
	strokeRgb,
	strokeCss,
	framingKey,
	fallbackMaxRadius,
	mounted = true,
	lensActive = false,
	onFrame,
}: ParametricTilingCanvasOptions): ParametricTilingCanvas {
	const glRef = useRef<FlatCellRenderer | null>(null);
	const glContextRef = useRef<WebGL2RenderingContext | null>(null);
	const modeRef = useRef<"init" | "gl" | "2d">("init");
	const uploadedRef = useRef<CellMesh | null>(null);
	const lastFramingRef = useRef<string | null>(null);

	// Live inputs the draw loop reads without re-subscribing. Written in an effect, not during render —
	// the same rule useAperiodicView follows for the same reason: every reader here runs after commit
	// (the RAF draw, and the lens' own loop), so the one-render lag is unobservable.
	const strokeRef = useRef(strokeWidth);
	const lensRef = useRef(lensActive);
	const onFrameRef = useRef(onFrame);
	useEffect(() => {
		strokeRef.current = strokeWidth;
		lensRef.current = lensActive;
		onFrameRef.current = onFrame;
	}, [strokeWidth, lensActive, onFrame]);

	// Only the 2-D fallback needs this; parsing once here keeps it off the draw path.
	const fallbackBase = useMemo(
		() => (cell ? parseBaseCell({ p: cell.polygons, b: [cell.v1, cell.v2] }) : null),
		[cell],
	);

	// Sets the starting scale only. These tilings have no edge to frame, so the box is square and the
	// renderer instances out to whatever the canvas' aspect turns out to be.
	const home = useCallback((): HomeBox | null => cell?.home ?? null, [cell]);

	const draw = useCallback((f: AperiodicFrame) => {
		const cv = canvasRef.current;
		if (!cv) return;
		onFrameRef.current?.(f);

		// The lens owns the picture: leave the canvas empty under it instead of paying for a flat pass
		// nothing will see.
		if (lensRef.current) {
			const ctx2 = glContextRef.current;
			if (ctx2) {
				ctx2.viewport(0, 0, cv.width, cv.height);
				ctx2.clearColor(0, 0, 0, 0);
				ctx2.clear(ctx2.COLOR_BUFFER_BIT);
			} else {
				cv.getContext("2d")?.clearRect(0, 0, cv.width, cv.height);
			}
			return;
		}

		if (modeRef.current === "gl" && glRef.current && glContextRef.current) {
			// FlatCellRenderer leaves backing-size and viewport to the caller. useAperiodicView has
			// already resized the backing store to w*dpr, so the viewport just follows it.
			glContextRef.current.viewport(0, 0, cv.width, cv.height);
			glRef.current.draw({
				width: f.w,
				height: f.h,
				// The hook's frame and flatWorldToClip share a convention (centred CSS px, y down,
				// rotation after the y flip) so the offset passes straight through. That holds because
				// home is centred on the origin, making f.centreX/Y zero.
				offset: { x: f.offsetX, y: f.offsetY },
				zoom: f.zoom,
				rotationDeg: (f.rot * 180) / Math.PI,
				lineWidth: strokeRef.current,
				showFill: true,
				strokeRGB: strokeRgb,
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
				fallbackMaxRadius,
			);
			drawPolygons(ctx, world, f.zoom, 0, strokeRef.current, strokeCss);
		}
		ctx.restore();
	}, [canvasRef, fallbackBase, strokeRgb, strokeCss, fallbackMaxRadius]);

	// fill: 1, not the hook's 0.86 default. There is no patch boundary to keep clear of the canvas
	// edges — the tiling runs off all four of them — so a margin would only mean less tiling.
	const view = useAperiodicView({ canvasRef, home, draw, fill: 1 });
	const { refit, rehome, requestDraw } = view;

	// Create the renderer once: a canvas holds one context type for its life, so this decides the path.
	// Declared BEFORE the upload effect so the renderer exists when the first upload runs (effects fire
	// in declaration order, including Strict Mode's re-run).
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
	}, [canvasRef, mounted]);

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

	// Anything that changes the picture without changing the cell asks for a repaint.
	useEffect(() => {
		requestDraw();
	}, [strokeWidth, lensActive, requestDraw]);

	const { frameRef } = view;
	const lensCamera = useCallback((): LensCamera | null => {
		const f = frameRef.current;
		if (!f || f.w <= 0) return null;
		return {
			offset: { x: f.offsetX, y: f.offsetY },
			zoom: f.zoom,
			rotationDeg: (f.rot * 180) / Math.PI,
			lineWidth: strokeRef.current,
		};
	}, [frameRef]);

	return { view, lensCamera };
}
