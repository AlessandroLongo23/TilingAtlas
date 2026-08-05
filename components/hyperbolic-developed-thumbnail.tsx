"use client";

import { useCallback } from "react";
import { useConfiguration } from "@/stores/configuration";
import { su11Identity } from "@/lib/render/hyperbolic";
import { loadDevelopedPatches, drawDevelopedPatch, type CataloguePatch } from "@/lib/render/hyperbolicDevelopedDraw";
import { FALLBACK_BOUND_R, HyperbolicDeveloper, THUMB_BUDGET } from "@/lib/render/hyperbolicDevelopClient";
import { prepareShaderTiling } from "@/lib/render/hyperbolicReduce";
import { cachedShaderTiling, diskCanvas2dDataUrl, ensureDiskCanvas2d, ensureDiskRenderer } from "@/lib/render/hypThumbHost";
import { DiskThumbnail } from "@/components/ui/disk-thumbnail";

// Static Poincaré-disk preview of an engine-developed hyperbolic tiling for the library grid and /play
// sidebar. It renders ONE frame with the SAME per-pixel renderer as the interactive canvas — reduce each
// pixel into the fundamental domain and colour it — so the preview fills the whole disk to the rim and
// matches the /play view exactly. Falls back to the explicit-polygon 2D renderer where WebGL2 is
// unavailable.
//
// The offscreen surfaces and the reduction-field cache are shared with every other disk thumbnail
// (lib/render/hypThumbHost.ts) — one WebGL2 context for all three shelves, which is what the comment here
// used to claim while each file kept a context of its own. The lazy/frame-paced/fade-in shell is
// DiskThumbnail; this shelf's own part is the plain (uncoloured, unmarked) develop.

interface ThumbOpts {
	hueOffset: number;
	showFill: boolean;
	lineMode: "geometry" | "constant";
	lineWidth: number;
}

function renderThumbGL(patch: CataloguePatch, size: number, opts: ThumbOpts): string | null {
	if (!patch.darts) return null;
	if (patch.certified === false) return null; // stamped un-certifiable: skip straight to the 2D bake
	const host = ensureDiskRenderer(size);
	if (!host) return null;
	const st = cachedShaderTiling("developed", patch.id, () =>
		prepareShaderTiling(
			patch.darts,
			patch.edge,
			{ id: patch.id, name: patch.name, config: patch.config, edge: patch.edge },
			{ fieldRes: 512 },
		),
	);
	if (!st) return null; // certificate failed (loud in prepareShaderTiling) → 2D fallback
	host.renderer.setTiling(st);
	const dark = document.documentElement.classList.contains("dark");
	host.renderer.draw({
		view: su11Identity(),
		R: size / 2 - 4,
		cx: size / 2,
		cy: size / 2,
		canvasH: size,
		dark,
		showFill: opts.showFill,
		hueOffset: opts.hueOffset || 0,
		strokePx: opts.lineWidth <= 0 ? 0 : Math.max(opts.lineWidth, 0.5) * 1.1, // 0 = no stroke
		taper: opts.lineMode !== "constant",
	});
	return host.canvas.toDataURL("image/png");
}

function renderThumb2d(patch: CataloguePatch, size: number, opts: ThumbOpts): string | null {
	const ctx = ensureDiskCanvas2d(size);
	if (!ctx) return null;
	const dark = document.documentElement.classList.contains("dark");
	const drawn = new HyperbolicDeveloper(patch.darts, patch.edge).develop(
		{ id: patch.id, name: patch.name, config: patch.config, edge: patch.edge },
		su11Identity(),
		FALLBACK_BOUND_R,
		THUMB_BUDGET,
	);
	drawDevelopedPatch(ctx, drawn, su11Identity(), {
		R: size / 2 - 4,
		cx: size / 2,
		cy: size / 2,
		dark,
		frame: true,
		showFill: opts.showFill,
		hueOffset: opts.hueOffset || 0,
		strokePx: opts.lineWidth <= 0 ? 0 : Math.max(opts.lineWidth, 0.5) * 1.1, // 0 = no stroke
		taper: opts.lineMode !== "constant",
	});
	return diskCanvas2dDataUrl();
}

function renderThumb(patch: CataloguePatch, size: number, opts: ThumbOpts): string | null {
	// A record stamped un-certifiable would spend a median 210 ms inside buildDirichletDomain only to
	// fail, once per card, and a grid bakes dozens of them. Skip straight to the 2D bake.
	if (patch.certified === false) return renderThumb2d(patch, size, opts);
	return renderThumbGL(patch, size, opts) ?? renderThumb2d(patch, size, opts);
}

interface Props {
	patch: string;
	size?: number;
	/**
	 * The patch record itself, when the caller already has it. Skips loadDevelopedPatches entirely —
	 * which is how a page that shows a HANDFUL of tilings (the /theory figures) avoids pulling the
	 * whole 11.6 MB catalogue into the browser just to read three entries out of it. The library and
	 * /play, which need the map anyway, keep passing the id alone.
	 */
	data?: CataloguePatch;
}
export function HyperbolicDevelopedThumbnail({ patch, size = 256, data }: Props) {
	// Live config — re-render the preview on hue-ring drags and stroke-option changes, exactly as the
	// euclidean and spherical thumbnails redraw on the hue ring. Cheap: the reduction field is cached per patch.
	const hueOffset = useConfiguration((s) => s.hueOffset);
	const showFill = useConfiguration((s) => s.showPolygonFill);
	const lineMode = useConfiguration((s) => s.hyperbolicLineMode);
	const lineWidth = useConfiguration((s) => s.lineWidth);

	// The patch fetch is async and shared across every card, so it runs OUTSIDE the frame-paced queue —
	// only the synchronous bake is paced (see lib/render/thumbnailQueue.ts). A caller that supplied `data`
	// resolves immediately and never touches the network.
	const prepare = useCallback(
		() =>
			(data ? Promise.resolve({ [patch]: data }) : loadDevelopedPatches()).then(
				(map) => map[patch] ?? null,
			),
		[patch, data],
	);
	const bake = useCallback(
		(p: CataloguePatch) => renderThumb(p, size, { hueOffset, showFill, lineMode, lineWidth }),
		[size, hueOffset, showFill, lineMode, lineWidth],
	);

	return (
		<DiskThumbnail
			alt={`hyperbolic tiling ${patch}`}
			label="HyperbolicDevelopedThumbnail"
			prepare={prepare}
			bake={bake}
		/>
	);
}
