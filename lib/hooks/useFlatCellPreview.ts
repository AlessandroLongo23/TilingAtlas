"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { buildCellMesh } from "@/lib/render/buildCellMesh";
import { buildOrbitDotMesh } from "@/lib/render/buildOrbitDotMesh";
import { FlatCellRenderer } from "@/lib/render/flatTilingGL";
import { parseDimTarget } from "@/lib/render/orbitHover";
import { canvas2dPen } from "@/lib/render/overlayPen";
import { drawFundamentalDomain, drawSymmetryElements, fdSnapTranslateAt } from "@/lib/render/symmetryOverlay";
import type { SymmetryData } from "@/lib/classes/symmetry/types";
import type { OrbitData } from "@/lib/services/orbitsFromExactSource";
import {
	ROTATE_SNAP_DEG,
	ZOOM_MAX,
	ZOOM_MIN,
	accumulateDetents,
	defaultZoomForCell,
	makeCardControls,
	resetCardControls,
	stepCardControls,
	wheelDeltaPx,
	wrap360,
	zoomAtPoint,
	type CardControls,
} from "@/lib/render/viewControls";
import { parseBaseCell, type TranslationalCellData } from "@/lib/utils/renderTiling";

// A live Euclidean tiling patch on a host element: the /play flat shader view (lib/render/flatTilingGL.ts)
// driven by the shared interaction math (lib/render/viewControls.ts) — drag pans, wheel zooms toward
// the cursor, Shift+wheel spins in 5° detents, right-click resets. The hook owns the canvas, the GL
// context, the mesh upload and the rAF loop; the caller owns the frame around it and says when the
// surface is active.
//
// Extracted from components/interactive-tiling-preview-card.tsx so the /theory prose cards and the
// landing wall's Play cell run the same lifecycle rather than two copies of it.
//
// Two things intentionally differ from /play:
// - Per-instance state. /play's controls live in the global configuration store; a page of previews
//   can't share one view, so each owns its controls in a ref and eases them in its own rAF loop.
// - Activation. The surface only takes the wheel while the caller says it is active (see
//   useCardActivation), so wheel events keep scrolling the page until the reader asks otherwise.
//
// Browsers cap live WebGL contexts (~8-16) and a page can embed a dozen of these. An
// IntersectionObserver creates the context (and rAF loop) only while the host is near the viewport
// and tears it down when it leaves, so the live-context count stays at the few visible surfaces.

export interface FlatCellPreviewOptions {
	cell: TranslationalCellData;
	/** Vertex orbits for this tiling. Supplied ⇒ /play's orbit mode: tiles dimmed, a dot on every
	 *  vertex coloured by orbit, and hovering one orbit grows all of its dots. */
	orbitData?: OrbitData | null;
	/** Lattice periods across the host at reset zoom. Wider surfaces want more, or the patch reads as
	 *  a crop of one tile instead of a tiling. */
	homePeriods: number;
	/**
	 * Fixed home zoom in screen px per world unit (≈ px per tile edge), overriding `homePeriods`.
	 * Periods are the right unit for a card showing ONE named tiling, where the reader wants to see
	 * the repeat; they are the wrong unit for a surface showing whatever the atlas dealt, because a
	 * large-period k=7 cell asks for a zoom below ZOOM_MIN, clamps, and lands as dense texture. A
	 * fixed px-per-edge keeps the tiles a legible size whatever the cell. Clamped to the shared bounds.
	 */
	homeZoom?: number;
	/** Whether this surface currently owns the wheel and the drag. */
	active: boolean;
	/** Exact wallpaper analysis of this tiling, for the two symmetry overlays. Null ⇒ both are dead
	 *  controls (a tiling with no exact source cannot be analysed). */
	symmetryData?: SymmetryData | null;
	/** Draw the fundamental domain, its cell and the cell's subdivision. /play's `d`. */
	showFundamentalDomain?: boolean;
	/** Draw the rotation centres and mirror/glide axes, over a faded fill. /play's `s`. */
	showSymmetryElements?: boolean;
	/** A disk on every centroid, halfway and vertex. /play's `p`. */
	showPolygonPoints?: boolean;
	/**
	 * Draw ONE copy of the cell rather than a lattice of it, and frame the view on the polygons'
	 * bounding box instead of on `homePeriods`. For a cell that is a finite patch — a seed
	 * (lib/render/seedPatch.ts) — where periods are not a unit the content has.
	 */
	single?: boolean;
	/**
	 * Take no input at all: no drag, no wheel, no rotate, no right-click reset. The surface still
	 * draws, still answers the overlay flags, and still tracks the pointer for the orbit hover.
	 *
	 * Distinct from `active`, which is a card WAITING to be clicked into. An inert surface is not
	 * waiting for anything; it is a picture. Defaults to true (interactive), so no existing caller
	 * changes behaviour.
	 */
	interactive?: boolean;
}

export interface FlatCellPreview {
	/** Goes on the element the canvas is mounted into — it must be positioned and sized by CSS. */
	hostRef: RefObject<HTMLDivElement | null>;
	/** WebGL2 unavailable, or the cell produced no mesh: the caller should show a fallback. */
	failed: boolean;
	/** Snap back to the home view (right-click, as in /play — but to this surface's fitted zoom). */
	resetView: () => void;
	/** Spread onto the host element. */
	pointerProps: {
		onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
		onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
		onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void;
		onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void;
		onPointerLeave: () => void;
		onContextMenu: (e: { preventDefault: () => void }) => void;
	};
}

export function useFlatCellPreview({
	cell,
	orbitData = null,
	homePeriods,
	homeZoom,
	active,
	symmetryData = null,
	showFundamentalDomain = false,
	showSymmetryElements = false,
	showPolygonPoints = false,
	single = false,
	interactive = true,
}: FlatCellPreviewOptions): FlatCellPreview {
	const hostRef = useRef<HTMLDivElement | null>(null);
	// In refs, not the GL effect's deps: changing one must not tear down and rebuild the context.
	const periodsRef = useRef(homePeriods);
	periodsRef.current = homePeriods;
	const fixedZoomRef = useRef(homeZoom);
	fixedZoomRef.current = homeZoom;
	const cellRef = useRef(cell);
	cellRef.current = cell;
	const orbitDataRef = useRef(orbitData);
	orbitDataRef.current = orbitData;
	// The symmetry overlays live in refs for the same reason the cell does: toggling one must not
	// tear the GL context down and rebuild it, it must just change what the next frame paints.
	const symmetryRef = useRef(symmetryData);
	symmetryRef.current = symmetryData;
	const overlayFlagsRef = useRef({ fd: showFundamentalDomain, sym: showSymmetryElements, pts: showPolygonPoints });
	overlayFlagsRef.current = { fd: showFundamentalDomain, sym: showSymmetryElements, pts: showPolygonPoints };
	const singleRef = useRef(single);
	singleRef.current = single;
	const interactiveRef = useRef(interactive);
	interactiveRef.current = interactive;
	// Pointer position in centred CSS px for the orbit hover, or null when the pointer is elsewhere.
	// Per-instance state, so several orbit surfaces on one page highlight independently. (This is why
	// /play's orbitHoverBridge singleton is not used here: it can only describe one surface at a time.)
	const hoverPxRef = useRef<{ x: number; y: number } | null>(null);
	const controlsRef = useRef<CardControls | null>(null);
	const homeZoomRef = useRef(0);
	// Lattice basis of the current mesh — lets the reset handler recompute the home zoom for the
	// host's CURRENT width (it changes when a card expands).
	const basisRef = useRef<{ v1: { x: number; y: number }; v2: { x: number; y: number } } | null>(null);
	// World point the view centres on: the patch's bbox centre in single mode, the origin otherwise.
	const centreRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
	// The host size and overlay state the home framing was last computed for, so a change recomputes it.
	const framingRef = useRef("");
	const activeRef = useRef(false);
	const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);
	const [failed, setFailed] = useState(false);
	activeRef.current = active;

	// How much of the shorter side a single patch takes when fitted, leaving a margin of surround —
	// a patch touching the card's edges reads as a crop of something larger.
	const FIT_FRACTION = 0.86;

	/**
	 * What a single patch has to hold: its own tiles, and — when the fundamental-domain overlay is on —
	 * the domain drawn over them. A domain whose corner sits outside the patch is precisely what that
	 * overlay is there to show on a seed card, so framing the tiles alone would crop the one thing the
	 * picture is for.
	 *
	 * The overlay snaps the domain to the lattice copy nearest the world point under the screen centre,
	 * so where it lands depends on what the view centres on, which depends on this box. Two passes
	 * settle it: the seed's own centre picks a copy, that copy gives a box, and the box's centre picks
	 * the copy again. It converges immediately in practice, and a stale copy would only ever be one
	 * lattice vector out.
	 */
	const singleHomeBox = () => {
		const base = parseBaseCell(cellRef.current);
		if (!base) return null;
		const box = { minX: base.minX, maxX: base.maxX, minY: base.minY, maxY: base.maxY };
		const sd = symmetryRef.current;
		if (!overlayFlagsRef.current.fd || !sd) return box;
		let centre = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
		for (let pass = 0; pass < 2; pass++) {
			const t = fdSnapTranslateAt(centre, sd.cell, sd.cellOrigin);
			box.minX = base.minX; box.maxX = base.maxX;
			box.minY = base.minY; box.maxY = base.maxY;
			for (const p of sd.cellPolygon) {
				box.minX = Math.min(box.minX, p.x + t.x);
				box.maxX = Math.max(box.maxX, p.x + t.x);
				box.minY = Math.min(box.minY, p.y + t.y);
				box.maxY = Math.max(box.maxY, p.y + t.y);
			}
			centre = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
		}
		return box;
	};

	// The reset zoom: a caller-fixed px-per-edge if one was given, else the whole patch fitted (single
	// mode), else `homePeriods` of the cell's lattice across the host. All three go through the shared
	// clamp.
	const resolveHomeZoom = (
		basis: { v1: { x: number; y: number }; v2: { x: number; y: number } },
		w: number,
		h: number,
	): number => {
		const fixed = fixedZoomRef.current;
		if (fixed != null) return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fixed));
		if (singleRef.current) {
			const box = singleHomeBox();
			const bw = box ? box.maxX - box.minX : 0;
			const bh = box ? box.maxY - box.minY : 0;
			if (bw > 0 && bh > 0) {
				const fit = FIT_FRACTION * Math.min(w / bw, h / bh);
				return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fit));
			}
		}
		return defaultZoomForCell(basis.v1, basis.v2, w, periodsRef.current);
	};

	/**
	 * Screen shift that holds the patch's own centre at the centre of the card.
	 *
	 * A seed is cut out of the tiling where it lies, keeping its absolute coordinates so the symmetry
	 * overlays still land on it — which means its bounding box is nowhere near the world origin the
	 * view is otherwise built around. Rather than move the geometry (that would take the symmetry
	 * elements off it) the view is shifted, exactly as subrosaGL's uCentre does for the aperiodic
	 * patches. Reproduces the shader's map: screen = offset + zoom·(c·x + s·y, s·x − c·y).
	 *
	 * Zero in every non-single mode, where the centre is the origin and nothing moves.
	 */
	const centreShift = (centre: { x: number; y: number }, zoom: number, rotDeg: number) => {
		const r = (rotDeg * Math.PI) / 180;
		const c = Math.cos(r), s = Math.sin(r);
		return {
			x: -zoom * (c * centre.x + s * centre.y),
			y: -zoom * (s * centre.x - c * centre.y),
		};
	};

	// Deactivating mid-drag (focus moved away, Esc) must not leave the pan latched to a pointer that
	// is no longer ours.
	useEffect(() => {
		if (!active) dragRef.current = null;
	}, [active]);

	// GL lifecycle, gated on viewport proximity. Everything imperative lives inside: canvas, context,
	// renderer, mesh upload, rAF loop, and the non-passive wheel listener (React's onWheel can't
	// preventDefault). The canvas element itself is CREATED PER SETUP, not kept in JSX: a canvas can
	// only ever hold one WebGL context, so after teardown loses the context, a later getContext() on
	// the same node would return the same dead context (this bites immediately under Strict Mode's
	// double-mount). A fresh node per setup always gets a live context.
	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;

		let canvas: HTMLCanvasElement | null = null;
		let renderer: FlatCellRenderer | null = null;
		let gl: WebGL2RenderingContext | null = null;
		// The symmetry overlays are vector work over the GL patch, so they get their own 2-D canvas
		// layered on top rather than a shader. Created lazily on first use: most surfaces never turn an
		// overlay on, and an unused canvas is still a compositor layer.
		let overlay: HTMLCanvasElement | null = null;
		let raf = 0;
		let visible = false;
		let broken = false; // latched on unrecoverable failure so the observer stops retrying
		// What the renderer currently holds, so the loop can notice the `o` overlay being toggled.
		// `undefined` = nothing uploaded yet, which is distinct from an uploaded null.
		let uploadedOrbit: OrbitData | null | undefined;

		// TEMPORARY (stroke-invisible investigation, /theory?gldebug=1). Reports what the stroke pass
		// actually issued, plus the GL error state and the attribute locations the two programs were
		// linked with — enough to tell "stroke pass never ran" from "ran but drew nothing".
		const debug = typeof location !== "undefined" && location.search.includes("gldebug");
		let badge: HTMLDivElement | null = null;
		let frame = 0;
		const sample = (bw: number, bh: number) => {
			if (!gl || !renderer) return;
			const err = gl.getError();
			const d = renderer.lastDraw;
			if (!badge) {
				badge = document.createElement("div");
				badge.className = "absolute left-1 top-1 z-20 rounded bg-black/80 px-1.5 py-1 font-mono text-[10px] leading-tight text-lime-300";
				badge.style.whiteSpace = "pre";
				host.prepend(badge);
			}
			badge.textContent = [
				`buf ${bw}x${bh} dpr${(window.devicePixelRatio || 1).toFixed(2)}`,
				`stroke verts ${d?.strokeVerts ?? "?"} px ${d?.strokePx ?? "?"} inst ${d?.instances ?? "?"}`,
				`attribs ${renderer.attribReport()}`,
				`glErr ${err}`,
			].join("\n");
		};

		const teardown = () => {
			cancelAnimationFrame(raf);
			raf = 0;
			renderer?.dispose();
			renderer = null;
			// Explicitly release the context instead of waiting for GC — that's the whole point of the
			// observer gating (the browser evicts the oldest live context once past its cap).
			gl?.getExtension("WEBGL_lose_context")?.loseContext();
			gl = null;
			canvas?.remove();
			canvas = null;
			overlay?.remove();
			overlay = null;
		};

		// The 2-D layer, sized and transformed to match the GL patch exactly, then handed to the shared
		// overlay code (lib/render/symmetryOverlay.ts) through a pen. The transform is the same sequence
		// /play's p5 canvas applies, which is what lets one implementation serve both.
		//
		// `offset` is the UNWRAPPED pan while the renderer wraps its own by whole lattice vectors. That
		// is not a mismatch: the tiling and its symmetry structure are both invariant under a lattice
		// translation, so the two agree on screen.
		const drawOverlays = (
			w: number,
			h: number,
			dpr: number,
			ctrl: CardControls,
			offset: { x: number; y: number },
		) => {
			const sd = symmetryRef.current;
			const { fd, sym } = overlayFlagsRef.current;
			const wanted = !!sd && (fd || sym);
			if (!wanted) {
				// Nothing to draw: clear once, then leave the canvas alone (removing it would thrash the
				// layer every time an overlay is toggled off and on).
				if (overlay) {
					const ctx = overlay.getContext("2d");
					ctx?.setTransform(1, 0, 0, 1, 0, 0);
					ctx?.clearRect(0, 0, overlay.width, overlay.height);
				}
				return;
			}
			if (!overlay) {
				overlay = document.createElement("canvas");
				overlay.className = "pointer-events-none absolute inset-0 h-full w-full";
				// Directly after the GL canvas: above the tiles, below every React-rendered control.
				canvas?.after(overlay);
			}
			const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
			if (overlay.width !== bw || overlay.height !== bh) { overlay.width = bw; overlay.height = bh; }
			const ctx = overlay.getContext("2d");
			if (!ctx || !sd) return;
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.clearRect(0, 0, bw, bh);
			const rot = (ctrl.rotation * Math.PI) / 180;
			ctx.save();
			ctx.scale(dpr, dpr);
			ctx.translate(w / 2, h / 2);
			ctx.translate(offset.x, offset.y);
			ctx.rotate(rot);
			ctx.scale(ctrl.zoom, ctrl.zoom);
			ctx.scale(1, -1);
			const pen = canvas2dPen(ctx);
			const view = { zoom: ctrl.zoom, rotation: rot, offset, width: w, height: h };
			if (fd) drawFundamentalDomain(pen, sd, view);
			if (sym) drawSymmetryElements(pen, sd, view);
			ctx.restore();
		};

		const render = () => {
			raf = requestAnimationFrame(render);
			if (!renderer || !gl || !canvas) return;
			const w = host.clientWidth;
			const h = host.clientHeight;
			if (w <= 0 || h <= 0) return;

			// Controls are created on the first sized frame (home zoom needs the host width).
			if (!controlsRef.current) {
				const mesh = buildCellMesh(cellRef.current);
				if (!mesh) return;
				basisRef.current = {
					v1: { x: mesh.v1[0], y: mesh.v1[1] },
					v2: { x: mesh.v2[0], y: mesh.v2[1] },
				};
				const box = singleRef.current ? singleHomeBox() : null;
				centreRef.current = box
					? { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
					: { x: 0, y: 0 };
				homeZoomRef.current = resolveHomeZoom(basisRef.current, w, h);
				framingRef.current = `${w}x${h}:${singleRef.current && overlayFlagsRef.current.fd ? "fd" : ""}`;
				controlsRef.current = makeCardControls(homeZoomRef.current);
			}
			const ctrl = controlsRef.current;

			// The home framing is a function of the host's size and of whether the domain is drawn, and
			// both change after the first frame: a card in a SlideGrid is laid out at a fallback size and
			// then capped to the space the slide has left, and `d` can be pressed at any time. A patch
			// fitted against the fallback overflows its card by whatever the cap took away. Interactive
			// surfaces only refresh the value `resetView` will use — their current view is the reader's
			// and is not ours to move — but an inert one has no view of its own to preserve, so it
			// refits and recentres immediately.
			const framing = `${w}x${h}:${singleRef.current && overlayFlagsRef.current.fd ? "fd" : ""}`;
			if (framingRef.current !== framing) {
				framingRef.current = framing;
				if (basisRef.current) {
					if (!interactiveRef.current) {
						const box = singleRef.current ? singleHomeBox() : null;
						if (box) centreRef.current = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
					}
					homeZoomRef.current = resolveHomeZoom(basisRef.current, w, h);
					if (!interactiveRef.current) {
						ctrl.zoom = homeZoomRef.current;
						ctrl.targetZoom = homeZoomRef.current;
					}
				}
			}

			stepCardControls(ctrl);

			// Toggling the `o` overlay swaps the caller's orbitData between the data and null, which the
			// loop turns into an upload. Doing it here rather than in an effect keeps the renderer inside
			// this closure, where its lifetime is already managed.
			if (uploadedOrbit !== orbitDataRef.current) {
				uploadedOrbit = orbitDataRef.current;
				renderer.uploadOrbitMesh(buildOrbitDotMesh(cellRef.current, uploadedOrbit));
			}

			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
			if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
			gl.viewport(0, 0, bw, bh);

			// The pan the shader sees: the user's, plus the shift that holds a single patch's own centre
			// at the centre of the card (zero otherwise).
			const shift = centreShift(centreRef.current, ctrl.zoom, ctrl.rotation);
			const offset = { x: ctrl.offset.x + shift.x, y: ctrl.offset.y + shift.y };

			renderer.draw({
				width: w,
				height: h,
				offset,
				zoom: ctrl.zoom,
				rotationDeg: ctrl.rotation,
				lineWidth: 1,
				showFill: true,
				// Fill is always on in a preview, so the stroke is always black — the same rule as
				// euclidean-canvas.tsx (its white-stroke case only exists for fill-off in dark mode).
				strokeRGB: [0, 0, 0],
				orbitHoverPx: hoverPxRef.current,
				// Orbit mode fades the tiles toward whatever the surface sits on, so the dots read as the
				// subject. Read from the host each frame, as /play does, so a theme switch follows.
				dimTargetRGB: parseDimTarget(getComputedStyle(host).backgroundColor),
				// Same fade under the symmetry elements, so the axes and rotation centres own the colour.
				dimFill: overlayFlagsRef.current.sym && symmetryRef.current != null,
				showPoints: overlayFlagsRef.current.pts,
				single: singleRef.current,
			});

			drawOverlays(w, h, dpr, ctrl, offset);

			if (debug && frame++ % 30 === 0) sample(bw, bh);
		};

		const setup = () => {
			if (gl || broken) return;
			canvas = document.createElement("canvas");
			canvas.className = "pointer-events-none absolute inset-0 h-full w-full";
			// First child, so the React-rendered overlays (caption, hint, fallback) paint above it.
			host.prepend(canvas);
			// If the browser evicts this context (too many live contexts elsewhere), rebuild while still
			// visible — the IO would otherwise only notice on the next enter/leave.
			canvas.addEventListener(
				"webglcontextlost",
				(e) => {
					e.preventDefault();
					teardown();
					if (visible) setup();
				},
				{ once: true },
			);
			const ctx = canvas.getContext("webgl2", { antialias: true, premultipliedAlpha: false, alpha: true });
			if (!ctx) { broken = true; setFailed(true); teardown(); return; }
			gl = ctx;
			try {
				renderer = new FlatCellRenderer(ctx);
			} catch {
				broken = true;
				setFailed(true);
				teardown();
				return;
			}
			const mesh = buildCellMesh(cellRef.current);
			if (!mesh) { broken = true; setFailed(true); teardown(); return; }
			renderer.uploadMesh(mesh);
			uploadedOrbit = orbitDataRef.current;
			renderer.uploadOrbitMesh(buildOrbitDotMesh(cellRef.current, uploadedOrbit));
			raf = requestAnimationFrame(render);
		};

		const io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					visible = entry.isIntersecting;
					if (entry.isIntersecting) setup();
					else teardown();
				}
			},
			{ rootMargin: "200px" },
		);
		io.observe(host);

		// Wheel: must be a non-passive DOM listener to preventDefault (block page scroll) while active.
		// Inactive surfaces let the event through untouched so the page scrolls normally.
		const onWheel = (e: WheelEvent) => {
			if (!interactiveRef.current || !activeRef.current) return;
			const ctrl = controlsRef.current;
			if (!ctrl) return;
			e.preventDefault();
			if (e.shiftKey) {
				// Rotate in detents by scroll distance, same as /play's Shift+wheel.
				const { steps, accum } = accumulateDetents(ctrl.scrollAccum, wheelDeltaPx(e));
				ctrl.scrollAccum = accum;
				if (steps !== 0) ctrl.targetRotation = wrap360(ctrl.targetRotation + steps * ROTATE_SNAP_DEG);
				return;
			}
			// Zoom toward the cursor (centred CSS px).
			const rect = host.getBoundingClientRect();
			const mouse = { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 };
			const { zoom, offset } = zoomAtPoint(mouse, ctrl.targetOffset, ctrl.targetZoom, wheelDeltaPx(e));
			ctrl.targetZoom = zoom;
			ctrl.targetOffset = offset;
		};
		host.addEventListener("wheel", onWheel, { passive: false });

		return () => {
			io.disconnect();
			host.removeEventListener("wheel", onWheel);
			teardown();
		};
	}, []);

	// New cell (props change) → rebuild controls + mesh on the next frame with a fresh home zoom.
	useEffect(() => {
		controlsRef.current = null;
	}, [cell]);

	const resetView = () => {
		const ctrl = controlsRef.current;
		if (!ctrl) return;
		// Recompute the home zoom for the current size — the host may have grown since mount.
		const basis = basisRef.current;
		const w = hostRef.current?.clientWidth ?? 0;
		const h = hostRef.current?.clientHeight ?? 0;
		if (basis && w > 0 && h > 0) homeZoomRef.current = resolveHomeZoom(basis, w, h);
		resetCardControls(ctrl, homeZoomRef.current);
	};

	const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
		if (!interactiveRef.current) return;
		if (e.button === 2) {
			// Right-click resets, as in /play. (The activation state is untouched — reset shouldn't
			// deactivate an active surface, nor activate an inert one.)
			resetView();
			return;
		}
		if (e.button !== 0) return;
		if (!activeRef.current) {
			// First click activates (via focus — see useCardActivation); it deliberately does NOT start a
			// pan, so an activation click never jolts the view.
			return;
		}
		dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	};

	const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
		// Orbit hover tracks the pointer whether or not the surface is active: hovering changes nothing
		// but the highlight, so gating it behind a click would only make the card feel dead. It tracks on
		// an INERT surface too — an inert card still shows its orbits, and a highlight that follows the
		// pointer is not an input, it is a readout.
		const rect = e.currentTarget.getBoundingClientRect();
		hoverPxRef.current = {
			x: e.clientX - rect.left - rect.width / 2,
			y: e.clientY - rect.top - rect.height / 2,
		};

		const drag = dragRef.current;
		if (!drag || drag.id !== e.pointerId) return;
		const ctrl = controlsRef.current;
		if (!ctrl) return;
		// Same as /play's drag-pan: the target moves with the pointer, the eased offset glides after it.
		ctrl.targetOffset.x += e.clientX - drag.x;
		ctrl.targetOffset.y += e.clientY - drag.y;
		drag.x = e.clientX;
		drag.y = e.clientY;
	};

	const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
		if (dragRef.current?.id === e.pointerId) dragRef.current = null;
	};

	return {
		hostRef,
		failed,
		resetView,
		pointerProps: {
			onPointerDown,
			onPointerMove,
			onPointerUp,
			onPointerCancel: onPointerUp,
			onPointerLeave: () => { hoverPxRef.current = null; },
			// Right-click is the reset gesture, so the menu is suppressed where there is one to run. An
			// inert surface has no reset, and swallowing the browser's menu there would take something
			// away and give nothing back.
			onContextMenu: (e) => { if (interactiveRef.current) e.preventDefault(); },
		},
	};
}
