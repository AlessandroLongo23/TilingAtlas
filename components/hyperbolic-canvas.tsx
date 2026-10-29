"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";
import { useConfiguration } from "@/stores/configuration";
import { useFamilyAlphas } from "@/stores/familyAlphas";
import { IslamicFeed } from "@/lib/render/hyperbolicIslamic";
import { HypCamera } from "@/lib/render/hypCamera";
import { publishCamera } from "@/lib/render/cameraPose";
import { diskDriver } from "@/lib/render/diskCamera";
import { DISK_BAR_PX, DISK_PAD_PX, diskFrame } from "@/lib/render/diskFrame";
import { buildWalk, type WalkTiling } from "@/lib/render/hyperbolicWalk";
import { HyperbolicPerPixelRenderer } from "@/lib/render/hyperbolicPerPixelGL";
import { syncCanvasSize } from "@/lib/render/canvasSize";
import { captureOverride, offerFrame } from "@/lib/render/capture";
import { HypOverlay, paintHypOverlay } from "@/lib/render/hyperbolicOverlay";
import { useOrbifoldMorph } from "@/stores/orbifoldMorph";
import { familyMember } from "@/lib/render/hypStarFamily";
import {
	allEdgesDrawn,
	diskStyle,
	resolveHypTiling,
	starFamilyOf,
	type HypDiskMode,
	type HypDiskSource,
	type HypDiskTiling,
} from "@/lib/render/hypDisk";

// Interactive Poincaré disk for every hyperbolic shelf. Each PIXEL walks the quotient to its face
// (lib/render/hyperbolicWalk.ts) and is painted there by the per-pixel renderer, so the disk fills to the
// rim, panning never drifts, and nothing is baked but the Islamic construction's per-polygon layers.
// `mode` (lib/render/hypDisk.ts) says how faces are painted. The p5 canvas underneath captures the pan
// gestures on /play; this canvas is an input-transparent overlay. WebGL2 is required.

/**
 * Per-instance view input, for an embedded disk that must NOT steer (or be steered by) the global
 * configuration store — the landing wall's Hyperbolic cell. Supply it and the loop reads pan,
 * rotation, recentre and click-to-anchor from here instead of `cfg.controls`; omit it and /play's
 * store-driven path runs.
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

interface Props {
	tiling: HypDiskSource;
	mode: HypDiskMode;
	/** Per-instance view input; omit to read /play's global controls. See HyperbolicViewInput. */
	input?: RefObject<HyperbolicViewInput | null>;
	/** Gap in CSS px between the disk's rim and the canvas edge. /play's default keeps the rim clear of
	 *  the floating controls over its corners; an embedded disk passes 0 and fills its cell. */
	diskPadPx?: number;
}

/** The record being drawn (as shipped: a star family re-solves from its defaults), the edge length and walk
 *  in use, the overlay, and for a star family the angle the walk was built at. */
interface Bound {
	tiling: HypDiskTiling;
	edge: number;
	walk: WalkTiling;
	/** The walk at the record's own angles: a family member's tiles take their identity from it. */
	ref: WalkTiling;
	overlay: HypOverlay | null;
	builtAlpha: number | null;
}

export function HyperbolicCanvas({ tiling, mode, input, diskPadPx = DISK_PAD_PX }: Props) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const overlayRef = useRef<HTMLCanvasElement>(null);
	const glRef = useRef<HyperbolicPerPixelRenderer | null>(null);
	const boundRef = useRef<Bound | null>(null);
	const camRef = useRef<{ id: string; cam: HypCamera } | null>(null);
	const feedRef = useRef(new IslamicFeed());
	// Local-input mode only: the last recentre / click sequence acted on (see HyperbolicViewInput).
	const lastResetSeq = useRef(0);
	const lastClickSeq = useRef(0);
	// Read in the rAF loop, which is created once — the props themselves may change between renders.
	const inputRef = useRef(input);
	const padRef = useRef(diskPadPx);
	const modeRef = useRef(mode);
	useLayoutEffect(() => {
		inputRef.current = input;
		padRef.current = diskPadPx;
		modeRef.current = mode;
	}, [input, diskPadPx, mode]);

	// On /play (no external input) the animation timeline drives this camera (lib/render/cameraPose.ts).
	useEffect(() => {
		if (input) return;
		return publishCamera(
			diskDriver(
				() => camRef.current?.cam ?? null,
				() => canvasRef.current,
				padRef.current,
				() => boundRef.current?.builtAlpha != null,
			),
		);
	}, [input]);

	useEffect(() => {
		const canvas = canvasRef.current;
		const gl = canvas?.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true });
		try {
			if (gl) glRef.current = new HyperbolicPerPixelRenderer(gl);
		} catch (e) {
			console.warn("hyperbolic per-pixel renderer unavailable:", e);
		}
		return () => {
			glRef.current?.dispose();
			glRef.current = null;
			// Release the context once the canvas has left the page, not at GC: browsers cap live contexts
			// (~16) and drop the oldest past it, so a view that mounts one disk after another (TileSearch
			// stepping through tilings) otherwise evicts live canvases. A tick later, and only if detached:
			// Strict Mode's re-run keeps this canvas and must find its context alive.
			setTimeout(() => {
				if (canvas && !canvas.isConnected) gl?.getExtension("WEBGL_lose_context")?.loseContext();
			});
		};
	}, []);

	// Bind the record: its walk to the shader. The camera belongs to the RECORD, so only a new id resets
	// where the reader has panned to.
	useEffect(() => {
		let alive = true;
		resolveHypTiling(tiling).then((t) => {
			const gl = glRef.current;
			if (!alive || !gl) return;
			boundRef.current = null;
			if (!t?.darts) return;
			const all = allEdgesDrawn(mode);
			const walk = buildWalk(t.darts, t.edge, { allDrawn: all });
			gl.setWalk(walk);
			const a0 = starFamilyOf(t)?.defaultAlphaDeg;
			boundRef.current = {
				tiling: t,
				edge: t.edge,
				walk,
				ref: walk,
				overlay: all ? new HypOverlay(t.darts, t.edge) : null,
				builtAlpha: a0 ?? null,
			};
			if (camRef.current?.id !== t.id) camRef.current = { id: t.id, cam: new HypCamera(walk) };
		});
		return () => {
			alive = false;
		};
	}, [tiling, mode]);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		let raf = 0;
		const render = () => {
			raf = requestAnimationFrame(render);
			const b = boundRef.current;
			const cam = camRef.current?.cam;
			const gl = glRef.current;
			if (!b || !cam || !gl) return;
			stepFamily(b, cam, gl);
			// Measured every frame from the element itself, so the backing store tracks a transitioning layout
			// exactly instead of trailing a React render behind it (lib/render/canvasSize.ts).
			const { w, h, dpr } = syncCanvasSize(canvas);
			if (w <= 0 || h <= 0) return;

			const cfg = useConfiguration.getState();
			const local = inputRef.current?.current ?? null;
			// Disk radius (pan units) and centre in CSS px. Only /play has the toolbar to clear.
			const { r: Rcss, cx, cy } = diskFrame(w, h, padRef.current, inputRef.current ? 0 : DISK_BAR_PX);
			stepCamera(cam, cfg, local, Rcss, lastResetSeq, lastClickSeq);

			const m = modeRef.current;
			const dark = document.documentElement.classList.contains("dark");
			gl.draw({
				view: cam.view,
				face: cam.face,
				R: Rcss * dpr,
				cx: cx * dpr,
				cy: cy * dpr,
				canvasH: canvas.height,
				...diskStyle(m, b.tiling, cfg, dark, dpr),
				...(m === "tiling" ? feedRef.current.frame(gl, cfg, b.tiling.id, b.walk.sizes, b.edge) : {}),
				material: m === "tiling" && cfg.materials ? cfg.material : null,
				home: cam.toHome(),
				homeRef: cam.toHomeRef(),
				scanned: cfg.materialSource === "scanned",
			});

			// Export: snapshot this layer while the frame is still in the drawing buffer. The context has no
			// preserveDrawingBuffer, so a read from anywhere but here comes back blank (lib/render/capture.ts).
			if (captureOverride()) offerFrame(canvas);
			// /play's overlays; an embedded disk has no sidebar to switch them on.
			// The symmetry panel's hovered class rides the overlay; only a morphed type's darts name classes.
			const flags = { ...cfg, highlightCone: useOrbifoldMorph.getState().hover };
			paintHypOverlay(overlayRef.current, local ? null : b.overlay, cam, b.walk, { R: Rcss, cx, cy }, flags);
		};
		raf = requestAnimationFrame(render);
		return () => cancelAnimationFrame(raf);
	}, []);

	return (
		<>
			<canvas
				ref={canvasRef}
				className="absolute inset-0 h-full w-full"
				style={{ pointerEvents: "none", width: "100%", height: "100%" }}
			/>
			<canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
		</>
	);
}

/**
 * A star family's angle, the way the flat canvases take it: `values` is the target (the slider, the
 * scrub), `live` the eased angle drawn, mutated in place. The timeline writes both at once, so playback
 * lands exactly on its keyframes. Rebuilding the walk is well under a millisecond.
 */
function stepFamily(b: Bound, cam: HypCamera, gl: HyperbolicPerPixelRenderer): void {
	const fam = starFamilyOf(b.tiling);
	if (!fam || b.builtAlpha === null) return;
	const [lo, hi] = fam.alphaRangeDegOpen;
	const clamp = (v: number) => Math.min(hi - 1e-3, Math.max(lo + 1e-3, v));
	const fa = useFamilyAlphas.getState();
	const want = clamp(fa.values?.[0] ?? fam.defaultAlphaDeg);
	if (!fa.live || fa.live.length !== 1) fa.live = [want];
	else fa.live[0] += Math.abs(want - fa.live[0]) < 0.01 ? want - fa.live[0] : (want - fa.live[0]) * 0.3;
	const shown = clamp(fa.live[0]);
	if (Math.abs(shown - b.builtAlpha) <= 1e-4) return;
	const m = familyMember({ darts: b.tiling.darts, edge: b.tiling.edge, family: fam }, shown);
	if (!m) return;
	b.builtAlpha = shown;
	b.edge = m.edge;
	b.walk = buildWalk(m.darts, m.edge, { allDrawn: true });
	gl.setWalk(b.walk, b.ref);
	b.overlay = new HypOverlay(m.darts, m.edge);
	cam.retile(b.walk);
}

/**
 * Where pan / rotation / recentre / click come from this frame. /play drives them through the global
 * store (its p5 input layer writes cfg.controls) and acknowledges by clearing its flags; an embedded disk
 * hands in its own input and the canvas remembers the sequence it last acted on.
 */
function stepCamera(
	cam: HypCamera,
	cfg: ReturnType<typeof useConfiguration.getState>,
	local: HyperbolicViewInput | null,
	Rcss: number,
	lastReset: { current: number },
	lastClick: { current: number },
): void {
	const ctrl = cfg.controls;
	const reset = local ? local.resetSeq !== lastReset.current : cfg.hyperbolicResetView;
	const click = local
		? local.click && local.click.seq !== lastClick.current
			? local.click
			: null
		: cfg.hyperbolicClick;
	if (local) {
		lastReset.current = local.resetSeq;
		if (local.click) lastClick.current = local.click.seq;
	}
	cam.step({
		offset: local ? local.offset : ctrl.offset,
		targetOffset: local ? local.targetOffset : ctrl.targetOffset,
		rotDeg: local ? local.rotationDeg : ctrl.rotation || 0,
		reset: !!reset,
		click: click ?? null,
		Rcss,
	});
	if (local) return;
	if (reset) useConfiguration.setState({ hyperbolicResetView: false });
	if (click) useConfiguration.setState({ hyperbolicClick: null });
}
