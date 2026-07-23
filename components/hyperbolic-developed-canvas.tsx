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
	hypMidpoint,
	type Su11,
	type Complex,
} from "@/lib/render/hyperbolic";
import { loadDevelopedPatches, drawDevelopedPatch, type CataloguePatch, type DevelopedPatch } from "@/lib/render/hyperbolicDevelopedDraw";
import { HyperbolicDeveloper } from "@/lib/render/hyperbolicDevelopClient";
import { prepareShaderTiling, type ShaderTiling } from "@/lib/render/hyperbolicReduce";
import { getIslamicField } from "@/lib/render/hyperbolicIslamic";
import { su11Inverse } from "@/lib/render/hyperbolic";
import { HyperbolicPerPixelRenderer } from "@/lib/render/hyperbolicPerPixelGL";
import { islamicNormalAngleFromSlider } from "@/utils/islamicNoise";
import { tileHueRgb01 } from "@/lib/render/hueRing";

// Interactive view of an engine-developed hyperbolic tiling. It reduces each PIXEL into the fundamental
// domain with the exact deck generators from the develop (lib/render/hyperbolicReduce.ts) and colours it —
// a per-pixel WebGL renderer that fills the WHOLE disk to the rim, with no symmetry-group reconstruction
// (which made the old shader fragile) and no orbit swap. If WebGL2 is unavailable it falls back to the
// explicit-polygon 2D renderer (robust but with a thin sub-pixel rim). The p5 canvas underneath captures
// the pan gestures; this canvas is an input-transparent overlay.

const DISK_PAD_PX = 24;
const MAX_CENTER_R = 0.9995; // clamp only against numerical blow-up at the ideal boundary; panning is otherwise free
const ISLAMIC_DRAG_RES = 256; // in-drag Islamic bake res — every slider notch lands the same frame
const ISLAMIC_SETTLE_MS = 200; // stable angle re-bakes at full res after this quiet window

interface Props {
	width: number;
	height: number;
	patchId: string;
}

export function HyperbolicDevelopedCanvas({ width, height, patchId }: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const glRef = useRef<HyperbolicPerPixelRenderer | null>(null);
	const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null); // set only in the 2D fallback path
	// Per-PATCH renderer choice, not just per-machine: a patch stamped `certified: false` (or whose
	// reduction fails at runtime) draws through the 2D developed renderer. A canvas that has yielded a
	// webgl2 context can never yield a 2d one, so flipping modes re-mounts the element via `key`.
	const [use2d, setUse2d] = useState(false);
	// Patches whose reduction failed AT RUNTIME (unstamped file, or a stamp gone stale). Without this
	// memory the mode reconciliation reads `certified === undefined`, decides GL is wanted, flips back,
	// fails again — an oscillation that leaves the canvas permanently blank (caught 2026-07-23).
	const runtimeUncertified = useRef<Set<string>>(new Set());
	const devRef = useRef<HyperbolicDeveloper | null>(null); // click-feature snapping + fallback draw
	const readyRef = useRef(false); // shader tiling uploaded (perPixel) or developer ready (2D)
	// (tile, residual) camera data: the certified side pairings fold the camera basepoint back into the
	// Dirichlet domain whenever panning carries it out, so the view isometry stays a few units from the
	// identity FOREVER — float32 uniforms never degrade and panning is unlimited.
	const anchorRef = useRef<{ gens: Su11[]; r: number } | null>(null);
	const metaRef = useRef<{ id: string; name: string; config: string; edge: number } | null>(null);
	const stRef = useRef<ShaderTiling | null>(null); // the prepared reduction — the Islamic bake reuses it
	const patchRef = useRef<CataloguePatch | null>(null);
	// Islamic plain field bookkeeping. Every angle change bakes IMMEDIATELY at a coarse resolution
	// (fast enough to land in the same frame — the develop is cached, only rays + arrangement + a
	// 256² texel loop re-run), then the stable angle silently refines to full resolution. No throttle:
	// the slider reads live at every notch.
	const islamicKey = useRef<string | null>(null);
	const islamicOk = useRef(false);
	const islamicRes = useRef(0); // res of the uploaded field (coarse during a drag)
	const islamicLastBake = useRef(0);
	const islamic2dWarned = useRef(false);
	const viewRef = useRef<Su11>(su11Identity());
	const prevOffset = useRef<{ x: number; y: number } | null>(null);
	const prevTargetOffset = useRef<{ x: number; y: number } | null>(null);
	const prevRot = useRef<number | null>(null);
	const centerAnim = useRef<Complex | null>(null);
	const sizeRef = useRef({ width, height });
	useEffect(() => {
		sizeRef.current = { width, height };
	}, [width, height]);

	// Acquire the drawing context (WebGL2 preferred; 2D when unavailable OR when the patch forces it).
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		if (!use2d) {
			const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true });
			if (gl) {
				try {
					glRef.current = new HyperbolicPerPixelRenderer(gl);
				} catch (e) {
					console.warn("hyperbolic per-pixel renderer unavailable, falling back to 2D:", e);
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
	}, [use2d]);

	// Load the patch, build its developer, and (perPixel) upload its reduction generators + field.
	// Re-runs when `use2d` flips: the flip re-mounts the canvas and re-acquires the context, and this
	// effect then binds the patch to whichever renderer came up. Each patch settles in ≤1 extra pass —
	// setUse2d is only called when the value actually changes.
	useEffect(() => {
		let alive = true;
		readyRef.current = false;
		loadDevelopedPatches().then((map) => {
			if (!alive) return;
			const patch = map[patchId] ?? null;
			const meta = patch ? { id: patch.id, name: patch.name, config: patch.config, edge: patch.edge } : null;
			metaRef.current = meta;
			patchRef.current = patch;
			stRef.current = null;
			islamicKey.current = null;
			islamicOk.current = false;
			devRef.current = patch?.darts ? new HyperbolicDeveloper(patch.darts, patch.edge) : null;
			viewRef.current = su11Identity();
			prevOffset.current = null;
			prevTargetOffset.current = null;
			prevRot.current = null;
			centerAnim.current = null;
			anchorRef.current = null;
			// Stamped un-certifiable → 2D. Stamped/unstamped certifiable while stuck in 2D mode (the
			// PREVIOUS patch forced it) → back to GL. Either flip re-mounts the canvas and re-runs this.
			const want2d = patch?.certified === false || runtimeUncertified.current.has(patchId);
			if (patch?.darts && want2d !== use2d && !(ctx2dRef.current && !glRef.current && want2d)) {
				setUse2d(want2d);
				if (want2d) return; // context is still webgl2 this pass; the re-run binds 2D
			}
			if (patch?.darts && glRef.current && meta && !want2d) {
				// Build the certified Dirichlet reduction (side pairings + total field) once, then upload.
				const st = prepareShaderTiling(patch.darts, patch.edge, meta);
				if (st) {
					glRef.current.setTiling(st);
					stRef.current = st;
					anchorRef.current = { gens: st.domain.gens, r: Math.min(0.97, st.domain.rPEu + 0.05) };
					readyRef.current = true;
				} else {
					// Certificate failed at runtime (loud in prepareShaderTiling) — remember it, then 2D.
					runtimeUncertified.current.add(patchId);
					setUse2d(true);
				}
			} else {
				readyRef.current = !!patch?.darts;
			}
		});
		return () => {
			alive = false;
		};
	}, [patchId, use2d]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		let raf = 0;
		const render = () => {
			raf = requestAnimationFrame(render);
			const meta = metaRef.current;
			if (!meta || !readyRef.current) return;
			const { width: w, height: h } = sizeRef.current;
			if (w <= 0 || h <= 0) return;

			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const bw = Math.round(w * dpr);
			const bh = Math.round(h * dpr);
			if (canvas.width !== bw || canvas.height !== bh) {
				canvas.width = bw;
				canvas.height = bh;
			}

			const cfg = useConfiguration.getState();
			const ctrl = cfg.controls;
			const Rcss = Math.max(0.5 * Math.min(w, h) - DISK_PAD_PX, 1); // disk radius in CSS px (pan units)
			const rotDeg = ctrl.rotation || 0;

			// dev-only pan diagnostics (window.__hypDebug), same spirit as the __stores hook
			const dbgHost = window as unknown as { __hypDebug?: Record<string, unknown> };
			const dbg: Record<string, unknown> =
				process.env.NODE_ENV !== "production"
					? (dbgHost.__hypDebug ??= { frames: 0, applied: 0, rejected: 0, folds: 0, view: null, center: null })
					: {};
			dbg.frames = ((dbg.frames as number) ?? 0) + 1;

			const clampApply = (next: Su11) => {
				const c = su11ApplyInverse(next, { x: 0, y: 0 });
				if (c.x * c.x + c.y * c.y <= MAX_CENTER_R * MAX_CENTER_R) {
					viewRef.current = next;
					dbg.applied = (dbg.applied as number) + 1;
				} else {
					dbg.rejected = (dbg.rejected as number) + 1;
				}
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
				// store offsets are centred CSS px with y DOWN; the disk world is y UP (the shader maps
				// gl_FragCoord y-up) — negate so dragging down moves the tiling down, not mirrored.
				const dy = -(ctrl.offset.y - prevOffset.current.y) / Rcss;
				prevOffset.current = { x: ctrl.offset.x, y: ctrl.offset.y };
				const dLen = Math.hypot(dx, dy);
				if (dLen > 1e-5 && !(centerAnim.current && !dragging)) {
					const sc = Math.min(dLen, 0.9) / dLen;
					clampApply(su11Normalize(su11Mul(su11Translation({ x: dx * sc, y: dy * sc }), viewRef.current)));
					if (dragging) centerAnim.current = null;
				}
				const dRot = ((rotDeg - prevRot.current) * Math.PI) / 180;
				prevRot.current = rotDeg;
				if (Math.abs(dRot) > 1e-6) {
					viewRef.current = su11Normalize(su11Mul(su11Rotation(dRot), viewRef.current));
				}
			}

			// Click-to-anchor: snap the click to the nearest tiling feature (developed on demand) and ease it
			// to the disk centre.
			if (cfg.hyperbolicClick) {
				// click comes in centred CSS px, y down (canvas.tsx) — flip to the disk's y-up frame.
				const clickDisk = { x: cfg.hyperbolicClick.x / Rcss, y: -cfg.hyperbolicClick.y / Rcss };
				useConfiguration.setState({ hyperbolicClick: null });
				const dev = devRef.current;
				if (dev && clickDisk.x * clickDisk.x + clickDisk.y * clickDisk.y < 0.998) {
					const local = dev.develop(meta, viewRef.current, 0.75, 4000);
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

			// Re-anchor: fold the camera basepoint back into the Dirichlet domain via the side pairings.
			// V ← V·g⁻¹ renders the IDENTICAL image (the tiling is Γ-invariant) with a small view matrix,
			// so unlimited panning never accumulates float error (the (tile, residual) camera).
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
					if (!bestG || !bestC) break; // basepoint already in the closed domain
					viewRef.current = su11Normalize(su11Mul(viewRef.current, su11Inverse(bestG)));
					// keep the click-anchor target pointing at the same world feature under the new labels
					if (centerAnim.current) centerAnim.current = su11Apply(bestG, centerAnim.current);
					c = bestC;
					dbg.folds = (dbg.folds as number) + 1;
				}
			}
			dbg.view = { a: { ...viewRef.current.a }, b: { ...viewRef.current.b } };
			dbg.center = su11ApplyInverse(viewRef.current, { x: 0, y: 0 });

			const view = viewRef.current;
			const dark = document.documentElement.classList.contains("dark");
			const gl = glRef.current;
			if (gl) {
				// Islamic plain field: a NEW angle bakes right away at ISLAMIC_DRAG_RES (cached develop —
				// the whole rebake is a few tens of ms, so each slider notch lands the frame it happens);
				// once the angle sits still for ISLAMIC_SETTLE_MS the same field re-bakes at full
				// resolution. Both bakes hit the per-(tiling, angle, res) cache on revisits.
				let islamicActive = false;
				if (cfg.isIslamic && stRef.current && patchRef.current?.darts) {
					const offsetPct = Math.round(Math.min(Math.max(cfg.islamicEdgeOffset, 0), 100));
					const key = `${meta.id}|${Math.round(cfg.islamicAngle)}|${offsetPct}`;
					const now = performance.now();
					const fullRes = Math.min(stRef.current.field.res, 1024);
					const bake = (res: number) => {
						const field = getIslamicField(
							stRef.current!,
							patchRef.current!.darts!,
							patchRef.current!.edge,
							meta,
							islamicNormalAngleFromSlider(cfg.islamicAngle),
							offsetPct / 100,
							{ fieldRes: res },
						);
						gl.setIslamicField(field);
						islamicKey.current = key;
						islamicOk.current = !!field;
						islamicRes.current = res;
						islamicLastBake.current = now;
					};
					if (islamicKey.current !== key) {
						bake(Math.min(ISLAMIC_DRAG_RES, fullRes));
					} else if (islamicOk.current && islamicRes.current < fullRes && now - islamicLastBake.current > ISLAMIC_SETTLE_MS) {
						bake(fullRes);
					}
					islamicActive = islamicOk.current;
				}
				gl.draw({
					view,
					R: Rcss * dpr,
					cx: bw / 2,
					cy: bh / 2,
					canvasH: bh,
					dark,
					showFill: cfg.showPolygonFill,
					hueOffset: cfg.hueOffset || 0,
					strokePx: cfg.lineWidth <= 0 ? 0 : Math.max(cfg.lineWidth, 0.5) * dpr * 1.1, // 0 = no stroke
					taper: cfg.hyperbolicLineMode !== "constant",
					islamic: islamicActive,
					islamicColB: tileHueRgb01(cfg.islamicFillHueB),
					islamicColC: tileHueRgb01(cfg.islamicFillHueC),
				});
			} else {
				if (cfg.isIslamic && !islamic2dWarned.current) {
					islamic2dWarned.current = true;
					console.info("hyperbolic 2D fallback: the Islamic construction needs the WebGL2 per-pixel renderer");
				}
				// 2D fallback: explicit developed polygons (robust, thin sub-pixel rim).
				const ctx = ctx2dRef.current;
				const dev = devRef.current;
				if (!ctx || !dev) return;
				const patch: DevelopedPatch = dev.develop(meta, view, 0.99, 12000);
				ctx.clearRect(0, 0, bw, bh);
				drawDevelopedPatch(ctx, patch, view, {
					R: Rcss * dpr,
					cx: bw / 2,
					cy: bh / 2,
					dark,
					frame: false,
					showFill: cfg.showPolygonFill,
					hueOffset: cfg.hueOffset || 0,
					strokePx: cfg.lineWidth <= 0 ? 0 : Math.max(cfg.lineWidth, 0.5) * dpr * 1.1, // 0 = no stroke
					taper: cfg.hyperbolicLineMode !== "constant",
				});
			}
		};
		raf = requestAnimationFrame(render);
		return () => {
			cancelAnimationFrame(raf);
		};
	}, [use2d]);

	return (
		<canvas
			// A mode flip must yield a FRESH element: a canvas that has produced a webgl2 context can
			// never produce a 2d one. The render loop re-binds through the same `use2d` dependency.
			key={use2d ? "2d" : "gl"}
			ref={canvasRef}
			className="absolute inset-0 h-full w-full"
			style={{ pointerEvents: "none", width: "100%", height: "100%" }}
		/>
	);
}
