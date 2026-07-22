"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Maximize, Minimize, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { buildCellMesh } from "@/lib/render/buildCellMesh";
import { FlatCellRenderer } from "@/lib/render/flatTilingGL";
import {
	ROTATE_SNAP_DEG,
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
import type { TranslationalCellData } from "@/lib/utils/renderTiling";

// A rounded-square interactive tiling preview — the /play canvas in miniature, one per tiling, for
// embedding in prose (the /theory page). Renders through the SAME WebGL pipeline as /play's flat
// shader view (lib/render/flatTilingGL.ts) and the same interaction math (lib/render/viewControls.ts):
// drag pans, wheel zooms toward the cursor, Shift+wheel spins in 5° detents, right-click resets.
//
// Two things intentionally differ from /play:
// - Per-instance state. /play's controls live in the global configuration store; a page of cards
//   can't share one view, so each card owns its controls in a ref and eases them in its own rAF loop.
// - Click-to-activate. A card is inert until clicked (focus = active — inherently exclusive across
//   cards), so wheel events keep scrolling the page and a stray drag doesn't yank the view while
//   reading. Esc or clicking outside deactivates.
//
// Browsers cap live WebGL contexts (~8-16); a page embeds 11 cards. An IntersectionObserver creates
// the context (and rAF loop) only while the card is near the viewport and tears it down when it
// leaves, so the live-context count stays at the few visible cards.

interface InteractiveTilingPreviewCardProps {
	cell: TranslationalCellData;
	/** Atlas id (e.g. "t1005"); when present, an overlay button deep-links to /play on this tiling. */
	tilingId?: string;
	/** Accessible name for the card, e.g. "3.3.4.3.4 · snub square". Not rendered visually. */
	title?: string;
	className?: string;
}

// How many lattice periods should span the card at reset zoom.
const HOME_PERIODS = 3;

// The one spring every expansion-related animation shares: the card's FLIP, its siblings' FLIP (via
// the grid's LayoutGroup), and the grid wrapper's real height (which pushes the prose below). One
// curve everywhere is what makes the reflow read as a single movement instead of three.
export const CARD_LAYOUT_SPRING = { type: "spring", stiffness: 260, damping: 30 } as const;

export function InteractiveTilingPreviewCard({ cell, tilingId, title, className }: InteractiveTilingPreviewCardProps) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const cellRef = useRef(cell);
	cellRef.current = cell;
	const controlsRef = useRef<CardControls | null>(null);
	const homeZoomRef = useRef(0);
	// Lattice basis of the current mesh — lets the reset handler recompute the home zoom for the
	// card's CURRENT width (it changes when the card expands).
	const basisRef = useRef<{ v1: { x: number; y: number }; v2: { x: number; y: number } } | null>(null);
	const activeRef = useRef(false);
	const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);
	const [active, setActive] = useState(false);
	const [expanded, setExpanded] = useState(false);
	const [failed, setFailed] = useState(false);
	activeRef.current = active;

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
		let raf = 0;
		let visible = false;
		let broken = false; // latched on unrecoverable failure so the observer stops retrying

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
		};

		const render = () => {
			raf = requestAnimationFrame(render);
			if (!renderer || !gl || !canvas) return;
			const w = host.clientWidth;
			const h = host.clientHeight;
			if (w <= 0 || h <= 0) return;

			// Controls are created on the first sized frame (home zoom needs the card width).
			if (!controlsRef.current) {
				const mesh = buildCellMesh(cellRef.current);
				if (!mesh) return;
				basisRef.current = {
					v1: { x: mesh.v1[0], y: mesh.v1[1] },
					v2: { x: mesh.v2[0], y: mesh.v2[1] },
				};
				homeZoomRef.current = defaultZoomForCell(basisRef.current.v1, basisRef.current.v2, w, HOME_PERIODS);
				controlsRef.current = makeCardControls(homeZoomRef.current);
			}
			const ctrl = controlsRef.current;
			stepCardControls(ctrl);

			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
			if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
			gl.viewport(0, 0, bw, bh);

			renderer.draw({
				width: w,
				height: h,
				offset: ctrl.offset,
				zoom: ctrl.zoom,
				rotationDeg: ctrl.rotation,
				lineWidth: 1,
				showFill: true,
				// Fill is always on in a card, so the stroke is always black — the same rule as
				// euclidean-canvas.tsx (its white-stroke case only exists for fill-off in dark mode).
				strokeRGB: [0, 0, 0],
			});

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
		// Inactive cards let the event through untouched so the page scrolls normally.
		const onWheel = (e: WheelEvent) => {
			if (!activeRef.current) return;
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
			const { zoom, offset } = zoomAtPoint(mouse, ctrl.targetOffset, ctrl.targetZoom, e.deltaY);
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
		// Recompute the home zoom for the current width — the card may have expanded since mount.
		const basis = basisRef.current;
		const w = hostRef.current?.clientWidth ?? 0;
		if (basis && w > 0) homeZoomRef.current = defaultZoomForCell(basis.v1, basis.v2, w, HOME_PERIODS);
		resetCardControls(ctrl, homeZoomRef.current);
	};

	const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
		if (e.button === 2) {
			// Right-click resets, as in /play. (The activation state is untouched — reset shouldn't
			// deactivate an active card, nor activate an inert one.)
			resetView();
			return;
		}
		if (e.button !== 0) return;
		if (!activeRef.current) {
			// First click activates (via focus — see onFocus); it deliberately does NOT start a pan, so an
			// activation click never jolts the view.
			return;
		}
		dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	};

	const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
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

	const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
		if (dragRef.current?.id === e.pointerId) dragRef.current = null;
	};

	// Overlay buttons live inside the focusable host, so their clicks must not start a drag; focus
	// moving to a button still counts as "inside" for the blur check below.
	const stopDrag = (e: React.PointerEvent) => e.stopPropagation();

	const reduceMotion = useReducedMotion();

	return (
		<motion.div
			ref={hostRef}
			layout={!reduceMotion}
			transition={reduceMotion ? { duration: 0 } : { layout: CARD_LAYOUT_SPRING }}
			role="application"
			aria-label={title ? `Interactive tiling preview: ${title}` : "Interactive tiling preview"}
			tabIndex={0}
			onFocus={() => setActive(true)}
			onBlur={(e: React.FocusEvent<HTMLDivElement>) => {
				// Focus hopping between the host and its own buttons stays "active"; only leaving the card
				// deactivates it.
				if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
				setActive(false);
				dragRef.current = null;
			}}
			onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
				if (e.key === "Escape") {
					if (expanded) setExpanded(false);
					(e.currentTarget as HTMLElement).blur();
				}
			}}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerUp}
			onContextMenu={(e: React.MouseEvent) => e.preventDefault()}
			// Inert cards let touch gestures scroll the page; an active card owns them (drag-pan).
			style={{ touchAction: active ? "none" : "auto" }}
			className={cn(
				"group relative select-none overflow-hidden rounded-2xl border bg-surface-base outline-none",
				// Expanded: break out of the grid to the full text-column width at 4:3; motion's layout
				// FLIP animates the bounds change.
				expanded ? "col-span-full aspect-[4/3]" : "aspect-square",
				active ? "cursor-grab border-accent ring-2 ring-accent/60" : "cursor-pointer border-line hover:border-line-strong",
				className,
			)}
		>
			{/* The WebGL canvas is created imperatively (host.prepend) by the GL-lifecycle effect. */}
			{failed ? (
				<div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-fg-muted">
					WebGL2 unavailable — interactive preview disabled.
				</div>
			) : null}
			{/* Top-right button stack, /play overlay style: expand/collapse + open-in-play. */}
			<div className="absolute right-2 top-2 z-10 flex gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
				<button
					type="button"
					onPointerDown={stopDrag}
					onClick={() => setExpanded((v) => !v)}
					title={expanded ? "Collapse" : "Expand"}
					aria-label={expanded ? "Collapse preview" : "Expand preview"}
					aria-pressed={expanded}
					className="flex items-center justify-center rounded-lg border border-line bg-surface-overlay/80 p-2 text-fg-muted backdrop-blur-sm transition-colors hover:border-line-strong hover:text-fg"
				>
					{expanded ? <Minimize size={14} /> : <Maximize size={14} />}
				</button>
				{tilingId ? (
					<Link
						href={`/play?source=reference&tiling=${encodeURIComponent(tilingId)}`}
						onPointerDown={stopDrag}
						title="Open in Play"
						aria-label="Open this tiling in Play"
						className="flex items-center justify-center rounded-lg border border-line bg-surface-overlay/80 p-2 text-fg-muted backdrop-blur-sm transition-colors hover:border-line-strong hover:text-fg"
					>
						<ExternalLink size={14} />
					</Link>
				) : null}
			</div>
		</motion.div>
	);
}
