"use client";

import { useEffect, useMemo, useRef } from "react";
import { useConfiguration } from "@/stores/configuration";
import { createHyperbolicProgram } from "@/lib/render/hyperbolicShader";
import {
	hyperbolicUniformValues,
	isHyperbolic,
	pickClickAnchor,
	su11Apply,
	su11ApplyInverse,
	su11Identity,
	su11Inverse,
	su11Mul,
	su11Normalize,
	su11Rebase,
	su11Rotation,
	su11Translation,
	type Complex,
	type Su11,
	type WythoffSpec,
} from "@/lib/render/hyperbolic";

// The hyperbolic view. A WebGL2 full-screen quad renders a regular {p,q} tiling in the Poincaré disk:
// the fragment shader folds each pixel into the fundamental Schwarz triangle of the (2,p,q) group (see
// lib/render/hyperbolicShader.ts). The p5 canvas (mounted underneath, input-only while hyperbolic is on)
// writes the pan offset into the store; here we consume the per-frame CHANGE in that offset and compose
// it into an SU(1,1) view isometry, so a fixed pixel-drag translates the disk by a fixed amount
// everywhere (locally consistent) rather than blowing up near the rim. Pan is a hyperbolic translation;
// there is no zoom.

interface HyperbolicCanvasProps {
	width: number;
	height: number;
	wythoff: WythoffSpec;
}

export function HyperbolicCanvas({ width, height, wythoff }: HyperbolicCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const sizeRef = useRef({ width, height });
	sizeRef.current = { width, height };

	// All shader inputs for the current tiling, recomputed only when the spec changes. null when {p,q} is
	// not hyperbolic (guards a bad palette entry — the loop then renders background only).
	const specKey = `${wythoff.p},${wythoff.q},${wythoff.rings.join("")},${wythoff.snub ? 1 : 0}`;
	const geom = useMemo(() => {
		if (!isHyperbolic(wythoff.p, wythoff.q)) return null;
		return hyperbolicUniformValues(wythoff);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [specKey]);
	const geomRef = useRef(geom);
	geomRef.current = geom;

	// The accumulated view isometry and the pan/rotation state we last folded into it.
	const viewRef = useRef<Su11>(su11Identity());
	const prevOffsetRef = useRef<{ x: number; y: number } | null>(null);
	const prevTargetOffsetRef = useRef<{ x: number; y: number } | null>(null);
	const prevRotRef = useRef<number | null>(null);
	// World-space centre of a clicked tile that we are easing toward the screen centre (null when idle).
	const centerAnimRef = useRef<Complex | null>(null);
	// Absolute-parity correction: accumulates the re-base's edge crossings (mod 2) so the two-tone colouring
	// stays fixed per tile as the view pans (only meaningful for the 2-colourable q-even tilings).
	const parityOffsetRef = useRef(0);

	// Recentre (identity view) when the selected tiling changes; re-sync the delta trackers so the switch
	// doesn't register as a giant drag.
	useEffect(() => {
		viewRef.current = su11Identity();
		prevOffsetRef.current = null;
		prevTargetOffsetRef.current = null;
		prevRotRef.current = null;
		centerAnimRef.current = null;
		parityOffsetRef.current = 0;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [specKey]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const gl = canvas.getContext("webgl2", { antialias: true, premultipliedAlpha: false });
		if (!gl) {
			console.error("hyperbolic view: WebGL2 unavailable");
			return;
		}
		const prog = createHyperbolicProgram(gl);
		if (!prog) return;
		const U = prog.uniforms;

		let raf = 0;
		const render = () => {
			raf = requestAnimationFrame(render);
			const g = geomRef.current;
			if (!g) return;
			const { width: w, height: h } = sizeRef.current;
			if (w <= 0 || h <= 0) return;

			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const bw = Math.round(w * dpr);
			const bh = Math.round(h * dpr);
			if (canvas.width !== bw || canvas.height !== bh) {
				canvas.width = bw;
				canvas.height = bh;
			}
			gl.viewport(0, 0, bw, bh);

			const cfg = useConfiguration.getState();
			const ctrl = cfg.controls;
			const R = 0.5 * Math.min(w, h);
			const rotDeg = cfg.rotation || 0;

			// Right-click reset (or tiling change): return to the centred identity view.
			if (cfg.hyperbolicResetView) {
				viewRef.current = su11Identity();
				centerAnimRef.current = null;
				parityOffsetRef.current = 0;
				prevOffsetRef.current = { x: ctrl.offset.x, y: ctrl.offset.y };
				prevTargetOffsetRef.current = { x: ctrl.targetOffset.x, y: ctrl.targetOffset.y };
				prevRotRef.current = rotDeg;
				useConfiguration.setState({ hyperbolicResetView: false });
			} else {
				if (prevOffsetRef.current === null) prevOffsetRef.current = { x: ctrl.offset.x, y: ctrl.offset.y };
				if (prevTargetOffsetRef.current === null) prevTargetOffsetRef.current = { x: ctrl.targetOffset.x, y: ctrl.targetOffset.y };
				if (prevRotRef.current === null) prevRotRef.current = rotDeg;
				// A genuine pan gesture MOVES targetOffset (live pointer input); the eased `offset` also drifts
				// while merely SETTLING toward a fixed target after a click (a click may carry up to the 5px
				// click-drag threshold of creep, or land before a prior pan settled). Distinguish them so that
				// settle drift is not mistaken for a drag and does not abort the click-to-centre ease.
				const dragging =
					Math.hypot(ctrl.targetOffset.x - prevTargetOffsetRef.current.x, ctrl.targetOffset.y - prevTargetOffsetRef.current.y) > 1e-4;
				prevTargetOffsetRef.current = { x: ctrl.targetOffset.x, y: ctrl.targetOffset.y };
				// Pan: compose the per-frame drift (in disk units) as a screen-space translation of the view.
				// Both the offset and the shader's screen coord are y-down, so no sign flip.
				const dx = (ctrl.offset.x - prevOffsetRef.current.x) / R;
				const dy = (ctrl.offset.y - prevOffsetRef.current.y) / R;
				prevOffsetRef.current = { x: ctrl.offset.x, y: ctrl.offset.y };
				const dLen = Math.hypot(dx, dy);
				// While a click-to-centre ease is running, ignore pure settle drift (target not moving) so it
				// neither fights nor aborts the ease; a real drag (target moving) both pans and cancels it.
				if (dLen > 1e-5 && !(centerAnimRef.current && !dragging)) {
					const s = Math.min(dLen, 0.9) / dLen; // clamp a single frame so a fast drag can't push |delta| ≥ 1
					viewRef.current = su11Normalize(su11Mul(su11Translation({ x: dx * s, y: dy * s }), viewRef.current));
					if (dragging) centerAnimRef.current = null;
				}
				// Rotation: compose the per-frame change about the screen centre.
				const dRot = ((rotDeg - prevRotRef.current) * Math.PI) / 180;
				prevRotRef.current = rotDeg;
				if (Math.abs(dRot) > 1e-6) {
					viewRef.current = su11Normalize(su11Mul(su11Rotation(dRot), viewRef.current));
				}
			}

			// Click-to-anchor: snap to the nearest of the clicked tile's centre, a vertex, or an edge
			// midpoint, then ease that point to the screen centre.
			if (cfg.hyperbolicClick) {
				const clickDisk = { x: cfg.hyperbolicClick.x / R, y: cfg.hyperbolicClick.y / R };
				const wClick = su11ApplyInverse(viewRef.current, clickDisk);
				centerAnimRef.current = pickClickAnchor(wClick, g);
				useConfiguration.setState({ hyperbolicClick: null });
			}
			if (centerAnimRef.current) {
				const sc = su11Apply(viewRef.current, centerAnimRef.current); // its current screen position
				if (Math.hypot(sc.x, sc.y) > 1e-3) {
					viewRef.current = su11Normalize(su11Mul(su11Translation({ x: -sc.x * 0.2, y: -sc.y * 0.2 }), viewRef.current));
				} else {
					centerAnimRef.current = null;
				}
			}

			// Re-base EVERY frame (even mid click-animation) so the view matrix never grows unbounded —
			// rapid clicking used to keep an animation alive continuously and starve the re-basing, bringing
			// the precision artifacts back. Re-basing is a tiling symmetry S (V' = V·S⁻¹), so it also moves
			// the world-space click target; transform it by S = V'⁻¹·V to hold its screen position steady.
			{
				const before = viewRef.current;
				const rb = su11Rebase(before, g.p, g.edgeA, g.edgeRho);
				viewRef.current = rb.view;
				parityOffsetRef.current = (parityOffsetRef.current + rb.steps) % 2;
				if (centerAnimRef.current) {
					const S = su11Normalize(su11Mul(su11Inverse(rb.view), before));
					centerAnimRef.current = su11Apply(S, centerAnimRef.current);
				}
			}

			const view = viewRef.current;
			const dark = document.documentElement.classList.contains("dark");

			gl.uniform2f(U.uRes, w, h);
			gl.uniform1f(U.uDpr, dpr);
			gl.uniform2f(U.uMa, view.a.x, view.a.y);
			gl.uniform2f(U.uMb, view.b.x, view.b.y);
			gl.uniform1f(U.uP, g.p);
			gl.uniform1f(U.uEdgeA, g.edgeA);
			gl.uniform1f(U.uEdgeRho, g.edgeRho);
			gl.uniform1i(U.uShadeMode, cfg.hyperbolicShading === "parity" ? 1 : 0);
			gl.uniform1f(U.uParityOffset, parityOffsetRef.current);
			gl.uniform1f(U.uHue, g.hue);
			// Magnitude is scaled per mode: geometry = a fraction of the tile edge, constant = screen px.
			const constantWidth = cfg.hyperbolicLineMode === "constant";
			gl.uniform1i(U.uStrokeMode, constantWidth ? 1 : 0);
			gl.uniform1f(U.uStrokePx, cfg.lineWidth * (constantWidth ? 1.2 : 0.03));
			gl.uniform3f(U.uSurface, dark ? 0.08 : 0.96, dark ? 0.09 : 0.96, dark ? 0.11 : 0.97);
			gl.uniform3f(U.uLine, 0.05, 0.05, 0.07);
			gl.uniform3f(U.uParityA, 0.9, 0.9, 0.92);
			gl.uniform3f(U.uParityB, 0.12, 0.12, 0.14);
			// Uniform-tiling classifier inputs (uNTiles==1 ⇒ the regular path ignores all of these).
			gl.uniform1i(U.uNTiles, g.nTiles);
			gl.uniform2f(U.uWythoff, g.wythoff.x, g.wythoff.y);
			gl.uniform2f(U.uFootA, g.footA.x, g.footA.y);
			gl.uniform2f(U.uFootB, g.footB.x, g.footB.y);
			gl.uniform2f(U.uFootC, g.footC.x, g.footC.y);
			gl.uniform2f(U.uCornerV, g.cornerV.x, g.cornerV.y);
			gl.uniform1f(U.uRin, g.rIn);
			gl.uniform3f(U.uOcc, g.occ[0], g.occ[1], g.occ[2]);
			gl.uniform3f(U.uTileHue, g.tileHue[0], g.tileHue[1], g.tileHue[2]);
			gl.uniform1i(U.uSnub, g.snub ? 1 : 0);
			if (g.snub) {
				gl.uniform2f(U.uSnubS, g.snub.s.x, g.snub.s.y);
				gl.uniform2f(U.uSnubAs, g.snub.as.x, g.snub.as.y);
				gl.uniform2f(U.uSnubAis, g.snub.ais.x, g.snub.ais.y);
				gl.uniform2f(U.uSnubBs, g.snub.bs.x, g.snub.bs.y);
				gl.uniform2f(U.uSnubBis, g.snub.bis.x, g.snub.bis.y);
				gl.uniform2f(U.uSnubN, g.snub.n.x, g.snub.n.y);
				gl.uniform2f(U.uSnubB2s, g.snub.b2s.x, g.snub.b2s.y);
			}

			gl.drawArrays(gl.TRIANGLES, 0, 6);
		};
		raf = requestAnimationFrame(render);

		return () => {
			cancelAnimationFrame(raf);
			gl.deleteProgram(prog.program);
			gl.deleteShader(prog.vs);
			gl.deleteShader(prog.fs);
			gl.deleteBuffer(prog.quad);
		};
	}, []);

	return (
		<canvas
			ref={canvasRef}
			className="absolute inset-0 h-full w-full"
			style={{ pointerEvents: "none", width: "100%", height: "100%" }}
		/>
	);
}
