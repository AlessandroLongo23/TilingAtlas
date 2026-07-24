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
import { wheelDeltaPx } from "@/lib/render/viewControls";
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
	classes?: string;
}

export function ColorsCanvas({
	pattern,
	style = DEFAULT_COLORS_STYLE,
	cells = 12,
	interactive = false,
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
		drawColors(ctx, cw, ch, pattern, view, { ...style, dark }, hoverRef.current, orbitScalesRef.current);
	}, [pattern, view, style, dark]);
	drawRef.current = draw;

	useEffect(() => {
		draw();
	}, [draw]);

	// Frame loop only while the orbit dots are up on an interactive canvas (the hover ease needs it).
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
			const dx = e.clientX - drag.current.x;
			const dy = e.clientY - drag.current.y;
			drag.current = { x: e.clientX, y: e.clientY };
			hoverRef.current = null;
			setView((v) => (v ? { ...v, cx: v.cx - dx / v.scale, cy: v.cy + dy / v.scale } : v));
			return;
		}
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
			onDoubleClick={() => size.w > 0 && setView(fitColorsView(size.w, size.h, cells))}
			className={cn("block w-full h-full", interactive && "cursor-grab active:cursor-grabbing", classes)}
		/>
	);
}
