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
import { wheelDeltaPx } from "@/lib/render/viewControls";
import { cn } from "@/lib/utils/cn";

// Zoom bounds are deliberately NOT the ones in lib/render/viewControls.ts. There a world unit is a
// tile edge; here it is one grid cell, and reading a freedraw pattern means seeing tens of cells at
// once, so the floor has to be much lower than ZOOM_MIN's 20 px/unit.
const ZOOM_MIN = 5;
const ZOOM_MAX = 160;
const ZOOM_STEP = 1.1;

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
	classes?: string;
}

export function FreedrawCanvas({
	pattern,
	style = DEFAULT_STYLE,
	cells = 12,
	interactive = false,
	classes,
}: Props) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [size, setSize] = useState({ w: 0, h: 0 });
	const [view, setView] = useState<FreedrawView | null>(null);
	const dark = useIsDark();
	const analysis = useMemo(() => analyseFaces(pattern), [pattern]);
	// Pointer in WORLD (grid) coordinates, for the orbit-dot hover. A ref, not state: it changes on every
	// pointermove and the frame loop below reads it — routing it through React would re-render the whole
	// component per mouse pixel for a value only the canvas consumes.
	const hoverRef = useRef<{ x: number; y: number } | null>(null);
	// Per-orbit hover-grow scales, eased toward their targets inside drawFreedraw. Owned here so the ease
	// survives across frames; a fresh array each draw would restart the growth every time.
	const orbitScalesRef = useRef<number[]>([]);

	// Track the element's CSS size; the canvas backing store is sized from it times the DPR.
	useEffect(() => {
		const el = canvasRef.current;
		if (!el) return;
		const ro = new ResizeObserver(([entry]) => {
			const r = entry.contentRect;
			setSize({ w: Math.round(r.width), h: Math.round(r.height) });
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	// Re-fit whenever the pattern changes or the element is first measured.
	useEffect(() => {
		if (size.w > 0 && size.h > 0) setView(fitView(size.w, size.h, cells));
	}, [pattern.id, size.w, size.h, cells]);

	const draw = useCallback(() => {
		const el = canvasRef.current;
		if (!el || !view || size.w === 0 || size.h === 0) return;
		const dpr = window.devicePixelRatio || 1;
		// Only resize when it actually changed — assigning width/height clears the backing store, so doing
		// it every frame would flash the canvas empty under the hover loop below.
		const w = Math.round(size.w * dpr);
		const h = Math.round(size.h * dpr);
		if (el.width !== w || el.height !== h) {
			el.width = w;
			el.height = h;
		}
		const ctx = el.getContext("2d");
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		drawFreedraw(
			ctx,
			size.w,
			size.h,
			pattern,
			view,
			{ ...style, dark },
			analysis,
			hoverRef.current,
			orbitScalesRef.current,
		);
	}, [pattern, view, size.w, size.h, style, dark, analysis]);

	useEffect(() => {
		draw();
	}, [draw]);

	// The orbit-dot hover eases over several frames, so it needs a frame loop — a redraw per pointermove
	// would freeze the growth the moment the cursor stops. Runs ONLY while the dots are up on an
	// interactive canvas; a gallery of 166 static thumbnails never enters it.
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
			const dx = e.clientX - drag.current.x;
			const dy = e.clientY - drag.current.y;
			drag.current = { x: e.clientX, y: e.clientY };
			// Panning, not pointing — drop the hover so a dot doesn't stay grown under a moving canvas.
			hoverRef.current = null;
			setView((v) => (v ? { ...v, cx: v.cx - dx / v.scale, cy: v.cy + dy / v.scale } : v));
			return;
		}
		// Screen → world, the inverse of the sx/sy the renderer draws with (y flips: world y grows upward).
		const v = view;
		if (!v) return;
		const rect = e.currentTarget.getBoundingClientRect();
		hoverRef.current = {
			x: v.cx + (e.clientX - rect.left - rect.width / 2) / v.scale,
			y: v.cy - (e.clientY - rect.top - rect.height / 2) / v.scale,
		};
	};
	const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
		if (!interactive) return;
		e.currentTarget.releasePointerCapture(e.pointerId);
		drag.current = null;
	};
	const onPointerLeave = () => {
		hoverRef.current = null;
	};

	// Wheel zoom toward the cursor: keep the world point under the pointer fixed on screen.
	useEffect(() => {
		const el = canvasRef.current;
		if (!el || !interactive) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const rect = el.getBoundingClientRect();
			const px = e.clientX - rect.left - rect.width / 2;
			const py = e.clientY - rect.top - rect.height / 2;
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
	}, [interactive]);

	return (
		<canvas
			ref={canvasRef}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerLeave={onPointerLeave}
			onDoubleClick={() => size.w > 0 && setView(fitView(size.w, size.h, cells))}
			className={cn("block w-full h-full", interactive && "cursor-grab active:cursor-grabbing", classes)}
		/>
	);
}
