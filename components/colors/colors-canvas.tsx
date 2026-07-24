"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useIsDark } from "@/components/freedraw/freedraw-canvas";
import type { ColorPattern } from "@/lib/colors/pattern";
import {
	type ColorsStyle,
	type ColorsView,
	DEFAULT_COLORS_STYLE,
	drawColors,
	fitColorsView,
} from "@/lib/colors/render";
import { useEasedRotation } from "@/lib/hooks/useEasedRotation";
import {
	accumulateDetents,
	ROTATE_SNAP_DEG,
	unrotateScreen,
	wheelDeltaPx,
	wrap360,
} from "@/lib/render/viewControls";
import { cn } from "@/lib/utils/cn";

// The colored-tiling canvas: FreedrawCanvas's shell (DPR-aware backing store, drag pan, wheel zoom
// toward the cursor, the orbit-hover frame loop) around drawColors. Kept as its own component rather
// than parameterizing FreedrawCanvas because the two draw paths share no pattern type and freedraw's
// face analysis has no counterpart here — the shell is the cheap part to duplicate, the overlays are
// shared at the render layer instead.
const ZOOM_MIN = 5;
const ZOOM_MAX = 160;
const ZOOM_STEP = 1.1;

interface Props {
	pattern: ColorPattern;
	style?: Omit<ColorsStyle, "dark">;
	/** Grid cells across the shorter side at the default zoom. */
	cells?: number;
	interactive?: boolean;
	/** View rotation about the canvas centre, DEGREES — the /play Rotation slider. Eased toward. */
	rotation?: number;
	/** New target angle from Shift+scroll (5° detents). Omit and the gesture is off. */
	onRotationChange?: (deg: number) => void;
	classes?: string;
}

export function ColorsCanvas({
	pattern,
	style = DEFAULT_COLORS_STYLE,
	cells = 12,
	interactive = false,
	rotation = 0,
	onRotationChange,
	classes,
}: Props) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [size, setSize] = useState({ w: 0, h: 0 });
	const [view, setView] = useState<ColorsView | null>(null);
	const dark = useIsDark();
	const hoverRef = useRef<{ x: number; y: number } | null>(null);
	const orbitScalesRef = useRef<number[]>([]);
	// Live CSS box + latest draw, so the observer can repaint at the new size in the same frame the box
	// changed — the same contract FreedrawCanvas uses (and lib/render/canvasSize.ts explains).
	const boxRef = useRef({ w: 0, h: 0 });
	const drawRef = useRef<() => void>(() => {});
	// View rotation — the freedraw canvas's arrangement exactly: an eased live angle in a ref (its frame
	// loop lives in the hook), injected per draw, and undone on every pointer vector, since input arrives
	// rotated while the view maths stays upright.
	const rotRef = useEasedRotation(rotation, drawRef);
	const radNow = useCallback(() => (rotRef.current * Math.PI) / 180, [rotRef]);
	// Sub-detent scroll remainder, carried between wheel events.
	const scrollAccumRef = useRef(0);

	useEffect(() => {
		const el = canvasRef.current;
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => {
			const r = entry.contentRect;
			const box = { w: Math.round(r.width), h: Math.round(r.height) };
			boxRef.current = box;
			drawRef.current();
			setSize(box);
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	useEffect(() => {
		if (size.w > 0 && size.h > 0) setView(fitColorsView(size.w, size.h, cells));
	}, [pattern.id, size.w, size.h, cells]);

	const draw = useCallback(() => {
		const el = canvasRef.current;
		const { w: cw, h: ch } = boxRef.current;
		if (!el || !view || cw === 0 || ch === 0) return;
		const dpr = window.devicePixelRatio || 1;
		const w = Math.round(cw * dpr);
		const h = Math.round(ch * dpr);
		if (el.width !== w || el.height !== h) {
			el.width = w;
			el.height = h;
		}
		const ctx = el.getContext("2d");
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		drawColors(
			ctx,
			cw,
			ch,
			pattern,
			// Live angle injected per draw, so a refit can rebuild the view without touching the rotation.
			{ ...view, rot: radNow() },
			{ ...style, dark },
			hoverRef.current,
			orbitScalesRef.current,
		);
	}, [pattern, view, style, dark, radNow]);
	drawRef.current = draw;

	useEffect(() => {
		draw();
	}, [draw]);

	// Frame loop only while the orbit dots are up on an interactive canvas (the hover ease needs it); a
	// view mid-turn runs its own inside useEasedRotation.
	const animate = interactive && style.showVertices;
	useEffect(() => {
		if (!animate) return;
		let raf = 0;
		const tick = () => {
			draw();
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [animate, draw]);

	const drag = useRef<{ x: number; y: number } | null>(null);
	const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
		if (!interactive) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		drag.current = { x: e.clientX, y: e.clientY };
	};
	const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
		if (!interactive) return;
		if (drag.current) {
			// Undo the view rotation on the drag delta so the pattern follows the cursor at any angle.
			const d = unrotateScreen(e.clientX - drag.current.x, e.clientY - drag.current.y, radNow());
			drag.current = { x: e.clientX, y: e.clientY };
			hoverRef.current = null;
			setView((v) => (v ? { ...v, cx: v.cx - d.x / v.scale, cy: v.cy + d.y / v.scale } : v));
			return;
		}
		const v = view;
		if (!v) return;
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

	useEffect(() => {
		const el = canvasRef.current;
		if (!el || !interactive) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			// Shift+wheel spins the view in 5° detents; the bare wheel zooms toward the cursor.
			if (e.shiftKey && onRotationChange) {
				const { steps, accum } = accumulateDetents(scrollAccumRef.current, wheelDeltaPx(e));
				scrollAccumRef.current = accum;
				if (steps !== 0) onRotationChange(wrap360(rotation + steps * ROTATE_SNAP_DEG));
				return;
			}
			const rect = el.getBoundingClientRect();
			const { x: px, y: py } = unrotateScreen(
				e.clientX - rect.left - rect.width / 2,
				e.clientY - rect.top - rect.height / 2,
				radNow(),
			);
			setView((v) => {
				if (!v) return v;
				const delta = wheelDeltaPx(e);
				const next = Math.max(
					ZOOM_MIN,
					Math.min(ZOOM_MAX, delta > 0 ? v.scale / ZOOM_STEP : v.scale * ZOOM_STEP),
				);
				if (next === v.scale) return v;
				const wx = v.cx + px / v.scale;
				const wy = v.cy - py / v.scale;
				return { scale: next, cx: wx - px / next, cy: wy + py / next };
			});
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
		// `rotation` in the deps so a detent adds to the current target — see the freedraw canvas.
	}, [interactive, onRotationChange, rotation, radNow]);

	// Double-click puts the whole view back: pan, zoom and angle.
	const refit = () => {
		if (size.w <= 0) return;
		setView(fitColorsView(size.w, size.h, cells));
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
