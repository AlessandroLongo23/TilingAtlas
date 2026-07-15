"use client";

import { useEffect, useRef, useState } from "react";
import { AlgorithmTiling } from "@/classes/algorithm/Tiling";
import {
	type RawPolygon,
	type TranslationalCellData,
	renderTilingToContext,
} from "@/lib/utils/renderTiling";

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
				});
			} catch (e) {
				console.warn("TilingThumbnail render error:", e);
				setHasError(true);
			}
		};

		const ro = new ResizeObserver(() => {
			if (observed) draw();
		});

		const io = new IntersectionObserver(
			(entries) => {
				if (!entries[0].isIntersecting) return;
				observed = true;
				draw();
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
		};
	}, [encodedTiling, rawPolygons, translationalCell, pxPerEdge]);

	if (hasError) {
		return (
			<div className="w-full h-full flex items-center justify-center bg-surface-raised rounded text-fg-disabled text-[10px]">
				err
			</div>
		);
	}

	return <canvas ref={canvasRef} className="w-full h-full rounded block" />;
}
