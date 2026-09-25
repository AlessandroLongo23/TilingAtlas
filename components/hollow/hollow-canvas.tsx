"use client";

import { useEffect, useRef, useState } from "react";
import { useIsDark } from "@/components/freedraw/freedraw-canvas";
import { loadHollowPatch, type HollowPatch } from "@/lib/hollow/pattern";
import {
	DEFAULT_HOLLOW_STYLE,
	drawHollow,
	fitHollowView,
	type HollowStyle,
	type HollowView,
} from "@/lib/hollow/render";
import { onViewReset, TouchGestures } from "@/lib/render/touchGestures";
import { cn } from "@/lib/utils/cn";

// The hollow-tiling renderer, sibling of FreedrawCanvas and HyperbolicDevelopedCanvas. A hollow
// tiling has no polygon cell for the flat renderer (its faces overlap and self-intersect), so this
// is the only way /play and the cards can show one at all.

const ZOOM_MIN = 8;
const ZOOM_MAX = 400;
const ZOOM_STEP = 1.1;

interface Props {
	patchId: string;
	style?: Omit<HollowStyle, "dark">;
	interactive?: boolean;
	className?: string;
	/** Even-odd fill, overriding whatever `style` carries. /play drives it from the sidebar toggle; the
	 *  thumbnails leave it alone, so a card keeps drawing the tile the classical way. */
	mod2?: boolean;
}

export function HollowCanvas({ patchId, style, interactive = true, className, mod2 }: Props) {
	const ref = useRef<HTMLCanvasElement | null>(null);
	const dark = useIsDark();
	const [patch, setPatch] = useState<HollowPatch | null>(null);
	const viewRef = useRef<HollowView | null>(null);
	const [, force] = useState(0);

	useEffect(() => {
		let live = true;
		viewRef.current = null;
		loadHollowPatch(patchId)
			.then((p) => {
				if (live) setPatch(p);
			})
			.catch(() => {
				if (live) setPatch(null);
			});
		return () => {
			live = false;
		};
	}, [patchId]);

	useEffect(() => {
		const cv = ref.current;
		if (!cv || !patch) return;
		const paint = () => {
			const dpr = window.devicePixelRatio || 1;
			const w = cv.clientWidth;
			const h = cv.clientHeight;
			if (w === 0 || h === 0) return;
			cv.width = Math.round(w * dpr);
			cv.height = Math.round(h * dpr);
			const ctx = cv.getContext("2d");
			if (!ctx) return;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			if (!viewRef.current) viewRef.current = fitHollowView(patch, w, h);
			const base = style ?? DEFAULT_HOLLOW_STYLE;
			drawHollow(ctx, patch, viewRef.current, { ...base, dark, mod2: mod2 ?? base.mod2 }, w, h);
		};
		paint();
		const ro = new ResizeObserver(paint);
		ro.observe(cv);
		return () => ro.disconnect();
	}, [patch, style, dark, mod2]);

	// Pan + zoom. Kept local to the ref so a drag does not re-render the tree every frame.
	useEffect(() => {
		const cv = ref.current;
		if (!cv || !patch || !interactive) return;
		let dragging = false;
		let lx = 0;
		let ly = 0;
		const repaint = () => force((n) => n + 1);
		// Home: the fit a fresh patch gets. The desktop has no gesture for it (the wheel never strays
		// far); a finger gets the double-tap and the phone's Reset button, since a pinch easily does.
		const reset = () => {
			viewRef.current = fitHollowView(patch, cv.clientWidth, cv.clientHeight);
			repaint();
		};
		// Fingers (lib/render/touchGestures.ts): two pinch and pan about their midpoint. No twist, as
		// this view has no rotation for Shift+wheel to turn either.
		const touch = new TouchGestures(undefined, {
			pinchStart: () => {
				dragging = false;
			},
			pinch: ({ from, to, scale }) => {
				const v = viewRef.current;
				if (!v) return;
				const wx = v.cx + from.x / v.zoom;
				const wy = v.cy - from.y / v.zoom;
				v.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v.zoom * scale));
				v.cx = wx - to.x / v.zoom;
				v.cy = wy + to.y / v.zoom;
				repaint();
			},
			doubleTap: reset,
		});
		const offTouch = touch.attach(cv);
		const offReset = onViewReset(reset);
		const onDown = (e: PointerEvent) => {
			if (touch.pinching) return;
			dragging = true;
			lx = e.clientX;
			ly = e.clientY;
			cv.setPointerCapture(e.pointerId);
		};
		const onMove = (e: PointerEvent) => {
			if (touch.pinching) return;
			const v = viewRef.current;
			if (!dragging || !v) return;
			v.cx -= (e.clientX - lx) / v.zoom;
			v.cy += (e.clientY - ly) / v.zoom;
			lx = e.clientX;
			ly = e.clientY;
			repaint();
		};
		const onUp = (e: PointerEvent) => {
			dragging = false;
			try {
				cv.releasePointerCapture(e.pointerId);
			} catch {
				/* pointer already released */
			}
		};
		const onWheel = (e: WheelEvent) => {
			const v = viewRef.current;
			if (!v) return;
			e.preventDefault();
			const f = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
			v.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v.zoom * f));
			repaint();
		};
		cv.addEventListener("pointerdown", onDown);
		cv.addEventListener("pointermove", onMove);
		cv.addEventListener("pointerup", onUp);
		cv.addEventListener("pointercancel", onUp);
		cv.addEventListener("wheel", onWheel, { passive: false });
		return () => {
			offTouch();
			offReset();
			cv.removeEventListener("pointerdown", onDown);
			cv.removeEventListener("pointermove", onMove);
			cv.removeEventListener("pointerup", onUp);
			cv.removeEventListener("pointercancel", onUp);
			cv.removeEventListener("wheel", onWheel);
		};
	}, [patch, interactive]);

	// Repaint on the forced re-render from a pan/zoom.
	useEffect(() => {
		const cv = ref.current;
		if (!cv || !patch) return;
		const ctx = cv.getContext("2d");
		if (!ctx || !viewRef.current) return;
		const dpr = window.devicePixelRatio || 1;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		drawHollow(
			ctx,
			patch,
			viewRef.current,
			{ ...(style ?? DEFAULT_HOLLOW_STYLE), dark, mod2: mod2 ?? (style ?? DEFAULT_HOLLOW_STYLE).mod2 },
			cv.clientWidth,
			cv.clientHeight,
		);
	});

	return (
		<canvas
			ref={ref}
			className={cn("h-full w-full", interactive && "cursor-grab active:cursor-grabbing touch-none", className)}
			data-testid="hollow-canvas"
		/>
	);
}
