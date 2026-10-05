"use client";

import { useCallback } from "react";
import { useConfiguration } from "@/stores/configuration";
import { su11Identity, su11Inverse } from "@/lib/render/hyperbolic";
import { drawDevelopedEdgePatch } from "@/lib/render/hyperbolicDevelopedDraw";
import { FALLBACK_BOUND_R, HyperbolicDeveloper, THUMB_BUDGET } from "@/lib/render/hyperbolicDevelopClient";
import { buildWalk } from "@/lib/render/hyperbolicWalk";
import { diskCanvas2dDataUrl, ensureDiskCanvas2d, ensureDiskRenderer } from "@/lib/render/hypThumbHost";
import { DiskThumbnail } from "@/components/ui/disk-thumbnail";
import { paletteRgb255 } from "@/lib/colors/render";
import type { HypColorsPattern } from "@/lib/colors/hyp-colors";

/** Everything this component reads off a record. Declared as a subset so a shelf that is NOT a colouring
 *  can draw through it: the 3.4.n.4 tilings (lib/tilings/hyp-poly.ts) fill each face by POLYGON SIZE
 *  instead of by solver colour, which is the same render — an index per face and every edge a boundary. */
export type HypColorsThumbInput = Pick<HypColorsPattern, "id" | "config" | "edge" | "darts" | "colors">;

// Static Poincaré-disk preview of a hyperbolic colored tiling — one frame of the same per-pixel colors
// renderer as the interactive canvas, so the preview fills the disk to the rim and matches /play. 2D
// developed fallback where WebGL2 is unavailable.
//
// Offscreen surfaces are shared with every other disk thumbnail
// (lib/render/hypThumbHost.ts); the lazy/frame-paced/fade-in shell is DiskThumbnail. This shelf's own part
// is colors mode, the palette, and `developColors` for the fallback.

interface ThumbOpts {
	palette: (number | "cream" | "dark")[];
	showFill: boolean;
	lineMode: "geometry" | "constant";
	lineWidth: number;
}

function renderThumbGL(pattern: HypColorsThumbInput, size: number, opts: ThumbOpts): string | null {
	const host = ensureDiskRenderer(size);
	if (!host) return null;
	const walk = buildWalk(pattern.darts, pattern.edge, { allDrawn: true });
	host.renderer.setWalk(walk);
	const dark = document.documentElement.classList.contains("dark");
	const pal = paletteRgb255(pattern.colors, opts.palette, dark);
	host.renderer.draw({
		view: su11Inverse(walk.home),
		face: walk.seedFace,
		R: size / 2 - 4,
		cx: size / 2,
		cy: size / 2,
		canvasH: size,
		dark,
		showFill: opts.showFill,
		hueOffset: 0,
		strokePx: opts.lineWidth <= 0 ? 0 : Math.max(opts.lineWidth, 0.5),
		taper: opts.lineMode !== "constant",
		edgeMode: true,
		colorsMode: true,
		palette: pal.map((c) => [c[0] / 255, c[1] / 255, c[2] / 255] as [number, number, number]),
	});
	return host.canvas.toDataURL("image/png");
}

function renderThumb2d(pattern: HypColorsThumbInput, size: number, opts: ThumbOpts): string | null {
	const ctx = ensureDiskCanvas2d(size);
	if (!ctx) return null;
	const dark = document.documentElement.classList.contains("dark");
	const meta = { id: pattern.id, name: pattern.id, config: pattern.config, edge: pattern.edge };
	const drawn = new HyperbolicDeveloper(pattern.darts, pattern.edge).developColors(meta, su11Identity(), FALLBACK_BOUND_R, THUMB_BUDGET);
	drawDevelopedEdgePatch(ctx, drawn, su11Identity(), {
		R: size / 2 - 4,
		cx: size / 2,
		cy: size / 2,
		dark,
		frame: true,
		showFill: opts.showFill,
		strokePx: opts.lineWidth <= 0 ? 0 : Math.max(opts.lineWidth, 0.5),
		taper: opts.lineMode !== "constant",
		palette: paletteRgb255(pattern.colors, opts.palette, dark),
	});
	return diskCanvas2dDataUrl();
}

function renderThumb(pattern: HypColorsThumbInput, size: number, opts: ThumbOpts): string | null {
	return renderThumbGL(pattern, size, opts) ?? renderThumb2d(pattern, size, opts);
}

export function HyperbolicColorsThumbnail({ pattern, size = 256 }: { pattern: HypColorsThumbInput; size?: number }) {
	const palette = useConfiguration((s) => s.colorsPalette);
	const showFill = useConfiguration((s) => s.fillAmount > 0);
	const lineMode = useConfiguration((s) => s.hyperbolicLineMode);
	const lineWidth = useConfiguration((s) => s.lineWidth);

	const prepare = useCallback(() => Promise.resolve(pattern), [pattern]);
	const bake = useCallback(
		(p: HypColorsThumbInput) => renderThumb(p, size, { palette, showFill, lineMode, lineWidth }),
		[size, palette, showFill, lineMode, lineWidth],
	);

	return (
		<DiskThumbnail
			alt={`hyperbolic colored tiling ${pattern.id}`}
			label="HyperbolicColorsThumbnail"
			prepare={prepare}
			bake={bake}
		/>
	);
}
