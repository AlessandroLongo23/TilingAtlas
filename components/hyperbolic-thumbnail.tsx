"use client";

import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { useConfiguration } from "@/stores/configuration";
import { su11Inverse } from "@/lib/render/hyperbolic";
import { buildWalk } from "@/lib/render/hyperbolicWalk";
import { ensureDiskRenderer } from "@/lib/render/hypThumbHost";
import {
	allEdgesDrawn,
	diskStyle,
	resolveHypTiling,
	type HypDiskMode,
	type HypDiskSettings,
	type HypDiskSource,
	type HypDiskTiling,
} from "@/lib/render/hypDisk";
import { DiskThumbnail } from "@/components/ui/disk-thumbnail";

// Static Poincaré-disk preview for every hyperbolic shelf: ONE frame of the same per-pixel renderer and
// the same style (lib/render/hypDisk.ts) as the interactive canvas, so a card fills to the rim and matches
// /play. The offscreen surface is shared by every card (lib/render/hypThumbHost.ts); the lazy,
// frame-paced, fade-in shell is DiskThumbnail.

function bakeDisk(t: HypDiskTiling, mode: HypDiskMode, size: number, s: HypDiskSettings): string | null {
	const host = ensureDiskRenderer(size);
	if (!host || !t.darts) return null;
	const walk = buildWalk(t.darts, t.edge, { allDrawn: allEdgesDrawn(mode) });
	host.renderer.setWalk(walk);
	const dark = document.documentElement.classList.contains("dark");
	host.renderer.draw({
		view: su11Inverse(walk.home),
		face: walk.seedFace,
		R: size / 2 - 4,
		cx: size / 2,
		cy: size / 2,
		canvasH: size,
		...diskStyle(mode, t, s, dark, 1),
	});
	return host.canvas.toDataURL("image/png");
}

const NO_PALETTE: HypDiskSettings["colorsPalette"] = [];

const ALT: Record<HypDiskMode, string> = {
	tiling: "hyperbolic tiling",
	edges: "hyperbolic edge tiling",
	colors: "hyperbolic colored tiling",
};

export function HyperbolicThumbnail({
	tiling,
	mode,
	size = 256,
}: {
	tiling: HypDiskSource;
	mode: HypDiskMode;
	size?: number;
}) {
	// Live settings: a hue-ring drag or a stroke change re-bakes, as the flat thumbnails do. A field the
	// mode does not read is pinned, so changing it re-bakes nothing.
	const settings = useConfiguration(
		useShallow(
			(s): HypDiskSettings => ({
				fillAmount: s.fillAmount,
				lineWidth: s.lineWidth,
				hueOffset: mode === "colors" ? 0 : s.hueOffset,
				hyperbolicLineMode: s.hyperbolicLineMode,
				hyperbolicDepthShade: s.hyperbolicDepthShade,
				freedrawScaffold: mode === "edges" && s.freedrawScaffold,
				colorsPalette: mode === "colors" ? s.colorsPalette : NO_PALETTE,
			}),
		),
	);
	// A developed-catalogue id is fetched OUTSIDE the frame-paced queue; only the bake is paced.
	const prepare = useCallback(() => resolveHypTiling(tiling), [tiling]);
	const bake = useCallback((t: HypDiskTiling) => bakeDisk(t, mode, size, settings), [mode, size, settings]);
	const id = typeof tiling === "string" ? tiling : tiling.id;
	return (
		<DiskThumbnail alt={`${ALT[mode]} ${id}`} label={`HyperbolicThumbnail(${mode})`} prepare={prepare} bake={bake} />
	);
}
