"use client";

import { useCallback } from "react";
import { useConfiguration } from "@/stores/configuration";
import { su11Identity } from "@/lib/render/hyperbolic";
import { drawDevelopedEdgePatch } from "@/lib/render/hyperbolicDevelopedDraw";
import { FALLBACK_BOUND_R, HyperbolicDeveloper, THUMB_BUDGET } from "@/lib/render/hyperbolicDevelopClient";
import { prepareEdgeShaderTiling } from "@/lib/render/hyperbolicReduce";
import { cachedShaderTiling, diskCanvas2dDataUrl, ensureDiskCanvas2d, ensureDiskRenderer } from "@/lib/render/hypThumbHost";
import { DiskThumbnail } from "@/components/ui/disk-thumbnail";
import type { HypEdgesPattern } from "@/lib/freedraw/hyp-edges";

// Static Poincaré-disk preview of a hyperbolic edge-system tiling for the library grid and /play sidebar.
// It renders ONE frame with the SAME per-pixel renderer as the interactive canvas — reduce each pixel into
// the fundamental domain and colour it by merged-tile orbit + drawn/scaffold edge distance — so the preview
// fills the whole disk to the rim and matches the /play view. Falls back to the explicit 2D developed-edge
// draw where WebGL2 is unavailable or the Dirichlet certificate fails.
//
// The offscreen surfaces and the reduction-field cache are shared with every other disk thumbnail
// (lib/render/hypThumbHost.ts); the lazy/frame-paced/fade-in shell is DiskThumbnail. What is this shelf's
// own is the two bakes below: edge mode, the scaffold toggle, and `developEdges` for the fallback.

interface ThumbOpts {
	hueOffset: number;
	showFill: boolean;
	showScaffold: boolean;
	lineMode: "geometry" | "constant";
	lineWidth: number;
}

function renderThumbGL(pattern: HypEdgesThumbInput, size: number, opts: ThumbOpts): string | null {
	const host = ensureDiskRenderer(size);
	if (!host) return null;
	const st = cachedShaderTiling("edges", pattern.id, () => {
		const meta = { id: pattern.id, name: pattern.id, config: pattern.config, edge: pattern.edge };
		return prepareEdgeShaderTiling(pattern.darts, pattern.edge, meta, { fieldRes: 512 });
	});
	if (!st) return null; // certificate failed → 2D fallback
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
		strokePx: opts.lineWidth <= 0 ? 0 : Math.max(opts.lineWidth, 0.5),
		taper: opts.lineMode !== "constant",
		edgeMode: true,
		scaffold: opts.showScaffold,
	});
	return host.canvas.toDataURL("image/png");
}

function renderThumb2d(pattern: HypEdgesThumbInput, size: number, opts: ThumbOpts): string | null {
	const ctx = ensureDiskCanvas2d(size);
	if (!ctx) return null;
	const dark = document.documentElement.classList.contains("dark");
	const meta = { id: pattern.id, name: pattern.id, config: pattern.config, edge: pattern.edge };
	const drawn = new HyperbolicDeveloper(pattern.darts, pattern.edge).developEdges(meta, su11Identity(), FALLBACK_BOUND_R, THUMB_BUDGET);
	drawDevelopedEdgePatch(ctx, drawn, su11Identity(), {
		R: size / 2 - 4,
		cx: size / 2,
		cy: size / 2,
		dark,
		frame: true,
		showFill: opts.showFill,
		showScaffold: opts.showScaffold,
		hueOffset: opts.hueOffset || 0,
		strokePx: opts.lineWidth <= 0 ? 0 : Math.max(opts.lineWidth, 0.5),
		taper: opts.lineMode !== "constant",
	});
	return diskCanvas2dDataUrl();
}

function renderThumb(pattern: HypEdgesThumbInput, size: number, opts: ThumbOpts): string | null {
	// A record stamped un-certifiable would spend a median 210 ms inside buildDirichletDomain only to
	// fail, once per card, and a grid bakes dozens of them. Skip straight to the 2D bake.
	if (pattern.certified === false) return renderThumb2d(pattern, size, opts);
	return renderThumbGL(pattern, size, opts) ?? renderThumb2d(pattern, size, opts);
}

/** Everything either render path reads off a record. The Schwarz shelf (lib/freedraw/schwarz.ts) is not a
 *  HypEdgesPattern but supplies exactly this, so it draws through the same component — SCALENE boards
 *  included, since their per-dart turns and lengths ride inside `darts`. */
export type HypEdgesThumbInput = Pick<HypEdgesPattern, "id" | "config" | "edge" | "darts" | "certified">;

export function HyperbolicEdgesThumbnail({
	pattern,
	size = 256,
}: {
	pattern: HypEdgesThumbInput;
	size?: number;
}) {
	const hueOffset = useConfiguration((s) => s.hueOffset);
	const showFill = useConfiguration((s) => s.showPolygonFill);
	const showScaffold = useConfiguration((s) => s.freedrawScaffold);
	const lineMode = useConfiguration((s) => s.hyperbolicLineMode);
	const lineWidth = useConfiguration((s) => s.lineWidth);

	// Nothing to fetch: the record is already in hand, so the async half resolves immediately.
	const prepare = useCallback(() => Promise.resolve(pattern), [pattern]);
	const bake = useCallback(
		(p: HypEdgesThumbInput) =>
			renderThumb(p, size, { hueOffset, showFill, showScaffold, lineMode, lineWidth }),
		[size, hueOffset, showFill, showScaffold, lineMode, lineWidth],
	);

	return (
		<DiskThumbnail
			alt={`hyperbolic edge tiling ${pattern.id}`}
			label="HyperbolicEdgesThumbnail"
			prepare={prepare}
			bake={bake}
		/>
	);
}
