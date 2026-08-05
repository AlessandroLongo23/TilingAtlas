"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyseFaces } from "@/lib/freedraw/faces";
import type { FreedrawPattern } from "@/lib/freedraw/pattern";
import {
	DEFAULT_STYLE,
	drawFreedraw,
	fitView,
	type FreedrawStyle,
	type FreedrawView,
} from "@/lib/freedraw/render";
import { useEasedRotation } from "@/lib/hooks/useEasedRotation";
import {
	accumulateDetents,
	makeCardControls,
	resetCardControls,
	ROTATE_SNAP_DEG,
	stepCardControls,
	unrotateScreen,
	wheelDeltaPx,
	wrap360,
	zoomAtPoint,
	type CardControls,
} from "@/lib/render/viewControls";
import { cn } from "@/lib/utils/cn";

// Zoom bounds are deliberately NOT the ones in lib/render/viewControls.ts. There a world unit is a
// tile edge; here it is one grid cell, and reading a freedraw pattern means seeing tens of cells at
// once, so the floor has to be much lower than ZOOM_MIN's 20 px/unit.
const ZOOM_MIN = 5;
const ZOOM_MAX = 160;
const ZOOM_BOUNDS = { min: ZOOM_MIN, max: ZOOM_MAX };

// The view is a CardControls — the same state, the same easing and the same zoom-toward-the-cursor
// arithmetic /play, the theory cards and the aperiodic canvases run on (lib/render/viewControls.ts,
// covered by tests/view-controls.test.ts). It used to set `scale` straight from the wheel handler,
// which is why zooming here jumped while every other view in the atlas glided.
//
// CardControls speaks zoom + a centred screen offset; this renderer speaks a world centre + a scale.
// They are the same view written two ways, so the draw derives one from the other:
//
//     scale = zoom      cx = -offset.x / zoom      cy = +offset.y / zoom
//
// (cy flips because the renderer's world y grows upward and the offset's does not.)
const viewOf = (c: CardControls): FreedrawView => ({
	cx: -c.offset.x / c.zoom,
	cy: c.offset.y / c.zoom,
	scale: c.zoom,
});

/** Track the `dark` class the ThemeToggle writes onto <html>. */
export function useIsDark(): boolean {
	const [dark, setDark] = useState(false);
	useEffect(() => {
		const root = document.documentElement;
		const read = () => setDark(root.classList.contains("dark"));
		read();
		const obs = new MutationObserver(read);
		obs.observe(root, { attributes: true, attributeFilter: ["class"] });
		return () => obs.disconnect();
	}, []);
	return dark;
}

interface Props {
	pattern: FreedrawPattern;
	style?: Omit<FreedrawStyle, "dark">;
	/** Grid cells across the shorter side at the default zoom. */
	cells?: number;
	/** Pan with drag, zoom with the wheel. Off for gallery thumbnails. */
	interactive?: boolean;
	/**
	 * View rotation about the canvas centre, DEGREES — the /play Rotation slider's value. The live angle
	 * eases toward it, so a slider drag and a wheel detent both glide.
	 */
	rotation?: number;
	/**
	 * Called with the new target angle when Shift+scroll spins the view (5° detents, as everywhere else).
	 * Omit and the gesture is off — a canvas whose rotation nobody owns can't move it.
	 */
	onRotationChange?: (deg: number) => void;
	classes?: string;
}

export function FreedrawCanvas({
	pattern,
	style = DEFAULT_STYLE,
	cells = 12,
	interactive = false,
	rotation = 0,
	onRotationChange,
	classes,
}: Props) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [size, setSize] = useState({ w: 0, h: 0 });
	// The live view. A ref, not state: it changes every eased frame, and routing that through React
	// would re-render the whole canvas sixty times a second to produce one draw call.
	const controlsRef = useRef<CardControls>(makeCardControls(0));
	const homeZoomRef = useRef(0);
	// Set when a target moves, so the frame loop below knows to run even though nothing eased yet.
	const dirtyRef = useRef(false);
	const dark = useIsDark();
	const analysis = useMemo(() => analyseFaces(pattern), [pattern]);
	// Pointer in WORLD (grid) coordinates, for the orbit-dot hover. A ref, not state: it changes on every
	// pointermove and the frame loop below reads it — routing it through React would re-render the whole
	// component per mouse pixel for a value only the canvas consumes.
	const hoverRef = useRef<{ x: number; y: number } | null>(null);
	// Per-orbit hover-grow scales, eased toward their targets inside drawFreedraw. Owned here so the ease
	// survives across frames; a fresh array each draw would restart the growth every time.
	const orbitScalesRef = useRef<number[]>([]);
	// The element's live CSS box, and the latest draw. `draw` reads the REF, not the state: the observer
	// below redraws through it the moment the box changes, so a resize lands in the same frame the browser
	// paints the new box. Going through state alone put the redraw a render late and the browser rescaled
	// the old bitmap into the new box — the tiling stretched, then snapped back (see lib/render/canvasSize.ts).
	const boxRef = useRef({ w: 0, h: 0 });
	const drawRef = useRef<() => void>(() => {});
	// View rotation. The live angle eases toward the prop in a ref, and useEasedRotation owns the frame
	// loop that carries it there (redrawing through drawRef). Every pointer handler below reads the angle
	// back as radians to undo the turn, since input arrives in the rotated frame while the pan/zoom/hover
	// maths all live in the upright one.
	const rotRef = useEasedRotation(rotation, drawRef);
	const radNow = useCallback(() => (rotRef.current * Math.PI) / 180, [rotRef]);
	// Sub-detent scroll remainder, carried between wheel events so a spin tracks total scroll distance
	// and not the wheel-event count (a trackpad fires dozens per gesture).
	const scrollAccumRef = useRef(0);

	// Track the element's CSS size; the canvas backing store is sized from it times the DPR.
	useEffect(() => {
		const el = canvasRef.current;
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => {
			const r = entry.contentRect;
			const box = { w: Math.round(r.width), h: Math.round(r.height) };
			boxRef.current = box;
			drawRef.current(); // repaint at the new size now; the re-fit below follows on the next render
			setSize(box);
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	// Re-fit whenever the pattern changes or the element is first measured. This one SNAPS (live and
	// target together): a new pattern arriving at the old zoom and gliding to its own would read as the
	// canvas lurching on every ←/→ step. Double-click is the eased one, below.
	useEffect(() => {
		if (size.w <= 0 || size.h <= 0) return;
		const home = fitView(size.w, size.h, cells).scale;
		homeZoomRef.current = home;
		const c = controlsRef.current;
		c.zoom = c.targetZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, home));
		c.offset.x = c.offset.y = c.targetOffset.x = c.targetOffset.y = 0;
		dirtyRef.current = true;
		// Draw it here, not through the effect below: `draw` no longer closes over the view (it reads the
		// ref), so its identity does not change when the fit does — and a NON-interactive canvas has no
		// frame loop to notice `dirty`. Thumbnails would stay blank without this line.
		drawRef.current();
	}, [pattern.id, size.w, size.h, cells]);

	const draw = useCallback(() => {
		const el = canvasRef.current;
		const { w: cw, h: ch } = boxRef.current;
		if (!el || homeZoomRef.current <= 0 || cw === 0 || ch === 0) return;
		const dpr = window.devicePixelRatio || 1;
		// Only resize when it actually changed — assigning width/height clears the backing store, so doing
		// it every frame would flash the canvas empty under the hover loop below.
		const w = Math.round(cw * dpr);
		const h = Math.round(ch * dpr);
		if (el.width !== w || el.height !== h) {
			el.width = w;
			el.height = h;
		}
		const ctx = el.getContext("2d");
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		drawFreedraw(
			ctx,
			cw,
			ch,
			pattern,
			// The live angle is injected per draw, not stored in the controls, so a refit (double-click,
			// a new pattern) can rebuild the view without touching the rotation.
			{ ...viewOf(controlsRef.current), rot: radNow() },
			{ ...style, dark },
			analysis,
			hoverRef.current,
			orbitScalesRef.current,
		);
	}, [pattern, style, dark, analysis, radNow]);
	drawRef.current = draw;

	useEffect(() => {
		draw();
	}, [draw]);

	// One frame loop for both things that move between renders: the view easing toward its target
	// (stepCardControls reports when it has arrived) and the orbit-dot hover growth, which eases over
	// several frames and would freeze the moment the cursor stopped if it only redrew on pointermove.
	//
	// It runs while EITHER is live, and stops when both settle, so a settled canvas costs nothing and a
	// gallery of 166 static thumbnails never enters it at all. (A view mid-TURN has its own loop inside
	// useEasedRotation, for the same reason and with the same shared constants.)
	const hoverAnimates = interactive && style.showVertices;
	useEffect(() => {
		if (!interactive) return;
		let raf = 0;
		const tick = () => {
			// pivotOffsetOnRotate = false: this renderer turns the whole context about the canvas centre,
			// so the world point at the centre is already fixed under a spin. Rotating the offset too
			// would double-count it and drift the pattern sideways as the angle eased.
			const moving = stepCardControls(controlsRef.current, false);
			if (moving || hoverAnimates || dirtyRef.current) {
				dirtyRef.current = false;
				drawRef.current();
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [interactive, hoverAnimates]);

	// Pan. Pointer capture keeps the drag alive when the cursor leaves the canvas.
	const drag = useRef<{ x: number; y: number } | null>(null);
	const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
		if (!interactive) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		drag.current = { x: e.clientX, y: e.clientY };
	};
	const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
		if (!interactive) return;
		if (drag.current) {
			// Undo the view rotation on the drag delta, so the pattern follows the cursor at any angle.
			const d = unrotateScreen(e.clientX - drag.current.x, e.clientY - drag.current.y, radNow());
			drag.current = { x: e.clientX, y: e.clientY };
			// Panning, not pointing — drop the hover so a dot doesn't stay grown under a moving canvas.
			hoverRef.current = null;
			// Target AND live together: a drag that eased would lag the cursor it is supposed to be
			// holding. The ease is for the wheel and the refit, where there is no pointer to track.
			const c = controlsRef.current;
			c.targetOffset.x += d.x;
			c.targetOffset.y += d.y;
			c.offset.x += d.x;
			c.offset.y += d.y;
			dirtyRef.current = true;
			return;
		}
		// Screen → world, the inverse of the sx/sy the renderer draws with (y flips: world y grows upward),
		// with the view rotation undone first.
		const v = viewOf(controlsRef.current);
		if (!(v.scale > 0)) return;
		const rect = e.currentTarget.getBoundingClientRect();
		const p = unrotateScreen(
			e.clientX - rect.left - rect.width / 2,
			e.clientY - rect.top - rect.height / 2,
			radNow(),
		);
		hoverRef.current = { x: v.cx + p.x / v.scale, y: v.cy - p.y / v.scale };
	};
	const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
		if (!interactive) return;
		e.currentTarget.releasePointerCapture(e.pointerId);
		drag.current = null;
	};
	const onPointerLeave = () => {
		hoverRef.current = null;
	};

	// Wheel zoom toward the cursor: keep the world point under the pointer fixed on screen. Shift+wheel
	// spins the view instead, in the same 5° detents as the flat canvas.
	useEffect(() => {
		const el = canvasRef.current;
		if (!el || !interactive) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			// Steps the TARGET (the prop), not the live angle — the ease then glides into the new detent.
			if (e.shiftKey && onRotationChange) {
				const { steps, accum } = accumulateDetents(scrollAccumRef.current, wheelDeltaPx(e));
				scrollAccumRef.current = accum;
				if (steps !== 0) onRotationChange(wrap360(rotation + steps * ROTATE_SNAP_DEG));
				return;
			}
			const rect = el.getBoundingClientRect();
			// Zoom pivots on the world point under the cursor, so the pointer offset goes back through the
			// view rotation first — otherwise a spun view zooms toward the wrong place.
			const { x: px, y: py } = unrotateScreen(
				e.clientX - rect.left - rect.width / 2,
				e.clientY - rect.top - rect.height / 2,
				radNow(),
			);
			// The shared one: scales the TARGET zoom by scroll DISTANCE (not per wheel event, which a
			// trackpad fires dozens of times per gesture) and shifts the target offset so the world point
			// under the cursor stays put. The frame loop above eases the live view into it.
			const c = controlsRef.current;
			const { zoom, offset } = zoomAtPoint(
				{ x: px, y: py },
				c.targetOffset,
				c.targetZoom,
				wheelDeltaPx(e),
				ZOOM_BOUNDS,
			);
			c.targetZoom = zoom;
			c.targetOffset.x = offset.x;
			c.targetOffset.y = offset.y;
			dirtyRef.current = true;
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
		// `rotation` is in here so the detent handler adds to the CURRENT target; re-subscribing a wheel
		// listener per 5° step costs nothing, and the sub-detent remainder lives in a ref that survives it.
	}, [interactive, onRotationChange, rotation, radNow]);

	// Double-click is "put it back": pan, zoom AND angle, so a refit never leaves the view tilted.
	const refit = () => {
		if (size.w <= 0) return;
		// Eased, unlike the pattern-change fit above: "put it back" reads better as a glide, and the
		// shared helper is the same one /play and the cards snap home with.
		resetCardControls(controlsRef.current, homeZoomRef.current, ZOOM_BOUNDS);
		dirtyRef.current = true;
		onRotationChange?.(0);
	};

	return (
		<canvas
			ref={canvasRef}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerLeave={onPointerLeave}
			onDoubleClick={refit}
			className={cn("block w-full h-full", interactive && "cursor-grab active:cursor-grabbing", classes)}
		/>
	);
}
