"use client";

import { useEffect, useRef, useState } from "react";
import { useConfiguration } from "@/stores/configuration";
import { AlgorithmTiling } from "@/classes/algorithm/Tiling";
import {
	type RawPolygon,
	type TranslationalCellData,
	renderTilingToContext,
} from "@/lib/utils/renderTiling";
import { enqueueThumbnailRender } from "@/lib/render/thumbnailQueue";
import { ThumbnailSkeleton } from "@/components/ui/thumbnail-skeleton";
import { cn } from "@/lib/utils/cn";

interface EncodedTiling {
	seed?: unknown;
	[key: string]: unknown;
}

interface TilingThumbnailProps {
	encodedTiling?: EncodedTiling;
	polygons?: RawPolygon[];
	translationalCell?: TranslationalCellData | null;
	/** Target pixels per polygon edge — keeps unit length consistent across cards. */
	pxPerEdge?: number;
}

export function TilingThumbnail({
	encodedTiling,
	polygons: rawPolygons,
	translationalCell = null,
	pxPerEdge = 22,
}: TilingThumbnailProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [hasError, setHasError] = useState(false);
	// Flips true after the first successful draw and never flips back — a hue-ring drag or a resize
	// redraws the canvas in place, and re-showing the skeleton for those would strobe the whole grid.
	const [drawn, setDrawn] = useState(false);
	// Global hue ring: subscribed LIVE, so every mounted thumbnail redraws on each drag tick — the
	// deliberate exact-colors choice (vs a cheap CSS hue-rotate approximation); revisit if it janks.
	const hueOffset = useConfiguration((s) => s.hueOffset);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		if (!translationalCell && !encodedTiling && !rawPolygons) return;

		let disposed = false;
		let observed = false;

		const draw = () => {
			if (disposed) return;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			const rect = canvas.getBoundingClientRect();
			const W = Math.max(1, Math.floor(rect.width));
			const H = Math.max(1, Math.floor(rect.height));
			if (W <= 1 || H <= 1) return;
			const dpr = Math.min(window.devicePixelRatio ?? 1, 3);
			canvas.width = Math.floor(W * dpr);
			canvas.height = Math.floor(H * dpr);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

			try {
				let polys: RawPolygon[] | undefined;
				if (!translationalCell) {
					if (rawPolygons) {
						polys = rawPolygons.map((p) => ({
							n: p.n ?? p.vertices.length,
							vertices: p.vertices,
							hue: p.hue,
						}));
					} else if (encodedTiling?.seed) {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						polys = (AlgorithmTiling as any).expandToPolygons(encodedTiling);
					}
				}
				renderTilingToContext(ctx, W, H, {
					translationalCell,
					polygons: polys,
					pxPerEdge,
					hueOffsetDeg: hueOffset,
				});
				setDrawn(true);
			} catch (e) {
				console.warn("TilingThumbnail render error:", e);
				setHasError(true);
			}
		};

		// Every draw goes through the shared frame-paced queue: a grid mounts dozens of these and their
		// observers all fire in one callback batch, so drawing inline would block the frame for the
		// whole page. Resizes queue too, so a window drag repaints the grid card-by-card. Overwriting
		// cancelJob can orphan an earlier pending job, which is harmless — draw() no-ops once disposed.
		let cancelJob: (() => void) | null = null;
		const queueDraw = () => {
			cancelJob = enqueueThumbnailRender(draw);
		};

		const ro = new ResizeObserver(() => {
			// ResizeObserver delivers an initial callback the moment we observe. That first one is the
			// size we already drew at, so skip it — otherwise every card would draw twice on mount.
			if (!observed) {
				observed = true;
				return;
			}
			queueDraw();
		});

		const io = new IntersectionObserver(
			(entries) => {
				if (!entries[0].isIntersecting) return;
				queueDraw();
				ro.observe(canvas);
				io.disconnect();
			},
			{ rootMargin: "300px" },
		);
		io.observe(canvas);

		return () => {
			disposed = true;
			io.disconnect();
			ro.disconnect();
			cancelJob?.();
		};
	}, [encodedTiling, rawPolygons, translationalCell, pxPerEdge, hueOffset]);

	if (hasError) {
		return (
			<div className="w-full h-full flex items-center justify-center bg-surface-raised rounded text-fg-disabled text-[10px]">
				err
			</div>
		);
	}

	// The canvas stays mounted and laid out at all times — draw() sizes it from getBoundingClientRect,
	// so it cannot be conditionally rendered. It is held transparent until the first draw lands and the
	// skeleton shows through from behind.
	return (
		<div className="relative w-full h-full">
			<ThumbnailSkeleton done={drawn} />
			<canvas
				ref={canvasRef}
				className={cn("relative w-full h-full rounded block", drawn ? "ta-fade-in" : "opacity-0")}
			/>
		</div>
	);
}
