"use client";

import { useEffect, useRef } from "react";
import { useConfiguration } from "@/stores/configuration";
import { drawDevelopedEdgePatch } from "@/lib/render/hyperbolicDevelopedDraw";
import { FALLBACK_BOUND_R, FALLBACK_BUDGET, HyperbolicDeveloper } from "@/lib/render/hyperbolicDevelopClient";
import { HypCamera } from "@/lib/render/hypCamera";
import { buildWalk, type WalkTiling } from "@/lib/render/hyperbolicWalk";
import { IslamicFeed } from "@/lib/render/hyperbolicIslamic";
import { HyperbolicPerPixelRenderer } from "@/lib/render/hyperbolicPerPixelGL";
import { syncCanvasSize } from "@/lib/render/canvasSize";
import { captureOverride, offerFrame } from "@/lib/render/capture";
import { paletteRgb255 } from "@/lib/colors/render";
import type { HypColorsThumbInput } from "@/components/hyperbolic-colors-thumbnail";

// Interactive Poincaré-disk view of a hyperbolic COLORED tiling — the per-pixel WebGL renderer in colors
// mode (lib/render/hyperbolicPerPixelGL.ts), the exact sibling of the hyperbolic edge-system canvas. Each
// pixel walks the quotient to its face (lib/render/hyperbolicWalk.ts) and the shader fills that face's
// colour index through the shared atlas palette (configuration.colorsPalette), every edge a bold tile
// boundary. Same three properties as the edge canvas: fills to the rim, infinite drift-free panning, GPU.
// 2D developed fallback where WebGL2 is unavailable.

const DISK_PAD_PX = 24;

interface Props {
	pattern: HypColorsThumbInput;
	/** The faces are TILES filled by polygon size (the hyp-poly shelf), not a colouring of one tiling,
	 *  so the Islamic construction applies and the sidebar's switch is honoured. */
	tiles?: boolean;
}

export function HyperbolicColorsCanvas({ pattern, tiles = false }: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const glRef = useRef<HyperbolicPerPixelRenderer | null>(null);
	const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
	const devRef = useRef<HyperbolicDeveloper | null>(null); // the 2D fallback only
	const camRef = useRef<{ id: string; cam: HypCamera } | null>(null);
	const walkRef = useRef<WalkTiling | null>(null);
	const feedRef = useRef(new IslamicFeed());
	const metaRef = useRef<{ id: string; name: string; config: string; edge: number } | null>(null);

	const palette = useConfiguration((s) => s.colorsPalette);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true });
		if (gl) {
			try {
				glRef.current = new HyperbolicPerPixelRenderer(gl);
			} catch (e) {
				console.warn("hyperbolic colors per-pixel renderer unavailable, falling back to 2D:", e);
			}
		}
		if (!glRef.current) ctx2dRef.current = canvas.getContext("2d");
		return () => {
			glRef.current?.dispose();
			glRef.current = null;
			ctx2dRef.current = null;
		};
	}, []);

	// Bind the pattern: its walk table to the shader, or a developer to the 2D fallback. The camera
	// belongs to the PATTERN, so only a new id resets where the reader has panned to.
	useEffect(() => {
		const meta = { id: pattern.id, name: pattern.id, config: pattern.config, edge: pattern.edge };
		metaRef.current = meta;
		const gl = glRef.current;
		const walk = gl ? buildWalk(pattern.darts, pattern.edge, { allDrawn: true }) : null;
		walkRef.current = walk;
		if (gl && walk) gl.setWalk(walk);
		if (camRef.current?.id === pattern.id) return;
		devRef.current = gl ? null : new HyperbolicDeveloper(pattern.darts, pattern.edge);
		camRef.current = { id: pattern.id, cam: new HypCamera(walk, devRef.current, meta) };
	}, [pattern]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		let raf = 0;
		const render = () => {
			raf = requestAnimationFrame(render);
			const meta = metaRef.current;
			const cam = camRef.current?.cam;
			if (!meta || !cam) return;
			const { w, h, dpr } = syncCanvasSize(canvas);
			if (w <= 0 || h <= 0) return;
			const bw = canvas.width;
			const bh = canvas.height;

			const cfg = useConfiguration.getState();
			const ctrl = cfg.controls;
			const Rcss = Math.max(0.5 * Math.min(w, h) - DISK_PAD_PX, 1);
			cam.step({
				offset: ctrl.offset,
				targetOffset: ctrl.targetOffset,
				rotDeg: ctrl.rotation || 0,
				reset: cfg.hyperbolicResetView,
				click: cfg.hyperbolicClick,
				Rcss,
			});
			if (cfg.hyperbolicResetView) useConfiguration.setState({ hyperbolicResetView: false });
			if (cfg.hyperbolicClick) useConfiguration.setState({ hyperbolicClick: null });

			const dark = document.documentElement.classList.contains("dark");
			const shared = {
				R: Rcss * dpr,
				cx: bw / 2,
				cy: bh / 2,
				dark,
				showFill: cfg.fillAmount > 0,
				strokePx: cfg.lineWidth <= 0 ? 0 : Math.max(cfg.lineWidth, 0.5) * dpr,
				taper: cfg.hyperbolicLineMode !== "constant",
			};
			const pal = paletteRgb255(pattern.colors, palette, dark);
			const gl = glRef.current;
			const ctx = ctx2dRef.current;
			const dev = devRef.current;
			const walk = walkRef.current;
			if (gl && walk) {
				// Under the construction the star bodies keep each tile's colour and the tile edges give
				// way to the construction lines, so the faces shade per tile like the developed shelf.
				const islamic = tiles ? feedRef.current.frame(gl, cfg, meta.id, walk.sizes, meta.edge) : { islamic: false };
				gl.draw({
					...shared,
					view: cam.view,
					face: cam.face,
					canvasH: bh,
					hueOffset: 0,
					...islamic,
					edgeMode: !islamic.islamic,
					colorsMode: true,
					palette: pal.map((c) => [c[0] / 255, c[1] / 255, c[2] / 255] as [number, number, number]),
				});
			} else if (ctx && dev) {
				const patch = dev.developColors(meta, cam.view, FALLBACK_BOUND_R, FALLBACK_BUDGET);
				ctx.clearRect(0, 0, bw, bh);
				drawDevelopedEdgePatch(ctx, patch, cam.view, { ...shared, frame: false, palette: pal });
			}

			// Export: snapshot this layer while the frame is still in the drawing buffer. The context has no
			// preserveDrawingBuffer, so a read from anywhere but here comes back blank (lib/render/capture.ts).
			if (captureOverride()) offerFrame(canvas);
		};
		raf = requestAnimationFrame(render);
		return () => cancelAnimationFrame(raf);
	}, [palette, pattern.colors, tiles]);

	return (
		<canvas
			ref={canvasRef}
			className="absolute inset-0 h-full w-full"
			style={{ pointerEvents: "none", width: "100%", height: "100%" }}
		/>
	);
}
