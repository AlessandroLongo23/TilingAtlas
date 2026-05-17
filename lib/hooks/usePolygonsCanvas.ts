"use client";

import { useEffect, useRef } from "react";
import type { Polygon } from "@/classes/polygons/Polygon";
import { hsbToHsl } from "@/lib/utils/drawVertexConfiguration";

interface PolygonsCanvasOptions {
	backgroundColor?: string;
	padding?: number;
	fallbackSize?: number;
	strokeColor?: string;
}

/**
 * Shared polygon-array → canvas renderer. Used by PolygonCard, SeedCard,
 * ExpandedSeedCard, and anything else that draws a Polygon[] with HSB hue
 * fill + fit-to-bounds + device-pixel-ratio scaling.
 */
export function usePolygonsCanvas(
	polygons: Polygon[] | null,
	options: PolygonsCanvasOptions = {},
) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const {
		backgroundColor = "rgba(24, 24, 27, 0.6)",
		padding = 16,
		fallbackSize = 200,
		strokeColor = "rgba(0, 0, 0, 0.6)",
	} = options;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !polygons || polygons.length === 0) return;

		const render = () => {
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			const dpr = window.devicePixelRatio || 1;
			const size = canvas.clientWidth || fallbackSize;
			canvas.width = size * dpr;
			canvas.height = size * dpr;
			ctx.scale(dpr, dpr);

			ctx.fillStyle = backgroundColor;
			ctx.fillRect(0, 0, size, size);

			let minX = Infinity;
			let minY = Infinity;
			let maxX = -Infinity;
			let maxY = -Infinity;
			for (const polygon of polygons) {
				if (!polygon.vertices) continue;
				for (const v of polygon.vertices) {
					minX = Math.min(minX, v.x);
					minY = Math.min(minY, v.y);
					maxX = Math.max(maxX, v.x);
					maxY = Math.max(maxY, v.y);
				}
			}
			if (!isFinite(minX)) return;

			const availableSize = size - 2 * padding;
			const dataWidth = maxX - minX || 1;
			const dataHeight = maxY - minY || 1;
			const scale = Math.min(availableSize / dataWidth, availableSize / dataHeight);
			const centerX = (minX + maxX) / 2;
			const centerY = (minY + maxY) / 2;

			ctx.save();
			ctx.translate(size / 2, size / 2);
			ctx.scale(scale, -scale);
			ctx.translate(-centerX, -centerY);

			for (const polygon of polygons) {
				if (!polygon.vertices || polygon.vertices.length === 0) continue;
				const hsl = hsbToHsl(polygon.hue ?? 200, 40, 100);
				ctx.fillStyle = `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, 0.85)`;
				ctx.strokeStyle = strokeColor;
				ctx.lineWidth = 1.5 / scale;
				ctx.beginPath();
				ctx.moveTo(polygon.vertices[0].x, polygon.vertices[0].y);
				for (let i = 1; i < polygon.vertices.length; i++) {
					ctx.lineTo(polygon.vertices[i].x, polygon.vertices[i].y);
				}
				ctx.closePath();
				ctx.fill();
				ctx.stroke();
			}
			ctx.restore();
		};

		const schedule = () => requestAnimationFrame(render);
		schedule();
		const ro = new ResizeObserver(schedule);
		ro.observe(canvas);
		return () => ro.disconnect();
	}, [polygons, backgroundColor, padding, fallbackSize, strokeColor]);

	return canvasRef;
}
