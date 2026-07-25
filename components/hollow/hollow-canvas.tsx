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
}

export function HollowCanvas({ patchId, style, interactive = true, className }: Props) {
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
			drawHollow(ctx, patch, viewRef.current, { ...(style ?? DEFAULT_HOLLOW_STYLE), dark }, w, h);
		};
		paint();
		const ro = new ResizeObserver(paint);
		ro.observe(cv);
		return () => ro.disconnect();
	}, [patch, style, dark]);

	// Pan + zoom. Kept local to the ref so a drag does not re-render the tree every frame.
	useEffect(() => {
		const cv = ref.current;
		if (!cv || !patch || !interactive) return;
		let dragging = false;
		let lx = 0;
		let ly = 0;
		const repaint = () => force((n) => n + 1);
		const onDown = (e: PointerEvent) => {
			dragging = true;
			lx = e.clientX;
			ly = e.clientY;
			cv.setPointerCapture(e.pointerId);
		};
		const onMove = (e: PointerEvent) => {
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
		cv.addEventListener("wheel", onWheel, { passive: false });
		return () => {
			cv.removeEventListener("pointerdown", onDown);
			cv.removeEventListener("pointermove", onMove);
			cv.removeEventListener("pointerup", onUp);
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
			{ ...(style ?? DEFAULT_HOLLOW_STYLE), dark },
			cv.clientWidth,
			cv.clientHeight,
		);
	});

	return (
		<canvas
			ref={ref}
			className={cn("h-full w-full", interactive && "cursor-grab active:cursor-grabbing", className)}
			data-testid="hollow-canvas"
		/>
	);
}
