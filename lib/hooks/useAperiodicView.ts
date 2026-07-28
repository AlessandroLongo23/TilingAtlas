"use client";

// Pan / rotate / zoom for the aperiodic canvases (/aperiodic), on the same interaction model as the
// periodic flat views: drag to pan, wheel to zoom toward the cursor, Shift+wheel to rotate in
// detents, right-click to snap home, everything easing toward its target on a rAF loop. The state and
// the feel constants are the shared ones in lib/render/viewControls.ts, so a turn or a wheel notch
// means the same thing here as on /play and on the theory cards.
//
// The transform is flatTilingGL's, with the world centre subtracted:
//
//     screen_centred = offset + zoom · R'(θ) · (p − centre),   R'(θ)·(x,y) = (c·x + s·y, s·x − c·y)
//
// R' is rotation composed with the y-flip (world y up, screen y down). It is its own inverse — a
// reflection — which is why `viewToWorld` below runs the same formula in both directions. Subtracting
// `centre` rather than folding it into the offset keeps home at offset = 0, so resetCardControls
// works unchanged and an unpanned view spins about the patch rather than about a stale origin.
//
// Why not the shared ZOOM_MIN/ZOOM_MAX: those are px per tile EDGE, and every aperiodic view measures
// its world differently (a Sub Rosa patch at depth 3 spans hundreds of edges, the hat's window
// eighteen). Each view fits its own home zoom and the wheel range is taken relative to that.

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import {
	accumulateDetents,
	makeCardControls,
	resetCardControls,
	ROTATE_SNAP_DEG,
	stepCardControls,
	wheelDeltaPx,
	wrap360,
	zoomAtPoint,
	type CardControls,
} from "@/lib/render/viewControls";

/** How far the wheel may travel either side of a view's fitted home zoom. */
export const ZOOM_OUT_FACTOR = 8; // home / 8 — far enough to see a whole patch shrink to texture
export const ZOOM_IN_FACTOR = 400; // home × 400 — far enough to read a single tile's edges

/** The view state one frame of drawing needs. Offsets are centred CSS px, y down; `rot` radians. */
export interface AperiodicFrame {
	w: number;
	h: number;
	dpr: number;
	zoom: number;
	offsetX: number;
	offsetY: number;
	rot: number;
	centreX: number;
	centreY: number;
}

/** The world box a view wants framed at home: centre plus the span to fit. Always contain-fitted. */
export interface HomeBox {
	cx: number;
	cy: number;
	width: number;
	height: number;
}

/** Apply the frame to a 2-D context, leaving it in world coordinates (y up). Caller saves/restores. */
export function applyViewTransform(ctx: CanvasRenderingContext2D, f: AperiodicFrame): void {
	ctx.translate(f.w / 2 + f.offsetX, f.h / 2 + f.offsetY);
	ctx.rotate(f.rot);
	ctx.scale(f.zoom, -f.zoom);
	ctx.translate(-f.centreX, -f.centreY);
}

/** Screen CSS px (canvas top-left origin) → world. R' is an involution, so this is the same map out. */
export function viewToWorld(f: AperiodicFrame, sx: number, sy: number): { x: number; y: number } {
	const ux = (sx - f.w / 2 - f.offsetX) / f.zoom;
	const uy = (sy - f.h / 2 - f.offsetY) / f.zoom;
	const c = Math.cos(f.rot), s = Math.sin(f.rot);
	return { x: f.centreX + c * ux + s * uy, y: f.centreY + s * ux - c * uy };
}

export interface AperiodicViewOptions {
	canvasRef: RefObject<HTMLCanvasElement | null>;
	/** The world box to frame at home. Re-read on every refit(); return null while nothing is ready. */
	home: () => HomeBox | null;
	/** Fraction of the canvas the home box should occupy. */
	fill?: number;
	/** Draw one frame. Called on the rAF loop only while something is moving or a redraw was asked for. */
	draw: (f: AperiodicFrame) => void;
	/** Pointer moved with no button down, in CSS px relative to the canvas — for hover picking. */
	onHover?: (sx: number, sy: number, f: AperiodicFrame) => void;
	/** Pointer left the canvas. */
	onHoverEnd?: () => void;
}

export interface AperiodicView {
	/** Spread onto the canvas element. Wheel is attached separately (it must be non-passive). */
	handlers: {
		onPointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
		onPointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
		onPointerUp: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
		onPointerLeave: (e: ReactPointerEvent<HTMLCanvasElement>) => void;
		onContextMenu: (e: React.MouseEvent) => void;
	};
	/** Re-read home() and snap the view to it. Call when the drawn geometry changes. */
	refit: () => void;
	/** Ease back to home (what right-click does). */
	resetView: () => void;
	/** Ask for one more frame — theme flips, a toggled option, anything not driven by the controls. */
	requestDraw: () => void;
	/** The frame last drawn, for code outside the draw callback (overlays, picking). */
	frameRef: RefObject<AperiodicFrame>;
	/**
	 * The view angle the controls are easing TOWARD, in whole degrees — the sidebar slider's value, and
	 * the only piece of view state that re-renders React. The target rather than the live angle so a
	 * slider drag doesn't fight the easing: a controlled input fed the live value would lag the pointer
	 * by however long the ease takes and stutter under the cursor.
	 */
	rotationDeg: number;
	/** Turn the view to `deg` (0–360), easing as a Shift+scroll detent does. */
	setRotation: (deg: number) => void;
}

export function useAperiodicView({
	canvasRef,
	home,
	fill = 0.86,
	draw,
	onHover,
	onHoverEnd,
}: AperiodicViewOptions): AperiodicView {
	const controlsRef = useRef<CardControls>(makeCardControls(1));
	const homeZoomRef = useRef(1);
	const centreRef = useRef({ x: 0, y: 0 });
	const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);
	const dirtyRef = useRef(true);
	const frameRef = useRef<AperiodicFrame>({
		w: 0, h: 0, dpr: 1, zoom: 1, offsetX: 0, offsetY: 0, rot: 0, centreX: 0, centreY: 0,
	});
	const [rotationDeg, setRotationDeg] = useState(0);

	// Latest callbacks without re-running the rAF/wheel effects (they mount once). Written in an
	// effect, not during render: effects commit before the next animation frame, so the loop never
	// reads a stale callback, and React's ref rules stay satisfied.
	const cbRef = useRef({ home, draw, onHover, onHoverEnd });
	useEffect(() => {
		cbRef.current = { home, draw, onHover, onHoverEnd };
	}, [home, draw, onHover, onHoverEnd]);

	const zoomBounds = useCallback(
		() => ({ min: homeZoomRef.current / ZOOM_OUT_FACTOR, max: homeZoomRef.current * ZOOM_IN_FACTOR }),
		[],
	);

	const requestDraw = useCallback(() => {
		dirtyRef.current = true;
	}, []);

	// Measure the canvas and recompute the home zoom from the current home box. Returns false if the
	// canvas has no size yet (first frame before layout) or the view has nothing to frame.
	const measureHome = useCallback((): boolean => {
		const cv = canvasRef.current;
		if (!cv) return false;
		const w = cv.clientWidth, h = cv.clientHeight;
		if (w <= 0 || h <= 0) return false;
		const box = cbRef.current.home();
		if (!box) return false;
		const bw = box.width || 1, bh = box.height || 1;
		homeZoomRef.current = fill * Math.min(w / bw, h / bh);
		centreRef.current = { x: box.cx, y: box.cy };
		return true;
	}, [canvasRef, fill]);

	const refit = useCallback(() => {
		if (!measureHome()) return;
		const c = controlsRef.current;
		// Snap, don't ease: a refit follows new geometry, and easing from the previous patch's scale
		// reads as a lurch rather than a transition.
		c.zoom = c.targetZoom = homeZoomRef.current;
		c.offset.x = c.offset.y = c.targetOffset.x = c.targetOffset.y = 0;
		c.rotation = c.targetRotation = 0;
		c.prevRotation = 0;
		c.scrollAccum = 0;
		dirtyRef.current = true;
	}, [measureHome]);

	// The slider's setter. Wraps like the wheel path so 355 + a detent and "355" from the slider land on
	// the same target, and publishes the value straight away rather than waiting for the next frame.
	const setRotation = useCallback((deg: number) => {
		const c = controlsRef.current;
		c.targetRotation = wrap360(deg);
		c.scrollAccum = 0; // a fresh angle, not a continuation of a half-finished wheel detent
		dirtyRef.current = true;
		setRotationDeg(Math.round(c.targetRotation));
	}, []);

	const resetView = useCallback(() => {
		measureHome(); // the canvas may have been resized since the last fit
		resetCardControls(controlsRef.current, homeZoomRef.current, zoomBounds());
		dirtyRef.current = true;
	}, [measureHome, zoomBounds]);

	// The frame loop. Steps the eased controls, publishes the frame, and draws when anything moved.
	useEffect(() => {
		let raf = 0;
		let lastDeg = -1;
		const tick = () => {
			raf = requestAnimationFrame(tick);
			const cv = canvasRef.current;
			if (!cv) return;
			const c = controlsRef.current;
			const moving = stepCardControls(c);
			if (!moving && !dirtyRef.current) return;
			dirtyRef.current = false;

			const dpr = window.devicePixelRatio || 1;
			const w = cv.clientWidth, h = cv.clientHeight;
			if (w <= 0 || h <= 0) return;
			if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
				cv.width = Math.round(w * dpr);
				cv.height = Math.round(h * dpr);
			}
			const f = frameRef.current;
			f.w = w; f.h = h; f.dpr = dpr;
			f.zoom = c.zoom;
			f.offsetX = c.offset.x; f.offsetY = c.offset.y;
			f.rot = (c.rotation * Math.PI) / 180;
			f.centreX = centreRef.current.x; f.centreY = centreRef.current.y;
			cbRef.current.draw(f);

			// Slider value + readout — round first so a spin re-renders React ~24 times, not every frame.
			const deg = Math.round(wrap360(c.targetRotation));
			if (deg !== lastDeg) {
				lastDeg = deg;
				setRotationDeg(deg);
			}
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [canvasRef]);

	// Refit on resize: the home zoom is a function of the canvas size, so a resized panel that kept its
	// old zoom would sit at the wrong scale. Only the zoom is re-derived; pan and angle are the user's.
	useEffect(() => {
		const cv = canvasRef.current;
		if (!cv) return;
		const ro = new ResizeObserver(() => {
			const before = homeZoomRef.current;
			if (!measureHome()) return;
			const c = controlsRef.current;
			if (before > 0) {
				const k = homeZoomRef.current / before;
				c.zoom *= k;
				c.targetZoom *= k;
			}
			dirtyRef.current = true;
		});
		ro.observe(cv);
		return () => ro.disconnect();
	}, [canvasRef, measureHome]);

	// Wheel must be a non-passive DOM listener so it can block the page scroll.
	useEffect(() => {
		const cv = canvasRef.current;
		if (!cv) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const c = controlsRef.current;
			if (e.shiftKey) {
				const { steps, accum } = accumulateDetents(c.scrollAccum, wheelDeltaPx(e));
				c.scrollAccum = accum;
				if (steps !== 0) c.targetRotation = wrap360(c.targetRotation + steps * ROTATE_SNAP_DEG);
				return;
			}
			const rect = cv.getBoundingClientRect();
			const mouse = { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 };
			const { zoom, offset } = zoomAtPoint(mouse, c.targetOffset, c.targetZoom, wheelDeltaPx(e), zoomBounds());
			c.targetZoom = zoom;
			c.targetOffset = offset;
		};
		cv.addEventListener("wheel", onWheel, { passive: false });
		return () => cv.removeEventListener("wheel", onWheel);
	}, [canvasRef, zoomBounds]);

	const handlers = {
		onPointerDown: (e: ReactPointerEvent<HTMLCanvasElement>) => {
			if (e.button === 2) {
				resetView();
				return;
			}
			if (e.button !== 0) return;
			dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
			e.currentTarget.setPointerCapture(e.pointerId);
		},
		onPointerMove: (e: ReactPointerEvent<HTMLCanvasElement>) => {
			const drag = dragRef.current;
			if (drag && drag.id === e.pointerId) {
				// The target follows the pointer 1:1 and the eased offset glides after it, as on /play.
				// No un-rotation: the offset lives in the same unrotated screen frame the transform adds
				// it in, so a drag moves the pattern with the cursor at any view angle.
				const c = controlsRef.current;
				c.targetOffset.x += e.clientX - drag.x;
				c.targetOffset.y += e.clientY - drag.y;
				drag.x = e.clientX;
				drag.y = e.clientY;
				return;
			}
			const hover = cbRef.current.onHover;
			if (!hover) return;
			const rect = e.currentTarget.getBoundingClientRect();
			hover(e.clientX - rect.left, e.clientY - rect.top, frameRef.current);
		},
		onPointerUp: (e: ReactPointerEvent<HTMLCanvasElement>) => {
			if (dragRef.current?.id === e.pointerId) dragRef.current = null;
		},
		onPointerLeave: () => {
			dragRef.current = null;
			cbRef.current.onHoverEnd?.();
		},
		onContextMenu: (e: React.MouseEvent) => e.preventDefault(), // right-click resets, not a menu
	};

	return { handlers, refit, resetView, requestDraw, frameRef, rotationDeg, setRotation };
}
