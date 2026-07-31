"use client";

import { useEffect, useRef, useState } from "react";
import { useConfiguration } from "@/stores/configuration";
import { AlgorithmTiling } from "@/classes/algorithm/Tiling";
import {
	type RawPolygon,
	type TranslationalCellData,
	fitPxPerEdge,
	parseBaseCell,
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
	/**
	 * FIGURE mode: ignore pxPerEdge and scale so the figure's bounding box fills this fraction of the
	 * slot (see fitPxPerEdge). For lone tiles, whose size in edges swings from 1 across to ~11; a
	 * repeating tiling doesn't want it (it fills the slot at any scale). Pair with `scaleBar`, since
	 * fitting is what costs the unit edge its card-to-card meaning.
	 */
	fit?: number;
	/**
	 * LATTICE mode: ignore pxPerEdge and scale so this many translational periods fit across the slot.
	 * Only meaningful with `translationalCell`.
	 *
	 * pxPerEdge assumes an edge in the data is an edge of a tile. That holds for the atlas, whose
	 * polygons are straight, and fails for a cell whose boundary is a flattened curve: there an "edge"
	 * is one of eight segments along a tile's side, so the same number zooms in ~8x and the slot shows
	 * one tile. The period is the honest unit for those.
	 */
	periodsAcross?: number;
	/** Draw a unit-edge ruler in the bottom-right corner. */
	scaleBar?: boolean;
}

/**
 * The pxPerEdge that puts `periodsAcross` lattice periods across the slot's short side.
 *
 * renderTilingToContext scales by pxPerEdge / medianEdge, so inverting through the same median is
 * what makes the request land: ask for a scale, divide the median back out. Null when the cell has
 * no usable basis, which sends the caller back to its own pxPerEdge.
 */
function latticePxPerEdge(
	cell: TranslationalCellData,
	W: number,
	H: number,
	periodsAcross: number,
): number | null {
	const base = parseBaseCell(cell);
	if (!base?.basis || base.basis.length < 2) return null;
	const [v1, v2] = base.basis;
	const period = Math.sqrt(Math.abs(v1[0] * v2[1] - v1[1] * v2[0]));
	if (!(period > 0) || !(periodsAcross > 0)) return null;
	return (Math.min(W, H) / (periodsAcross * period)) * base.medianEdge;
}

export function TilingThumbnail({
	encodedTiling,
	polygons: rawPolygons,
	translationalCell = null,
	pxPerEdge = 22,
	fit,
	periodsAcross,
	scaleBar = false,
}: TilingThumbnailProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [hasError, setHasError] = useState(false);
	// Pixel length of one polygon edge in the last draw, plus the slot width it was measured against —
	// the scale bar's geometry. Only meaningful in figure mode, where every card resolves its own.
	const [unit, setUnit] = useState<{ px: number; boxW: number } | null>(null);
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
				// Figure mode resolves its edge length from the measured slot, so it can only happen
				// here — the card has no width to fit against until the canvas is laid out.
				const edgePx =
					fit != null && polys?.length
						? fitPxPerEdge(polys, W, H, fit)
						: (periodsAcross != null && translationalCell
								? latticePxPerEdge(translationalCell, W, H, periodsAcross)
								: null) ?? pxPerEdge;
				renderTilingToContext(ctx, W, H, {
					translationalCell,
					polygons: polys,
					pxPerEdge: edgePx,
					hueOffsetDeg: hueOffset,
					// Transparent: the preview slot's own bg-surface-raised shows through, so the
					// backdrop follows the theme and a Shift+T flip recolours every mounted thumbnail
					// with no redraw (the draw effect has no theme dependency, so it wouldn't rerun).
					background: null,
				});
				setUnit((prev) =>
					prev && prev.px === edgePx && prev.boxW === W ? prev : { px: edgePx, boxW: W },
				);
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
	}, [encodedTiling, rawPolygons, translationalCell, pxPerEdge, fit, periodsAcross, hueOffset]);

	if (hasError) {
		return (
			<div className="w-full h-full flex items-center justify-center bg-surface-raised rounded text-fg-disabled text-[10px]">
				err
			</div>
		);
	}

	// The bar is DOM, not canvas: it inherits the theme through text-fg-muted (so a Shift+T recolours it
	// without a redraw, like the transparent backdrop), and its "1" stays real text at any DPR. Suppressed
	// when it would be too short to read or wide enough to leave the slot — a ruler that doesn't measure
	// the frame it's in is worse than none.
	const showBar = drawn && scaleBar && unit != null && unit.px >= 8 && unit.px <= unit.boxW - 16;

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
			{showBar ? (
				<div
					aria-hidden
					className="absolute bottom-1.5 right-2 flex flex-col items-center text-fg-muted ta-fade-in pointer-events-none select-none"
					style={{ width: unit.px }}
				>
					<span className="text-[9px] font-mono leading-none mb-[3px]">1</span>
					{/* End serifs turn a bare rule into a ruler: they mark where the unit starts and stops. */}
					<span className="relative w-full h-[5px]">
						<span className="absolute inset-x-0 top-1/2 border-t border-current" />
						<span className="absolute left-0 inset-y-0 border-l border-current" />
						<span className="absolute right-0 inset-y-0 border-r border-current" />
					</span>
				</div>
			) : null}
		</div>
	);
}
