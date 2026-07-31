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
// Two separate numbers therefore govern the view, and conflating them is what made the first version
// of this feel broken:
//
//   `width`  — the window the card FRAMES at rest. Chosen for the slide; do not change it or the
//              cards change size on a deck that was laid out around them.
//   `clean`  — the half-width of the largest gap-free square around the same centre, measured by
//              scripts/measure-patch-window.ts. This is what pan and zoom are CLAMPED to.
//
// /aperiodic can frame these patches freely because its home view is "fit the whole patch" and the
// ragged edge is honestly on display there; here the card sits on a slide whose claim is that a
// tiling covers the plane, so the boundary must never come into view.
//
// The room to pan is exactly the slack between the two. The hat at level 4 already had it (clean
// square 29.5 against a framed 18). Penrose at depth 5 did not — 14.5 against 14, a quarter of a unit
// — so it is built at depth 6 instead: same tile size (the substitution grows the patch outward, it
// does not shrink the tiles — measured density 0.93 tiles/unit² at both depths), 1,140 tiles instead
// of 430, and a clean square of 24. The framing is untouched at both.

const toPoly = (pts: readonly Pt[]): RawPolygon => ({ n: pts.length, vertices: pts.map(([x, y]) => ({ x, y })) });

interface PatchDef {
	build: () => RawPolygon[];
	/** Centre and side of the window to FRAME at rest, in the patch's own units. */
	cx: number;
	cy: number;
	width: number;
	/** Half-width of the gap-free square about (cx, cy). Measured, with a little taken off. */
	clean: number;
}

const PATCHES: Record<string, PatchDef> = {
	// measured 12.00 at depth 6 and 14.75 at level 4; a rounded-down margin keeps the very edge unused
	penrose: { build: () => penrosePatch(PENROSE_CARD_DEPTH), ...PENROSE_WINDOW, clean: 11.75 },
	hat: { build: () => hatPatch(), ...HAT_WINDOW, clean: 14.5 },
	// The single tiles, for a slide that wants the shape, not the tiling. No patch around them, so the
	// framed window is all there is: clean = width/2 leaves zoom in, and no pan at rest.
	"penrose-star": { build: () => penroseSun().map(toPoly), cx: 0, cy: 0, width: 4.2, clean: 2.1 },
	"hat-tile": { build: () => [toPoly(hatOutline())], cx: 1.5, cy: 0.43, width: 7.5, clean: 3.75 },
};

/** Deeper than the shared default, purely to buy the card room to pan. See the note at the top. */
const PENROSE_CARD_DEPTH = 6;
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
	/** The card size the current zoom was computed against, so a resize can carry the view with it. */
	const lastSize = useRef(0);

	/** The zoom that frames `width` exactly — the view the slide was laid out around. */
	const homeZoom = useCallback((W: number, H: number, def: PatchDef) => Math.max(W, H) / def.width, []);

	/**
	 * Zoom range. The floor is not home: you may pull back until the whole gap-free square is on
	 * screen, which is further out than the framing and still shows no boundary.
	 */
	const zoomRange = useCallback(
		(W: number, H: number, def: PatchDef) => ({
			min: Math.max(W, H) / (2 * def.clean),
			max: (Math.max(W, H) / def.width) * MAX_ZOOM_FACTOR,
		}),
		[],
	);

	/**
	 * Hold the viewport inside the gap-free square. At a given zoom the visible half-width in world
	 * units is (W/2)/zoom, so the centre may wander by `clean` minus that. It is the slack between
	 * `clean` and the framed `width` that gives room to pan at rest; zooming in adds more.
	 */
	const clamp = useCallback((W: number, H: number, def: PatchDef) => {
		const z = zoom.current;
		const mx = Math.max(0, z * def.clean - W / 2);
		const my = Math.max(0, z * def.clean - H / 2);
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

		// A resize changes what "fits" means. Rescale the view with the card instead of leaving the old
		// zoom in place: the first paint can land before layout settles, and with a floor BELOW home
		// (the pull-back to the clean square) nothing would ever push a stale zoom back up — which is
		// exactly how "home" stopped being home, and double-click stopped restoring the framing.
		const size = Math.max(W, H);
		if (zoom.current === 0) {
			zoom.current = homeZoom(W, H, def);
		} else if (lastSize.current && lastSize.current !== size) {
			const k = size / lastSize.current;
			zoom.current *= k;
			offset.current.x *= k;
			offset.current.y *= k;
		}
		lastSize.current = size;
		const { min, max } = zoomRange(W, H, def);
		zoom.current = Math.max(min, Math.min(max, zoom.current));
		clamp(W, H, def);

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
	}, [patch, polys, homeZoom, zoomRange, clamp]);

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
			clamp(wrap.clientWidth, wrap.clientHeight, def);
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
			const next = zoomAtPoint(
				{ x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 },
				offset.current,
				zoom.current,
				wheelDeltaPx(e),
				zoomRange(wrap.clientWidth, wrap.clientHeight, def),
			);
			zoom.current = next.zoom;
			offset.current = next.offset;
			clamp(wrap.clientWidth, wrap.clientHeight, def);
			schedule();
		};
		/** Back to the framing the slide was designed at. */
		const reset = () => {
			zoom.current = homeZoom(wrap.clientWidth, wrap.clientHeight, def);
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
	}, [patch, interactive, clamp, schedule, homeZoom, zoomRange]);

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
