"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { HAT_WINDOW, hatPatch } from "@/lib/render/hatPatch";
import { hatOutline, penroseSun, type Pt } from "@/lib/render/landingPatches";
import { PENROSE_WINDOW, penrosePatch } from "@/lib/render/penrosePatch";
import { wheelDeltaPx, zoomAtPoint } from "@/lib/render/viewControls";
import { drawPolygons, type RawPolygon } from "@/lib/utils/renderTiling";

// A card for tilings with no translational cell to render from. Every atlas card takes a fundamental
// cell and repeats it across a lattice, which is exactly what an aperiodic tiling does not have, so
// Penrose and the hat arrive as a finite patch instead: deflated Robinson triangles for the one,
// Kaplan's metatile substitution for the other.
//
// A patch is finite, so it has a ragged boundary that would read as a rendering fault on a slide.
// Each entry therefore carries a world-space window that the patch covers completely, and the card
// shows only that. The windows below are not guesses: a rasterised coverage scan found the largest
// square containing no gap, and these sit inside it with a little room to spare.
//
// Pan and zoom are CLAMPED TO THAT WINDOW, which is the whole design of the interaction. /aperiodic
// can frame these patches freely because its home view is "fit the whole patch" and the ragged edge
// is honestly on display there; here the card sits on a slide whose claim is that a tiling covers the
// plane, so the boundary must never come into view. The consequence is deliberate: at home the view
// IS the clean window, so there is no room to pan and dragging does nothing. Zoom in and the room
// appears. The one knob if that ever needs to change is HOME_FILL.

const toPoly = (pts: readonly Pt[]): RawPolygon => ({ n: pts.length, vertices: pts.map(([x, y]) => ({ x, y })) });

interface PatchDef {
	build: () => RawPolygon[];
	/** Centre and side of the window to show, in the patch's own units. */
	cx: number;
	cy: number;
	width: number;
}

const PATCHES: Record<string, PatchDef> = {
	penrose: { build: () => penrosePatch(), ...PENROSE_WINDOW },
	hat: { build: () => hatPatch(), ...HAT_WINDOW },
	// The single tiles, for a slide that wants the shape, not the tiling.
	"penrose-star": { build: () => penroseSun().map(toPoly), cx: 0, cy: 0, width: 4.2 },
	"hat-tile": { build: () => [toPoly(hatOutline())], cx: 1.5, cy: 0.43, width: 7.5 },
};

/** Fraction of the gap-free window the home view shows. 1 keeps the framing these slides were set at. */
const HOME_FILL = 1;
/** How far in the view can be pushed, as a multiple of home. Past this the tiles are bigger than the card. */
const MAX_ZOOM_FACTOR = 10;

/** The patches are deterministic and none is cheap, so build each at most once per page. */
const cache = new Map<string, RawPolygon[]>();
function patchPolygons(name: string): RawPolygon[] | null {
	const def = PATCHES[name];
	if (!def) return null;
	let polys = cache.get(name);
	if (!polys) {
		polys = def.build();
		cache.set(name, polys);
	}
	return polys;
}

interface PatchCardProps {
	patch: string;
	label?: string;
	/** Off makes the card a fixed picture again, for a slide that does not want a thing to fiddle with. */
	interactive?: boolean;
}

export function PatchCard({ patch, label, interactive = true }: PatchCardProps) {
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const polys = useMemo(() => patchPolygons(patch), [patch]);

	// View state in refs, painted imperatively: a drag must not re-render the slide around it.
	// `zoom` is CSS px per world unit and `offset` is a screen-px shift of the canvas centre, the same
	// frame zoomAtPoint works in, so the shared helper drops straight in.
	const zoom = useRef(0);
	const offset = useRef({ x: 0, y: 0 });
	const frame = useRef(0);

	/**
	 * The zoom that fits the window exactly. Scaled off the LONGER side so the visible window can only
	 * ever be smaller than the one that was measured clean, never larger.
	 */
	const homeZoom = useCallback((W: number, H: number, width: number) => Math.max(W, H) / (width * HOME_FILL), []);

	/**
	 * Hold the viewport inside the gap-free window. At a given zoom the visible half-width in world
	 * units is (W/2)/zoom, so the centre may wander by width/2 minus that — which is zero at home and
	 * opens up as you zoom in. This is what makes the ragged boundary unreachable.
	 */
	const clamp = useCallback((W: number, H: number, width: number) => {
		const z = zoom.current;
		const mx = Math.max(0, (z * width) / 2 - W / 2);
		const my = Math.max(0, (z * width) / 2 - H / 2);
		offset.current.x = Math.max(-mx, Math.min(mx, offset.current.x));
		offset.current.y = Math.max(-my, Math.min(my, offset.current.y));
	}, []);

	const paint = useCallback(() => {
		const canvas = canvasRef.current;
		const wrap = wrapRef.current;
		const def = PATCHES[patch];
		if (!canvas || !wrap || !def || !polys) return;
		const W = wrap.clientWidth;
		const H = wrap.clientHeight;
		if (W === 0 || H === 0) return;

		const home = homeZoom(W, H, def.width);
		if (zoom.current === 0) zoom.current = home;
		// A resize changes what "fits" means, so re-anchor the floor and re-clamp before drawing.
		zoom.current = Math.max(home, Math.min(home * MAX_ZOOM_FACTOR, zoom.current));
		clamp(W, H, def.width);

		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
			canvas.width = W * dpr;
			canvas.height = H * dpr;
		}
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, W, H);

		// Y flips: world y runs up, canvas y runs down.
		ctx.save();
		ctx.translate(W / 2 + offset.current.x, H / 2 + offset.current.y);
		ctx.scale(zoom.current, -zoom.current);
		ctx.translate(-def.cx, -def.cy);
		drawPolygons(ctx, polys, zoom.current);
		ctx.restore();
	}, [patch, polys, homeZoom, clamp]);

	/** Coalesce to one paint per frame: a trackpad emits pointer and wheel events faster than that. */
	const schedule = useCallback(() => {
		if (frame.current) return;
		frame.current = requestAnimationFrame(() => {
			frame.current = 0;
			paint();
		});
	}, [paint]);

	useEffect(() => {
		paint();
		const wrap = wrapRef.current;
		if (!wrap) return;
		const ro = new ResizeObserver(paint);
		ro.observe(wrap);
		return () => {
			ro.disconnect();
			if (frame.current) cancelAnimationFrame(frame.current);
		};
	}, [paint]);

	useEffect(() => {
		const canvas = canvasRef.current;
		const wrap = wrapRef.current;
		const def = PATCHES[patch];
		if (!interactive || !canvas || !wrap || !def) return;

		let dragging = false;
		let last = { x: 0, y: 0 };

		const down = (e: PointerEvent) => {
			dragging = true;
			last = { x: e.clientX, y: e.clientY };
			canvas.setPointerCapture(e.pointerId);
			canvas.style.cursor = "grabbing";
		};
		const move = (e: PointerEvent) => {
			if (!dragging) return;
			offset.current.x += e.clientX - last.x;
			offset.current.y += e.clientY - last.y;
			last = { x: e.clientX, y: e.clientY };
			clamp(wrap.clientWidth, wrap.clientHeight, def.width);
			schedule();
		};
		const up = (e: PointerEvent) => {
			dragging = false;
			if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
			canvas.style.cursor = "grab";
		};
		const wheel = (e: WheelEvent) => {
			// Non-passive so the deck does not scroll under a zoom gesture.
			e.preventDefault();
			const r = canvas.getBoundingClientRect();
			const home = homeZoom(wrap.clientWidth, wrap.clientHeight, def.width);
			const next = zoomAtPoint(
				{ x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 },
				offset.current,
				zoom.current,
				wheelDeltaPx(e),
				{ min: home, max: home * MAX_ZOOM_FACTOR },
			);
			zoom.current = next.zoom;
			offset.current = next.offset;
			clamp(wrap.clientWidth, wrap.clientHeight, def.width);
			schedule();
		};
		/** Back to the framing the slide was designed at. */
		const reset = () => {
			zoom.current = homeZoom(wrap.clientWidth, wrap.clientHeight, def.width);
			offset.current = { x: 0, y: 0 };
			schedule();
		};

		canvas.style.cursor = "grab";
		canvas.style.touchAction = "none";
		canvas.addEventListener("pointerdown", down);
		canvas.addEventListener("pointermove", move);
		canvas.addEventListener("pointerup", up);
		canvas.addEventListener("pointercancel", up);
		canvas.addEventListener("wheel", wheel, { passive: false });
		canvas.addEventListener("dblclick", reset);
		return () => {
			canvas.removeEventListener("pointerdown", down);
			canvas.removeEventListener("pointermove", move);
			canvas.removeEventListener("pointerup", up);
			canvas.removeEventListener("pointercancel", up);
			canvas.removeEventListener("wheel", wheel);
			canvas.removeEventListener("dblclick", reset);
		};
	}, [patch, interactive, clamp, schedule, homeZoom]);

	return (
		<figure className="not-prose m-0">
			<div
				ref={wrapRef}
				className="relative aspect-square w-full overflow-hidden rounded-xl border border-line bg-white"
			>
				<canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
			</div>
			{label && (
				<figcaption className="mt-2 text-center text-[clamp(0.7rem,1vh+0.3vw,1rem)] text-fg-muted">
					{label}
				</figcaption>
			)}
		</figure>
	);
}
