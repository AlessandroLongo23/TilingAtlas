"use client";

import { useEffect, useRef } from "react";
import { fillAmountToSatPct } from "@/lib/render/tilePalette";
import type { RefObject } from "react";
import { useConfiguration } from "@/stores/configuration";
import { loadDevelopedPatches, drawDevelopedPatch, type CataloguePatch } from "@/lib/render/hyperbolicDevelopedDraw";
import { FALLBACK_BOUND_R, FALLBACK_BUDGET, HyperbolicDeveloper } from "@/lib/render/hyperbolicDevelopClient";
import { IslamicFeed } from "@/lib/render/hyperbolicIslamic";
import { HypCamera } from "@/lib/render/hypCamera";
import { buildWalk, type WalkTiling } from "@/lib/render/hyperbolicWalk";
import { HyperbolicPerPixelRenderer } from "@/lib/render/hyperbolicPerPixelGL";
import { syncCanvasSize } from "@/lib/render/canvasSize";
import { captureOverride, offerFrame } from "@/lib/render/capture";

// Interactive view of an engine-developed hyperbolic tiling. Each PIXEL walks the quotient to its tile
// (lib/render/hyperbolicWalk.ts) and is coloured there, so the WHOLE disk fills to the rim for every
// record, with no symmetry-group reconstruction and nothing to bake but the Islamic construction's
// per-polygon layers (hyperbolicIslamic.ts). If WebGL2 is unavailable it falls back to the explicit-polygon 2D renderer (robust but
// with a thin sub-pixel rim). The p5 canvas underneath captures the pan gestures; this canvas is an
// input-transparent overlay.

const DISK_PAD_PX = 24; // /play's default gap from the canvas edge; see the diskPadPx prop
/**
 * Per-instance view input, for an embedded disk that must NOT steer (or be steered by) the global
 * configuration store — the landing wall's Hyperbolic cell. Supply it and the loop reads pan,
 * rotation, recentre and click-to-anchor from here instead of `cfg.controls`; omit it and /play's
 * store-driven path runs exactly as before.
 *
 * `resetSeq` / `click.seq` are counters, not flags, because ownership stays one-way: the canvas
 * remembers the last sequence it acted on instead of writing a consumed flag back into its caller's
 * object (which is what /play does, and what two owners of one object would race over).
 */
export interface HyperbolicViewInput {
	/** Live (eased) pan offset in centred CSS px, y DOWN — the same frame as /play's controls.offset. */
	offset: { x: number; y: number };
	/** Pan target the pointer writes. Only used to tell an active drag from a settling glide. */
	targetOffset: { x: number; y: number };
	/** Live (eased) view rotation in degrees. */
	rotationDeg: number;
	/** Bump to recentre the disk (right-click in /play). */
	resetSeq: number;
	/** Click to fold to the disk centre, in centred CSS px, y down. `seq` bumps per click. */
	click: { x: number; y: number; seq: number } | null;
}

// No width/height props: the canvas fills its parent by CSS and measures itself in the render loop
// (syncCanvasSize) — see lib/render/canvasSize.ts.
interface Props {
	patchId: string;
	/**
	 * The patch record itself, when the caller already has it. Skips loadDevelopedPatches entirely —
	 * which is how a page that shows ONE disk (the landing wall) avoids pulling the whole 9.9 MB
	 * developed catalogue into the browser to read a 350-byte record out of it. /play, which needs the
	 * map anyway for its sidebar, keeps passing the id alone. Mirrors the thumbnail's `data` prop.
	 */
	data?: CataloguePatch;
	/** Per-instance view input; omit to read /play's global controls. See HyperbolicViewInput. */
	input?: RefObject<HyperbolicViewInput | null>;
	/**
	 * Gap in CSS px between the disk's ideal boundary and the nearest edge of the canvas. /play's
	 * default keeps the rim clear of the floating controls that sit over its viewport corners; an
	 * embedded disk with nothing on top of it passes 0 and fills its cell edge to edge.
	 */
	diskPadPx?: number;
}

export function HyperbolicDevelopedCanvas({ patchId, data, input, diskPadPx = DISK_PAD_PX }: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const glRef = useRef<HyperbolicPerPixelRenderer | null>(null);
	const ctx2dRef = useRef<CanvasRenderingContext2D | null>(null); // set only in the 2D fallback path
	const devRef = useRef<HyperbolicDeveloper | null>(null); // the 2D fallback only
	const camRef = useRef<{ id: string; cam: HypCamera } | null>(null);
	const walkRef = useRef<WalkTiling | null>(null);
	const metaRef = useRef<{ id: string; name: string; config: string; edge: number } | null>(null);
	const feedRef = useRef(new IslamicFeed());
	// Local-input mode only: the last recentre / click sequence acted on (see HyperbolicViewInput).
	const lastResetSeq = useRef(0);
	const lastClickSeq = useRef(0);
	// Read in the rAF loop, which is created once — the prop itself may be a fresh ref object per render.
	const inputRef = useRef<RefObject<HyperbolicViewInput | null> | undefined>(input);
	inputRef.current = input;
	const padRef = useRef(diskPadPx);
	padRef.current = diskPadPx;

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true });
		if (gl) {
			try {
				glRef.current = new HyperbolicPerPixelRenderer(gl);
			} catch (e) {
				console.warn("hyperbolic per-pixel renderer unavailable, falling back to 2D:", e);
			}
		}
		if (!glRef.current) ctx2dRef.current = canvas.getContext("2d");
		return () => {
			glRef.current?.dispose();
			glRef.current = null;
			ctx2dRef.current = null;
		};
	}, []);

	// Load the patch and bind it: its walk table to the shader, or a developer to the 2D fallback. The
	// camera belongs to the PATCH, so only a new id resets where the reader has panned to.
	useEffect(() => {
		let alive = true;
		// A caller that supplied the record resolves immediately and never touches the network.
		(data ? Promise.resolve({ [patchId]: data }) : loadDevelopedPatches()).then((map) => {
			if (!alive) return;
			const patch = map[patchId] ?? null;
			metaRef.current = null;
			if (!patch?.darts) return;
			const meta = { id: patch.id, name: patch.name, config: patch.config, edge: patch.edge };
			metaRef.current = meta;
			const gl = glRef.current;
			walkRef.current = gl ? buildWalk(patch.darts, patch.edge, { allDrawn: true }) : null;
			if (gl && walkRef.current) gl.setWalk(walkRef.current);
			if (camRef.current?.id === patchId) return;
			devRef.current = gl ? null : new HyperbolicDeveloper(patch.darts, patch.edge);
			camRef.current = { id: patchId, cam: new HypCamera(walkRef.current, devRef.current, meta) };
		});
		return () => {
			alive = false;
		};
	}, [patchId, data]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		let raf = 0;
		const render = () => {
			raf = requestAnimationFrame(render);
			const meta = metaRef.current;
			const cam = camRef.current?.cam;
			if (!meta || !cam) return;
			// Measured every frame from the element itself, so the backing store tracks a transitioning layout
			// exactly instead of trailing a React render behind it (lib/render/canvasSize.ts).
			const { w, h, dpr } = syncCanvasSize(canvas);
			if (w <= 0 || h <= 0) return;
			const bw = canvas.width, bh = canvas.height; // backing-store px (CSS px x dpr)

			const cfg = useConfiguration.getState();
			const ctrl = cfg.controls;
			const Rcss = Math.max(0.5 * Math.min(w, h) - padRef.current, 1); // disk radius in CSS px (pan units)

			// Where pan / rotation / recentre / click come from this frame. /play drives them through the
			// global store (its p5 input layer writes cfg.controls); an embedded disk hands in its own
			// per-instance input instead, so the two never steer each other. Everything BELOW this block
			// reads these four locals and is identical in both modes — only the acknowledgement differs:
			// the store path clears its flags by writing them back, the local path remembers a sequence.
			const local = inputRef.current?.current ?? null;
			const offset = local ? local.offset : ctrl.offset;
			const targetOffset = local ? local.targetOffset : ctrl.targetOffset;
			const rotDeg = local ? local.rotationDeg : ctrl.rotation || 0;
			const wantReset = local ? local.resetSeq !== lastResetSeq.current : cfg.hyperbolicResetView;
			if (local) lastResetSeq.current = local.resetSeq;
			const localClick = local?.click && local.click.seq !== lastClickSeq.current ? local.click : null;
			if (local?.click) lastClickSeq.current = local.click.seq;
			const clickPx = local ? localClick : cfg.hyperbolicClick;

			cam.step({ offset, targetOffset, rotDeg, reset: !!wantReset, click: clickPx ?? null, Rcss });
			if (!local && wantReset) useConfiguration.setState({ hyperbolicResetView: false });
			if (!local && clickPx) useConfiguration.setState({ hyperbolicClick: null });

			const dark = document.documentElement.classList.contains("dark");
			const gl = glRef.current;
			const walk = walkRef.current;
			if (gl && walk) {
				gl.draw({
					view: cam.view,
					face: cam.face,
					R: Rcss * dpr,
					cx: bw / 2,
					cy: bh / 2,
					canvasH: bh,
					dark,
					showFill: cfg.fillAmount > 0,
					fillSatPct: fillAmountToSatPct(cfg.fillAmount),
					hueOffset: cfg.hueOffset || 0,
					strokePx: cfg.lineWidth <= 0 ? 0 : Math.max(cfg.lineWidth, 0.5) * dpr * 1.1, // 0 = no stroke
					taper: cfg.hyperbolicLineMode !== "constant",
					...feedRef.current.frame(gl, cfg, meta.id, walk.sizes, meta.edge),
				});
			} else {
				// 2D fallback: explicit developed polygons (robust, thin sub-pixel rim). No Islamic here.
				const ctx = ctx2dRef.current;
				const dev = devRef.current;
				if (!ctx || !dev) return;
				const patch = dev.develop(meta, cam.view, FALLBACK_BOUND_R, FALLBACK_BUDGET);
				ctx.clearRect(0, 0, bw, bh);
				drawDevelopedPatch(ctx, patch, cam.view, {
					R: Rcss * dpr,
					cx: bw / 2,
					cy: bh / 2,
					dark,
					frame: false,
					showFill: cfg.fillAmount > 0,
					fillSatPct: fillAmountToSatPct(cfg.fillAmount),
					hueOffset: cfg.hueOffset || 0,
					strokePx: cfg.lineWidth <= 0 ? 0 : Math.max(cfg.lineWidth, 0.5) * dpr * 1.1, // 0 = no stroke
					taper: cfg.hyperbolicLineMode !== "constant",
				});
			}

			// Export: snapshot this layer while the frame is still in the drawing buffer. The context has no
			// preserveDrawingBuffer, so a read from anywhere but here comes back blank (lib/render/capture.ts).
			if (captureOverride()) offerFrame(canvas);
		};
		raf = requestAnimationFrame(render);
		return () => {
			cancelAnimationFrame(raf);
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
