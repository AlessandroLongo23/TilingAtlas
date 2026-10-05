"use client";

import { useEffect, useRef } from "react";
import { useConfiguration } from "@/stores/configuration";
import { drawDevelopedEdgePatch } from "@/lib/render/hyperbolicDevelopedDraw";
import { FALLBACK_BOUND_R, FALLBACK_BUDGET, HyperbolicDeveloper } from "@/lib/render/hyperbolicDevelopClient";
import { HypCamera } from "@/lib/render/hypCamera";
import { buildWalk } from "@/lib/render/hyperbolicWalk";
import { HyperbolicPerPixelRenderer } from "@/lib/render/hyperbolicPerPixelGL";
import { syncCanvasSize } from "@/lib/render/canvasSize";
import { captureOverride, offerFrame } from "@/lib/render/capture";
import type { HypEdgesPattern } from "@/lib/freedraw/hyp-edges";

// Interactive Poincaré-disk view of a hyperbolic edge-system tiling: the per-pixel WebGL renderer, the
// SAME one the developed hyperbolic shelf uses. Each pixel walks the quotient to its base face
// (lib/render/hyperbolicWalk.ts) and strokes by its computed distance to that face's drawn and undrawn
// sides. The disk fills to the rim pixel-wise, the camera re-anchors to the face under the centre so
// panning never drifts or stops, and it runs on the GPU. Where WebGL2 is unavailable it falls back to
// the explicit 2D developed-edge draw. The p5 canvas underneath captures pan gestures; this canvas is an
// input-transparent overlay.

const DISK_PAD_PX = 24;

interface Props {
	/** Everything both render paths read. The Schwarz shelf (lib/freedraw/schwarz.ts) is not a
	 *  HypEdgesPattern but supplies exactly this, so it draws through this canvas unchanged — including
	 *  the SCALENE boards, whose per-dart turns and lengths ride inside `darts`. */
	pattern: Pick<HypEdgesPattern, "id" | "config" | "edge" | "darts">;
}

export function HyperbolicEdgesCanvas({ pattern }: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const glRef = useRef<HyperbolicPerPixelRenderer | null>(null);
	const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
	const devRef = useRef<HyperbolicDeveloper | null>(null); // the 2D fallback only
	const camRef = useRef<{ id: string; cam: HypCamera } | null>(null);
	const metaRef = useRef<{ id: string; name: string; config: string; edge: number } | null>(null);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true });
		if (gl) {
			try {
				glRef.current = new HyperbolicPerPixelRenderer(gl);
			} catch (e) {
				console.warn("hyperbolic edge per-pixel renderer unavailable, falling back to 2D:", e);
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
		const walk = gl ? buildWalk(pattern.darts, pattern.edge) : null;
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
			const gl = glRef.current;
			const ctx = ctx2dRef.current;
			const dev = devRef.current;
			const hueOffset = cfg.hueOffset || 0;
			if (gl) {
				gl.draw({ ...shared, view: cam.view, face: cam.face, canvasH: bh, hueOffset, edgeMode: true, scaffold: cfg.freedrawScaffold });
			} else if (ctx && dev) {
				const patch = dev.developEdges(meta, cam.view, FALLBACK_BOUND_R, FALLBACK_BUDGET);
				ctx.clearRect(0, 0, bw, bh);
				drawDevelopedEdgePatch(ctx, patch, cam.view, { ...shared, frame: false, showScaffold: cfg.freedrawScaffold, hueOffset });
			}

			// Export: snapshot this layer while the frame is still in the drawing buffer. The context has no
			// preserveDrawingBuffer, so a read from anywhere but here comes back blank (lib/render/capture.ts).
			if (captureOverride()) offerFrame(canvas);
		};
		raf = requestAnimationFrame(render);
		return () => cancelAnimationFrame(raf);
	}, []);

	return (
		<canvas
			ref={canvasRef}
			className="absolute inset-0 h-full w-full"
			style={{ pointerEvents: "none", width: "100%", height: "100%" }}
		/>
	);
}
