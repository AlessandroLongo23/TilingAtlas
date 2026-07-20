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
	su11Inverse,
	type Su11,
	type Complex,
} from "@/lib/render/hyperbolic";
import { buildTilingGL, rebaseView, anchorPoint, type HyperbolicTilingGL } from "@/lib/render/hyperbolicGroup";
import {
	createDevelopedProgram,
	buildDevelopedUniforms,
	type DevelopedUniformData,
} from "@/lib/render/hyperbolicDevelopedShader";
import { loadDevelopedPatches } from "@/lib/render/hyperbolicDevelopedDraw";

// Interactive view of an engine-developed hyperbolic tiling, drawn per-pixel on the GPU (Poincaré disk).
// It reduces each pixel into a fundamental domain by the tiling's symmetry-group generators
// (lib/render/hyperbolicGroup.ts) and colours it by the fundamental tile it lands in — so it draws ANY
// developed tiling, infinitely, pixel-perfect to the rim. The p5 canvas underneath writes controls.offset;
// here we fold the per-frame delta into an SU(1,1) view and re-base every frame so the matrix never blows up.

const DISK_PAD_PX = 24;

interface Props {
	width: number;
	height: number;
	patchId: string;
}

export function HyperbolicDevelopedCanvas({ width, height, patchId }: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const glDataRef = useRef<HyperbolicTilingGL | null>(null);
	const uniRef = useRef<DevelopedUniformData | null>(null);
	const uniVersionRef = useRef(0); // bumped when uniRef changes, so the loop re-uploads the static arrays
	const viewRef = useRef<Su11>(su11Identity());
	const prevOffset = useRef<{ x: number; y: number } | null>(null);
	const prevTargetOffset = useRef<{ x: number; y: number } | null>(null);
	const prevRot = useRef<number | null>(null);
	const centerAnim = useRef<Complex | null>(null);
	const sizeRef = useRef({ width, height });
	useEffect(() => {
		sizeRef.current = { width, height };
	}, [width, height]);

	// Load the patch and build its symmetry group + shader uniforms when the tiling changes.
	useEffect(() => {
		let alive = true;
		loadDevelopedPatches().then((map) => {
			if (!alive) return;
			const patch = map[patchId];
			if (!patch) {
				glDataRef.current = null;
				uniRef.current = null;
				return;
			}
			const verts = patch.vertices.map(([x, y]) => ({ x, y }));
			const gl = buildTilingGL(verts, patch.faces);
			glDataRef.current = gl;
			uniRef.current = buildDevelopedUniforms(gl);
			uniVersionRef.current++;
			viewRef.current = su11Identity();
			prevOffset.current = null;
			prevTargetOffset.current = null;
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
		const gl = canvas.getContext("webgl2", { antialias: true, premultipliedAlpha: false });
		if (!gl) {
			console.error("developed hyperbolic view: WebGL2 unavailable");
			return;
		}
		const prog = createDevelopedProgram(gl);
		if (!prog) return;
		const U = prog.uniforms;
		let uploadedVersion = -1;

		let raf = 0;
		const render = () => {
			raf = requestAnimationFrame(render);
			const uni = uniRef.current;
			const gd = glDataRef.current;
			if (!uni || !gd) return;
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
			const R = Math.max(0.5 * Math.min(w, h) - DISK_PAD_PX, 1);
			const rotDeg = ctrl.rotation || 0;

			if (cfg.hyperbolicResetView) {
				viewRef.current = su11Identity();
				centerAnim.current = null;
				prevOffset.current = { x: ctrl.offset.x, y: ctrl.offset.y };
				prevTargetOffset.current = { x: ctrl.targetOffset.x, y: ctrl.targetOffset.y };
				prevRot.current = rotDeg;
				useConfiguration.setState({ hyperbolicResetView: false });
			} else {
				if (prevOffset.current === null) prevOffset.current = { x: ctrl.offset.x, y: ctrl.offset.y };
				if (prevTargetOffset.current === null) prevTargetOffset.current = { x: ctrl.targetOffset.x, y: ctrl.targetOffset.y };
				if (prevRot.current === null) prevRot.current = rotDeg;
				// A genuine DRAG moves targetOffset (live pointer input); the eased `offset` also drifts while
				// merely SETTLING toward a fixed target after a click (a click carries up to the ~5px click-drag
				// threshold of creep, or lands before a prior pan settled). Distinguish them so settle-drift is
				// not mistaken for a drag and does not abort the click-to-centre ease before it reaches the middle.
				const dragging =
					Math.hypot(ctrl.targetOffset.x - prevTargetOffset.current.x, ctrl.targetOffset.y - prevTargetOffset.current.y) > 1e-4;
				prevTargetOffset.current = { x: ctrl.targetOffset.x, y: ctrl.targetOffset.y };
				// Pan: per-frame drift in disk units, composed as a screen-space translation of the view.
				const dx = (ctrl.offset.x - prevOffset.current.x) / R;
				const dy = (ctrl.offset.y - prevOffset.current.y) / R;
				prevOffset.current = { x: ctrl.offset.x, y: ctrl.offset.y };
				const dLen = Math.hypot(dx, dy);
				// While a click-to-centre ease runs, ignore pure settle-drift (target not moving) so it neither
				// fights nor aborts the ease; a real drag (target moving) both pans and cancels it.
				if (dLen > 1e-5 && !(centerAnim.current && !dragging)) {
					const sc = Math.min(dLen, 0.9) / dLen;
					viewRef.current = su11Normalize(su11Mul(su11Translation({ x: dx * sc, y: dy * sc }), viewRef.current));
					if (dragging) centerAnim.current = null;
				}
				const dRot = ((rotDeg - prevRot.current) * Math.PI) / 180;
				prevRot.current = rotDeg;
				if (Math.abs(dRot) > 1e-6) {
					viewRef.current = su11Normalize(su11Mul(su11Rotation(dRot), viewRef.current));
				}
			}

			// Click-to-anchor: snap the click to the nearest tiling feature (vertex / edge midpoint / tile
			// centroid) and ease THAT to the disk centre — not the raw pixel. Only for clicks inside the disk.
			if (cfg.hyperbolicClick) {
				const clickDisk = { x: cfg.hyperbolicClick.x / R, y: cfg.hyperbolicClick.y / R };
				useConfiguration.setState({ hyperbolicClick: null });
				if (clickDisk.x * clickDisk.x + clickDisk.y * clickDisk.y < 0.998) {
					const world = su11ApplyInverse(viewRef.current, clickDisk);
					centerAnim.current = anchorPoint(gd, world);
				}
			}
			// Click-to-centre ease: nudge the anchored feature toward the disk centre with a screen-space
			// left-translation each frame, until it is within a pixel of the middle.
			if (centerAnim.current) {
				const sp = su11Apply(viewRef.current, centerAnim.current);
				if (Math.hypot(sp.x, sp.y) > 1e-3) {
					viewRef.current = su11Normalize(su11Mul(su11Translation({ x: -sp.x * 0.2, y: -sp.y * 0.2 }), viewRef.current));
				} else {
					centerAnim.current = null;
				}
			}

			// Re-base EVERY frame (even mid-ease) so the view matrix never grows unbounded — rapid clicking
			// keeps an ease alive continuously, which would otherwise starve the re-basing and bring back the
			// near-rim precision artifacts. Re-basing is a tiling symmetry (view' = view·g), image-invariant,
			// but it moves the anchor's screen position; carry the anchor through S = view'⁻¹·view (= g⁻¹) so
			// the ease target holds steady on screen and the animation neither jitters nor is knocked off course.
			{
				const before = viewRef.current;
				const rebased = rebaseView(gd, before);
				viewRef.current = rebased;
				if (centerAnim.current) {
					const S = su11Normalize(su11Mul(su11Inverse(rebased), before));
					centerAnim.current = su11Apply(S, centerAnim.current);
				}
			}
			const view = viewRef.current;
			const dark = document.documentElement.classList.contains("dark");

			// Static per-tiling arrays: upload once per tiling change.
			if (uploadedVersion !== uniVersionRef.current) {
				gl.uniform2f(U.uO, uni.o[0], uni.o[1]);
				gl.uniform1f(U.uOInvDen, uni.oInvDen);
				gl.uniform1i(U.uNGen, uni.nGen);
				gl.uniform4fv(U.uGenInv, uni.genInv);
				gl.uniform2fv(U.uSite, uni.site);
				gl.uniform1fv(U.uSiteInvDen, uni.siteInvDen);
				gl.uniform1i(U.uNTile, uni.nTile);
				gl.uniform1fv(U.uTileHue, uni.tileHue);
				gl.uniform2fv(U.uTileCentroid, uni.tileCentroid);
				gl.uniform1iv(U.uTileEdgeOff, uni.tileEdgeOff);
				gl.uniform1iv(U.uTileEdgeCount, uni.tileEdgeCount);
				gl.uniform4fv(U.uEdge, uni.edge);
				uploadedVersion = uniVersionRef.current;
			}

			gl.uniform2f(U.uRes, w, h);
			gl.uniform1f(U.uDpr, dpr);
			gl.uniform1f(U.uPadPx, DISK_PAD_PX);
			gl.uniform2f(U.uMa, view.a.x, view.a.y);
			gl.uniform2f(U.uMb, view.b.x, view.b.y);
			gl.uniform1f(U.uHueOffset, cfg.hueOffset || 0);
			gl.uniform1i(U.uDark, dark ? 1 : 0);
			gl.uniform3f(U.uSurface, dark ? 0.08 : 0.976, dark ? 0.067 : 0.973, dark ? 0.051 : 0.961);
			gl.uniform3f(U.uLine, dark ? 0.0 : 0.067, dark ? 0.0 : 0.067, dark ? 0.0 : 0.043);
			gl.uniform1i(U.uShowFill, cfg.showPolygonFill ? 1 : 0);
			// Stroke: geometry (perspective) keeps a constant hyperbolic width that tapers toward the rim like
			// the tiles; constant keeps a fixed device-px width. Driven by the shared options-tab toggle.
			gl.uniform1i(U.uStrokeMode, cfg.hyperbolicLineMode === "constant" ? 1 : 0);
			gl.uniform1f(U.uStrokePx, Math.max(cfg.lineWidth, 0.5) * 1.1 * dpr);
			gl.uniform1f(U.uStrokeGeom, Math.max(cfg.lineWidth, 0.5) * 0.02);

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

	// Absolute overlay over the input-only p5 canvas (which captures the pan gestures driving controls.offset).
	return (
		<canvas
			ref={canvasRef}
			className="absolute inset-0 h-full w-full"
			style={{ pointerEvents: "none", width: "100%", height: "100%" }}
		/>
	);
}
