"use client";

import { useEffect, useRef } from "react";
import { useConfiguration } from "@/stores/configuration";
import {
	su11Identity,
	su11Mul,
	su11Normalize,
	su11Translation,
	su11Rotation,
	su11Apply,
	su11ApplyInverse,
	type Su11,
	type Complex,
} from "@/lib/render/hyperbolic";
import { drawDevelopedPatch, loadDevelopedPatches, type DevelopedPatch } from "@/lib/render/hyperbolicDevelopedDraw";

// Interactive view of an engine-DEVELOPED hyperbolic tiling (Poincaré disk, 2D canvas). Reuses the same
// store-driven SU(1,1) pan/rotation as components/hyperbolic-canvas.tsx (the fold-shader placeholder view):
// the play page's pointer handlers move controls.offset/rotation, this loop reads the per-frame delta and
// composes it into the accumulated view isometry, so the navigation feels identical. Unlike the fold
// shader it can draw ANY developed patch (mixed tiles, arbitrary vertex config), which the (2,p,q) shader
// cannot. A patch is finite, so panning very far runs off its edge — acceptable until re-development lands.

const DISK_PAD_PX = 18;

interface Props {
	width: number;
	height: number;
	patchId: string;
}

export function HyperbolicDevelopedCanvas({ width, height, patchId }: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const patchRef = useRef<DevelopedPatch | null>(null);
	const viewRef = useRef<Su11>(su11Identity());
	const prevOffset = useRef<{ x: number; y: number } | null>(null);
	const prevRot = useRef<number | null>(null);
	const centerAnim = useRef<Complex | null>(null);
	const sizeRef = useRef({ width, height });
	sizeRef.current = { width, height };

	// load + reset when the selected tiling changes
	useEffect(() => {
		let alive = true;
		loadDevelopedPatches().then((map) => {
			if (!alive) return;
			patchRef.current = map[patchId] ?? null;
			viewRef.current = su11Identity();
			prevOffset.current = null;
			prevRot.current = null;
			centerAnim.current = null;
		});
		return () => {
			alive = false;
		};
	}, [patchId]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		let raf = 0;
		const render = () => {
			raf = requestAnimationFrame(render);
			const patch = patchRef.current;
			const { width: w, height: h } = sizeRef.current;
			if (!patch || w <= 0 || h <= 0) return;
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const bw = Math.round(w * dpr);
			const bh = Math.round(h * dpr);
			if (canvas.width !== bw || canvas.height !== bh) {
				canvas.width = bw;
				canvas.height = bh;
			}
			const Rcss = Math.max(0.5 * Math.min(w, h) - DISK_PAD_PX, 1);

			const cfg = useConfiguration.getState();
			const ctrl = cfg.controls;
			const rotDeg = ctrl.rotation || 0;

			if (cfg.hyperbolicResetView) {
				viewRef.current = su11Identity();
				centerAnim.current = null;
				prevOffset.current = { x: ctrl.offset.x, y: ctrl.offset.y };
				prevRot.current = rotDeg;
				useConfiguration.setState({ hyperbolicResetView: false });
			} else {
				if (prevOffset.current === null) prevOffset.current = { x: ctrl.offset.x, y: ctrl.offset.y };
				if (prevRot.current === null) prevRot.current = rotDeg;
				// Pan: per-frame drift in disk units (offset is CSS px; y-down screen → y-up disk, so dy flips).
				const dx = (ctrl.offset.x - prevOffset.current.x) / Rcss;
				const dy = -(ctrl.offset.y - prevOffset.current.y) / Rcss;
				prevOffset.current = { x: ctrl.offset.x, y: ctrl.offset.y };
				const dLen = Math.hypot(dx, dy);
				if (dLen > 1e-5) {
					const s = Math.min(dLen, 0.9) / dLen; // clamp one frame so |delta| stays < 1
					viewRef.current = su11Normalize(su11Mul(su11Translation({ x: dx * s, y: dy * s }), viewRef.current));
					centerAnim.current = null;
				}
				const dRot = ((rotDeg - prevRot.current) * Math.PI) / 180;
				prevRot.current = rotDeg;
				if (Math.abs(dRot) > 1e-6) {
					viewRef.current = su11Normalize(su11Mul(su11Rotation(dRot), viewRef.current));
				}
			}

			// Click-to-centre: ease the clicked world point to the disk centre.
			if (cfg.hyperbolicClick) {
				const clickDisk = { x: cfg.hyperbolicClick.x / Rcss, y: -cfg.hyperbolicClick.y / Rcss };
				centerAnim.current = su11ApplyInverse(viewRef.current, clickDisk);
				useConfiguration.setState({ hyperbolicClick: null });
			}
			if (centerAnim.current) {
				const sc = su11Apply(viewRef.current, centerAnim.current);
				if (Math.hypot(sc.x, sc.y) > 1e-3) {
					viewRef.current = su11Normalize(su11Mul(su11Translation({ x: -sc.x * 0.2, y: -sc.y * 0.2 }), viewRef.current));
				} else {
					centerAnim.current = null;
				}
			}

			const R = Rcss * dpr;
			ctx.clearRect(0, 0, bw, bh);
			const dark = document.documentElement.classList.contains("dark");
			drawDevelopedPatch(ctx, patch, viewRef.current, { R, cx: bw / 2, cy: bh / 2, dark, frame: true });
		};
		raf = requestAnimationFrame(render);
		return () => cancelAnimationFrame(raf);
	}, []);

	// Absolute overlay over the flat p5 canvas (which stays mounted below and captures the pan gestures that
	// drive controls.offset — pointerEvents:none lets them through), matching components/hyperbolic-canvas.tsx.
	return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ pointerEvents: "none" }} />;
}
