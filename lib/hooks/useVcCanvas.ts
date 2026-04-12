"use client";

import { useEffect, useRef } from "react";
import type { VertexConfiguration } from "@/classes/algorithm/VertexConfiguration";
import { drawVertexConfiguration } from "@/lib/utils/drawVertexConfiguration";

interface VcCanvasOptions {
	backgroundColor?: string;
	padding?: number;
	fallbackSize?: number;
}

/**
 * Shared VC → canvas renderer: sizes for device pixel ratio, draws via
 * drawVertexConfiguration, and re-renders on ResizeObserver events.
 */
export function useVcCanvas(
	vc: VertexConfiguration | null,
	options: VcCanvasOptions = {},
) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const { backgroundColor = "rgba(24, 24, 27, 0.6)", padding = 16, fallbackSize = 200 } = options;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas || !vc) return;

		const render = () => {
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			const dpr = window.devicePixelRatio || 1;
			const size = canvas.clientWidth || fallbackSize;
			canvas.width = size * dpr;
			canvas.height = size * dpr;
			ctx.scale(dpr, dpr);
			drawVertexConfiguration(ctx, vc, { size, backgroundColor, padding });
		};

		const schedule = () => requestAnimationFrame(render);
		schedule();
		const ro = new ResizeObserver(schedule);
		ro.observe(canvas);
		return () => ro.disconnect();
	}, [vc, backgroundColor, padding, fallbackSize]);

	return canvasRef;
}
