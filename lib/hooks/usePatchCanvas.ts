"use client";

// One finite patch of polygons on a canvas, explorable: the drawing half of /aperiodic's patch views
// and of /heesch's coronas, which are the same thing to a renderer (a few hundred to a few hundred
// thousand polygons with a hue each, and no lattice to instance).
//
// Draws through SubRosaGL, the batched WebGL2 renderer: the whole patch is triangulated once into one
// vertex buffer, and pan/zoom/rotate are uniforms. A 2-D fallback stays for canvases with no WebGL2
// context, drawing the same polygons through drawPolygons.
//
// Home framing is ONE rule: fit the whole patch. A finite patch has a ragged boundary and this shows
// it, which is honest for an explorer even though it would be a defect on a slide.

import { useCallback, useEffect, useRef } from "react";
import { TILE_HSL_LIGHT_PCT, TILE_HSL_SAT_01 } from "@/lib/render/tilePalette";
import { applyViewTransform, useAperiodicView, type AperiodicFrame, type HomeBox } from "@/lib/hooks/useAperiodicView";
import { SubRosaGL } from "@/lib/render/subrosaGL";
import { drawPolygons, polygonFillHue, type RawPolygon } from "@/lib/utils/renderTiling";

/** Outline width in CSS px: the slider's range, and the width a view starts at. The default is
 *  /play's `lineWidth`, so "1.5 px" draws the same line on both pages. */
export const STROKE_WIDTH = { min: 0, max: 3, step: 0.25, def: 1.5 } as const;

/** Tile outline colour, as /play draws it: opaque black. It has to stay opaque: the outline pass
 *  (lib/render/subrosaGL.ts) draws one line per polygon side without deduplicating shared sides, so a
 *  semi-transparent stroke would come out darker on every interior edge than on the patch boundary. */
export const STROKE_RGBA: [number, number, number, number] = [0, 0, 0, 1];
export const STROKE_CSS = "#000";

/** Most an outline may take of a tile edge. Beyond this the tiling reads as a grid of lines with
 *  colour in the gaps, which is what a 10,997-rhombus multigrid at 5 px a tile did at a flat 1.5 px. */
const STROKE_MAX_FRACTION = 0.15;

/**
 * The width to actually draw at this zoom, in CSS px. `zoom` is px per world unit, which in every
 * patch view is px per tile edge.
 *
 * The slider's width is what a tile gets once it is big enough to carry it — from ~10 px an edge up.
 * Below that the line is capped to a fraction of the tile, and under ~2 px an edge it is dropped: at
 * that size neighbouring outlines are closer together than the line is wide, so every width paints
 * the same grey wash and the pattern is gone. Zooming in is what shows you the edges.
 */
export function strokePxAt(width: number, zoom: number): number {
	if (width <= 0 || zoom <= 2.2) return 0;
	return Math.min(width, zoom * STROKE_MAX_FRACTION);
}

// The shader's HSL saturation/lightness for the patch fills: the atlas' tile fill — used by drawPolygons
// and so by every thumbnail and card — converted to HSL, since this path is handed saturation and
// lightness as uniforms instead of a colour string. Keeping the GPU path on the SAME numbers is what
// makes the two paths indistinguishable, so they are derived, not copied.
export const PATCH_SAT = TILE_HSL_SAT_01;
export const PATCH_LIGHT = TILE_HSL_LIGHT_PCT;

/**
 * The hue drawPolygons would pick, so the GPU and 2-D paths agree tile for tile: an explicit `hue`
 * when the builder set one, otherwise the by-shape ramp. No patch produces star tiles, so that branch
 * of drawPolygons has no counterpart here.
 */
export const patchHue = (p: RawPolygon) => p.hue ?? polygonFillHue(p.vertices);

export function usePatchCanvas({
	polys,
	strokeWidth,
	subject,
	keepView = false,
	onFrame,
}: {
	polys: RawPolygon[];
	strokeWidth: number;
	/** What is being looked at. A change of subject always snaps home, whatever `keepView` says. */
	subject: string;
	/** Hold pan and zoom when `polys` changes under the same subject, instead of refitting. */
	keepView?: boolean;
	/** Called after each frame is drawn, with the frame: for an overlay that must track the view. */
	onFrame?: (f: AperiodicFrame) => void;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const glRef = useRef<SubRosaGL | null>(null);
	const modeRef = useRef<"init" | "gl" | "2d">("init");
	const uploadedRef = useRef<RawPolygon[] | null>(null);

	const home = useCallback((): HomeBox | null => {
		let minx = Infinity,
			miny = Infinity,
			maxx = -Infinity,
			maxy = -Infinity;
		for (const p of polys)
			for (const v of p.vertices) {
				if (v.x < minx) minx = v.x;
				if (v.x > maxx) maxx = v.x;
				if (v.y < miny) miny = v.y;
				if (v.y > maxy) maxy = v.y;
			}
		if (!Number.isFinite(minx)) return null;
		return {
			cx: (minx + maxx) / 2,
			cy: (miny + maxy) / 2,
			width: maxx - minx,
			height: maxy - miny,
		};
	}, [polys]);

	const draw = useCallback(
		(f: AperiodicFrame) => {
			const cv = canvasRef.current;
			if (!cv) return;
			const strokePx = strokePxAt(strokeWidth, f.zoom);

			if (modeRef.current === "gl" && glRef.current) {
				glRef.current.draw(
					{
						widthCss: f.w,
						heightCss: f.h,
						zoom: f.zoom,
						offsetX: f.offsetX,
						offsetY: f.offsetY,
						rot: f.rot,
						centreX: f.centreX,
						centreY: f.centreY,
						light: PATCH_LIGHT,
						sat: PATCH_SAT,
						strokePx,
						strokeRGBA: STROKE_RGBA,
					},
					f.dpr,
				);
				onFrame?.(f);
				return;
			}

			// 2-D fallback (no WebGL2 context): the same polygons, the same hues.
			const ctx = cv.getContext("2d");
			if (!ctx) return;
			ctx.setTransform(f.dpr, 0, 0, f.dpr, 0, 0);
			ctx.clearRect(0, 0, f.w, f.h);
			ctx.save();
			applyViewTransform(ctx, f);
			ctx.lineJoin = "round";
			drawPolygons(ctx, polys, f.zoom, 0, strokePx, STROKE_CSS);
			ctx.restore();
			onFrame?.(f);
		},
		[polys, strokeWidth, onFrame],
	);

	const view = useAperiodicView({ canvasRef, home, draw });
	const { refit, remeasure, requestDraw } = view;

	// Create the renderer once: a canvas holds one context type for its life, so this decides the path.
	// Declared BEFORE the upload effect so the renderer exists when the first upload runs (effects fire
	// in declaration order, including Strict Mode's re-run) — the same ordering Sub Rosa relies on.
	useEffect(() => {
		const cv = canvasRef.current;
		if (!cv) return;
		const gl = cv.getContext("webgl2", { antialias: true, premultipliedAlpha: false, alpha: true });
		if (gl) {
			try {
				glRef.current = new SubRosaGL(gl);
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
			uploadedRef.current = null;
		};
	}, []);

	// Triangulate and upload whenever the patch changes, then reframe.
	//
	// A NEW SUBJECT always snaps home: holding the view across subjects would leave the reader pointed
	// at wherever the last patch happened to be, which need not even be the same quadrant.
	const subjectRef = useRef<string | null>(null);
	useEffect(() => {
		if (modeRef.current === "gl" && glRef.current && uploadedRef.current !== polys) {
			glRef.current.uploadPolygons(polys, patchHue);
			uploadedRef.current = polys;
		}
		const newSubject = subjectRef.current !== subject;
		subjectRef.current = subject;
		if (newSubject || !keepView) refit();
		else remeasure();
	}, [polys, subject, keepView, refit, remeasure]);
	useEffect(() => {
		requestDraw();
	}, [strokeWidth, requestDraw]);

	return { canvasRef, view };
}
