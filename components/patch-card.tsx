"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { HAT_WINDOW, hatPatch } from "@/lib/render/hatPatch";
import { hatOutline, penroseSun, type Pt } from "@/lib/render/landingPatches";
import { PENROSE_WINDOW, penrosePatch } from "@/lib/render/penrosePatch";
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
	// The single tiles, for a slide that wants the shape rather than the tiling.
	"penrose-star": { build: () => penroseSun().map(toPoly), cx: 0, cy: 0, width: 4.2 },
	"hat-tile": { build: () => [toPoly(hatOutline())], cx: 1.5, cy: 0.43, width: 7.5 },
};

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
}

export function PatchCard({ patch, label }: PatchCardProps) {
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const polys = useMemo(() => patchPolygons(patch), [patch]);

	const paint = useCallback(() => {
		const canvas = canvasRef.current;
		const wrap = wrapRef.current;
		const def = PATCHES[patch];
		if (!canvas || !wrap || !def || !polys) return;
		const W = wrap.clientWidth;
		const H = wrap.clientHeight;
		if (W === 0 || H === 0) return;

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

		// Scale off the LONGER side so the visible window can only ever be smaller than the one that
		// was measured clean, never larger. Y flips: world y runs up, canvas y runs down.
		const scale = Math.max(W, H) / def.width;
		ctx.save();
		ctx.translate(W / 2, H / 2);
		ctx.scale(scale, -scale);
		ctx.translate(-def.cx, -def.cy);
		drawPolygons(ctx, polys, scale);
		ctx.restore();
	}, [patch, polys]);

	useEffect(() => {
		paint();
		const wrap = wrapRef.current;
		if (!wrap) return;
		const ro = new ResizeObserver(paint);
		ro.observe(wrap);
		return () => ro.disconnect();
	}, [paint]);

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
