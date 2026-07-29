"use client";

import { useEffect, useRef, useState } from "react";
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
	hypMidpoint,
	type Su11,
	type Complex,
} from "@/lib/render/hyperbolic";
import { drawDevelopedEdgePatch, type DevelopedEdgePatch } from "@/lib/render/hyperbolicDevelopedDraw";
import { HyperbolicDeveloper } from "@/lib/render/hyperbolicDevelopClient";
import { prepareEdgeShaderTiling, type ShaderTiling } from "@/lib/render/hyperbolicReduce";
import { HyperbolicPerPixelRenderer } from "@/lib/render/hyperbolicPerPixelGL";
import { syncCanvasSize } from "@/lib/render/canvasSize";
import type { HypEdgesPattern } from "@/lib/freedraw/hyp-edges";

// Interactive Poincaré-disk view of a hyperbolic edge-system tiling — the per-pixel WebGL renderer, the
// SAME one the developed hyperbolic shelf uses. Each pixel reduces into the certified Dirichlet
// fundamental domain (lib/render/hyperbolicDirichlet.ts) with the complete side pairings and samples a
// baked EDGE field (prepareEdgeShaderTiling: merged-tile orbit + drawn/scaffold edge distances). This is
// what gives the three properties the 2D developer could not: the disk fills to the rim pixel-wise, panning
// re-anchors through the side pairings so it never drifts or stops (infinite, drift-free), and it runs on
// the GPU. When WebGL2 is unavailable or the Dirichlet certificate fails, it falls back to the explicit
// 2D developed-edge draw. The p5 canvas underneath captures pan gestures; this canvas is an
// input-transparent overlay.

const DISK_PAD_PX = 24;
const MAX_CENTER_R = 0.9995;

interface Props {
	/** Everything both render paths read. The Schwarz shelf (lib/freedraw/schwarz.ts) is not a
	 *  HypEdgesPattern but supplies exactly this, so it draws through this canvas unchanged. */
	pattern: Pick<HypEdgesPattern, "id" | "config" | "edge" | "darts">;
	/** Skip the per-pixel path. The Dirichlet reducer rebuilds side pairings from ONE edge length, so a
	 *  SCALENE board (a Schwarz triangle has three) has to take the explicit developed draw — which reads
	 *  the per-dart lengths off the darts and is correct there. */
	force2d?: boolean;
}

export function HyperbolicEdgesCanvas({ pattern, force2d = false }: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const glRef = useRef<HyperbolicPerPixelRenderer | null>(null);
	const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null);
	// A canvas that yielded a webgl2 context can never yield a 2d one, so a mode flip re-mounts via `key`.
	const [use2d, setUse2d] = useState(false);
	const devRef = useRef<HyperbolicDeveloper | null>(null); // fallback draw + click-feature snapping
	const stRef = useRef<ShaderTiling | null>(null);
	const readyRef = useRef(false);
	const anchorRef = useRef<{ gens: Su11[]; r: number } | null>(null);
	const metaRef = useRef<{ id: string; name: string; config: string; edge: number } | null>(null);
	const viewRef = useRef<Su11>(su11Identity());
	const prevOffset = useRef<{ x: number; y: number } | null>(null);
	const prevTargetOffset = useRef<{ x: number; y: number } | null>(null);
	const prevRot = useRef<number | null>(null);
	const centerAnim = useRef<Complex | null>(null);

	// Acquire the drawing context (WebGL2 preferred; 2D only when unavailable or when the tiling forces it).
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		if (!use2d && !force2d) {
			const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true });
			if (gl) {
				try {
					glRef.current = new HyperbolicPerPixelRenderer(gl);
				} catch (e) {
					console.warn("hyperbolic edge per-pixel renderer unavailable, falling back to 2D:", e);
					glRef.current = null;
				}
			}
		}
		if (!glRef.current) ctx2dRef.current = canvas.getContext("2d");
		return () => {
			glRef.current?.dispose();
			glRef.current = null;
			ctx2dRef.current = null;
		};
	}, [use2d, force2d]);

	// Bind the pattern to whichever renderer came up; (perPixel) build + upload the edge field.
	useEffect(() => {
		readyRef.current = false;
		const meta = { id: pattern.id, name: pattern.id, config: pattern.config, edge: pattern.edge };
		metaRef.current = meta;
		stRef.current = null;
		devRef.current = new HyperbolicDeveloper(pattern.darts, pattern.edge);
		viewRef.current = su11Identity();
		prevOffset.current = null;
		prevTargetOffset.current = null;
		prevRot.current = null;
		centerAnim.current = null;
		anchorRef.current = null;
		if (glRef.current) {
			const st = prepareEdgeShaderTiling(pattern.darts, pattern.edge, meta);
			if (st) {
				glRef.current.setTiling(st);
				stRef.current = st;
				anchorRef.current = { gens: st.domain.gens, r: Math.min(0.97, st.domain.rPEu + 0.05) };
				readyRef.current = true;
			} else {
				// Dirichlet certificate failed at runtime (loud in prepareEdgeShaderTiling) → 2D.
				setUse2d(true);
			}
		} else {
			readyRef.current = true; // 2D path is ready as soon as the developer exists
		}
	}, [pattern, use2d]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		let raf = 0;
		const render = () => {
			raf = requestAnimationFrame(render);
			const meta = metaRef.current;
			if (!meta || !readyRef.current) return;
			const { w, h, dpr } = syncCanvasSize(canvas);
			if (w <= 0 || h <= 0) return;
			const bw = canvas.width;
			const bh = canvas.height;

			const cfg = useConfiguration.getState();
			const ctrl = cfg.controls;
			const Rcss = Math.max(0.5 * Math.min(w, h) - DISK_PAD_PX, 1);
			const rotDeg = ctrl.rotation || 0;

			const clampApply = (next: Su11) => {
				const c = su11ApplyInverse(next, { x: 0, y: 0 });
				if (c.x * c.x + c.y * c.y <= MAX_CENTER_R * MAX_CENTER_R) viewRef.current = next;
			};

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
				const dragging =
					Math.hypot(ctrl.targetOffset.x - prevTargetOffset.current.x, ctrl.targetOffset.y - prevTargetOffset.current.y) > 1e-4;
				prevTargetOffset.current = { x: ctrl.targetOffset.x, y: ctrl.targetOffset.y };
				const dx = (ctrl.offset.x - prevOffset.current.x) / Rcss;
				const dy = -(ctrl.offset.y - prevOffset.current.y) / Rcss; // store y is DOWN; disk world y is UP
				prevOffset.current = { x: ctrl.offset.x, y: ctrl.offset.y };
				const dLen = Math.hypot(dx, dy);
				if (dLen > 1e-5 && !(centerAnim.current && !dragging)) {
					const sc = Math.min(dLen, 0.9) / dLen;
					clampApply(su11Normalize(su11Mul(su11Translation({ x: dx * sc, y: dy * sc }), viewRef.current)));
					if (dragging) centerAnim.current = null;
				}
				const dRot = ((rotDeg - prevRot.current) * Math.PI) / 180;
				prevRot.current = rotDeg;
				if (Math.abs(dRot) > 1e-6) viewRef.current = su11Normalize(su11Mul(su11Rotation(dRot), viewRef.current));
			}

			// Click-to-anchor: snap the click to the nearest developed feature and ease it to the centre.
			if (cfg.hyperbolicClick) {
				const clickDisk = { x: cfg.hyperbolicClick.x / Rcss, y: -cfg.hyperbolicClick.y / Rcss };
				useConfiguration.setState({ hyperbolicClick: null });
				const dev = devRef.current;
				if (dev && clickDisk.x * clickDisk.x + clickDisk.y * clickDisk.y < 0.998) {
					const local = dev.developEdges(meta, viewRef.current, 0.75, 4000);
					const world = su11ApplyInverse(viewRef.current, clickDisk);
					let best: Complex | null = null;
					let bd = Infinity;
					const consider = (c: Complex) => {
						const d = (c.x - world.x) ** 2 + (c.y - world.y) ** 2;
						if (d < bd) {
							bd = d;
							best = c;
						}
					};
					for (const f of local.faces) {
						let cx = 0;
						let cy = 0;
						for (const idx of f) {
							const v = local.vertices[idx];
							consider({ x: v[0], y: v[1] });
							cx += v[0];
							cy += v[1];
						}
						consider({ x: cx / f.length, y: cy / f.length });
						for (let i = 0; i < f.length; i++) {
							const a = local.vertices[f[i]];
							const b = local.vertices[f[(i + 1) % f.length]];
							consider(hypMidpoint({ x: a[0], y: a[1] }, { x: b[0], y: b[1] }));
						}
					}
					if (best) centerAnim.current = best;
				}
			}
			if (centerAnim.current) {
				const sp = su11Apply(viewRef.current, centerAnim.current);
				if (Math.hypot(sp.x, sp.y) > 1e-3) {
					clampApply(su11Normalize(su11Mul(su11Translation({ x: -sp.x * 0.2, y: -sp.y * 0.2 }), viewRef.current)));
				} else {
					centerAnim.current = null;
				}
			}

			// Re-anchor: fold the camera basepoint back into the Dirichlet domain via the side pairings, so
			// V ← V·g⁻¹ renders the identical image with a small view matrix — unlimited, drift-free panning.
			const anchor = anchorRef.current;
			if (anchor) {
				let c = su11ApplyInverse(viewRef.current, { x: 0, y: 0 });
				for (let i = 0; i < 64 && Math.hypot(c.x, c.y) > anchor.r; i++) {
					let bestG: Su11 | null = null;
					let bestC: Complex | null = null;
					let bestR = Math.hypot(c.x, c.y) - 1e-12;
					for (const g of anchor.gens) {
						const q = su11Apply(g, c);
						const qr = Math.hypot(q.x, q.y);
						if (qr < bestR) {
							bestR = qr;
							bestG = g;
							bestC = q;
						}
					}
					if (!bestG || !bestC) break;
					viewRef.current = su11Normalize(su11Mul(viewRef.current, su11Inverse(bestG)));
					if (centerAnim.current) centerAnim.current = su11Apply(bestG, centerAnim.current);
					c = bestC;
				}
			}

			const view = viewRef.current;
			const dark = document.documentElement.classList.contains("dark");
			const gl = glRef.current;
			if (gl && stRef.current) {
				gl.draw({
					view,
					R: Rcss * dpr,
					cx: bw / 2,
					cy: bh / 2,
					canvasH: bh,
					dark,
					showFill: cfg.showPolygonFill,
					hueOffset: cfg.hueOffset || 0,
					strokePx: cfg.lineWidth <= 0 ? 0 : Math.max(cfg.lineWidth, 0.5) * dpr,
					taper: cfg.hyperbolicLineMode !== "constant",
					edgeMode: true,
					scaffold: cfg.freedrawScaffold,
				});
			} else {
				// 2D fallback: explicit developed edges (robust; thin sub-pixel rim, no infinite pan).
				const ctx = ctx2dRef.current;
				const dev = devRef.current;
				if (!ctx || !dev) return;
				const patch: DevelopedEdgePatch = dev.developEdges(meta, view, 0.99, 12000);
				ctx.clearRect(0, 0, bw, bh);
				drawDevelopedEdgePatch(ctx, patch, view, {
					R: Rcss * dpr,
					cx: bw / 2,
					cy: bh / 2,
					dark,
					frame: false,
					showFill: cfg.showPolygonFill,
					showScaffold: cfg.freedrawScaffold,
					hueOffset: cfg.hueOffset || 0,
					strokePx: cfg.lineWidth <= 0 ? 0 : Math.max(cfg.lineWidth, 0.5) * dpr,
					taper: cfg.hyperbolicLineMode !== "constant",
				});
			}
		};
		raf = requestAnimationFrame(render);
		return () => cancelAnimationFrame(raf);
	}, [use2d]);

	return (
		<canvas
			key={use2d ? "2d" : "gl"}
			ref={canvasRef}
			className="absolute inset-0 h-full w-full"
			style={{ pointerEvents: "none", width: "100%", height: "100%" }}
		/>
	);
}
